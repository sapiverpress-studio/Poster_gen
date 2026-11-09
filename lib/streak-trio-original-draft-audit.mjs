// Strict, read-only investigation of the original 9 November Streak trio.
// Never log seller text, private records, provider response bodies or tokens.
import {createHash} from 'node:crypto';
import {exactHtmlEntityChanges} from './poster-template.mjs';
import {normalizeFrame,normalizeSize} from './poster-template.mjs';
import {SHRIMP_API} from './printshrimp-api.mjs';
const SHOP=50893070,LISTING=4613186929;
const ID='hzKirH1Ca7OCWmgxKxiAbB1OGeV-auFw';
const SKU='SP-TRIO-9661EA52B86E24784FC9A50D';
const h=x=>createHash('sha256').update(x).digest('hex');
const fail=s=>{throw Error(s)};
function comparison(expected,actual){
 if(expected===actual)return 'same';
 if(typeof actual!==typeof expected)return 'type_changed';
 if(typeof expected==='string'){
  if(exactHtmlEntityChanges(expected,actual).exact===true)return 'exact_html_entities';
  if(expected.replace(/\r\n?/g,'\n')===actual.replace(/\r\n?/g,'\n'))return 'line_endings';
  if(expected.trim()===actual.trim())return 'edge_whitespace';
  if(expected.replace(/\s+/g,' ').trim()===actual.replace(/\s+/g,' ').trim())return 'whitespace';
 }
 return 'changed';
}
function checkedPrices(actual,expected,sku){
 const a=(actual?.products||[]).filter(x=>!x.is_deleted);
 const e=(expected?.products||[]).filter(x=>!x.is_deleted);
 if(a.length!==e.length)return {status:'count_mismatch',expected:e.length,found:a.length};
 const mismatches=[];
 for(let n=0;n<e.length;n++){
  const p=e[n],key=x=>((x.property_values||[]).map(y=>{
   const v=String(y.values?.[0]||'');
   return String(y.property_id)+':'+(normalizeSize(v)||normalizeFrame(v)||'?');
  }).sort().join('|'));
  const found=a.filter(x=>x.sku===sku&&key(x)===key(p));
  if(found.length!==1){mismatches.push({n,reason:'sku_or_properties'});continue;}
  const offer=(found[0].offerings||[]).filter(x=>x.is_enabled&&!x.is_deleted);
  const expectedOffer=p.offerings?.[0],val=offer[0]?.price;
  const price=typeof val==='number'?val:val?.currency_code==='GBP'&&val?.divisor>0?val.amount/val.divisor:NaN;
  if(offer.length!==1||offer[0].quantity!==expectedOffer?.quantity||
     !Number.isFinite(price)||Math.abs(price-expectedOffer.price)>0.005)
   mismatches.push({n,reason:'price_or_quantity'});
 }
 return {status:mismatches.length?'mismatch':'verified',expected:e.length,found:a.length,mismatches};
}
export async function inspectStreakTrioOriginalDraft({uploads,etsyStore,client,apiKey,request=fetch}){
 const a=await uploads.get('uploads/'+ID+'/state',{type:'json',consistency:'strong'});
 const lock=await etsyStore.get('draft/'+SKU,{type:'json',consistency:'strong'});
 if(a?.type!=='physical_bundle'||a.productId!==ID||a.phase!=='needs_investigation'||
    a.stage!=='etsy_draft'||a.listingId!==LISTING||a.sku!==SKU||a.plan?.sku!==SKU||
    lock?.listingId!==LISTING||lock?.uploadId!==ID)
  fail('Original Streak trio retained draft identity or stage differs');
 const plan=a.plan;
 if(h(JSON.stringify(Object.fromEntries(Object.entries(plan).filter(([k])=>k!=='hash'))))!==plan.hash||
    h(plan.hash+':'+ID)!==a.approvalHash)
  fail('Original approved bundle plan hash differs');
 const seller=await client.session();
 if(seller?.shop_id!==SHOP||seller?.shop_name!=='SapiverPrints'||plan.shopId!==SHOP)
  fail('Wrong Etsy shop identity');
 const listing=await client.api('/listings/'+LISTING+'?includes=Images');
 if(listing?.listing_id!==LISTING||listing?.shop_id!==SHOP)
  fail('Original Etsy draft listing readback identity mismatch');
 const inventory=await client.api('/listings/'+LISTING+'/inventory');
 const tags=String(plan.body.tags).split(',').map(x=>x.trim().toLowerCase()).sort();
 const actualTags=Array.isArray(listing.tags)?listing.tags.map(x=>String(x).trim().toLowerCase()).sort():null;
 const fields=['title','description','shipping_profile_id','shop_section_id','taxonomy_id','readiness_state_id','return_policy_id','who_made','when_made','production_partner_ids'];
 const fieldResults=fields.map(field=>({field,result:comparison(plan.body[field],listing[field])}));
 const mismatches=fieldResults.filter(x=>x.result!=='same');
 if(!actualTags||tags.join('|')!==actualTags.join('|'))mismatches.push({field:'tags',result:'changed'});
 const photos=Array.isArray(listing.images)?listing.images:[];
 const imagesVerified=photos.length===4&&new Set(photos.map(x=>x.listing_image_id)).size===4;
 const priceAudit=checkedPrices(inventory,plan.inventory,SKU);
 const settings=await client.api('/shops/'+SHOP+'/sections');
 const sectionMatch=settings.results?.filter(x=>x.title==='Trio Collection');
 const sectionVerified=sectionMatch?.length===1&&listing.shop_section_id===sectionMatch[0].shop_section_id&&
  plan.body.shop_section_id===sectionMatch[0].shop_section_id;
 let supplier='not_checked',supplierIdMatch=false;
 const savedSupplier=await uploads.get('supplier-bundles/'+SKU,{type:'json',consistency:'strong'});
 if(typeof apiKey==='string'&&apiKey){
  try{
   const r=await request(SHRIMP_API+'/api-get-bundle?'+new URLSearchParams({sku:SKU}),
    {headers:{'x-api-key':apiKey,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
   if(r.status===404)supplier='absent';
   else if(!r.ok)supplier='unavailable';
   else{
    const x=await r.json(),b=x?.bundle;
    supplier=x?.success===true&&b?.sku===SKU&&b?.total_prints===3&&b?.items?.length===3?'exists':'mismatch';
    supplierIdMatch=supplier==='exists'&&b.bundle_id===a.supplierProductId&&
      b.bundle_id===savedSupplier?.bundleId;
   }
  }catch{supplier='unavailable'}
 }
 return {
  listingId:LISTING,sku:SKU,stage:a.stage,phase:a.phase,etsyState:listing.state,
  planApproved:true,fieldResults,mismatches,
  inventory:priceAudit,photoCount:photos.length,imagesVerified,sectionVerified,
  supplier,supplierIdMatch,savedSupplierPhase:savedSupplier?.phase||'absent',
  canResumeWithExactReadback:listing.state==='draft'&&listing.listing_type==='physical'&&
   imagesVerified&&sectionVerified&&priceAudit.status==='verified'&&supplierIdMatch&&
   mismatches.every(x=>x.result==='exact_html_entities'),
  actualEtsyListingRetained:true
 };
}
