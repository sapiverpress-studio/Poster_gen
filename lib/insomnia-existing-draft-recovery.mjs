import {createHash,randomBytes} from 'node:crypto';
import {auditInsomniaDraft} from './insomnia-draft-diagnostic.mjs';
import {exactHtmlEntityChanges,verifyTemplateListing,verifyTemplateInventory,SIZES} from './poster-template.mjs';
import {requiredPhysicalDeliveryMode,verifyRequiredPhysicalProfile,readCompleteDeliveryProfile,verifyPhysicalDeliveryProfile} from './international-delivery.mjs';
import {SHRIMP_API,TRANSFER_TTL,supplierPayload} from './printshrimp-api.mjs';
import {recordRevision,recordKey} from './product-records.mjs';
import {workerFailure} from './worker-diagnostics.mjs';
const SHOP=50893070,SKU='SP-INSOMNIA-ON-STRIKE-9AE40538';
const VERSION='owner-authorised-insomnia-draft-recovery-20261109-v1';
const digest=data=>createHash('sha256').update(data).digest('hex');
const assetKey=id=>'uploads/'+id+'/state';
const GET_OPTS={type:'json',consistency:'strong'};
export function exactInsomniaTitleEncoding(expected,actual){
 const entity=exactHtmlEntityChanges(expected,actual);
 return entity.exact===true&&entity.total>0;
}
function verifyTitleAndDraft(listing,plan,listingId,state='draft'){
 if(listing?.listing_id!==listingId||listing?.shop_id!==SHOP)throw Error('Insomnia existing Etsy listing identity changed');
 if(!exactInsomniaTitleEncoding(plan.body.title,listing.title))
  throw Error('Insomnia title has a substantive difference; no in-place recovery permitted');
 verifyTemplateListing(listing,plan,{shopId:SHOP,state});
 if(!Array.isArray(listing.images)||listing.images.length!==4||
    new Set(listing.images.map(x=>x.listing_image_id)).size!==4||
    listing.images.some(x=>!Number.isSafeInteger(x.listing_image_id)||x.listing_image_id<=0))
  throw Error('Insomnia original Etsy images changed');
}
// Only the exact retained draft may be resumed. This never creates an Etsy listing,
// changes the owner-approved title or removes old publication claims.
export async function recoverInsomniaDraft({uploads,etsyStore,client,env,request=fetch,clock=()=>Date.now()}){
 if(env('POSTER_PUBLICATION_ENABLED')!=='true')throw Error('Insomnia publication release gate disabled');
 const audit=await auditInsomniaDraft({uploads,etsyStore,client,apiKey:env('SHRIMP_APIKEY'),request});
 if(!audit.canInvestigateRepair||audit.mismatches.length!==1||audit.mismatches[0].field!=='title')
  throw Error('Insomnia retained draft does not have a safe title-only discrepancy');
 const lock=await etsyStore.get('draft/'+SKU,GET_OPTS);
 if(!/^[A-Za-z0-9_-]{32}$/.test(lock?.uploadId||'')||lock.listingId!==audit.listingId)
  throw Error('Insomnia original Etsy draft reservation changed');
 const id=lock.uploadId,listingId=lock.listingId;
 let asset=await uploads.get(assetKey(id),GET_OPTS);
 if(asset?.phase!=='needs_investigation'||asset?.stage!=='etsy_draft'||asset.failureAction!=='publish'||
    asset.listingId!==listingId||asset.plan?.identity?.sku!==SKU||asset.supplierProductId)
  throw Error('Insomnia saved revision changed');
 const plan=asset.plan,sizes=asset.metadata?.printSizes||SIZES;
 if(!['A5|A4','A5|A4|A3'].includes(sizes.join('|'))||
    plan.inventory.products.length!==sizes.length*4||
    plan.inventory.products.some(p=>p.sku!==SKU))
  throw Error('Insomnia original supplier sizes or SKU changed');
 const product=await uploads.get(recordKey(asset.productId||id),GET_OPTS);
 if(product?.currentRevision&&product.currentRevision!==id||
    product?.pendingRevision&&product.pendingRevision!==id||
    product?.etsyListingId&&product.etsyListingId!==listingId)
  throw Error('Insomnia existing product mapping changed');
 const seller=await client.session();
 if(seller.shop_id!==SHOP||seller.shop_name!=='SapiverPrints')throw Error('Insomnia seller changed');
 if(plan.identity.shopId&&plan.identity.shopId!==SHOP)throw Error('Insomnia approved shop changed');
 const getListing=()=>client.api('/listings/'+listingId+'?includes=Images');
 const getInventory=()=>client.api('/listings/'+listingId+'/inventory');
 const original=await getListing();
 verifyTitleAndDraft(original,plan,listingId);
 verifyTemplateInventory(await getInventory(),plan);
 const master=await uploads.get(asset.masterKey,{type:'arrayBuffer',consistency:'strong'});
 if(!master||digest(Buffer.from(master))!==asset.image.sha256)
  throw Error('Insomnia approved master changed');
 for(let i=0;i<4;i++){
  const preview=await uploads.get('uploads/'+id+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'});
  if(!preview||digest(Buffer.from(preview))!==plan.identity.previewHashes?.[i])
   throw Error('Insomnia approved preview changed');
 }
 const deliveryMode=plan.deliveryMode||'domestic';
 requiredPhysicalDeliveryMode(env);
 verifyRequiredPhysicalProfile({env,deliveryMode,shippingProfileId:plan.body.shipping_profile_id});
 if(deliveryMode==='international'&&env('POSTER_INTERNATIONAL_SHIPPING_ENABLED')!=='true')
  throw Error('Insomnia approved international shipping disabled');
 verifyPhysicalDeliveryProfile({
  shipping:await readCompleteDeliveryProfile({client,shopId:SHOP,profileId:plan.body.shipping_profile_id}),
  processing:await client.api('/shops/'+SHOP+'/readiness-state-definitions/'+plan.body.readiness_state_id),
  returns:await client.api('/shops/'+SHOP+'/policies/return/'+plan.body.return_policy_id),
  shopId:SHOP,mode:deliveryMode,carriers:await client.api('/shipping-carriers?origin_country_iso=GB')
 });
 const partners=await client.api('/shops/'+SHOP+'/production-partners');
 const matching=partners.results?.filter(p=>/^print\s*shrimp$/i.test(p.partner_name||'')&&
   /Romford/i.test(p.location||'')&&String(p.production_partner_id)===plan.body.production_partner_ids);
 if(matching?.length!==1)throw Error('Insomnia supplier attribution changed');
 const origin=env('CANVA_SITE_ORIGIN'),key=env('SHRIMP_APIKEY');
 if(!origin||!key||new URL(origin).protocol!=='https:')throw Error('Insomnia supplier configuration missing');
 const supplierKey='supplier/'+SKU,existing=await uploads.get(supplierKey,GET_OPTS);
 if(existing)throw Error('Insomnia supplier reservation already exists');
 const headers={'x-api-key':key,Accept:'application/json'};
 const lookup=SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku:SKU});
 const result=await request(lookup,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)});
 if(result.status!==404)throw Error('Insomnia supplier SKU is not confirmed absent');
 // One irreversible claim. No automatic retry after ANY subsequent uncertainty.
 const claimKey='products/'+id+'/revision/'+digest(VERSION).slice(0,32);
 const claimed=await etsyStore.setJSON(claimKey,{phase:'running',listingId,approvalHash:asset.approvalHash,at:clock()},{onlyIfNew:true});
 if(claimed?.modified!==true)throw Error('Insomnia in-place recovery already claimed');
 const save=async patch=>{
  asset={...asset,...patch,updatedAt:clock()};
  await uploads.setJSON(assetKey(id),asset);
  await recordRevision(uploads,id);
 };
 let step='supplier_reservation',ticketKey=null;
 try{
  await save({phase:'publishing',stage:'supplier_pending',failureCode:null,
   recovery:{version:VERSION,step,startedAt:clock()}});
  const reservation=await uploads.setJSON(supplierKey,{phase:'reserved',listingId,uploadId:id,ordersEnabled:false},{onlyIfNew:true});
  if(reservation?.modified!==true)throw Error('Insomnia supplier reservation unavailable');
  const ticket=randomBytes(32).toString('base64url');ticketKey='transfers/'+ticket;
  await uploads.setJSON(ticketKey,{fileKey:asset.masterKey,bytes:asset.image.bytes,sha256:asset.image.sha256,expiresAt:clock()+TRANSFER_TTL});
  step='supplier_transfer';await save({recovery:{...asset.recovery,step}});
  const sourceUrl=origin+'/poster/artwork.png?'+new URLSearchParams({ticket});
  const created=await request(SHRIMP_API+'/api-create-product',{method:'POST',redirect:'error',
   signal:AbortSignal.timeout(60000),headers:{...headers,'Content-Type':'application/json'},
   body:JSON.stringify(supplierPayload(plan.identity.name,SKU,sourceUrl,sizes))});
  if(!created.ok)throw Error('Insomnia supplier create not verified');
  const response=await request(lookup,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Insomnia supplier readback unavailable');
  const data=await response.json(),p=data.product;
  if(data.success!==true||p?.sku!==SKU||typeof p.product_id!=='string'||!p.product_id||
     p.variants?.map(v=>v.size).sort().join('|')!==sizes.slice().sort().join('|')||
     p.variants?.some(v=>{try{const u=new URL(v.image_url);return u.protocol!=='https:'||u.origin===new URL(origin).origin;}catch{return true;}}))
   throw Error('Insomnia supplier sizes not verified');
  await uploads.setJSON(supplierKey,{phase:'verified',listingId,productId:p.product_id,uploadId:id,ordersEnabled:false});
  step='activation';await save({stage:'supplier_verified',supplierProductId:p.product_id,recovery:{...asset.recovery,step}});
  const unchanged=await getListing();verifyTitleAndDraft(unchanged,plan,listingId);
  verifyTemplateInventory(await getInventory(),plan);
  await save({stage:'publishing_etsy'});
  await client.api('/shops/'+SHOP+'/listings/'+listingId,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'state=active'});
  const active=await getListing();verifyTitleAndDraft(active,plan,listingId,'active');
  verifyTemplateInventory(await getInventory(),plan);
  await save({phase:'published',stage:'complete',failureCode:null,etsyUrl:active.url||null,
   publishedAt:clock(),recovery:{...asset.recovery,step:'complete'}});
  await etsyStore.setJSON('draft/'+SKU,{phase:'published',listingId,uploadId:id});
  await etsyStore.setJSON(claimKey,{phase:'complete',listingId,at:clock()});
  return {phase:'published',listingId,existingListing:true,variants:sizes.length*4,
   images:4,supplierVerified:true,ordersEnabled:false};
 }catch(error){
  const diagnostic=workerFailure(error);
  await save({phase:'needs_investigation',failureAction:'publish',
   failureCode:'Insomnia recovery stopped at '+step+': '+(diagnostic.reason||'unclassified'),
   recovery:{...asset.recovery,step,failedAt:clock(),diagnostic}});
  await etsyStore.setJSON(claimKey,{phase:'needs_investigation',listingId,step,diagnostic,at:clock()});
  return {phase:'needs_investigation',listingId,step,reason:diagnostic.reason||'unclassified',existingListing:true};
 }finally{
  if(ticketKey)await uploads.setJSON(ticketKey,{revoked:true,expiresAt:0});
 }
}
