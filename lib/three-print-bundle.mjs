// PrintShrimp bundle support. The supplier stores three existing product SKUs,
// never uploads the artwork a second time, and does not publish to Etsy.
import {SHRIMP_API} from './printshrimp-api.mjs';
const fail=x=>{throw Error(x);};
const SKU=/^[A-Za-z0-9_-]{1,100}$/;
const round=v=>Math.round(v*100)/100;
export function expectedTrioItems({members,size}){
 if(!['A5','A4','A3'].includes(size)||!Array.isArray(members)||members.length!==3)
  fail('Trio requires exactly three products in one supported fixed size');
 const list=members.map(p=>{
  const sku=p?.sku;
  if(!SKU.test(sku||'')||!p.sizes?.includes(size))fail('Each trio member needs a verified supplier product with artwork in '+size);
  return {sku,quantity:1,size};
 });
 if(new Set(list.map(x=>x.sku.toLowerCase())).size!==3)fail('Three different supplier artwork SKUs required');
 return list;
}
export function verifySupplierBundle(payload,{sku,items,productIds}){
 const b=payload?.bundle;
 if(payload?.success!==true||!b||String(b.sku).toLowerCase()!==sku.toLowerCase()||
  !b.bundle_id||b.total_prints!==3||!Array.isArray(b.items)||b.items.length!==3)fail('PrintShrimp bundle identity or print count differs');
 const want=items.map(x=>x.sku.toLowerCase()+'|'+x.size+'|'+x.quantity).sort();
 const actual=b.items.map(x=>String(x.sku||'').toLowerCase()+'|'+x.size+'|'+x.quantity).sort();
 if(want.join(',')!==actual.join(','))fail('PrintShrimp bundle contains different artwork or print sizes');
 if(b.items.some(x=>!x.product_id))fail('PrintShrimp bundle includes missing product artwork');
 if(productIds&&b.items.some(x=>productIds.get(String(x.sku||'').toLowerCase())!==x.product_id))fail('PrintShrimp bundle artwork product IDs changed for the approved SKUs');
 return {bundleId:b.bundle_id,sku:b.sku,members:actual};
}
export function computeUKBundleQuote({pricing,size,unitPrices,discount,minimumContribution=6}){
 const prices=unitPrices;
 if(!Array.isArray(prices)||prices.length!==3||prices.some(x=>!Number.isFinite(x)||x<=0))fail('Three currently verified unframed Etsy prices required');
 if(![0,10,15].includes(discount)||!['A5','A4','A3'].includes(size))fail('Unsupported discount or size');
 if(pricing?.success!==true||pricing.currency!=='GBP'||!Array.isArray(pricing.sizes))fail('Current PrintShrimp UK pricing unavailable');
 const item=pricing.sizes.find(x=>x.size===size)?.print;
 if(!item||!Number.isFinite(item.price)||item.price<=0||!Number.isFinite(item.shipping)||item.shipping<0)fail('Current PrintShrimp print price or shipping unavailable');
 const gross=round(prices.reduce((a,b)=>a+b,0)*(1-discount/100));
 const production=round(item.price*3*0.8+item.shipping);
 // Conservative fee planning buffer; actual VAT, regulatory, and Offsite Ads exposure
 // depend on seller/account. This is NOT a marketplace fee guarantee.
 const fees=round(gross*0.15+0.5);
 const contribution=round(gross-production-fees);
 if(contribution<minimumContribution)fail('Bundle margin below £'+minimumContribution.toFixed(2)+' minimum; no publication allowed');
 return {currency:'GBP',size,discount,grossGbp:gross,baseGbp:round(prices.reduce((a,b)=>a+b,0)),
  supplierCostGbp:production,estimatedFeesGbp:fees,contributionGbp:contribution,
  quoteBasis:'GB standard delivery; 20% on exactly three unframed PrintShrimp prints; 15% Etsy fee buffer plus £0.50; excludes Offsite Ads and overhead.'};
}
async function call({request,apiKey,path,method='GET',body}){
 if(!apiKey||typeof apiKey!=='string')fail('Supplier API key required');
 const r=await request(SHRIMP_API+path,{method,redirect:'error',signal:AbortSignal.timeout(25000),
  headers:{'x-api-key':apiKey,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 return r;
}
export async function getSupplierBundle({request=fetch,apiKey,sku}){
 if(!SKU.test(sku||''))fail('Invalid bundle SKU');
 const r=await call({request,apiKey,path:'/api-get-bundle?'+new URLSearchParams({sku})});
 if(r.status===404)return null;
 if(!r.ok)fail('PrintShrimp bundle lookup returned HTTP '+r.status);
 const p=await r.json();
 if(p?.success!==true||!p.bundle)fail('PrintShrimp bundle lookup incomplete');
 return p;
}
export async function quoteSupplierGB({request=fetch,apiKey}){
 const r=await call({request,apiKey,path:'/api-get-pricing?country=GB'});
 if(!r.ok)fail('Live PrintShrimp UK pricing unavailable HTTP '+r.status);
 return r.json();
}
export async function createOrVerifyTrio({store,key,request=fetch,apiKey,sku,name,items,productIds,clock=()=>Date.now()}){
 if(!SKU.test(sku||'')||typeof name!=='string'||!name.trim()||name.length>255)fail('Invalid supplier bundle identity');
 if(!Array.isArray(items)||items.length!==3||items.some(x=>!SKU.test(x.sku||'')||x.quantity!==1||!['A5','A4','A3'].includes(x.size)))fail('Invalid bundle items');
 const found=await getSupplierBundle({request,apiKey,sku});
 if(found)return {verified:verifySupplierBundle(found,{sku,items,productIds}),reused:true};
 const claim=await store.setJSON(key,{phase:'creating',sku,items,at:clock()},{onlyIfNew:true});
 if(claim?.modified!==true)fail('Supplier bundle creation already reserved; inspect before retrying');
 try{
  const result=await call({request,apiKey,path:'/api-create-bundle',method:'POST',body:{name,sku,items}});
  if(result.status!==201)fail('Supplier bundle create did not confirm 201');
  const response=await result.json();verifySupplierBundle(response,{sku,items,productIds});
  const read=await getSupplierBundle({request,apiKey,sku});
  const verified=verifySupplierBundle(read,{sku,items,productIds});
  await store.setJSON(key,{phase:'verified',sku,items,...verified,at:clock()});
  return {verified,reused:false};
 }catch(error){
  await store.setJSON(key,{phase:'needs_investigation',sku,items,at:clock()});
  throw Error('Supplier bundle outcome uncertain; check SKU before any retry');
 }
}
