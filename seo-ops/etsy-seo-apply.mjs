// Scoped Etsy tags-only updater. No SKU, inventory, photo, file, shipping or supplier writes.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRemoteStore} from '../../site/lib/github-remote-store.mjs';
import {createEtsySession} from '../../site/lib/etsy-session.mjs';
import {etsySetup} from '../../site/lib/etsy-oauth.mjs';
const origin='https://sapiver-poster-gen-auth.netlify.app';
const ensure=(yes,message)=>{if(!yes)throw Error(message);};
ensure(process.env.GITHUB_REPOSITORY==='sapiverpress-studio/Poster_gen'&&process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_WORKFLOW==='Approved poster publication','Untrusted worker context');
ensure(['pilot','apply'].includes(process.env.SEO_APPLY_MODE),'Unapproved SEO mode');
ensure(process.env.POSTER_SITE_ORIGIN===origin&&process.env.ETSY_PRINTS_KEYSTRING&&process.env.ETSY_PRINTS_SHARED_SECRET,'Missing API configuration');
const plan=JSON.parse(await readFile(new URL('./etsy-seo-plan.json',import.meta.url),'utf8'));
ensure(plan.shop==='SapiverPrints'&&plan.version===1&&plan.reviewedCatalogCount===78&&Array.isArray(plan.listings)&&plan.listings.length===23,'Unexpected SEO plan');
const entries=new Map();
for(const item of plan.listings){
 ensure(Number.isSafeInteger(item.id)&&item.id>0&&!entries.has(item.id)&&Array.isArray(item.tags)&&item.tags.length===13,'Invalid SEO record');
 const tags=item.tags.map(t=>String(t).trim());
 ensure(new Set(tags.map(t=>t.toLowerCase())).size===13&&tags.every(t=>t.length>0&&t.length<=20&&/^[\p{L}\p{N}\p{Zs}\-'™©®]+$/u.test(t)),'Invalid tags');
 entries.set(item.id,tags);
}
ensure(new Set(plan.pilotIds).size===3&&plan.pilotIds.every(id=>entries.has(id)),'Invalid pilot');
async function rpc(body){
 const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 ensure(url.protocol==='https:'&&(url.hostname==='run-actions.githubusercontent.com'||url.hostname.endsWith('.actions.githubusercontent.com')),'Untrusted identity issuer');
 url.searchParams.set('audience',origin+'/poster/github-worker');
 const identity=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
 ensure(identity.ok,'Identity unavailable');
 const token=(await identity.json()).value;
 const response=await fetch(origin+'/poster/github-worker',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 ensure(response.ok,'Private bridge unavailable');
 return response.json();
}
const boot=await rpc({op:'bootstrap'});
ensure(boot.secret&&boot.origin===origin,'Invalid site configuration');
const tokenStore=createRemoteStore('sapiver-etsy-private',rpc),backups=createRemoteStore('sapiver-poster-uploads',rpc);
const env=n=>n==='CANVA_CLIENT_SECRET'?boot.secret:n==='CANVA_SITE_ORIGIN'?origin:n==='CANVA_SETUP_PASSWORD'?'worker-unused-password':process.env[n];
const client=createEtsySession({store:tokenStore,config:etsySetup(env)});
const seller=await client.session();
ensure(seller.shop_name==='SapiverPrints'&&Number.isSafeInteger(seller.shop_id)&&seller.shop_id>0,'Wrong seller');
const stable=x=>JSON.stringify(x);
const protectedKeys=['listing_id','shop_id','state','listing_type','title','description','taxonomy_id','shop_section_id','price','shipping_profile_id','return_policy_id','readiness_state_id','who_made','when_made','is_supply','has_variations','should_auto_renew'];
const core=x=>Object.fromEntries(protectedKeys.map(k=>[k,x?.[k]??null]));
const gallery=p=>p.results.map(x=>[x.listing_image_id,x.rank,x.alt_text,x.url_fullxfull]).sort((a,b)=>a[1]-b[1]);
async function inspect(id){
 const listing=await client.api('/listings/'+id);
 ensure(listing.listing_id===id&&listing.shop_id===seller.shop_id&&listing.state==='active','Live listing changed');
 const photos=await client.api('/listings/'+id+'/images');
 ensure(Array.isArray(photos?.results),'Gallery unavailable');
 const data=listing.listing_type==='physical'?await client.api('/listings/'+id+'/inventory'):await client.api('/shops/'+seller.shop_id+'/listings/'+id+'/files');
 ensure(Array.isArray(data?.products)||Array.isArray(data?.results),'SKU or digital file data unavailable');
 return {listing,photos,data};
}
const ids=process.env.SEO_APPLY_MODE==='pilot'?plan.pilotIds:[...entries.keys()];
let updated=0,already=0;
for(const id of ids){
 const tags=entries.get(id);
 const key='seo-current/backup/'+createHash('sha256').update('seo-safe-20261121/'+seller.shop_id+'/'+id).digest('hex').slice(0,32);
 const original=await backups.get(key,{type:'json',consistency:'strong'});
 ensure(original?.version===1&&original.shopId===seller.shop_id&&original.listing?.listing_id===id,'Immutable backup unavailable');
 const before=await inspect(id);
 ensure(stable(core(before.listing))===stable(core(original.listing)),'Protected fields differ from backup; STOP');
 ensure(stable(gallery(before.photos))===stable(gallery({results:original.images})),'Image IDs, order or alt text differ from backup; STOP');
 ensure(stable(before.data)===stable(original.fulfilment),'SKU, inventory, variations or digital files differ from backup; STOP');
 const matches=before.listing.tags?.length===13&&tags.every(t=>before.listing.tags.some(x=>x.toLowerCase()===t.toLowerCase()));
 if(matches){already++;continue;}
 ensure(stable(before.listing.tags)===stable(original.listing.tags),'Tags changed since backup; STOP');
 // Etsy seller mutation is restricted to PATCH tags ONLY. Never submit other listing fields.
 await client.api('/shops/'+seller.shop_id+'/listings/'+id,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({tags:tags.join(',')}).toString()});
 const after=await inspect(id);
 ensure(stable(core(after.listing))===stable(core(before.listing)),'Protected listing fields changed after PATCH; STOP');
 ensure(stable(gallery(after.photos))===stable(gallery(before.photos)),'Image IDs, ranks or descriptions changed; STOP');
 ensure(stable(after.data)===stable(before.data),'Inventory, SKU, variations or digital files changed; STOP');
 ensure(after.listing.tags?.length===13&&tags.every(t=>after.listing.tags.some(x=>x.toLowerCase()===t.toLowerCase())),'Tag readback failed; STOP');
 updated++;
 console.log('SEO_TAG_VERIFIED '+JSON.stringify({id,tags:13,skuUnchanged:true,imagesUnchanged:true}));
}
console.log('SEO_COMPLETE '+JSON.stringify({mode:process.env.SEO_APPLY_MODE,attempted:ids.length,updated,already,skuWrites:0,inventoryWrites:0,imageWrites:0,fileWrites:0,shippingWrites:0}));
