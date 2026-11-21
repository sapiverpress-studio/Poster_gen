// One live, owner-authorised alt-text write to an existing non-primary photo.
// No binary upload, new image, deletion, reordering, inventory or fulfilment update.
import {createHash} from 'node:crypto';
import {createRemoteStore} from '../../site/lib/github-remote-store.mjs';
import {createEtsySession} from '../../site/lib/etsy-session.mjs';
import {etsySetup} from '../../site/lib/etsy-oauth.mjs';
const origin='https://sapiver-poster-gen-auth.netlify.app';
const listingId=4620969937, expectedImageId=8888602050, expectedRank=4;
const alt='Electric bass guitar illustration displayed as a framed music print in a furnished room, showing the artwork as wall decor.';
const assert=(v,m)=>{if(!v)throw Error(m);};
assert(process.env.GITHUB_REPOSITORY==='sapiverpress-studio/Poster_gen'&&process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_WORKFLOW==='Approved poster publication'&&process.env.ALT_WRITE_MODE==='single','Wrong execution context');
assert(alt.length<=250,'Alt text too long');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(body){
 const u=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 assert(u.protocol==='https:'&&(u.hostname==='run-actions.githubusercontent.com'||u.hostname.endsWith('.actions.githubusercontent.com')),'Wrong issuer');
 u.searchParams.set('audience',origin+'/poster/github-worker');
 const ir=await fetch(u,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
 assert(ir.ok,'OIDC unavailable');
 const res=await fetch(origin+'/poster/github-worker',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+(await ir.json()).value,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert(res.ok,'Private store unavailable');
 return res.json();
}
const boot=await rpc({op:'bootstrap'});
assert(boot.secret&&boot.origin===origin,'Wrong site');
const store=createRemoteStore('sapiver-etsy-private',rpc),backups=createRemoteStore('sapiver-poster-uploads',rpc);
const env=n=>n==='CANVA_CLIENT_SECRET'?boot.secret:n==='CANVA_SITE_ORIGIN'?origin:n==='CANVA_SETUP_PASSWORD'?'worker-unused-password':process.env[n];
const client=createEtsySession({store,config:etsySetup(env)});
const seller=await client.session();
assert(seller.shop_name==='SapiverPrints'&&Number.isSafeInteger(seller.shop_id),'Wrong seller');
const backupKey='seo-current/backup/'+createHash('sha256').update('seo-safe-20261121/'+seller.shop_id+'/'+listingId).digest('hex').slice(0,32);
const backup=await backups.get(backupKey,{type:'json',consistency:'strong'});
assert(backup?.shopId===seller.shop_id&&backup.listing?.listing_id===listingId,'Immutable backup unavailable');
const keys=['listing_id','shop_id','state','listing_type','title','description','tags','taxonomy_id','shop_section_id','price','shipping_profile_id','return_policy_id','readiness_state_id','who_made','when_made','is_supply','has_variations','should_auto_renew'];
const core=x=>JSON.stringify(Object.fromEntries(keys.map(k=>[k,x?.[k]??null])));
const gallery=x=>JSON.stringify(x.map(i=>[i.listing_image_id,i.rank,i.url_fullxfull,i.listing_image_id===expectedImageId?null:i.alt_text]).sort((a,b)=>a[1]-b[1]));
async function inspect(){
 const listing=await client.api('/listings/'+listingId);
 const photos=await client.api('/listings/'+listingId+'/images');
 const inventory=await client.api('/listings/'+listingId+'/inventory');
 assert(listing.listing_id===listingId&&listing.shop_id===seller.shop_id&&listing.state==='active'&&Array.isArray(photos?.results)&&Array.isArray(inventory?.products),'Listing unavailable');
 return {listing,photos:photos.results,inventory};
}
const before=await inspect();
assert(core(before.listing)===core(backup.listing),'Protected fields drifted since backup');
assert(gallery(before.photos)===gallery(backup.images),'Gallery identities or order drifted');
assert(JSON.stringify(before.inventory)===JSON.stringify(backup.fulfilment),'Inventory, SKU or variations drifted');
const img=before.photos.find(x=>x.listing_image_id===expectedImageId);
assert(img?.rank===expectedRank&&(!img.alt_text||!img.alt_text.trim()),'Image changed or already has alt text');
const body=new FormData();
body.set('listing_image_id',String(expectedImageId));
body.set('rank',String(expectedRank));
body.set('overwrite','false');
body.set('alt_text',alt);
const response=await client.api('/shops/'+seller.shop_id+'/listings/'+listingId+'/images',{method:'POST',body});
assert(response?.listing_image_id===expectedImageId,'Unexpected response image ID');
let verified=false;
for(let attempt=0;attempt<4;attempt++){
 await pause(6000);
 const after=await inspect();
 assert(core(after.listing)===core(before.listing),'Listing metadata changed');
 assert(JSON.stringify(after.inventory)===JSON.stringify(before.inventory),'Inventory or SKUs changed');
 assert(gallery(after.photos)===gallery(before.photos),'Unexpected photo ID, rank or other alt text change');
 const updated=after.photos.find(x=>x.listing_image_id===expectedImageId);
 if(updated?.alt_text===alt){verified=true;break;}
}
assert(verified,'Etsy did not save alt text on existing image; no further automation');
console.log('ALT_SINGLE_VERIFIED '+JSON.stringify({listingId,imageId:expectedImageId,rank:expectedRank,altTextSaved:true,imageIdsAndRanksPreserved:true,inventoryUnchanged:true,skuUnchanged:true}));
