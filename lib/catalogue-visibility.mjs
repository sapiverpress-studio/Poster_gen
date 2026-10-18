// Merchant state writes run ONLY in the signed GitHub worker after explicit owner approval.
// Never publish drafts, relist sold-out/expired products, or change supplier/fulfilment settings.
const STATES=new Set(['active','inactive']);
const validId=id=>Number.isSafeInteger(id)&&id>0;
export const visibilityKey=id=>'catalogue/visibility/'+id;
export function approveVisibilityPlan({audit,target,ids,shopId,clock=()=>Date.now()}){
 if(!audit||audit.version!==1||audit.shopId!==shopId||!validId(shopId)||!Number.isFinite(audit.checkedAt)||clock()-audit.checkedAt>3600000||audit.checkedAt>clock()+30000)throw Error('Refresh the Etsy catalogue before changing listings');
 if(!STATES.has(target)||!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>!validId(id))||new Set(ids).size!==ids.length)throw Error('Select 1–20 listings and choose On or Off');
 const items=ids.map(id=>{
  const row=audit.listings?.find(x=>x.id===id);
  if(!row||!STATES.has(row.state)||row.state===target)throw Error('A selected listing is already in that state or is not eligible. Refresh catalogue.');
  return {id,expected:row.state,title:row.title,sectionId:row.sectionId??null,sku:row.sku??[]};
 });
 return {shopId,target,items,approvedAt:clock(),auditCheckedAt:audit.checkedAt};
}
export async function executeVisibilityPlan({client,uploads,plan,id,clock=()=>Date.now()}){
 if(!/^[A-Za-z0-9_-]{32}$/.test(id)||!plan||!STATES.has(plan.target)||!Array.isArray(plan.items)||!plan.items.length||plan.items.length>20||new Set(plan.items.map(x=>x.id)).size!==plan.items.length)throw Error('Invalid owner visibility plan');
 const key=visibilityKey(id),stored=await uploads.get(key,{type:'json',consistency:'strong'});
 if(stored?.phase!=='queued'||JSON.stringify(stored.plan)!==JSON.stringify(plan)||clock()-plan.approvedAt>1800000)throw Error('Visibility approval is expired or already processed');
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||seller.shop_id!==plan.shopId)throw Error('Etsy seller mismatch; no listings changed');
 // Check every listing before starting, to avoid avoidable partial batch changes.
 for(const row of plan.items){
  if(!validId(row.id)||!STATES.has(row.expected)||row.expected===plan.target||typeof row.title!=='string'||!Array.isArray(row.sku))throw Error('Invalid listing selection');
  const actual=await client.api('/listings/'+row.id);
  if(actual.shop_id!==plan.shopId||actual.listing_id!==row.id||actual.state!==row.expected||(actual.listing_type!=='physical'&&actual.type!=='physical')||actual.title!==row.title||actual.shop_section_id!==row.sectionId||JSON.stringify(actual.skus??[])!==JSON.stringify(row.sku))throw Error('Etsy listing changed since approval; nothing was written');
 }
 const results=[];
 await uploads.setJSON(key,{phase:'running',plan,results,startedAt:clock()});
 for(const row of plan.items){
  // Record the exact attempted listing before PATCH. Any network ambiguity halts retries.
  await uploads.setJSON(key,{phase:'running',plan,results,attemptingId:row.id,startedAt:stored.createdAt||plan.approvedAt});
  try{
   const patched=await client.api('/shops/'+plan.shopId+'/listings/'+row.id,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({state:plan.target}).toString()});
   if(patched?.listing_id!==row.id||patched?.shop_id!==plan.shopId||patched.state!==plan.target)throw Error('Etsy returned an unexpected listing state');
   const confirmed=await client.api('/listings/'+row.id);
   if(confirmed?.listing_id!==row.id||confirmed.shop_id!==plan.shopId||confirmed.state!==plan.target||confirmed.title!==row.title||confirmed.shop_section_id!==row.sectionId||JSON.stringify(confirmed.skus??[])!==JSON.stringify(row.sku))throw Error('Etsy read-back differs; inspect listing before any retry');
   results.push({id:row.id,state:plan.target,verifiedAt:clock()});
  }catch{
   await uploads.setJSON(key,{phase:'needs_investigation',plan,results,attemptingId:row.id,failedAt:clock(),reason:'Seller update/read-back uncertain; inspect Etsy before any retry'});
   return {phase:'needs_investigation',results,attemptingId:row.id};
  }
 }
 // Only successful, individually read-back-verified state changes update catalogue display.
 const audit=await uploads.get('catalogue/audit',{type:'json',consistency:'strong'});
 if(audit?.shopId===plan.shopId&&Array.isArray(audit.listings)){
  const changed=new Map(results.map(x=>[x.id,x]));
  const listings=audit.listings.map(row=>changed.has(row.id)?{...row,state:changed.get(row.id).state,visibilityVerifiedAt:changed.get(row.id).verifiedAt}:row);
  const active=listings.filter(x=>x.state==='active');
  await uploads.setJSON('catalogue/audit',{...audit,listings,summary:{...audit.summary,activePhysical:active.length,activeCorrectDelivery:active.filter(x=>x.deliveryMatches).length,activeOtherDelivery:active.filter(x=>!x.deliveryMatches).length,unverifiedSupplier:active.filter(x=>x.supplierMapping==='not_verified').length}});
 }
 await uploads.setJSON(key,{phase:'complete',plan,results,completedAt:clock()});
 return {phase:'complete',results};
}
