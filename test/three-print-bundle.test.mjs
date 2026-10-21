import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedTrioItems,verifySupplierBundle,computeUKBundleQuote,getSupplierBundle,createOrVerifyTrio} from '../lib/three-print-bundle.mjs';
const members=['FOX','ROBIN','HEDGEHOG'].map(sku=>({sku,sizes:['A5','A4']}));
const items=expectedTrioItems({members,size:'A4'});
const bundle={bundle_id:'supplier-123',sku:'SP-WOODLAND-VERSE-TRIO',total_prints:3,items:items.map((x,i)=>({...x,product_id:'product-'+i}))};
const pricing={success:true,currency:'GBP',sizes:[{size:'A4',print:{price:6.59,shipping:0}}]};
const mem=()=>{const m=new Map();return{m,setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&m.has(k))return{modified:false};m.set(k,v);return{modified:true};}}};
test('three unique fixed A4 sources are required and their SKUs are not repeated',()=>{
 assert.deepEqual(items.map(x=>x.size),['A4','A4','A4']);
 assert.throws(()=>expectedTrioItems({members:[members[0],members[0],members[1]],size:'A4'}),/different/);
 assert.throws(()=>expectedTrioItems({members:[members[0],members[1],{sku:'THIRD',sizes:['A5']}],size:'A4'}),/artwork/);
});
test('supplier bundle must match all three actual artwork SKUs and exact fixed print sizes',()=>{
 assert.equal(verifySupplierBundle({success:true,bundle},{sku:bundle.sku,items}).bundleId,'supplier-123');
 assert.throws(()=>verifySupplierBundle({success:true,bundle:{...bundle,items:bundle.items.map((x,i)=>i===0?{...x,sku:'OTHER'}:x)}},{sku:bundle.sku,items}),/different artwork/);
 assert.throws(()=>verifySupplierBundle({success:true,bundle:{...bundle,total_prints:2}},{sku:bundle.sku,items}),/print count/);
 assert.throws(()=>verifySupplierBundle({success:true,bundle:{...bundle,items:bundle.items.map((x,i)=>i===0?{...x,size:'A5'}:x)}},{sku:bundle.sku,items}),/print sizes/);
});
test('supplier contribution calculations use UK VAT inclusive pricing, 20% supplier 3-print offer and a safety margin',()=>{
 const q=computeUKBundleQuote({pricing,size:'A4',unitPrices:[13.99,13.99,13.99],discount:15});
 assert.equal(q.grossGbp,35.67);
 assert.equal(q.supplierCostGbp,15.82);
 assert.equal(q.estimatedFeesGbp,5.85);
 assert.equal(q.contributionGbp,14);
 assert.throws(()=>computeUKBundleQuote({pricing,size:'A4',unitPrices:[6,6,6],discount:15}),/margin/);
 assert.throws(()=>computeUKBundleQuote({pricing:{success:true,currency:'USD',sizes:[]},size:'A4',unitPrices:[14,14,14],discount:10}),/pricing unavailable/);
});
test('read existing supplier bundle is read-only, unknown returns null',async()=>{
 const responses=[{status:404,ok:false},{status:200,ok:true,json:async()=>({success:true,bundle})}],paths=[];
 const fetcher=async url=>{paths.push(String(url));return responses.shift();};
 assert.equal(await getSupplierBundle({request:fetcher,apiKey:'private',sku:bundle.sku}),null);
 assert.equal((await getSupplierBundle({request:fetcher,apiKey:'private',sku:bundle.sku})).bundle.sku,bundle.sku);
 assert.ok(paths.every(p=>p.includes('/api-get-bundle?sku=')));
});
test('existing supplier bundle is reused only if all three products and size match; no supplier POST',async()=>{
 let posts=0;const request=async(url,options)=>{if(options.method==='POST')posts++;return {ok:true,status:200,json:async()=>({success:true,bundle})};};
 const r=await createOrVerifyTrio({store:mem(),key:'bundle/SKU',request,apiKey:'private',sku:bundle.sku,name:'Woodland Set',items});
 assert.equal(r.reused,true);assert.equal(posts,0);
});
test('new supplier bundle is reserved once, created once and read back before verified state',async()=>{
 const store=mem(),calls=[];
 const request=async(url,options)=>{calls.push({url,method:options.method});
  if(options.method==='POST')return{ok:true,status:201,json:async()=>({success:true,bundle})};
  return {ok:calls.filter(x=>x.method==='GET').length>1,status:calls.filter(x=>x.method==='GET').length>1?200:404,json:async()=>({success:true,bundle})};
 };
 const r=await createOrVerifyTrio({store,key:'bundle/SKU',request,apiKey:'private',sku:bundle.sku,name:'Woodland Set',items});
 assert.equal(r.reused,false);assert.equal(store.m.get('bundle/SKU').phase,'verified');
 assert.equal(calls.filter(x=>x.method==='POST').length,1);
});
test('ambiguous provider post stays claimed and cannot be retried into duplicates',async()=>{
 const store=mem();let posts=0;
 const request=async(url,options)=>options.method==='POST'?(posts++,{status:500,ok:false}):{status:404,ok:false};
 await assert.rejects(createOrVerifyTrio({store,key:'bundle/SKU',request,apiKey:'private',sku:bundle.sku,name:'Woodland Set',items}),/outcome uncertain/);
 await assert.rejects(createOrVerifyTrio({store,key:'bundle/SKU',request,apiKey:'private',sku:bundle.sku,name:'Woodland Set',items}),/already reserved/);
 assert.equal(posts,1);
});


test('supplier bundle reuses only the exact original product IDs behind all three SKUs',async()=>{
 const ids=new Map(items.map((x,i)=>[x.sku.toLowerCase(),'product-'+i]));
 const requester=async()=>({ok:true,status:200,json:async()=>({success:true,bundle})});
 assert.equal((await createOrVerifyTrio({store:mem(),key:'bundle/SKU',request:requester,apiKey:'private',sku:bundle.sku,name:'Woodland Set',items,productIds:ids})).reused,true);
 const drifted=new Map(ids);drifted.set(items[0].sku.toLowerCase(),'replaced-artwork-product');
 await assert.rejects(createOrVerifyTrio({store:mem(),key:'bundle/SKU',request:requester,apiKey:'private',sku:bundle.sku,name:'Woodland Set',items,productIds:drifted}),/product IDs changed/);
});
