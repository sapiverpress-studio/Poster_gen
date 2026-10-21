// One-off clean-up after confirmed two active Woodland trio listings.
// Only the explicitly redundant PrintShrimp SKUs and six legacy verse descriptions.
// No order writes, new listings, product creation, Netlify deployment, or SKU changes.
const oldBundle='SP-WOODLAND-VERSE-TRIO';
const keepBundles=['SP-TRIO-D1B581C8843C136EF3744B3D','SP-TRIO-7AD9AD4192AB53D36FCE3CC6'];
const redundant=['SP-WOOD-BADGER-3EBC29B76F','SP-WOOD-RED-SQUIRREL-0F27360216','SP-WOOD-ROE-DEER-17790EA57D'];
const singles=[
 {id:4595277551,sku:'SP-FOX-PRINT-WI-05689631'},
 {id:4595921846,sku:'SP-THE-ROBIN'},
 {id:4595944801,sku:'SP-THE-HEDGEHOG'},
 {id:4599437738,sku:'SP-BADGER-73C91495'},
 {id:4599399281,sku:'SP-RED-SQUIRREL-649E8590'},
 {id:4599438228,sku:'SP-ROE-DEER-08061999'}];
const fail=s=>{throw Error(s)};
async function shrimp(key,path,method='GET'){
 const r=await fetch('https://api.printshrimp.com/functions/v1'+path,{
  method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{'x-api-key':key,Accept:'application/json'}});
 if(!r.ok)fail('Supplier '+method+' '+path.split('?')[0]+' HTTP '+r.status);
 const d=await r.json();if(d?.success!==true)fail('Supplier response incomplete');return d;
}
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function cleanWoodlandLive({client,apiKey}){
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints'||!Number.isSafeInteger(seller.shop_id))fail('Wrong Etsy seller');
 const bundles=[],prods=[];
 const catalogue=await shrimp(apiKey,'/api-get-bundle?page=1');
 if(catalogue.total_bundles!==3||!Array.isArray(catalogue.bundles)||catalogue.bundles.length!==3)
  fail('Unexpected supplier bundle count; no deletion allowed');
 for(const sku of [...keepBundles,oldBundle]){
  const {bundle}=await shrimp(apiKey,'/api-get-bundle?'+new URLSearchParams({sku}));
  if(bundle?.sku!==sku||bundle.total_prints!==3||bundle.items?.length!==3)fail('Supplier bundle missing '+sku);
  bundles.push(bundle);
 }
 for(const sku of redundant){
  const {product}=await shrimp(apiKey,'/api-get-product?'+new URLSearchParams({sku}));
  if(product?.sku!==sku||!product.product_id||!Array.isArray(product.variants)||product.variants.length!==2)
   fail('Unexpected unused supplier product '+sku);
  prods.push(product);
 }
 if(bundles[0].items.some(x=>x.size!=='A4')||bundles[1].items.some(x=>x.size!=='A4'))
  fail('One live bundle no longer fixed A4');
 const want1=['SP-FOX-PRINT-WI-05689631','SP-THE-ROBIN','SP-THE-HEDGEHOG'].sort();
 const want2=['SP-BADGER-73C91495','SP-RED-SQUIRREL-649E8590','SP-ROE-DEER-08061999'].sort();
 if(!eq(bundles[0].items.map(x=>x.sku).sort(),want1)||!eq(bundles[1].items.map(x=>x.sku).sort(),want2))
  fail('Published bundle memberships changed; no cleanup');
 if(bundles.some(b=>b.items.some(x=>redundant.includes(x.sku))))fail('Supplier copy still used by bundle');
 const orders=await shrimp(apiKey,'/api-get-order?page=1');
 if(orders.total_orders!==0||!Array.isArray(orders.orders)||orders.orders.length)
  fail('Supplier paid-order history not empty; manual review required');
 const usedSkus=[];
 for(const state of ['active','draft','inactive','sold_out','expired','removed']){
  for(let offset=0;offset<10000;offset+=100){
   const p=await client.api('/shops/'+seller.shop_id+'/listings?'+new URLSearchParams({state,offset:String(offset),limit:'100'}));
   if(!Number.isInteger(p.count)||p.count>10000||!Array.isArray(p.results)||p.results.some(x=>x.shop_id!==seller.shop_id||!Array.isArray(x.skus)))
    fail('Etsy catalogue scan cannot verify all SKUs in '+state);
   for(const listing of p.results){
    if(listing.skus.some(x=>redundant.includes(x)||x===oldBundle))usedSkus.push(listing.listing_id);
   }
   if(offset+p.results.length>=p.count)break;
   if(p.results.length!==100)fail('Incomplete Etsy pagination');
  }
 }
 if(usedSkus.length)fail('Redundant supplier SKU still referenced on Etsy');
 const active=[];
 for(const g of [{id:4600180569,sku:keepBundles[0]},{id:4600182933,sku:keepBundles[1]}]){
  const e=await client.api('/listings/'+g.id);
  const i=await client.api('/listings/'+g.id+'/inventory');
  if(e.state!=='active'||e.shop_id!==seller.shop_id||e.description.includes('FINISH OPTIONS')||
   e.description.includes('A3 dimensions')||
   i.products?.filter(x=>!x.is_deleted).length!==1||
   i.products.filter(x=>!x.is_deleted)[0].sku!==g.sku)
   fail('Live trio Etsy listing needs review '+g.id);
  active.push(g.id);
 }
 const corrections=[];
 for(const {id,sku} of singles){
  const e=await client.api('/listings/'+id),inv=await client.api('/listings/'+id+'/inventory');
  if(e.shop_id!==seller.shop_id||e.state!=='active'||
   !Array.isArray(e.tags)||e.tags.length!==13||
   !Array.isArray(inv?.products)||!inv.products.some(p=>!p.is_deleted&&p.sku===sku))
   fail('Live Woodland single identity changed '+id);
  const text=String(e.description||'');
  if(!text||!text.toLowerCase().includes('woodland'))fail('Individual verse description unexpected '+id);
  let clean=text
   .replace(/Check the listed A5, A4 and A3 dimensions before ordering\./g,
      'Check the listed A5 and A4 dimensions before ordering.')
   .replace(/coordinated eight-subject Woodland Verses range/gi,'coordinated six-poster Woodland Verses collection');
  if(!/AI.assist/i.test(clean))clean+='\n\nArtwork developed with AI assistance and reviewed by Sapiver Prints.';
  // Do not alter framed choices available for individual prints.
  if(clean.includes('A3 dimensions')||clean.length>10000)fail('Unsupported individual description edit '+id);
  corrections.push({id,sku,before:text,after:clean});
 }
 console.log('WOODLAND_CLEANUP_PREFLIGHT '+JSON.stringify({activeTrioIds:active,unusedProducts:redundant,obsoleteBundle:oldBundle,individualDescriptionChanges:corrections.filter(x=>x.before!==x.after).length,paidOrders:orders.total_orders}));
 const deleteBundle=await shrimp(apiKey,'/api-delete-bundle?'+new URLSearchParams({sku:oldBundle}),'DELETE');
 if(deleteBundle.deleted?.sku!==oldBundle)fail('Old bundle deletion uncertain. HOLD');
 console.log('WOODLAND_CLEANUP_OLD_BUNDLE_REMOVED '+oldBundle);
 for(const sku of redundant){
  const deleted=await shrimp(apiKey,'/api-delete-product?'+new URLSearchParams({sku}),'DELETE');
  if(deleted.deleted?.sku!==sku)fail('Product deletion uncertain for '+sku+'. HOLD');
  console.log('WOODLAND_CLEANUP_DUPLICATE_REMOVED '+sku);
 }
 for(const x of corrections){
  if(x.before===x.after)continue;
  await client.api('/shops/'+seller.shop_id+'/listings/'+x.id,{
   method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({description:x.after}).toString()});
  const after=await client.api('/listings/'+x.id);
  if(after.description!==x.after||after.state!=='active'||after.shop_id!==seller.shop_id)
   fail('Woodland individual description readback failed '+x.id);
  console.log('WOODLAND_CLEANUP_SINGLE_DESCRIPTION '+x.id);
 }
 for(const g of [{id:4600180569,sku:keepBundles[0]},{id:4600182933,sku:keepBundles[1]}]){
  const e=await client.api('/listings/'+g.id);
  const s=await shrimp(apiKey,'/api-get-bundle?'+new URLSearchParams({sku:g.sku}));
  if(e.state!=='active'||s.bundle?.sku!==g.sku||s.bundle.items.length!==3||s.bundle.items.some(x=>x.size!=='A4'))
   fail('Final active trio and supplier readback changed '+g.id);
 }
 console.log('WOODLAND_CLEANUP_COMPLETE '+JSON.stringify({twoActiveBundles:true,unusedProductsRemoved:redundant.length,oldSupplierBundleRemoved:true,singleDescriptionsCorrected:corrections.filter(x=>x.before!==x.after).length,noOrdersCreated:true}));
}
