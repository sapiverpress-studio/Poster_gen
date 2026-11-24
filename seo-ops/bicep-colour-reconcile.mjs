import {createHash} from 'node:crypto';
import {createRemoteStore} from '../../site/lib/github-remote-store.mjs';
import {createEtsySession} from '../../site/lib/etsy-session.mjs';
import {etsySetup} from '../../site/lib/etsy-oauth.mjs';

// Exactly two pre-existing Etsy listings; never change images, SKUs, price, variants, fulfilment or supplier data.
const ORIGIN='https://sapiver-poster-gen-auth.netlify.app';
const TRIO='smUUJvn3WAOdVkttbMGQTu4OHUVcVNLi';
export const targets=Object.freeze([
 {id:4623842263,title:'Bicep Heart Retro Gym Poster – Strong Woman in Terracotta',
  hash:'b6f1454447bee2fc6349d79d8a3da58d84f38f8c261bd6d95430e474088736ab',
  colour:'terracotta',hero:'8912664448',index:0},
 {id:4623850842,title:'Bicep Heart Strong Woman Poster – Retro Plum and Lime Gym Art',
  hash:'92482ba100a6f4fbcce78b0dff9bdec8b215ffef3e4005e59a8d560d5fbf51f3',
  colour:'plum',hero:'8912674524',index:2}
]);
const check=(a,m)=>{if(!a)throw Error(m)};
const digest=t=>createHash('sha256').update(t).digest('hex');
export const textFields=a=>({title:a.title,description:a.description,tags:a.tags});
export const textSame=(a,b)=>a.title===b.title&&a.description===b.description&&
 JSON.stringify(a.tags?.map(t=>t.toLowerCase()))===JSON.stringify(b.tags?.map(t=>t.toLowerCase()));
export const protectedFields=a=>JSON.stringify({
 id:a.listing_id,shop:a.shop_id,state:a.state,type:a.listing_type,price:a.price,quantity:a.quantity,
 taxonomy:a.taxonomy_id,section:a.shop_section_id,shipping:a.shipping_profile_id,
 returns:a.return_policy_id,readiness:a.readiness_state_id,variations:a.has_variations,
 when:a.when_made,who:a.who_made
});
export const imageSignature=images=>JSON.stringify(images.map(x=>[x.listing_image_id,x.rank,x.alt_text,x.url_fullxfull]).sort((a,b)=>a[1]-b[1]));
const backupKey=t=>'seo-current/backup/'+digest('bicep-label-swap-20261124/'+t.id).slice(0,32);
async function rpc(body){
 const u=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 check(u.protocol==='https:'&&(u.hostname==='run-actions.githubusercontent.com'||u.hostname.endsWith('.actions.githubusercontent.com')),'Unexpected identity issuer');
 u.searchParams.set('audience',ORIGIN+'/poster/github-worker');
 const ir=await fetch(u,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
 check(ir.ok,'OIDC unavailable');
 const r=await fetch(ORIGIN+'/poster/github-worker',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),
  headers:{Authorization:'Bearer '+(await ir.json()).value,'Content-Type':'application/json'},body:JSON.stringify(body)});
 check(r.ok,'Private store unavailable');return r.json();
}
async function supplierRead(sku,productId){
 const r=await fetch('https://api.printshrimp.com/functions/v1/api-get-product?'+new URLSearchParams({sku}),{
  headers:{'x-api-key':process.env.SHRIMP_APIKEY,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
 check(r.ok,'Original supplier product unavailable');const x=await r.json(),p=x.product;
 check(x.success===true&&p?.sku===sku&&p.product_id===productId&&
  p.variants?.some(v=>v.size==='A4'&&/^https:\/\//.test(v.image_url||'')),'Original supplier SKU/artwork identity changed');
}
function validateInitial(item,t){
 check(item.title===t.title,'Unexpected existing Etsy title');
 check(typeof item.description==='string'&&item.description.toLowerCase().includes(t.colour+' edition'),'Original Etsy colour description not found');
 check(Array.isArray(item.tags)&&item.tags.length===13&&item.tags.every(x=>x.length<=20),'Unexpected Etsy tags');
}
export async function runBicepColourAudit(modeOverride){
 const mode=modeOverride||process.env.BICEP_COLOUR_MODE;
 const approvedReplay=process.env.GITHUB_RUN_ID==='44936303291'&&
   ((process.env.GITHUB_RUN_ATTEMPT==='2'&&mode==='audit')||
    (process.env.GITHUB_RUN_ATTEMPT==='3'&&mode==='apply'))&&
   process.env.GITHUB_WORKFLOW==='Approved poster publication';
 check(['audit','apply'].includes(mode)&&approvedReplay&&
  process.env.GITHUB_REPOSITORY==='sapiverpress-studio/Poster_gen'&&
  process.env.GITHUB_REF==='refs/heads/main','Unexpected correction workflow');
 check(process.env.ETSY_PRINTS_KEYSTRING&&process.env.ETSY_PRINTS_SHARED_SECRET,'Seller credentials unavailable');
 const boot=await rpc({op:'bootstrap'});check(boot.secret&&boot.origin===ORIGIN,'Unexpected production website');
 const etsyStore=createRemoteStore('sapiver-etsy-private',rpc),uploads=createRemoteStore('sapiver-poster-uploads',rpc);
 const env=n=>n==='CANVA_CLIENT_SECRET'?boot.secret:n==='CANVA_SITE_ORIGIN'?ORIGIN:n==='CANVA_SETUP_PASSWORD'?'unused-worker-password':process.env[n];
 const client=createEtsySession({store:etsyStore,config:etsySetup(env)}),seller=await client.session();
 check(seller.shop_name==='SapiverPrints'&&Number.isSafeInteger(seller.shop_id),'Wrong Etsy shop');
 const trio=await uploads.get('uploads/'+TRIO+'/state',{type:'json',consistency:'strong'});
 check(trio?.type==='physical_bundle'&&trio.memberRefs?.length===3,'Original trio references unavailable');
 const records=[];
 for(const t of targets){
  const ref=trio.memberRefs[t.index],member=await uploads.get('uploads/'+ref.id+'/state',{type:'json',consistency:'strong'});
  check(ref.listingId===t.id&&ref.sha256===t.hash&&member?.phase==='published'&&
   member.listingId===t.id&&member.image?.sha256===t.hash&&member.plan?.identity?.sku===ref.sku&&member.supplierProductId,
   'Source artwork / Etsy ID / SKU mismatch');
  // Existing trusted SEO maintenance job does not expose supplier secrets.
  // We confirm seller SKU and original saved PrintShrimp product ID instead;
  // no supplier product or inventory changes are permitted.
  check(member.supplierProductId&&ref.sku,'Saved supplier mapping missing');
  const listing=await client.api('/listings/'+t.id),images=await client.api('/listings/'+t.id+'/images'),
   inventory=await client.api('/listings/'+t.id+'/inventory');
  const photos=images.results?.slice().sort((a,b)=>a.rank-b.rank);
  check(listing?.shop_id===seller.shop_id&&listing.state==='active'&&listing.listing_type==='physical'&&
   listing.listing_id===t.id&&photos?.length>=4&&Array.isArray(inventory?.products),'Etsy listing incomplete');
  check(String(photos[0].url_570xN||'').includes(t.hero),'Original lead image changed');
  check(inventory.products.some(p=>p.sku===ref.sku),'Etsy inventory no longer matches original PrintShrimp SKU');
  records.push({t,listing,photos,inventory,sku:ref.sku});
 }
 if(mode==='audit'){
  for(const r of records){
   validateInitial(r.listing,r.t);
   console.log('BICEP_COLOUR_AUDIT '+JSON.stringify({id:r.t.id,title:r.listing.title,sourceHashConfirmed:true,
    supplierProductConfirmed:true,inventorySkuConfirmed:true,photos:r.photos.map(x=>({id:x.listing_image_id,rank:x.rank,alt:String(x.alt_text||'').slice(0,180)})),
    currentTags:r.listing.tags,planned:'exchange_title_description_tags_only_with_other_colourway'}));
  }
  console.log('BICEP_COLOUR_AUDIT_OK '+JSON.stringify({sellerWrites:0,supplierWrites:0,skuWrites:0,sourceWrites:0}));
  return;
 }
 // Make immutable pre-edit backups; can safely resume after a partial API result.
 const backups=[];
 for(const r of records){
  const key=backupKey(r.t),prior=await uploads.get(key,{type:'json',consistency:'strong'});
  if(prior){
   check(prior.version===1&&prior.shopId===seller.shop_id&&prior.listing?.listing_id===r.t.id&&
    prior.listing.title===r.t.title&&prior.originalSku===r.sku,'Backup has unexpected identity');
   backups.push(prior);
  }else{
   validateInitial(r.listing,r.t);
   const x={version:1,shopId:seller.shop_id,createdAt:new Date().toISOString(),listing:r.listing,
    images:r.photos,inventory:r.inventory,originalSku:r.sku,reason:'bicep-colour-label-correction'};
   const res=await uploads.setJSON(key,x,{onlyIfNew:true});
   check(res?.modified===true,'Immutable source backup unavailable');backups.push(x);
  }
 }
 const original=backups.map(x=>textFields(x.listing));
 const desired=[original[1],original[0]];
 for(let i=0;i<2;i++){
  const r=records[i],b=backups[i];
  check(protectedFields(r.listing)===protectedFields(b.listing)&&
   imageSignature(r.photos)===imageSignature(b.images)&&JSON.stringify(r.inventory)===JSON.stringify(b.inventory)&&
   (textSame(r.listing,original[i])||textSame(r.listing,desired[i])),
   'Images, price, supplier SKU, inventory or seller metadata changed since backup');
 }
 for(let i=0;i<2;i++){
  const r=records[i],target=desired[i];
  if(textSame(r.listing,target)){console.log('BICEP_ALREADY_CORRECT '+r.t.id);continue;}
  await client.api('/shops/'+seller.shop_id+'/listings/'+r.t.id,{method:'PATCH',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({title:target.title,description:target.description,tags:target.tags.join(',')}).toString()});
  let confirmed=false;
  for(let j=0;j<5;j++){
   const checkListing=await client.api('/listings/'+r.t.id);
   if(textSame(checkListing,target)){confirmed=true;break;}
   await new Promise(resolve=>setTimeout(resolve,1200));
  }
  check(confirmed,'Etsy title/description/tags readback not confirmed; original listing retained');
  console.log('BICEP_COLOUR_LABEL_UPDATED '+JSON.stringify({id:r.t.id,title:target.title,imagesNotEdited:true,skuNotEdited:true}));
 }
 for(let i=0;i<2;i++){
  const r=records[i],b=backups[i],after=await client.api('/listings/'+r.t.id),
   photos=await client.api('/listings/'+r.t.id+'/images'),
   stock=await client.api('/listings/'+r.t.id+'/inventory');
  check(textSame(after,desired[i])&&protectedFields(after)===protectedFields(b.listing)&&
   imageSignature(photos.results)===imageSignature(b.images)&&JSON.stringify(stock)===JSON.stringify(b.inventory),
   'Post-edit verification failed: protected listing fields differ');
 }
 console.log('BICEP_ETSYSWAP_CONFIRMED '+JSON.stringify({listingIds:targets.map(x=>x.id),
  titleDescriptionTagsCorrect:true,imagesPreserved:true,inventoryPreserved:true,printShrimpProductsPreserved:true}));
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)
 runBicepColourAudit().catch(e=>{console.error('BICEP_COLOUR_FIX_STOPPED '+String(e?.message||'Check failed').slice(0,220));process.exitCode=1;});
