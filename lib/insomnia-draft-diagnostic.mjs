import {createHash} from 'node:crypto';
import {descriptionFingerprint} from './robin-draft-audit.mjs';
import {exactHtmlEntityChanges,verifyTemplateInventory,TEMPLATE_VERSION} from './poster-template.mjs';
import {SHRIMP_API} from './printshrimp-api.mjs';

const SKU='SP-INSOMNIA-ON-STRIKE-9AE40538',SHOP=50893070;
const MATCH_ID=/^[A-Za-z0-9_-]{32}$/;
const FIELDS=['title','description','taxonomy_id','shipping_profile_id','readiness_state_id','return_policy_id','who_made','when_made'];
const digest=value=>createHash('sha256').update(value).digest('hex');
function shape(expected,actual){
 if(actual===undefined||actual===null)return 'missing_or_null';
 if(typeof expected!==typeof actual)return 'different_type';
 if(typeof expected==='string'){
  if(expected.replace(/\r\n?/g,'\n')===actual.replace(/\r\n?/g,'\n'))return 'line_endings';
  if(expected.trim()===actual.trim())return 'outer_whitespace';
  if(expected.normalize('NFC')===actual.normalize('NFC'))return 'unicode_normalisation';
  if(expected.replace(/\s+/g,' ').trim()===actual.replace(/\s+/g,' ').trim())return 'whitespace';
  if(expected.toLowerCase()===actual.toLowerCase())return 'case_only';
 }
 return 'different_value';
}
// Read-only, exact SKU audit. No owner/seller text, secret, URL, listing title,
// approval receipt, or image contents are logged. Never modifies a product.
export async function auditInsomniaDraft({uploads,etsyStore,client,apiKey,request=fetch}){
 const lock=await etsyStore.get('draft/'+SKU,{type:'json',consistency:'strong'});
 if(!MATCH_ID.test(lock?.uploadId||'')||!Number.isSafeInteger(lock?.listingId)||lock.listingId<=0)
  throw Error('Insomnia retained draft identity unavailable');
 const id=lock.uploadId,asset=await uploads.get('uploads/'+id+'/state',{type:'json',consistency:'strong'});
 if(asset?.listingId!==lock.listingId||asset?.plan?.identity?.sku!==SKU||asset.plan.version!==TEMPLATE_VERSION)
  throw Error('Insomnia saved draft mismatch');
 if(asset.phase!=='needs_investigation'||asset.stage!=='etsy_draft'||asset.failureAction!=='publish')
  throw Error('Insomnia saved state is no longer at the expected retained-draft stage');
 const approval=await uploads.get('claims/'+id+'/publish',{type:'json',consistency:'strong'});
 const plan=asset.plan,planHash=digest(JSON.stringify({
  version:plan.version,deliveryMode:plan.deliveryMode||'domestic',
  identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory
 }));
 if(!Number.isFinite(asset.approvedAt)||approval?.approvalHash!==asset.approvalHash||planHash!==plan.hash||
    digest(asset.image.sha256+':'+planHash+':'+TEMPLATE_VERSION)!==asset.approvalHash)
  throw Error('Insomnia original owner approval did not verify');
 const seller=await client.session();
 if(seller.shop_id!==SHOP||seller.shop_name!=='SapiverPrints')throw Error('Insomnia seller identity mismatch');
 const listing=await client.api('/listings/'+lock.listingId+'?includes=Images');
 if(listing.listing_id!==lock.listingId||listing.shop_id!==SHOP)throw Error('Insomnia Etsy listing identity mismatch');
 const inventory=await client.api('/listings/'+lock.listingId+'/inventory');
 let inventoryStatus='verified';
 try{verifyTemplateInventory(inventory,plan)}catch{inventoryStatus='mismatch'}
 const differences=[];
 for(const field of FIELDS){
  const expected=plan.body[field],actual=listing[field];
  if(field==='description'&&exactHtmlEntityChanges(expected,actual).exact)continue;
  if(expected!==actual)differences.push({field,shape:shape(expected,actual),
   ...(field==='description'?{descriptionFingerprint:descriptionFingerprint(expected,actual),
    htmlEntityAudit:exactHtmlEntityChanges(expected,actual)}:{})});
 }
 if(listing.state!=='draft')differences.push({field:'state',shape:'not_draft'});
 if(listing.listing_type!=='physical')differences.push({field:'listing_type',shape:'not_physical'});
 if(listing.is_personalizable!==false)differences.push({field:'is_personalizable',shape:'not_false'});
 const tags=Array.isArray(listing.tags)?listing.tags:null;
 if(!tags||tags.slice().sort().join('|')!==String(plan.body.tags).split(',').sort().join('|'))
  differences.push({field:'tags',shape:'different',expectedCount:String(plan.body.tags).split(',').length,actualCount:tags?.length??null});
 const photos=Array.isArray(listing.images)?listing.images:[];
 const allImages=photos.length===4&&new Set(photos.map(x=>x.listing_image_id)).size===4;
 const sections=await client.api('/shops/'+SHOP+'/sections');
 const matches=Array.isArray(sections.results)?sections.results.filter(x=>x.title===plan.identity.sectionTitle):[];
 const sectionStatus=matches.length===1&&matches[0].shop_section_id===listing.shop_section_id?'verified':'mismatch';
 const skuReservation=await uploads.get('supplier/'+SKU,{type:'json',consistency:'strong'});
 let supplierStatus='not_checked';
 if(apiKey){
  try{
   const response=await request(SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku:SKU}),
    {method:'GET',headers:{'x-api-key':apiKey,Accept:'application/json'},signal:AbortSignal.timeout(20000),redirect:'error'});
   supplierStatus=response.status===404?'absent':response.ok?'exists':'unknown';
  }catch{supplierStatus='unavailable'}
 }
 return {audit:'insomnia-original-draft-v1',listingId:lock.listingId,
  savedPhase:asset.phase,savedStage:asset.stage,etsyState:listing.state,
  approvalVerified:true,mismatches:differences,inventoryStatus,
  imageCount:photos.length,allImagesVerified:allImages,sectionStatus,
  supplierReservation:skuReservation?.phase||'absent',supplierStatus,
  canInvestigateRepair:listing.state==='draft'&&inventoryStatus==='verified'&&allImages&&
   sectionStatus==='verified'&&supplierStatus==='absent'&&!skuReservation&&!asset.supplierProductId};
}
