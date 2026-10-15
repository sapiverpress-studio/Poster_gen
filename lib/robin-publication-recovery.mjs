import {createHash,randomBytes} from 'node:crypto';
import {auditRobinDraft} from './robin-draft-audit.mjs';
import {verifyTemplateInventory,verifyTemplateListing,verifyTemplateProfiles,verifyTemplateCarrier,TEMPLATE_VERSION} from './poster-template.mjs';
import {SHRIMP_API,TRANSFER_TTL,supplierPayload} from './printshrimp-api.mjs';
import {recordRevision,recordKey} from './product-records.mjs';
import {workerFailure} from './worker-diagnostics.mjs';

const SKU='SP-THE-ROBIN',LISTING=4595921846,SHOP=50893070;
const RECOVERY='owner-approved-robin-draft-recovery-v1';
const digest=s=>createHash('sha256').update(s).digest('hex');
const hashBytes=b=>digest(Buffer.from(b));
const stateKey=id=>'uploads/'+id+'/state';

// STAGED, NOT SCHEDULED OR ENABLED. This exact-ID recovery is not called by
// the ordinary publication worker; separate owner authorisation is required
// before wiring or executing it on a credentialled live worker.
export async function recoverRobinDraft({uploads,etsyStore,client,env,request=fetch,clock=()=>Date.now()}){
 if(env('POSTER_PUBLICATION_ENABLED')!=='true')throw Error('Publication gate disabled');
 const read=await auditRobinDraft({uploads,etsyStore,client,apiKey:env('SHRIMP_APIKEY'),request});
 if(read.listingId!==LISTING||read.etsyState!=='draft'||read.recordStage!=='etsy_draft'||!read.approvalVerified||
    read.inventoryStatus!=='verified'||read.inventoryProducts!==12||read.imageCount!==4||read.sectionStatus!=='verified'||
    read.supplierRecorded||read.supplierStatus!=='absent')throw Error('Robin recovery preflight mismatch');
 if(read.modifiedFields.length!==1||read.modifiedFields[0].field!=='description'||
    read.descriptionProbe?.normalisations?.join('|')!=='html_entities'||
    read.entityAudit?.exact!==true||read.entityAudit.total!==2||
    read.entityAudit.entityCounts?.apostrophe_numeric!==2||
    Object.keys(read.entityAudit.entityCounts).length!==1||
    read.descriptionProbe.actualCharacters-read.descriptionProbe.expectedCharacters!==8)
    throw Error('Robin description discrepancy differs from the verified two apostrophe encodings');
 const lock=await etsyStore.get('draft/'+SKU,{type:'json',consistency:'strong'}),id=lock.uploadId;
 let asset=await uploads.get(stateKey(id),{type:'json',consistency:'strong'});
 if(asset.listingId!==LISTING||asset.phase!=='needs_investigation'||asset.stage!=='etsy_draft'||asset.plan.identity.sku!==SKU||
   asset.plan.version!==TEMPLATE_VERSION||!Number.isFinite(asset.approvedAt))throw Error('Robin revision identity mismatch');
 const product=await uploads.get(recordKey(asset.productId||id),{type:'json',consistency:'strong'});
 if(product?.currentRevision&&product.currentRevision!==id||product?.pendingRevision&&product.pendingRevision!==id||
    product?.etsyListingId&&product.etsyListingId!==LISTING)throw Error('Robin product revision changed');
 const master=await uploads.get(asset.masterKey,{type:'arrayBuffer',consistency:'strong'});
 if(!master||hashBytes(master)!==asset.image.sha256)throw Error('Robin approved master changed');
 for(let i=0;i<4;i++){
  const preview=await uploads.get('uploads/'+id+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'});
  if(!preview||hashBytes(preview)!==asset.plan.identity.previewHashes?.[i])throw Error('Robin approved preview changed');
 }
 const listing=await client.api('/listings/'+LISTING+'?includes=Images');
 verifyTemplateListing(listing,asset.plan,{shopId:SHOP,state:'draft'});
 if(listing.listing_id!==LISTING||listing.images?.length!==4||new Set(listing.images.map(i=>i.listing_image_id)).size!==4||
    listing.images.some(i=>!Number.isSafeInteger(i.listing_image_id)||i.listing_image_id<=0))throw Error('Robin verified image set changed');
 verifyTemplateInventory(await client.api('/listings/'+LISTING+'/inventory'),asset.plan);
 // Recheck the unchanged made-to-order delivery/returns/processing settings
 // and supplier attribution before making any merchant or supplier write.
 const shipping=await client.api('/shops/'+SHOP+'/shipping-profiles/'+asset.plan.body.shipping_profile_id);
 verifyTemplateProfiles(shipping,
  await client.api('/shops/'+SHOP+'/readiness-state-definitions/'+asset.plan.body.readiness_state_id),
  await client.api('/shops/'+SHOP+'/policies/return/'+asset.plan.body.return_policy_id),SHOP);
 verifyTemplateCarrier(shipping,await client.api('/shipping-carriers?origin_country_iso=GB'));
 const partner=await client.api('/shops/'+SHOP+'/production-partners');
 if(partner.results?.filter(p=>/^print\s*shrimp$/i.test(p.partner_name||'')&&/Romford/i.test(p.location||'')&&String(p.production_partner_id)===asset.plan.body.production_partner_ids).length!==1)
  throw Error('Robin approved production partner changed');
 // Verify no competing supplier reservation before creating a one-time claim.
 if(await uploads.get('supplier/'+SKU,{type:'json',consistency:'strong'}))throw Error('Robin supplier already reserved');
 const claimKey='products/'+id+'/revision/'+digest(RECOVERY).slice(0,32);
 const claim=await etsyStore.setJSON(claimKey,{phase:'running',listingId:LISTING,at:clock(),approvalHash:asset.approvalHash},{onlyIfNew:true});
 if(claim?.modified!==true)throw Error('Robin recovery already attempted; inspect before retry');
 const save=async patch=>{asset={...asset,...patch,updatedAt:clock()};await uploads.setJSON(stateKey(id),asset);await recordRevision(uploads,id);};
 let step='supplier',ticketKey=null;
 try{
  await save({phase:'publishing',stage:'supplier_pending',failureCode:null,recovery:{version:RECOVERY,step,startedAt:clock()}});
  const reserved=await uploads.setJSON('supplier/'+SKU,{phase:'reserved',listingId:LISTING,uploadId:id,ordersEnabled:false},{onlyIfNew:true});
  if(reserved?.modified!==true)throw Error('Robin supplier reservation failed');
  const ticket=randomBytes(32).toString('base64url');
  ticketKey='transfers/'+ticket;
  await uploads.setJSON(ticketKey,{fileKey:asset.masterKey,bytes:asset.image.bytes,sha256:asset.image.sha256,expiresAt:clock()+TRANSFER_TTL});
  const origin=env('CANVA_SITE_ORIGIN'),key=env('SHRIMP_APIKEY');
  if(!origin||!key)throw Error('Robin supplier configuration missing');
  const sourceUrl=origin+'/poster/artwork.png?'+new URLSearchParams({ticket});
  const headers={'x-api-key':key,Accept:'application/json'};
  const created=await request(SHRIMP_API+'/api-create-product',{method:'POST',headers:{...headers,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(60000),body:JSON.stringify(supplierPayload(asset.plan.identity.name,SKU,sourceUrl))});
  if(!created.ok)throw Error('Robin supplier create unavailable');
  const result=await request(SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku:SKU}),{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!result.ok)throw Error('Robin supplier readback unavailable');
  const data=await result.json(),p=data.product;
  if(data.success!==true||p?.sku!==SKU||typeof p.product_id!=='string'||!p.product_id||
      p.variants?.map(v=>v.size).sort().join('|')!=='A3|A4|A5'||
      p.variants.some(v=>{try{const u=new URL(v.image_url);return u.protocol!=='https:'||u.origin===new URL(origin).origin;}catch{return true;}}))
      throw Error('Robin supplier variants not verified');
  await uploads.setJSON('supplier/'+SKU,{phase:'verified',listingId:LISTING,productId:p.product_id,uploadId:id,ordersEnabled:false});
  await save({stage:'supplier_verified',supplierProductId:p.product_id,recovery:{...asset.recovery,step:'activation'}});
  step='activation';
  const unchanged=await client.api('/listings/'+LISTING+'?includes=Images');
  verifyTemplateListing(unchanged,asset.plan,{shopId:SHOP,state:'draft'});
  if(unchanged.listing_id!==LISTING||unchanged.images?.length!==4)throw Error('Robin draft changed before activation');
  verifyTemplateInventory(await client.api('/listings/'+LISTING+'/inventory'),asset.plan);
  await client.api('/shops/'+SHOP+'/listings/'+LISTING,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'state=active'});
  const active=await client.api('/listings/'+LISTING+'?includes=Images');
  verifyTemplateListing(active,asset.plan,{shopId:SHOP,state:'active'});
  if(active.listing_id!==LISTING||active.images?.length!==4)throw Error('Robin activation readback mismatch');
  verifyTemplateInventory(await client.api('/listings/'+LISTING+'/inventory'),asset.plan);
  await save({phase:'published',stage:'complete',failureCode:null,etsyUrl:active.url||null,publishedAt:clock(),recovery:{...asset.recovery,step:'complete'}});
  await etsyStore.setJSON('draft/'+SKU,{phase:'published',listingId:LISTING,uploadId:id});
  await etsyStore.setJSON(claimKey,{phase:'complete',listingId:LISTING,at:clock()});
  return {phase:'published',listingId:LISTING,images:4,variants:12,supplierRecorded:true,changed:true};
 }catch(error){
  const diagnostic=workerFailure(error);
  await save({phase:'needs_investigation',failureAction:'publish',failureCode:'Robin recovery stopped at '+step+': '+(diagnostic.message||diagnostic.reason),
   recovery:{...asset.recovery,step,diagnostic,failedAt:clock()}});
  await etsyStore.setJSON(claimKey,{phase:'needs_investigation',listingId:LISTING,step,diagnostic,at:clock()});
  return {phase:'needs_investigation',listingId:LISTING,step,...diagnostic};
 }finally{
  if(ticketKey)await uploads.setJSON(ticketKey,{revoked:true,expiresAt:0});
 }
}
