import {PRINT_PRODUCT} from './printshrimp-product.mjs';
const positive=n=>Number.isSafeInteger(n)&&n>0;
const sizes=['A5','A4','A3'];
function sizeValue(v){return sizes.find(s=>new RegExp('^'+s+'(?:$|[\\s–—-])','i').test(v));}
export function prepareDraft(reference,inventory,{title,description,shopId}) {
 if(reference?.shop_id!==shopId||reference.state!=='active'||reference.listing_type!=='physical'||reference.is_private===true||reference.price?.currency_code!=='GBP')throw Error('Reference must be an active GBP physical poster in this shop');
 if(typeof title!=='string'||!title.trim()||title.length>140||!title.includes('Dinosaurs Across Time')||typeof description!=='string'||!description.trim()||description.length>20000)throw Error('Product title and description required');
 if(!positive(reference.taxonomy_id)||!positive(reference.shipping_profile_id)||!positive(reference.readiness_state_id)||!positive(reference.return_policy_id)||!['i_did','someone_else','collective'].includes(reference.who_made)||!reference.when_made)throw Error('Reference shop settings incomplete');
 const products=sizes.map(size=>{
  const matches=(inventory.products||[]).filter(p=>!p.is_deleted&&p.property_values?.length===1&&p.property_values[0].values?.length===1&&sizeValue(p.property_values[0].values[0])===size);
  if(matches.length!==1)throw Error('Reference needs one unambiguous offering per A size');
  const p=matches[0],v=p.property_values[0],offers=(p.offerings||[]).filter(o=>!o.is_deleted&&o.is_enabled);
  if(!positive(v.property_id)||offers.length!==1)throw Error('Reference size offering incomplete');
  const o=offers[0],money=o.price;
  if(money?.currency_code!=='GBP'||!positive(money.amount)||!positive(money.divisor)||!positive(o.quantity)||!positive(o.readiness_state_id))throw Error('Reference price, stock or processing profile incomplete');
  return {sku:PRINT_PRODUCT.sku,property_values:[{property_id:v.property_id,property_name:v.property_name||'Size',value_ids:v.value_ids||[],values:[v.values[0]],...(v.scale_id?{scale_id:v.scale_id}:{})}],offerings:[{price:money.amount/money.divisor,quantity:o.quantity,is_enabled:true,readiness_state_id:o.readiness_state_id}]};
 });
 const propertyId=products[0].property_values[0].property_id;
 if(products.some(p=>p.property_values[0].property_id!==propertyId||p.offerings[0].readiness_state_id!==reference.readiness_state_id))throw Error('Size property mismatch');
 const body={title:title.trim(),description:description.trim(),quantity:products.reduce((n,p)=>n+p.offerings[0].quantity,0),price:Math.min(...products.map(p=>p.offerings[0].price)),who_made:reference.who_made,when_made:reference.when_made,taxonomy_id:reference.taxonomy_id,shipping_profile_id:reference.shipping_profile_id,readiness_state_id:reference.readiness_state_id,return_policy_id:reference.return_policy_id,is_supply:false,type:'physical',should_auto_renew:false,is_customizable:false};
 return {body,inventory:{products,price_on_property:[propertyId],quantity_on_property:[propertyId],sku_on_property:[],readiness_state_on_property:[]},referenceListingId:reference.listing_id,sharedSku:PRINT_PRODUCT.sku};
}
export async function verifyDraft({client,listingId}) {
 if(!positive(listingId))throw Error('Invalid draft ID');
 const seller=await client.session(),listing=await client.api('/listings/'+listingId);
 if(listing.shop_id!==seller.shop_id||listing.state!=='draft'||listing.listing_type!=='physical')throw Error('Wrong seller or listing state');
 const inventory=await client.api('/listings/'+listingId+'/inventory');
 const products=(inventory.products||[]).filter(p=>!p.is_deleted);
 const mapped=products.map(p=>{if(p.sku!==PRINT_PRODUCT.sku||p.property_values?.length!==1||p.property_values[0].values?.length!==1)throw Error('Draft SKU or variation mismatch');return sizeValue(p.property_values[0].values[0]);});
 if(products.length!==3||mapped.sort().join('|')!=='A3|A4|A5')throw Error('Draft requires exactly three A sizes');
 return {shop_name:seller.shop_name,state:'draft',sharedSku:PRINT_PRODUCT.sku,sizes:[...sizes],listingId};
}
export async function createDraft({client,store,referenceListingId,title,description,clock=()=>Date.now()}) {
 if(!positive(referenceListingId))throw Error('Reference listing required');
 const seller=await client.session();
 const reference=await client.api('/listings/'+referenceListingId);
 const inventory=await client.api('/listings/'+referenceListingId+'/inventory');
 const plan=prepareDraft(reference,inventory,{title,description,shopId:seller.shop_id});
 await client.api('/shops/'+seller.shop_id+'/shipping-profiles/'+plan.body.shipping_profile_id);
 await client.api('/shops/'+seller.shop_id+'/readiness-state-definitions/'+plan.body.readiness_state_id);
 const partners=await client.api('/shops/'+seller.shop_id+'/production-partners');
 const matches=(partners.results||[]).filter(p=>/^print\s*shrimp$/i.test(p.partner_name||'')&&positive(p.production_partner_id));
 if(matches.length!==1)throw Error('One verified PrintShrimp production partner required');
 plan.body.production_partner_ids=String(matches[0].production_partner_id);
 // Check existing SKUs in every listing state before reserving a new draft.
 for(const state of ['active','inactive','sold_out','draft','removed','expired']) {
  let offset=0;
  while(true) {
   const page=await client.api('/shops/'+seller.shop_id+'/listings?'+new URLSearchParams({state,limit:'100',offset:String(offset)}));
   if(!Number.isSafeInteger(page.count)||!Array.isArray(page.results)||page.count<0||page.count>10000)throw Error('SKU audit incomplete');
   for(const listing of page.results) {
    if(listing.shop_id!==seller.shop_id||!Array.isArray(listing.skus))throw Error('SKU audit incomplete');
    if(listing.skus.includes(PRINT_PRODUCT.sku))throw Error('Shared SKU already used; inspect existing listing');
   }
   offset+=page.results.length;if(offset>=page.count)break;if(!page.results.length)throw Error('SKU audit incomplete');
  }
 }
 const key='draft/'+PRINT_PRODUCT.sku;
 const lock=await store.setJSON(key,{phase:'creating',referenceListingId,at:clock()},{onlyIfNew:true});
 if(lock?.modified!==true)throw Error('Draft already reserved; inspect existing result before retry');
 let listingId;
 try {
  const result=await client.api('/shops/'+seller.shop_id+'/listings',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(Object.entries(plan.body).map(([k,v])=>[k,String(v)])).toString()});
  listingId=result.listing_id;
  if(!positive(listingId)||result.shop_id!==seller.shop_id||result.state!=='draft')throw Error('Draft response mismatch');
  await store.setJSON(key,{phase:'inventory_pending',listingId,referenceListingId,at:clock()});
  await client.api('/listings/'+listingId+'/inventory',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan.inventory)});
  const verified=await verifyDraft({client,listingId});
  await store.setJSON(key,{phase:'verified',listingId,referenceListingId,at:clock(),publishEnabled:false});return verified;
 }catch {
  await store.setJSON(key,{phase:'uncertain',...(positive(listingId)?{listingId}:{}),referenceListingId,at:clock(),publishEnabled:false});throw Error('Draft outcome needs investigation; no automatic retry');
 }
}
