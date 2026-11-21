// One exact, idempotent API capability probe. No image upload or deletion.
// Sends the existing alt text to the existing image ID at the existing rank.
// A changed gallery, listing or stock is an immediate failure. No retries.
import {createHash} from 'node:crypto';
import {createRemoteStore} from '../../site/lib/github-remote-store.mjs';
import {createEtsySession} from '../../site/lib/etsy-session.mjs';
import {etsySetup} from '../../site/lib/etsy-oauth.mjs';
const origin='https://sapiver-poster-gen-auth.netlify.app';
const listingId=4621547010;
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
assert(process.env.GITHUB_REPOSITORY==='sapiverpress-studio/Poster_gen'&&process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_WORKFLOW==='Approved poster publication','Wrong worker');
assert(process.env.ALT_PROBE_MODE==='idempotent','Wrong probe mode');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(body){
 const u=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 assert(u.protocol==='https:'&&(u.hostname==='run-actions.githubusercontent.com'||u.hostname.endsWith('.actions.githubusercontent.com')),'Wrong issuer');
 u.searchParams.set('audience',origin+'/poster/github-worker');
 const ir=await fetch(u,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
 assert(ir.ok,'OIDC unavailable');
 const tr=await fetch(origin+'/poster/github-worker',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+(await ir.json()).value,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert(tr.ok,'Private bridge unavailable');
 return tr.json();
}
const boot=await rpc({op:'bootstrap'});
assert(boot.secret&&boot.origin===origin,'Wrong site');
const store=createRemoteStore('sapiver-etsy-private',rpc),backups=createRemoteStore('sapiver-poster-uploads',rpc);
const env=n=>n==='CANVA_CLIENT_SECRET'?boot.secret:n==='CANVA_SITE_ORIGIN'?origin:n==='CANVA_SETUP_PASSWORD'?'worker-unused-password':process.env[n];
const client=createEtsySession({store,config:etsySetup(env)});
const seller=await client.session();
assert(seller.shop_name==='SapiverPrints'&&Number.isSafeInteger(seller.shop_id),'Wrong seller');
const key='seo-current/backup/'+createHash('sha256').update('seo-safe-20261121/'+seller.shop_id+'/'+listingId).digest('hex').slice(0,32);
const backup=await backups.get(key,{type:'json',consistency:'strong'});
assert(backup?.shopId===seller.shop_id&&backup.listing.listing_id===listingId,'Backup not found');
const fields=['listing_id','shop_id','state','listing_type','title','description','taxonomy_id','shop_section_id','price','shipping_profile_id','return_policy_id','readiness_state_id','who_made','when_made','is_supply','has_variations','should_auto_renew'];
const core=x=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,x?.[k]??null])));
const photoSignature=photos=>JSON.stringify(photos.map(i=>[i.listing_image_id,i.rank,i.alt_text,i.url_fullxfull]).sort((a,b)=>a[1]-b[1]));
async function inspect(){
 const listing=await client.api('/listings/'+listingId);
 const images=await client.api('/listings/'+listingId+'/images');
 const inventory=await client.api('/listings/'+listingId+'/inventory');
 assert(listing.listing_id===listingId&&listing.shop_id===seller.shop_id&&listing.state==='active','Listing mismatch');
 assert(Array.isArray(images?.results)&&Array.isArray(inventory?.products),'Images or stock unavailable');
 return {listing,images:images.results,inventory};
}
const before=await inspect();
assert(core(backup.listing)===core(before.listing),'Metadata drift');
assert(photoSignature(backup.images)===photoSignature(before.images),'Image drift');
assert(JSON.stringify(backup.fulfilment)===JSON.stringify(before.inventory),'Inventory or SKU drift');
const image=before.images.slice().sort((a,b)=>a.rank-b.rank).at(-1);
assert(image&&Number.isSafeInteger(image.listing_image_id)&&image.rank>=2&&typeof image.alt_text==='string'&&image.alt_text.length>10&&image.alt_text.length<=250,'Probe image has no safe original alt text');
const body=new FormData();
body.set('listing_image_id',String(image.listing_image_id));
body.set('rank',String(image.rank));
body.set('overwrite','false');
body.set('alt_text',image.alt_text);
let status;
try{
 const response=await client.api('/shops/'+seller.shop_id+'/listings/'+listingId+'/images',{method:'POST',body});
 status='accepted';
 assert(response?.listing_image_id===image.listing_image_id,'Unexpected returned image ID');
}catch(error){
 if(error?.message==='Etsy request failed'&&[400,403,404,409,422].includes(error.etsyStatus))status='rejected_'+error.etsyStatus;
 else throw error;
}
for(let i=0;i<3;i++){
 await pause(6000);
 const after=await inspect();
 assert(core(after.listing)===core(before.listing),'Unexpected listing mutation');
 assert(photoSignature(after.images)===photoSignature(before.images),'Unexpected image ID, order or alt text change');
 assert(JSON.stringify(after.inventory)===JSON.stringify(before.inventory),'Unexpected SKU or stock mutation');
}
console.log('ALT_CAPABILITY_PROBE '+JSON.stringify({listingId,imageRank:image.rank,mode:'same_id_same_rank_same_alt',status,listingUnchanged:true,imagesUnchanged:true,inventoryUnchanged:true}));
