import {createHash} from 'node:crypto';
import {verifyTemplateInventory,TEMPLATE_VERSION} from './poster-template.mjs';
import {SHRIMP_API} from './printshrimp-api.mjs';

const SKU='SP-BUTTERFLY';
const LISTING=4595774989;
const SHOP=50893070;
const FIELDS=['title','description','taxonomy_id','shipping_profile_id','readiness_state_id','return_policy_id','who_made','when_made'];
const digest=data=>createHash('sha256').update(data).digest('hex');
const exists=v=>v!==null&&v!==undefined;
function classification(expected,actual){
 if(!exists(actual))return 'missing_or_null';
 if(typeof expected!==typeof actual)return 'type_mismatch';
 if(typeof expected==='string'&&typeof actual==='string'){
  if(expected.replace(/\r\n/g,'\n')===actual.replace(/\r\n/g,'\n'))return 'line_endings_only';
  if(expected.trim()===actual.trim())return 'outer_whitespace_only';
  if(expected.replace(/\s+/g,' ').trim()===actual.replace(/\s+/g,' ').trim())return 'whitespace_normalisation';
 }
 return 'different_value';
}
// One-off, strictly read-only check; never emit provider bodies, listing copy,
// customer details, tokens, signed URLs, approval hash, or private blob keys.
export async function auditButterflyDraft({uploads,etsyStore,client,apiKey,request=fetch}){
 const lock=await etsyStore.get('draft/'+SKU,{type:'json',consistency:'strong'});
 if(lock?.listingId!==LISTING||!/^[A-Za-z0-9_-]{32}$/.test(lock.uploadId||''))throw Error('Butterfly draft lock mismatch');
 const id=lock.uploadId;
 const asset=await uploads.get('uploads/'+id+'/state',{type:'json',consistency:'strong'});
 if(asset?.listingId!==LISTING||asset?.phase!=='needs_investigation'||asset?.stage!=='etsy_draft'||asset.plan?.identity?.sku!==SKU||asset.plan.version!==TEMPLATE_VERSION)throw Error('Butterfly retained revision mismatch');
 const plan=asset.plan;
 const approval=await uploads.get('claims/'+id+'/publish',{type:'json',consistency:'strong'});
 const planHash=digest(JSON.stringify({version:plan.version,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 const approved=Number.isFinite(asset.approvedAt)&&approval?.approvalHash===asset.approvalHash&&planHash===plan.hash&&digest(asset.image.sha256+':'+planHash+':'+TEMPLATE_VERSION)===asset.approvalHash;
 if(!approved)throw Error('Butterfly approval integrity mismatch');
 const seller=await client.session();
 if(seller.shop_id!==SHOP||seller.shop_name!=='SapiverPrints')throw Error('Butterfly shop mismatch');
 const listing=await client.api('/listings/'+LISTING+'?includes=Images');
 if(listing.listing_id!==LISTING||listing.shop_id!==SHOP)throw Error('Butterfly listing identity mismatch');
 const inventory=await client.api('/listings/'+LISTING+'/inventory');
 const differences=FIELDS.filter(field=>listing[field]!==plan.body[field]).map(field=>({field,classification:classification(plan.body[field],listing[field]),expectedPresent:exists(plan.body[field]),actualPresent:exists(listing[field])}));
 if(listing.state!=='draft')differences.push({field:'state',classification:'unexpected_state'});
 if(listing.listing_type!=='physical')differences.push({field:'listing_type',classification:'unexpected_type'});
 if(listing.is_personalizable!==false)differences.push({field:'is_personalizable',classification:'unexpected_value'});
 const expectedTags=String(plan.body.tags||'').split(',').sort();
 const actualTags=Array.isArray(listing.tags)?listing.tags.slice().sort():null;
 if(!actualTags||actualTags.join('|')!==expectedTags.join('|'))differences.push({field:'tags',classification:'different_or_missing_tags',expectedCount:expectedTags.length,actualCount:actualTags?.length??null});
 const inventoryProducts=(inventory.products||[]).filter(p=>!p.is_deleted);
 let inventoryStatus='verified';
 try{verifyTemplateInventory(inventory,plan)}catch{inventoryStatus='mismatch'}
 const images=Array.isArray(listing.images)?listing.images:[];
 const sections=await client.api('/shops/'+SHOP+'/sections');
 const matching=sections.results?.filter(s=>s.title===plan.identity.sectionTitle)||[];
 const sectionStatus=matching.length===1&&matching[0].shop_section_id===listing.shop_section_id?'verified':'mismatch';
 let supplierStatus='not_checked';
 if(typeof apiKey==='string'&&apiKey.length){
  try{
   const response=await request(SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku:SKU}),{method:'GET',headers:{'x-api-key':apiKey,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
   supplierStatus=response.status===404?'absent':response.ok?'exists':'unknown_response';
  }catch{supplierStatus='request_unavailable'}
 }
 return {audit:'butterfly-draft-read-only-v1',listingId:LISTING,sku:SKU,recordPhase:asset.phase,recordStage:asset.stage,etsyState:listing.state,
  approvalVerified:true,modifiedFields:differences,inventoryStatus,inventoryProducts:inventoryProducts.length,expectedInventoryProducts:plan.inventory.products.length,
  liveSkuLengths:[...new Set(inventoryProducts.map(p=>String(p.sku||'').length))],imageCount:images.length,sectionStatus,supplierRecorded:!!asset.supplierProductId,supplierStatus,
  readyForSafeRepair:sectionStatus==='verified'&&inventoryStatus==='verified'&&images.length===4&&supplierStatus==='absent'&&!asset.supplierProductId};
}
