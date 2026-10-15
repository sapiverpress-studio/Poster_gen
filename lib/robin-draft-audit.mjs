import {createHash} from 'node:crypto';
import {verifyTemplateInventory,TEMPLATE_VERSION} from './poster-template.mjs';
import {SHRIMP_API} from './printshrimp-api.mjs';

const SKU='SP-THE-ROBIN';
const LISTING=4595921846;
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
// Numeric and fixed-label-only fingerprint of a changed description. Never
// return original text, changed text, snippets, code points, or content hashes.
export function descriptionFingerprint(expected,actual){
 if(typeof expected!=='string'||typeof actual!=='string')return {shape:'non_string'};
 const variants={
  nfc:s=>s.normalize('NFC'),
  nfkc:s=>s.normalize('NFKC'),
  lowercase:s=>s.toLocaleLowerCase('en-GB'),
  html_entities:s=>s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' ','&#39;':"'",'&#x27;':"'"}[m.toLowerCase()]||m)),
  punctuation:s=>s.replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/\u2026/g,'...'),
  invisible:s=>s.replace(/[\u200b-\u200f\ufeff]/g,''),
  spacing:s=>s.replace(/[\s\u00a0]+/g,' ').trim(),
  html_tags:s=>s.replace(/<[^>]+>/g,''),
  line_breaks:s=>s.replace(/\r\n?/g,'\n'),
 };
 const normalisations=[];
 for(const [name,normalise] of Object.entries(variants)){
  if(expected!==actual&&(normalise(expected)===actual||normalise(actual)===expected||normalise(expected)===normalise(actual)))normalisations.push(name);
 }
 let prefix=0,suffix=0;while(prefix<Math.min(expected.length,actual.length)&&expected[prefix]===actual[prefix])prefix++;
 while(suffix<Math.min(expected.length,actual.length)-prefix&&expected[expected.length-1-suffix]===actual[actual.length-1-suffix])suffix++;
 const isPrefix=expected.startsWith(actual),isExtension=actual.startsWith(expected);
 // Describe the exact 1-character-to-entity transformation without printing
 // either character or any part of the owner-approved listing copy.
 // Match the complete original around each candidate rather than the longest
 // common prefix: '&amp;' shares its first '&' with the original '&'.
 const allowed=[
  ['ampersand_entity','&','&amp;'],
  ['apostrophe_numeric_entity',"'",'&#39;'],
  ['apostrophe_hex_entity',"'",'&#x27;'],
  ['apostrophe_named_entity',"'",'&apos;'],
  ['quote_entity','"','&quot;'],
  ['less_than_entity','<','&lt;'],
  ['greater_than_entity','>','&gt;'],
  ['nonbreaking_space_entity',' ','&nbsp;']
 ];
 const exactSingleEntity=allowed.find(([,source,escaped])=>{
  for(let index=expected.indexOf(source);index!==-1;index=expected.indexOf(source,index+1)){
   if(actual===expected.slice(0,index)+escaped+expected.slice(index+source.length))return true;
  }
  return false;
 })?.[0]||'not_exact_known_entity';

 return {expectedCharacters:expected.length,actualCharacters:actual.length,matchingPrefixCharacters:prefix,matchingSuffixCharacters:suffix,
  shape:isPrefix&&expected.length!==actual.length?'truncated':isExtension&&expected.length!==actual.length?'appended':'changed_in_middle_or_multiple',
  normalisations,exactSingleEntity};
}
// Verify only explicit Etsy HTML entity conversions, allowing several distinct
// occurrences without exposing listing text. Other character changes fail.
export function exactHtmlEntityChanges(expected,actual){
 if(typeof expected!=='string'||typeof actual!=='string')return {exact:false};
 const entities={
  '&':['&amp;'],"'":['&#39;','&#x27;','&apos;'],'"':['&quot;'],
  '<':['&lt;'],'>':['&gt;'],' ':['&nbsp;']
 };
 const label={'&amp;':'ampersand','&#39;':'apostrophe_numeric','&#x27;':'apostrophe_hex',
  '&apos;':'apostrophe_named','&quot;':'double_quote','&lt;':'less_than','&gt;':'greater_than','&nbsp;':'space_nbsp'};
 let states=new Map([[0,{}]]);
 for(const char of expected){
  const next=new Map();
  for(const [offset,counts] of states){
   if(actual[offset]===char)next.set(offset+1,counts);
   for(const entity of entities[char]||[]){
    if(actual.startsWith(entity,offset)){
     const key=label[entity],amount=(counts[key]||0)+1;
     if(amount>30)continue;
     const at=offset+entity.length,copy={...counts,[key]:amount};
     const old=next.get(at);
     if(!old||Object.values(copy).reduce((a,b)=>a+b,0)<Object.values(old).reduce((a,b)=>a+b,0))next.set(at,copy);
    }
   }
  }
  if(next.size===0)return {exact:false};
  states=next;
 }
 const counts=states.get(actual.length);
 return counts?{exact:true,entityCounts:counts,total:Object.values(counts).reduce((a,b)=>a+b,0),
   expectedCharacters:expected.length,actualCharacters:actual.length}:{exact:false};
}
// One-off, strictly read-only check; never emit provider bodies, listing copy,
// customer details, tokens, signed URLs, approval hash, or private blob keys.
export async function auditRobinDraft({uploads,etsyStore,client,apiKey,request=fetch}){
 const lock=await etsyStore.get('draft/'+SKU,{type:'json',consistency:'strong'});
 if(lock?.listingId!==LISTING||!/^[A-Za-z0-9_-]{32}$/.test(lock.uploadId||''))throw Error('Robin draft lock mismatch');
 const id=lock.uploadId;
 const asset=await uploads.get('uploads/'+id+'/state',{type:'json',consistency:'strong'});
 if(asset?.listingId!==LISTING||asset?.phase!=='needs_investigation'||asset?.stage!=='etsy_draft'||asset.plan?.identity?.sku!==SKU||asset.plan.version!==TEMPLATE_VERSION)throw Error('Robin retained revision mismatch');
 const plan=asset.plan;
 const approval=await uploads.get('claims/'+id+'/publish',{type:'json',consistency:'strong'});
 const planHash=digest(JSON.stringify({version:plan.version,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 const approved=Number.isFinite(asset.approvedAt)&&approval?.approvalHash===asset.approvalHash&&planHash===plan.hash&&digest(asset.image.sha256+':'+planHash+':'+TEMPLATE_VERSION)===asset.approvalHash;
 if(!approved)throw Error('Robin approval integrity mismatch');
 const seller=await client.session();
 if(seller.shop_id!==SHOP||seller.shop_name!=='SapiverPrints')throw Error('Robin shop mismatch');
 const listing=await client.api('/listings/'+LISTING+'?includes=Images');
 if(listing.listing_id!==LISTING||listing.shop_id!==SHOP)throw Error('Robin listing identity mismatch');
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
 return {audit:'robin-draft-read-only-v1',listingId:LISTING,sku:SKU,recordPhase:asset.phase,recordStage:asset.stage,etsyState:listing.state,
  approvalVerified:true,modifiedFields:differences,descriptionProbe:differences.some(d=>d.field==='description')?descriptionFingerprint(plan.body.description,listing.description):null,entityAudit:differences.some(d=>d.field==='description')?exactHtmlEntityChanges(plan.body.description,listing.description):null,inventoryStatus,inventoryProducts:inventoryProducts.length,expectedInventoryProducts:plan.inventory.products.length,
  liveSkuLengths:[...new Set(inventoryProducts.map(p=>String(p.sku||'').length))],imageCount:images.length,sectionStatus,supplierRecorded:!!asset.supplierProductId,supplierStatus,
  readyForSafeRepair:sectionStatus==='verified'&&inventoryStatus==='verified'&&images.length===4&&supplierStatus==='absent'&&!asset.supplierProductId};
}
