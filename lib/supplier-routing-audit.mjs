// Read-only, fail-closed Etsy/PrintShrimp SKU audit.
// This module is not wired to any live worker, route or schedule.
// Prodigi toggles and PrintShrimp order automation are NOT accessible via these APIs.
import {SHRIMP_API} from './printshrimp-api.mjs';

const STATES=['active','draft','inactive','sold_out','expired'];
const ROUTES=new Set(['printshrimp','prodigi','none']);
const sku=v=>String(v??'').trim().toUpperCase();
const idOk=v=>Number.isSafeInteger(v)&&v>0;
function requireOk(ok,reason){if(!ok)throw Error(reason);}

export function classifyEtsyListing(l) {
 const kind=String(l?.listing_type||l?.type||'').toLowerCase();
 return ['download','digital'].includes(kind)?'digital':kind==='physical'?'physical':'unknown';
}

// Source records are held in memory; never put full results into public Actions logs.
export function compareSupplierSnapshot({listings,inventories,products,expectedRoutes={}}) {
 requireOk(Array.isArray(listings)&&inventories&&typeof inventories==='object'&&Array.isArray(products),'Incomplete audit inputs');
 requireOk(expectedRoutes&&typeof expectedRoutes==='object'&&!Array.isArray(expectedRoutes),'Invalid route registry');
 for(const [id,route] of Object.entries(expectedRoutes))requireOk(idOk(Number(id))&&ROUTES.has(route),'Invalid declared supplier route');
 const shrimpBySku=new Map(),shrimpDuplicates=new Set(),skuToListings=new Map(),rows=[],seen=new Set();
 for(const p of products){const k=sku(p?.sku);if(!k)continue;if(shrimpBySku.has(k))shrimpDuplicates.add(k);else shrimpBySku.set(k,p);}
 for(const listing of listings) {
  const id=listing?.listing_id;
  requireOk(idOk(id)&&!seen.has(id),'Duplicate or invalid Etsy listing identity');seen.add(id);
  const kind=classifyEtsyListing(listing),route=expectedRoutes[String(id)]||(kind==='digital'?'none':'unassigned');
  const issues=[],all=Array.isArray(inventories[String(id)]?.products)?inventories[String(id)].products.filter(p=>!p.is_deleted):null;
  if(kind==='unknown')issues.push('unknown_listing_type');
  if(kind==='digital'&&route!=='none')issues.push('digital_supplier_route_conflict');
  if(kind==='physical'&&route==='none')issues.push('physical_without_supplier');
  if(kind==='physical'&&route==='unassigned')issues.push('supplier_route_unassigned');
  if(kind!=='digital'&&(!all||!all.length))issues.push('inventory_unavailable');
  const enabled=(all||[]).filter(p=>(p.offerings||[]).some(o=>o.is_enabled&&!o.is_deleted));
  const skus=[...new Set(enabled.map(p=>sku(p.sku)).filter(Boolean))];
  if(kind==='physical'&&enabled.some(p=>!sku(p.sku)))issues.push('missing_etsy_sku');
  if(kind==='physical'&&skus.length>1)issues.push('mixed_variant_skus');
  const sizes=new Set();
  for(const p of enabled)for(const v of p.property_values||[])for(const value of v.values||[]){
   const match=/^(A[345])(?:\s|$|[()\-])/i.exec(String(value).trim());if(match)sizes.add(match[1].toUpperCase());
  }
  for(const k of skus){if(!skuToListings.has(k))skuToListings.set(k,new Set());skuToListings.get(k).add(id);}
  const unique=skus.length===1?skus[0]:null,shrimp=unique?shrimpBySku.get(unique):null;
  if(unique&&shrimpDuplicates.has(unique))issues.push('duplicate_printshrimp_product_sku');
  if(kind==='physical'&&route==='printshrimp'&&!shrimp)issues.push('printshrimp_product_missing');
  if(kind==='physical'&&route==='prodigi'&&shrimp)issues.push('prodigi_sku_also_exists_in_printshrimp');
  if(kind==='physical'&&route==='printshrimp'&&shrimp){
   const variants=Array.isArray(shrimp.variants)?shrimp.variants:[];
   for(const size of sizes){
    const matched=variants.filter(v=>String(v.size||'').toUpperCase()===size);
    if(matched.length!==1)issues.push('missing_or_duplicate_printshrimp_size_file');
    else if(typeof matched[0].image_url!=='string'||!matched[0].image_url.startsWith('https://'))issues.push('unverified_printshrimp_artwork_url');
   }
   if(!sizes.size)issues.push('etsy_sizes_unverified');
  }
  rows.push({listingId:id,state:listing.state||'unknown',kind,expectedSupplier:route,sku:unique,sizeCount:sizes.size,etsyVariantCount:enabled.length,printshrimpProductPresent:Boolean(shrimp),issues:[...new Set(issues)]});
 }
 for(const row of rows)if(row.sku&&skuToListings.get(row.sku)?.size>1&&row.kind==='physical')row.issues.push('sku_shared_across_etsy_listings');
 const issueCounts={};
 for(const r of rows)for(const code of r.issues)issueCounts[code]=(issueCounts[code]||0)+1;
 return {audit:'etsy_printshrimp_read_only_v1',totalEtsyListings:rows.length,totalPrintShrimpProducts:products.length,issueCounts,rows,
  complete:rows.every(r=>!r.issues.length)&&Object.keys(expectedRoutes).every(id=>seen.has(Number(id))),
  notVerified:[
   'Prodigi per-listing toggles, variants and default: dashboard only',
   'PrintShrimp auto-import, auto-pay, tracking and wallet: dashboard only',
   'PrintShrimp unpaid attention or rejected orders: not listed by API',
   'Supplier file URLs do not prove printable output or quality',
   'Actual future order routing and double-fulfilment safety not demonstrated'
  ]};
}

// Authenticated reads only; no publishing, orders, settings mutation or webhook calls.
export async function collectSupplierSnapshot({client,apiKey,request=fetch,expectedRoutes={},shopName='SapiverPrints',maxListings=4000,maxSupplierProducts=25000}) {
 requireOk(client&&typeof client.session==='function'&&typeof client.api==='function','Etsy client unavailable');
 requireOk(typeof apiKey==='string'&&apiKey.length>10,'Missing supplier read key');
 const seller=await client.session();
 requireOk(idOk(seller?.shop_id)&&seller.shop_name===shopName,'Wrong Etsy shop');
 const listings=[];
 for(const state of STATES)for(let offset=0;;offset+=100){
  requireOk(listings.length<maxListings,'Etsy audit limit exceeded');
  const path='/shops/'+seller.shop_id+'/listings?'+new URLSearchParams({state,limit:'100',offset:String(offset)});
  const page=await client.api(path);
  requireOk(Array.isArray(page?.results),'Etsy listing result unavailable');
  for(const item of page.results){requireOk(item.shop_id===seller.shop_id,'Foreign Etsy listing');listings.push(item);}
  if(page.results.length<100)break;
 }
 requireOk(listings.length<=maxListings,'Etsy audit limit exceeded');
 const inventories={};
 for(const l of listings){
  requireOk(idOk(l.listing_id),'Invalid Etsy listing identity');
  if(classifyEtsyListing(l)==='digital')continue;
  try{inventories[String(l.listing_id)]=await client.api('/listings/'+l.listing_id+'/inventory');}
  catch{inventories[String(l.listing_id)]=null;}
 }
 const products=[];
 for(let page=1;;page++){
  requireOk(products.length<=maxSupplierProducts&&page<=Math.ceil(maxSupplierProducts/25)+1,'PrintShrimp audit limit exceeded');
  const url=SHRIMP_API+'/api-get-product?'+new URLSearchParams({page:String(page)});
  const r=await request(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'x-api-key':apiKey,Accept:'application/json'}});
  requireOk(r.ok,'PrintShrimp read failed');
  const body=await r.json();
  requireOk(body?.success===true&&Array.isArray(body.products)&&Number.isSafeInteger(body.total_products)&&body.total_products>=0,'Malformed PrintShrimp result');
  products.push(...body.products);
  if(products.length>=body.total_products)break;
  requireOk(body.products.length===25,'Truncated PrintShrimp product page');
 }
 requireOk(products.length<=maxSupplierProducts,'PrintShrimp audit limit exceeded');
 return {...compareSupplierSnapshot({listings,inventories,products,expectedRoutes}),shopId:seller.shop_id,
  evidence:'authenticated Etsy listing and inventory GET; PrintShrimp product GET',
  safeExecution:'GET-only; no merchant writes or Prodigi API requests'};
}

// Safe fixed-size workflow logging: no SKUs, customer details, URLs or provider bodies.
export function safeAuditSummary(r){
 return {audit:r.audit,totalEtsyListings:r.totalEtsyListings,totalPrintShrimpProducts:r.totalPrintShrimpProducts,
  issueCounts:r.issueCounts,complete:r.complete,limitations:r.notVerified.length};
}
