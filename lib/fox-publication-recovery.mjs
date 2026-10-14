import {randomBytes,createHash} from 'node:crypto';
const hashBytes=bytes=>createHash('sha256').update(bytes instanceof ArrayBuffer?Buffer.from(bytes):bytes).digest('hex');
const assetKey=id=>'uploads/'+id+'/state';
import {recordRevision,recordKey} from './product-records.mjs';
import {verifyTemplateListing,verifyTemplateInventory,verifyTemplateProfiles,verifyTemplateCarrier,TEMPLATE_VERSION,etsyCompatibleSku} from './poster-template.mjs';
import {SHRIMP_API,TRANSFER_TTL,supplierPayload} from './printshrimp-api.mjs';
import {workerFailure} from './worker-diagnostics.mjs';
const SKU='SP-FOX-PRINT-WITH-ORIGINAL-WOODLAND-VERSE',LISTING=4595277551,SHOP=50893070;
const PREVIOUS_RECOVERY='owner-authorised-fox-recovery-20261014-v1';
const RECOVERY='owner-authorised-fox-sku-repair-20261014-v2';
const FULFILMENT_SKU=etsyCompatibleSku(SKU);
if(FULFILMENT_SKU.length>32||FULFILMENT_SKU===SKU)throw Error('Fox mapped SKU invalid');
const digest=s=>createHash('sha256').update(s).digest('hex');
// Explicitly authorised one-product recovery. Never clears the original publication lock.
export async function recoverFoxPublication({uploads,etsyStore,client,env,request=fetch,clock=()=>Date.now()}){
 if(env('POSTER_PUBLICATION_ENABLED')!=='true')throw Error('Live publication is not enabled');
 const lock=await etsyStore.get('draft/'+SKU,{type:'json',consistency:'strong'});
 if(lock?.listingId!==LISTING||!/^[A-Za-z0-9_-]{32}$/.test(lock.uploadId||''))throw Error('Fox recovery identity mismatch');
 const id=lock.uploadId;let asset=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 if(asset?.listingId!==LISTING||asset.plan?.identity?.sku!==SKU||asset.plan?.version!==TEMPLATE_VERSION)throw Error('Fox recovery identity mismatch');
 const plan=asset.plan,approval=await uploads.get('claims/'+id+'/publish',{type:'json',consistency:'strong'});
 if(plan.identity.sku!==SKU||plan.inventory.products.length!==12||plan.inventory.products.some(p=>p.sku!==SKU))throw Error('Fox original approved SKU mismatch');
 // The 41-character SKU remains in the original plan and approval hash; only
 // the two downstream supplier/Etsy inventory APIs receive the mapped SKU.
 const livePlan={...plan,identity:{...plan.identity,sku:FULFILMENT_SKU},inventory:{...plan.inventory,products:plan.inventory.products.map(p=>({...p,sku:FULFILMENT_SKU}))}};
 const planHash=hashBytes(JSON.stringify({version:plan.version,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 if(!Number.isFinite(asset.approvedAt)||approval?.approvalHash!==asset.approvalHash||planHash!==plan.hash||hashBytes(asset.image.sha256+':'+planHash+':'+TEMPLATE_VERSION)!==asset.approvalHash)throw Error('Fox recovery approval mismatch');
 if(hashBytes(Buffer.from(await uploads.get(asset.masterKey,{type:'arrayBuffer',consistency:'strong'})))!==asset.image.sha256)throw Error('Approved master changed');
 const previews=[];for(let i=0;i<4;i++){const bytes=await uploads.get('uploads/'+id+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'});if(!bytes||hashBytes(bytes)!==plan.identity.previewHashes?.[i])throw Error('Approved preview changed');previews.push(bytes);}
 const seller=await client.session();if(seller.shop_id!==SHOP||seller.shop_name!=='SapiverPrints')throw Error('Fox recovery shop mismatch');
 const product=await uploads.get(recordKey(asset.productId||id),{type:'json',consistency:'strong'});
 if(product?.etsyListingId&&product.etsyListingId!==LISTING||product?.currentRevision&&product.currentRevision!==id)throw Error('Fox recovery product changed');
 const getListing=()=>client.api('/listings/'+LISTING+'?includes=Images');
 const getInventory=()=>client.api('/listings/'+LISTING+'/inventory');
 const sections=await client.api('/shops/'+SHOP+'/sections');const matches=sections.results?.filter(s=>s.title===plan.identity.sectionTitle);
 if(matches?.length!==1)throw Error('Fox recovery section mismatch');const sectionId=matches[0].shop_section_id;
 const checkListing=(l,state)=>{verifyTemplateListing(l,plan,{shopId:SHOP,state});if(l.listing_id!==LISTING||l.shop_section_id!==sectionId)throw Error('Fox recovery listing changed');};
 const listing=await getListing();
 if(asset.phase==='published'&&listing.state==='active'){
  checkListing(listing,'active');
  if(asset.fulfilmentSku!==FULFILMENT_SKU)throw Error('Fox published SKU mismatch');
  verifyTemplateInventory(await getInventory(),livePlan);
  if(!asset.supplierProductId||listing.images?.length!==4)throw Error('Fox recovery completion not verified');
  return {phase:'published',listingId:LISTING,fulfilmentSku:FULFILMENT_SKU,supplierRecorded:true,changed:false};
 }
 if(asset.phase!=='needs_investigation'||asset.stage!=='etsy_draft')throw Error('Fox recovery not at retained draft stage');
 // Allow v2 only when the first, single-shot v1 attempt was rejected for SKU length.
 const previous=await etsyStore.get('products/'+id+'/revision/'+digest(PREVIOUS_RECOVERY).slice(0,32),{type:'json',consistency:'strong'});
 const oldReason=asset.recovery?.diagnostic;
 if(asset.recovery?.version!==PREVIOUS_RECOVERY||asset.recovery?.step!=='inventory'||oldReason?.httpStatus!==400||oldReason?.validationReason!=='sku_length_rejected'||
    previous?.phase!=='needs_investigation'||previous?.step!=='inventory'||previous?.diagnostic?.validationReason!=='sku_length_rejected')throw Error('Fox SKU failure evidence mismatch');
 if(await etsyStore.get('draft/'+FULFILMENT_SKU,{type:'json',consistency:'strong'}))throw Error('Fox shorter SKU already reserved');
 checkListing(listing,'draft');
 if(listing.images?.length!==0||asset.supplierProductId)throw Error('Fox recovery progress requires inspection');
 const inv=await getInventory();const live=inv.products?.filter(p=>!p.is_deleted);
 if(live?.length!==1||live[0].sku||live[0].property_values?.length)throw Error('Fox recovery inventory already changed');
 // Search ALL listing states for a previous manual or automated SKU allocation.
 for(const state of ['active','inactive','sold_out','draft','removed','expired']){
  let offset=0;
  while(true){
   const page=await client.api('/shops/'+SHOP+'/listings?'+new URLSearchParams({state,limit:'100',offset:String(offset)}));
   if(!Array.isArray(page.results)||!Number.isSafeInteger(page.count)||page.count<0||page.count>10000)throw Error('Fox SKU collision audit incomplete');
   for(const item of page.results){if(item.shop_id!==SHOP||!Array.isArray(item.skus))throw Error('Fox SKU collision audit incomplete');if(item.skus.includes(FULFILMENT_SKU))throw Error('Fox fulfilment SKU already used');}
   offset+=page.results.length;if(offset>=page.count)break;if(!page.results.length)throw Error('Fox SKU collision audit incomplete');
  }
 }
 // Confirm original business settings before the first write.
 const shipping=await client.api('/shops/'+SHOP+'/shipping-profiles/'+plan.body.shipping_profile_id);
 verifyTemplateProfiles(shipping,await client.api('/shops/'+SHOP+'/readiness-state-definitions/'+plan.body.readiness_state_id),await client.api('/shops/'+SHOP+'/policies/return/'+plan.body.return_policy_id),SHOP);
 verifyTemplateCarrier(shipping,await client.api('/shipping-carriers?origin_country_iso=GB'));
 const partners=await client.api('/shops/'+SHOP+'/production-partners');
 if(partners.results?.filter(p=>/^print\s*shrimp$/i.test(p.partner_name||'')&&/Romford/i.test(p.location||'')&&String(p.production_partner_id)===plan.body.production_partner_ids).length!==1)throw Error('Fox recovery production partner changed');
 const key=env('SHRIMP_APIKEY'),origin=env('CANVA_SITE_ORIGIN');if(!key||!origin)throw Error('Fox recovery supplier configuration missing');
 const headers={'x-api-key':key,Accept:'application/json'},lookup=SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku:FULFILMENT_SKU});
 const oldLookup=SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku:SKU});
 if(await uploads.get('supplier/'+SKU,{type:'json',consistency:'strong'})||
    await uploads.get('supplier/'+FULFILMENT_SKU,{type:'json',consistency:'strong'}))throw Error('Fox recovery supplier already reserved');
 for(const url of [oldLookup,lookup]){
  if((await request(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)})).status!==404)throw Error('Fox recovery supplier lookup not absent');
 }
 const recoveryKey='products/'+id+'/revision/'+digest(RECOVERY).slice(0,32);
 const claim=await etsyStore.setJSON(recoveryKey,{phase:'running',listingId:LISTING,approvalHash:asset.approvalHash,fulfilmentSku:FULFILMENT_SKU,at:clock()},{onlyIfNew:true});
 if(claim?.modified!==true)throw Error('Fox recovery already attempted; inspect before retry');
 const alias=await etsyStore.setJSON('draft/'+FULFILMENT_SKU,{phase:'recovery_reserved',listingId:LISTING,uploadId:id},{onlyIfNew:true});
 if(alias?.modified!==true)throw Error('Fox shorter SKU already reserved');
 const save=async patch=>{asset={...asset,...patch,updatedAt:clock()};await uploads.setJSON(assetKey(id),asset);await recordRevision(uploads,id);};
 let step='inventory';
 try{
  await save({phase:'publishing',failureCode:null,fulfilmentSku:FULFILMENT_SKU,recovery:{version:RECOVERY,step,startedAt:clock()}});
  await client.api('/listings/'+LISTING+'/inventory',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(livePlan.inventory)});
  verifyTemplateInventory(await getInventory(),livePlan);
  step='images';await save({recovery:{...asset.recovery,step}});
  const imageIds=[];
  for(let i=0;i<4;i++){
   const form=new FormData();form.set('image',new Blob([previews[i]],{type:'image/jpeg'}),SKU+'-mockup-'+(i+1)+'.jpg');form.set('rank',String(i+1));
   const image=await client.api('/shops/'+SHOP+'/listings/'+LISTING+'/images',{method:'POST',body:form});
   if(!Number.isSafeInteger(image.listing_image_id)||image.listing_image_id<=0)throw Error('Fox recovery image response invalid');
   imageIds.push(image.listing_image_id);await save({recovery:{...asset.recovery,imageIds:[...imageIds]}});
  }
  const pictured=await getListing();checkListing(pictured,'draft');
  if(pictured.images?.length!==4||!imageIds.every(id=>pictured.images.some(i=>i.listing_image_id===id)))throw Error('Fox recovery images not verified');
  step='supplier';await save({recovery:{...asset.recovery,step}});
  const reserved=await uploads.setJSON('supplier/'+FULFILMENT_SKU,{phase:'reserved',listingId:LISTING,uploadId:id},{onlyIfNew:true});if(reserved?.modified!==true)throw Error('Supplier upload already reserved');
  const ticket=randomBytes(32).toString('base64url'),grantKey='transfers/'+ticket;
  await uploads.setJSON(grantKey,{fileKey:asset.masterKey,bytes:asset.image.bytes,sha256:asset.image.sha256,expiresAt:clock()+TRANSFER_TTL});
  try{
   const imageUrl=origin+'/poster/artwork.png?'+new URLSearchParams({ticket});
   const created=await request(SHRIMP_API+'/api-create-product',{method:'POST',headers:{...headers,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(60000),body:JSON.stringify(supplierPayload(plan.identity.name,FULFILMENT_SKU,imageUrl))});
   if(!created.ok)throw Error('Supplier create unavailable');
   const read=await request(lookup,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)});if(!read.ok)throw Error('Supplier read-back unavailable');
   const data=await read.json(),p=data.product;
   if(data.success!==true||p?.sku!==FULFILMENT_SKU||typeof p.product_id!=='string'||!p.product_id||p.variants?.map(v=>v.size).sort().join('|')!=='A3|A4|A5'||p.variants.some(v=>{try{const u=new URL(v.image_url);return u.protocol!=='https:'||u.origin===new URL(origin).origin;}catch{return true;}}))throw Error('Supplier did not persist three print sizes');
   await uploads.setJSON('supplier/'+FULFILMENT_SKU,{phase:'verified',listingId:LISTING,productId:p.product_id,uploadId:id,ordersEnabled:false});await save({stage:'supplier_verified',supplierProductId:p.product_id});
  }finally{await uploads.setJSON(grantKey,{revoked:true,expiresAt:0});}
  step='activation';await save({stage:'publishing_etsy',recovery:{...asset.recovery,step}});
  checkListing(await getListing(),'draft');verifyTemplateInventory(await getInventory(),livePlan);
  await client.api('/shops/'+SHOP+'/listings/'+LISTING,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'state=active'});
  const active=await getListing();checkListing(active,'active');verifyTemplateInventory(await getInventory(),livePlan);
  await save({phase:'published',stage:'complete',failureCode:null,etsyUrl:active.url||null,publishedAt:clock(),recovery:{...asset.recovery,step:'complete'}});
  await etsyStore.setJSON('draft/'+SKU,{phase:'published',listingId:LISTING,uploadId:id,fulfilmentSku:FULFILMENT_SKU});
  await etsyStore.setJSON('draft/'+FULFILMENT_SKU,{phase:'published',listingId:LISTING,uploadId:id});await etsyStore.setJSON(recoveryKey,{phase:'complete',listingId:LISTING,at:clock()});
  return {phase:'published',listingId:LISTING,fulfilmentSku:FULFILMENT_SKU,supplierRecorded:true,images:4,variants:12,changed:true};
 }catch(error){
  const diagnostic=workerFailure(error);
  await save({phase:'needs_investigation',failureAction:'publish',failureCode:'Fox recovery stopped at '+step+': '+(diagnostic.message||diagnostic.reason)+(diagnostic.httpStatus?' (HTTP '+diagnostic.httpStatus+')':'')+(diagnostic.validationReason?' '+diagnostic.validationReason:''),recovery:{...asset.recovery,step,diagnostic,failedAt:clock()}});
  await etsyStore.setJSON(recoveryKey,{phase:'needs_investigation',listingId:LISTING,step,diagnostic,at:clock()});
  return {phase:'needs_investigation',listingId:LISTING,step,...diagnostic};
 }
}
