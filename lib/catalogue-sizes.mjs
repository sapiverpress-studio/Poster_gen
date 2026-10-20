// Existing-listing size restriction. Never affects Etsy state, supplier products or orders.
// Only a fresh, confirmed owner batch may remove A3; product IDs may change on Etsy PUT.
const validId=n=>Number.isSafeInteger(n)&&n>0;
const allowed=['Nature','Kids','Early Learning','Music Learning'];
export const sizeChangeKey=id=>'catalogue/remove-a3/'+id;
export const eligibleForA4A5=row=>!!row&&(allowed.includes(row.section)||/\bcapybara\b/i.test(row.title||''))&&row.state==='active';

export function approveA3Removal({audit,ids,shopId,clock=()=>Date.now()}){
 if(audit?.version!==1||audit.shopId!==shopId||!validId(shopId)||!Number.isFinite(audit.checkedAt)||clock()-audit.checkedAt>3600000||audit.checkedAt>clock()+30000)throw Error('Refresh Etsy catalogue before changing sizes');
 if(!Array.isArray(ids)||ids.length<1||ids.length>20||ids.some(x=>!validId(x))||new Set(ids).size!==ids.length)throw Error('Choose 1 to 20 unique existing posters');
 const items=ids.map(id=>{
  const row=audit.listings?.find(x=>x.id===id);
  if(!eligibleForA4A5(row))throw Error('Only active Nature, nursery, learning and capybara posters are eligible. Decorative Wall Art keeps A3');
  return {id,title:row.title,shopId,sectionId:row.sectionId??null,sku:row.sku,section:row.section};
 });
 return {shopId,items,approvedAt:clock(),auditCheckedAt:audit.checkedAt,operation:'remove_a3_only'};
}
function sizeFor(p){
 const ps=(p.property_values||[]).filter(v=>Array.isArray(v.values)&&v.values.length===1&&/^A[345](?:$|[\s(–—-])/i.test(v.values[0]));
 if(ps.length!==1)return null;
 return ps[0].values[0].slice(0,2).toUpperCase();
}
function priceOf(v){
 const p=v?.price;
 if(typeof p==='number')return p;
 if(p&&Number.isInteger(p.amount)&&Number.isInteger(p.divisor)&&p.divisor>0&&p.currency_code==='GBP')return p.amount/p.divisor;
 return NaN;
}
function normalProduct(product){
 if(typeof product.sku!=='string'||product.sku.length>50||!Array.isArray(product.property_values)||product.property_values.length<1||product.property_values.length>2||!Array.isArray(product.offerings)||product.offerings.length!==1)throw Error('Unexpected listing product structure');
 const property_values=product.property_values.map(v=>{
  if(!validId(v.property_id)||typeof v.property_name!=='string'||!Array.isArray(v.values)||v.values.length!==1||!Array.isArray(v.value_ids))throw Error('Unexpected listing variation property');
  return {property_id:v.property_id,property_name:v.property_name,value_ids:v.value_ids,values:v.values,...validId(v.scale_id)?{scale_id:v.scale_id}:{}};
 });
 const offerings=product.offerings.map(o=>{
  const price=priceOf(o);
  if(o.is_deleted||o.is_enabled!==true||!Number.isFinite(price)||price<=0||!Number.isInteger(o.quantity)||o.quantity<1||!validId(o.readiness_state_id))throw Error('Unexpected Etsy price, stock or processing settings');
  return {price,quantity:o.quantity,is_enabled:true,readiness_state_id:o.readiness_state_id};
 });
 return {sku:product.sku,property_values,offerings};
}
function signature(p){
 const pv=p.property_values.map(v=>[v.property_id,v.values[0],v.scale_id||null,v.value_ids]).sort((a,b)=>a[0]-b[0]);
 return JSON.stringify([p.sku,pv,p.offerings.map(o=>[o.price,o.quantity,o.is_enabled,o.readiness_state_id])]);
}
export function makeA4A5Inventory(inventory){
 const current=(inventory?.products||[]).filter(p=>!p.is_deleted);
 if(current.length<3||current.length>30)throw Error('Unexpected Etsy product count');
 const sizes=current.map(sizeFor);
 if(sizes.some(s=>!['A3','A4','A5'].includes(s)))throw Error('Unexpected variations; manual inspection required');
 if(!['A3','A4','A5'].every(s=>sizes.includes(s)))throw Error('Expected an A3/A4/A5 listing; A3 may already be removed');
 const nonA3=current.filter((p,i)=>sizes[i]!=='A3').map(normalProduct);
 const a4=nonA3.filter(p=>sizeFor(p)==='A4'),a5=nonA3.filter(p=>sizeFor(p)==='A5');
 if(!a4.length||a4.length!==a5.length||nonA3.length>20)throw Error('A4/A5 variation count mismatch');
 const seen=new Set(nonA3.map(p=>JSON.stringify(p.property_values)));
 if(seen.size!==nonA3.length)throw Error('Duplicate size and frame options');
 const ids=new Set(nonA3.flatMap(p=>p.property_values.map(v=>v.property_id)));
 const result={products:nonA3};
 for(const field of ['price_on_property','quantity_on_property','sku_on_property','readiness_state_on_property']){
  const values=inventory[field]||[];
  if(!Array.isArray(values)||values.some(x=>!ids.has(x)))throw Error('Unexpected Etsy inventory property mapping');
  result[field]=values;
 }
 return result;
}
export async function executeA3Removal({client,uploads,plan,id,clock=()=>Date.now()}){
 if(!/^[A-Za-z0-9_-]{32}$/.test(id||'')||plan?.operation!=='remove_a3_only'||!Array.isArray(plan.items)||plan.items.length<1||plan.items.length>20||new Set(plan.items.map(x=>x.id)).size!==plan.items.length)throw Error('Invalid A3-removal operation');
 const key=sizeChangeKey(id),saved=await uploads.get(key,{type:'json',consistency:'strong'});
 if(saved?.phase!=='queued'||JSON.stringify(saved.plan)!==JSON.stringify(plan)||clock()-plan.approvedAt>1800000)throw Error('A3-removal approval expired or already claimed');
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||seller.shop_id!==plan.shopId)throw Error('Seller mismatch; no listings changed');
 const prepared=[];
 for(const row of plan.items){
  if(!validId(row.id)||!eligibleForA4A5({title:row.title,section:row.section,state:'active'}))throw Error('Invalid A3 removal selection');
  const listing=await client.api('/listings/'+row.id);
  if(listing.listing_id!==row.id||listing.shop_id!==plan.shopId||listing.state!=='active'||(listing.listing_type!=='physical'&&listing.type!=='physical')||listing.title!==row.title||(listing.shop_section_id||null)!==row.sectionId||JSON.stringify(listing.skus||[])!==JSON.stringify(row.sku||[]))throw Error('Listing changed since approval; no inventory changed');
  const before=await client.api('/listings/'+row.id+'/inventory');
  const payload=makeA4A5Inventory(before);
  prepared.push({row,payload,before:JSON.stringify(before)});
 }
 await uploads.setJSON(key,{phase:'running',plan,results:[],startedAt:clock()});
 const results=[];
 for(const item of prepared){
  const row=item.row;
  await uploads.setJSON(key,{phase:'running',plan,results,attemptingId:row.id,startedAt:saved.createdAt});
  try{
   const current=await client.api('/listings/'+row.id+'/inventory');
   if(JSON.stringify(current)!==item.before)throw Error('Inventory changed before update');
   await client.api('/listings/'+row.id+'/inventory?max_variations_supported=3',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.payload)});
   const after=await client.api('/listings/'+row.id+'/inventory');
   const got=(after.products||[]).filter(x=>!x.is_deleted).map(normalProduct);
   if(got.length!==item.payload.products.length||got.some(x=>sizeFor(x)==='A3')||got.map(signature).sort().join('|')!==item.payload.products.map(signature).sort().join('|'))throw Error('Inventory readback mismatch');
   for(const field of ['price_on_property','quantity_on_property','sku_on_property','readiness_state_on_property'])
    if(JSON.stringify(after[field]||[])!==JSON.stringify(item.payload[field]))throw Error('Variation mapping changed');
   const listing=await client.api('/listings/'+row.id);
   if(listing.listing_id!==row.id||listing.shop_id!==plan.shopId||listing.state!=='active'||listing.title!==row.title||(listing.shop_section_id||null)!==row.sectionId)throw Error('Listing altered unexpectedly');
   results.push({id:row.id,removed:'A3',retained:['A4','A5'],verifiedAt:clock()});
  }catch{
   await uploads.setJSON(key,{phase:'needs_investigation',plan,results,attemptingId:row.id,failedAt:clock(),reason:'Inventory update or read-back uncertain; do not retry automatically'});
   return {phase:'needs_investigation',results,attemptingId:row.id};
  }
 }
 await uploads.setJSON(key,{phase:'complete',plan,results,completedAt:clock()});
 return {phase:'complete',results};
}
