// Five fixed existing educational listing lead-image alt descriptions only.
// Preserves every image ID and rank, seller metadata, SKUs, variations and stock.
import {createHash} from 'node:crypto';
import {createRemoteStore} from '../../site/lib/github-remote-store.mjs';
import {createEtsySession} from '../../site/lib/etsy-session.mjs';
import {etsySetup} from '../../site/lib/etsy-oauth.mjs';
const origin='https://sapiver-poster-gen-auth.netlify.app';
const descriptions=new Map([
[4589703919,'Dinosaur-themed colour learning wall art for children, showing illustrated dinosaurs in an educational poster design.'],
[4589715114,'Children’s counting poster for learning the numbers one to nine, presented as colourful educational nursery wall art.'],
[4589703441,'Children’s solar system learning poster with illustrated planets, designed as educational space-themed wall art.'],
[4589703929,'Preschool shapes-learning poster featuring simple geometric shapes, presented as educational artwork for a child’s room.'],
[4589715100,'Animal alphabet world map learning poster, combining illustrated animals, letters and geography for a child’s room.']
]);
const assert=(c,m)=>{if(!c)throw Error(m);};
assert(process.env.ALT_EDU_MODE==='apply'&&process.env.GITHUB_REPOSITORY==='sapiverpress-studio/Poster_gen'&&process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_WORKFLOW==='Approved poster publication','Wrong worker');
for(const alt of descriptions.values())assert(alt.length>45&&alt.length<=250,'Invalid alt text');
async function rpc(body){
 const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 assert(url.protocol==='https:'&&(url.hostname==='run-actions.githubusercontent.com'||url.hostname.endsWith('.actions.githubusercontent.com')),'Wrong issuer');
 url.searchParams.set('audience',origin+'/poster/github-worker');
 const identity=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
 assert(identity.ok,'No GitHub identity');
 const result=await fetch(origin+'/poster/github-worker',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+(await identity.json()).value,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert(result.ok,'Private store unavailable');
 return result.json();
}
const boot=await rpc({op:'bootstrap'});
assert(boot.secret&&boot.origin===origin,'Wrong site');
const store=createRemoteStore('sapiver-etsy-private',rpc),backups=createRemoteStore('sapiver-poster-uploads',rpc);
const env=n=>n==='CANVA_CLIENT_SECRET'?boot.secret:n==='CANVA_SITE_ORIGIN'?origin:n==='CANVA_SETUP_PASSWORD'?'worker-unused-password':process.env[n];
const client=createEtsySession({store,config:etsySetup(env)}),seller=await client.session();
assert(seller.shop_name==='SapiverPrints'&&Number.isSafeInteger(seller.shop_id),'Wrong Etsy seller');
const keys=['listing_id','shop_id','state','listing_type','title','description','taxonomy_id','shop_section_id','price','shipping_profile_id','return_policy_id','readiness_state_id','who_made','when_made','is_supply','has_variations','should_auto_renew'];
const core=x=>JSON.stringify(Object.fromEntries(keys.map(k=>[k,x?.[k]??null])));
const gallery=x=>JSON.stringify(x.slice().sort((a,b)=>a.rank-b.rank).map(p=>[p.listing_image_id,p.rank,p.url_fullxfull]));
async function inspect(id){
 const listing=await client.api('/listings/'+id);
 const photos=await client.api('/listings/'+id+'/images');
 const inventory=await client.api('/listings/'+id+'/inventory');
 assert(listing.listing_id===id&&listing.shop_id===seller.shop_id&&listing.state==='active'&&listing.listing_type==='physical'&&Array.isArray(photos.results)&&Array.isArray(inventory.products),'Listing mismatch');
 return {listing,photos:photos.results,inventory};
}
let changed=0,already=0;
for(const [id,alt] of descriptions){
 const key='seo-current/backup/'+createHash('sha256').update('seo-safe-20261121/'+seller.shop_id+'/'+id).digest('hex').slice(0,32);
 const original=await backups.get(key,{type:'json',consistency:'strong'});
 assert(original?.shopId===seller.shop_id&&original.listing?.listing_id===id&&original.images?.length===3,'Missing immutable educational backup');
 const before=await inspect(id);
 assert(core(before.listing)===core(original.listing),'Protected fields changed');
 assert(gallery(before.photos)===gallery(original.images),'Image identities or order changed');
 assert(JSON.stringify(before.inventory)===JSON.stringify(original.fulfilment),'Inventory or SKU changed');
 const first=before.photos.find(p=>p.rank===1);
 assert(first&&first.full_width===first.full_height,'Lead educational image does not match expected layout');
 if(!first.alt_text?.trim()){
  const form=new FormData();
  form.set('listing_image_id',String(first.listing_image_id));
  form.set('rank','1');form.set('overwrite','false');form.set('alt_text',alt);
  const response=await client.api('/shops/'+seller.shop_id+'/listings/'+id+'/images',{method:'POST',body:form});
  assert(response?.listing_image_id===first.listing_image_id,'Unexpected image ID');
  let seen=false;
  for(let i=0;i<5;i++){
   await new Promise(resolve=>setTimeout(resolve,1500));
   const next=await client.api('/listings/'+id+'/images');
   assert(Array.isArray(next.results)&&gallery(next.results)===gallery(before.photos),'Gallery modified');
   assert(next.results.every(p=>p.listing_image_id===first.listing_image_id||p.alt_text===before.photos.find(q=>q.listing_image_id===p.listing_image_id)?.alt_text),'Other image alt changed');
   if(next.results.find(p=>p.listing_image_id===first.listing_image_id)?.alt_text===alt){seen=true;break;}
  }
  assert(seen,'Etsy did not return new image description');
  changed++;
 }else already++;
 const after=await inspect(id);
 assert(gallery(after.photos)===gallery(before.photos),'Image ID/rank changed');
 assert(core(after.listing)===core(before.listing)&&JSON.stringify(after.listing.tags)===JSON.stringify(before.listing.tags),'Listing changed');
 assert(JSON.stringify(after.inventory)===JSON.stringify(before.inventory),'SKU or fulfilment changed');
 assert(after.photos.every(p=>p.alt_text?.trim()),'Educational listing still has missing alt text');
 console.log('ALT_EDU_VERIFIED '+JSON.stringify({id,images:after.photos.length,descriptions:after.photos.length,skuUnchanged:true}));
}
console.log('ALT_EDU_COMPLETE '+JSON.stringify({total:descriptions.size,updated:changed,already,skuWrites:0,imageUploads:0,inventoryWrites:0,fulfilmentWrites:0}));
