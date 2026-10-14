import {createHash} from 'node:crypto';
import {makePosterMockups} from './poster-mockups.mjs';
import {physicalDescription} from './physical-description.mjs';
import {recordKey,recordRevision,validId} from './product-records.mjs';
import {TEMPLATE_VERSION} from './poster-template.mjs';
const sku='SP-THIS-SEATS-TAKEN',refreshId=createHash('sha256').update(sku+':original-scenes-v1').digest('hex').slice(0,32);
const hash=b=>createHash('sha256').update(b instanceof ArrayBuffer?Buffer.from(b):b).digest('hex');
const stateKey=id=>'uploads/'+id+'/state';
const read=(store,key)=>store.get(key,{type:'json',consistency:'strong'});
const retained=l=>JSON.stringify(Object.fromEntries(['listing_id','shop_id','state','listing_type','title','price','quantity','should_auto_renew','shipping_profile_id','readiness_state_id','return_policy_id','taxonomy_id','shop_section_id','tags','who_made','when_made'].map(k=>[k,l[k]])));
// One explicit chat-authorised presentation update. No listing creation, inventory,
// supplier, renewal or order endpoint is used. Ambiguous writes are never replayed.
export async function refreshCatListing({client,uploads,etsyStore,mockups=makePosterMockups,clock=()=>Date.now()}) {
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints'||!Number.isSafeInteger(seller.shop_id))throw Error('Unexpected seller');
 const mapping=await read(etsyStore,'draft/'+sku);
 if(mapping?.phase!=='published'||!Number.isSafeInteger(mapping.listingId)||!validId(mapping.uploadId))throw Error('Published cat mapping unavailable');
 const listingId=mapping.listingId,path='/listings/'+listingId;
 const saved=await read(uploads,stateKey(refreshId));
 if(saved?.phase==='published'&&saved.presentationRefresh?.phase==='verified')return {phase:'verified',listingId,imageIds:saved.presentationRefresh.imageIds,changed:false};
 const asset=await read(uploads,stateKey(mapping.uploadId)),productId=asset?.productId||mapping.uploadId;
 const product=await read(uploads,recordKey(productId));
 if(asset?.phase!=='published'||asset.plan?.identity?.sku!==sku||asset.listingId!==listingId||product?.type!=='physical'||product.etsyListingId!==listingId||product.currentRevision!==mapping.uploadId||product.pendingRevision||!product.supplierProductId)throw Error('Published cat revision unavailable');
 const before=await client.api(path),inventory=await client.api(path+'/inventory'),photos=await client.api(path+'/images');
 if(before.listing_id!==listingId||before.shop_id!==seller.shop_id||before.state!=='active'||before.listing_type!=='physical'||!/^This seats taken\b/i.test(before.title))throw Error('Unexpected cat listing');
 if(inventory.products?.filter(p=>!p.is_deleted).length!==12||inventory.products.some(p=>!p.is_deleted&&p.sku!==sku))throw Error('Unexpected cat inventory');
 if(!Array.isArray(photos.results)||photos.results.length!==4||photos.results.some(p=>p.listing_id!==listingId||!Number.isSafeInteger(p.listing_image_id))||new Set(photos.results.map(p=>p.rank)).size!==4||photos.results.some(p=>p.rank<1||p.rank>4))throw Error('Expected four current cat photographs');
 const master=await uploads.get(asset.masterKey,{type:'arrayBuffer',consistency:'strong'});
 if(!master||hash(master)!==asset.image?.sha256)throw Error('Cat master changed');
 const images=await mockups(Buffer.from(master));if(images.length!==4||images.some(b=>!Buffer.isBuffer(b)||!b.length))throw Error('Four replacement mockups required');
 const description=physicalDescription(before.description),previewHashes=images.map(hash),plan=structuredClone(asset.plan);
 plan.body.description=description;plan.identity.previewHashes=previewHashes;
 plan.hash=hash(JSON.stringify({version:plan.version,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 const approvalHash=hash(asset.image.sha256+':'+plan.hash+':'+TEMPLATE_VERSION);
 const claim=await uploads.setJSON('claims/'+refreshId+'/publish',{purpose:'owner-chat-authorised-cat-presentation',listingId,sourceRevision:mapping.uploadId,at:clock()},{onlyIfNew:true});
 if(claim?.modified!==true)throw Error('Cat refresh already claimed; inspect before retry');
 let state={...asset,productId,updateProductId:productId,phase:'publishing',stage:'replacing_listing_images',plan,approvalHash,metadata:{...asset.metadata,description},approvedAt:clock(),updatedAt:clock(),presentationRefresh:{phase:'updating',sourceRevision:mapping.uploadId,previousDescription:before.description,previousImages:photos.results.map(p=>({listing_image_id:p.listing_image_id,rank:p.rank})),imageIds:[],inventoryHash:hash(JSON.stringify(inventory)),authorisation:'Jim explicitly requested replacement in chat on 2026-10-14'}};
 await uploads.setJSON(stateKey(refreshId),state);
 for(let i=0;i<4;i++)await uploads.set('uploads/'+refreshId+'/mockups/'+i+'.jpg',images[i]);
 try {
  // Check again immediately before the first external mutation.
  if(retained(await client.api(path))!==retained(before)||JSON.stringify(await client.api(path+'/inventory'))!==JSON.stringify(inventory))throw Error('Cat listing changed before update');
  for(let i=0;i<4;i++){
   const form=new FormData();form.set('image',new Blob([images[i]],{type:'image/jpeg'}),sku+'-'+(i+1)+'.jpg');form.set('rank',String(i+1));form.set('overwrite','true');
   form.set('alt_text',['Print only — unframed','Black frame','White frame','Oak frame'][i]+': black cat resting on an open book. Illustrative mockup; frame appearance may vary.');
   const photo=await client.api('/shops/'+seller.shop_id+'/listings/'+listingId+'/images',{method:'POST',body:form});
   if(photo.listing_id!==listingId||!Number.isSafeInteger(photo.listing_image_id))throw Error('Replacement photo response mismatch');
   state.presentationRefresh.imageIds.push(photo.listing_image_id);state.updatedAt=clock();await uploads.setJSON(stateKey(refreshId),state);
  }
  const checked=await client.api(path+'/images');
  const ranked=checked.results?.slice().sort((a,b)=>a.rank-b.rank);
  if(ranked?.length!==4||ranked.some((p,i)=>p.listing_id!==listingId||p.rank!==i+1||p.listing_image_id!==state.presentationRefresh.imageIds[i]))throw Error('Replacement photo read-back mismatch');
  await client.api('/shops/'+seller.shop_id+'/listings/'+listingId,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({description}).toString()});
  const after=await client.api(path);
  if(after.description!==description||retained(after)!==retained(before)||JSON.stringify(await client.api(path+'/inventory'))!==JSON.stringify(inventory))throw Error('Cat listing retained-field mismatch');
  state={...state,phase:'published',stage:'complete',publishedAt:clock(),updatedAt:clock(),presentationRefresh:{...state.presentationRefresh,phase:'verified'}};
  await uploads.setJSON(stateKey(refreshId),state);await recordRevision(uploads,refreshId);
  await etsyStore.setJSON('draft/'+sku,{...mapping,uploadId:refreshId});
  return {phase:'verified',listingId,imageIds:state.presentationRefresh.imageIds,changed:true};
 }catch(error){await uploads.setJSON(stateKey(refreshId),{...state,phase:'needs_investigation',stage:'presentation_refresh_needs_checking',presentationRefresh:{...state.presentationRefresh,phase:'needs_investigation'}});throw error;}
}
