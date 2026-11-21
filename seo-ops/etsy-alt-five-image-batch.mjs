// One-off existing-image alt-text backfill for verified five-photo single prints.
// No new images, no file upload, no delete, no SKU/stock/fulfilment mutation.
import {createHash} from 'node:crypto';
import {createRemoteStore} from '../../site/lib/github-remote-store.mjs';
import {createEtsySession} from '../../site/lib/etsy-session.mjs';
import {etsySetup} from '../../site/lib/etsy-oauth.mjs';
const origin='https://sapiver-poster-gen-auth.netlify.app';
const mode=process.env.ALT_BATCH_MODE;
const assert=(v,m)=>{if(!v)throw Error(m);};
assert(['pilot','five'].includes(mode),'No authorisation for this alt-text batch');
assert(process.env.GITHUB_REPOSITORY==='sapiverpress-studio/Poster_gen'&&process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_WORKFLOW==='Approved poster publication','Untrusted runner');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const tidy=s=>String(s??'').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
const nameOf=title=>{const full=tidy(title);const raw=/^Physical Print Trio Set\s[-—]\s(.+)$/i.exec(full)?.[1]||full.split(/\s[-—|]\s/)[0];return raw.slice(0,95).replace(/\s+(art print|wall art print|print)$/i,'').trim();};
const isTrio=title=>/\b(?:trio|set of (?:3|three)|three (?:a4 )?prints|collection set of 3)\b/i.test(title);
function caption({title,rank}){
 const name=nameOf(title);
 const variants={
  2:'First styled-room photograph showing '+name+' print displayed as wall art',
  3:'Second illustrative room-display mockup of '+name+' art print',
  4:'Third furnished-room preview of '+name+' art print on the wall',
  5:'Fourth interior mockup presenting '+name+' as decorative wall art'
 };
 const body=(variants[rank]||'').trim()+'.';
 assert(body.length>35&&body.length<=250,'Invalid alt description');
 return body;
}
async function rpc(body){
 const u=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 assert(u.protocol==='https:'&&(u.hostname==='run-actions.githubusercontent.com'||u.hostname.endsWith('.actions.githubusercontent.com')),'Untrusted issuer');
 u.searchParams.set('audience',origin+'/poster/github-worker');
 const response=await fetch(u,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
 assert(response.ok,'GitHub identity unavailable');
 const r=await fetch(origin+'/poster/github-worker',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+(await response.json()).value,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert(r.ok,'Private store unavailable');
 return r.json();
}
const boot=await rpc({op:'bootstrap'});
assert(boot.secret&&boot.origin===origin,'Unexpected site');
const store=createRemoteStore('sapiver-etsy-private',rpc),backups=createRemoteStore('sapiver-poster-uploads',rpc);
const env=n=>n==='CANVA_CLIENT_SECRET'?boot.secret:n==='CANVA_SITE_ORIGIN'?origin:n==='CANVA_SETUP_PASSWORD'?'worker-unused-password':process.env[n];
const client=createEtsySession({store,config:etsySetup(env)});
const seller=await client.session();
assert(seller.shop_name==='SapiverPrints'&&Number.isSafeInteger(seller.shop_id),'Wrong seller');
const baseKeys=['listing_id','shop_id','state','listing_type','title','description','taxonomy_id','shop_section_id','price','shipping_profile_id','return_policy_id','readiness_state_id','who_made','when_made','is_supply','has_variations','should_auto_renew'];
const core=x=>JSON.stringify(Object.fromEntries(baseKeys.map(k=>[k,x?.[k]??null])));
const gallery=x=>JSON.stringify(x.slice().sort((a,b)=>a.rank-b.rank).map(i=>[i.listing_image_id,i.rank,i.url_fullxfull]));
async function inspect(id,type){
 const listing=await client.api('/listings/'+id),photos=await client.api('/listings/'+id+'/images');
 assert(listing.listing_id===id&&listing.shop_id===seller.shop_id&&listing.state==='active'&&listing.listing_type===type&&Array.isArray(photos.results),'Listing or photos changed');
 const inv=type==='physical'?await client.api('/listings/'+id+'/inventory'):await client.api('/shops/'+seller.shop_id+'/listings/'+id+'/files');
 assert(Array.isArray(inv?.products)||Array.isArray(inv?.results),'Inventory or files unavailable');
 return {listing,photos:photos.results,inv};
}
const pilot=[4598485326];
let ids=pilot;
if(mode==='five'){
 const all=[],seen=new Set();
 for(let offset=0;offset<250;offset+=100){
  const page=await client.api('/shops/'+seller.shop_id+'/listings/active?'+new URLSearchParams({limit:'100',offset:String(offset)}));
  assert(Array.isArray(page?.results)&&page.results.length<=100,'Catalogue unavailable');
  for(const x of page.results){assert(x.shop_id===seller.shop_id&&x.state==='active'&&!seen.has(x.listing_id),'Catalogue changed');seen.add(x.listing_id);all.push(x.listing_id);}
  if(page.results.length<100)break;
 }
 assert(all.length>=70&&all.length<=250,'Unexpected active catalogue size');
 ids=all;
}
let changed=0,already=0,skipped=0,listingCount=0;
for(const id of ids){
 const key='seo-current/backup/'+createHash('sha256').update('seo-safe-20261121/'+seller.shop_id+'/'+id).digest('hex').slice(0,32);
 const original=await backups.get(key,{type:'json',consistency:'strong'});
 if(!original){if(mode==='pilot')throw Error('Missing pilot backup');skipped++;continue;}
 const listing=original.listing;
 const type=listing.listing_type;
 if(type!=='physical'||original.images?.length!==5||isTrio(listing.title)){skipped++;continue;}
 const trio=isTrio(listing.title);
 const before=await inspect(id,type);
 assert(core(before.listing)===core(listing),'Protected listing drift');
 assert(gallery(before.photos)===gallery(original.images),'Gallery ID/order drift');
 assert(JSON.stringify(before.inv)===JSON.stringify(original.fulfilment),'Inventory, SKU or variations drift');
 assert(before.photos.length===5&&[1,2,3,4,5].every(n=>before.photos.some(p=>p.rank===n)),'Photo count or ranks changed');
 const ranked=before.photos.slice().sort((a,b)=>a.rank-b.rank);
 if(!ranked[0].alt_text?.trim()||ranked[0].full_width!==ranked[0].full_height||ranked.slice(1).some(p=>!(p.full_width>p.full_height*1.1))){skipped++;continue;}
 let current=before;
 for(const img of before.photos.slice().sort((a,b)=>a.rank-b.rank)){
  const live=current.photos.find(x=>x.listing_image_id===img.listing_image_id);
  assert(live?.rank===img.rank,'Unexpected live image rank');
  if(live.alt_text?.trim()){already++;continue;}
  const requested=caption({title:listing.title,rank:img.rank});
  const form=new FormData();
  form.set('listing_image_id',String(img.listing_image_id));
  form.set('rank',String(img.rank));
  form.set('overwrite','false');
  form.set('alt_text',requested);
  const res=await client.api('/shops/'+seller.shop_id+'/listings/'+id+'/images',{method:'POST',body:form});
  assert(res?.listing_image_id===img.listing_image_id,'Unexpected image association ID');
  let verified=false;
  for(let attempt=0;attempt<4;attempt++){
   await delay(1600);
   const after=await client.api('/listings/'+id+'/images');
   assert(Array.isArray(after?.results)&&gallery(after.results)===gallery(current.photos),'Photos reordered, replaced or added; STOP');
   const updated=after.results.find(x=>x.listing_image_id===img.listing_image_id);
   assert(after.results.every(x=>x.listing_image_id===img.listing_image_id||x.alt_text===current.photos.find(y=>y.listing_image_id===x.listing_image_id)?.alt_text),'Other photo alt text changed; STOP');
   if(updated?.alt_text===requested){verified=true;current={...current,photos:after.results};break;}
  }
  assert(verified,'New alt text failed readback; STOP');
  changed++;
  console.log('ALT_IMAGE_VERIFIED '+JSON.stringify({listingId:id,imageId:img.listing_image_id,rank:img.rank,photoCount:5}));
 }
 const post=await inspect(id,type);
 assert(core(post.listing)===core(before.listing)&&JSON.stringify(post.listing.tags)===JSON.stringify(before.listing.tags),'Listing or tags mutated');
 assert(JSON.stringify(post.inv)===JSON.stringify(before.inv),'Inventory or SKU mutated');
 assert(gallery(post.photos)===gallery(before.photos),'Gallery changed');
 listingCount++;
 console.log('ALT_LISTING_VERIFIED '+JSON.stringify({listingId:id,type:'physical',trio,altFilled:post.photos.filter(x=>!!x.alt_text?.trim()).length,photos:post.photos.length,fulfilmentPreserved:true}));
}
console.log('ALT_FIVE_BATCH_COMPLETE '+JSON.stringify({mode,reviewed:ids.length,updatedDescriptions:changed,alreadyPresent:already,skipped,fullyVerifiedListings:listingCount,skuWrites:0,inventoryWrites:0,photoUploads:0,photoDeletions:0,printshrimpCalls:0}));
