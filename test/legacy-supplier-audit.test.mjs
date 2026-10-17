import test from 'node:test';
import assert from 'node:assert/strict';
import {checkLegacySupplier} from '../lib/legacy-supplier-audit.mjs';

const legacy=[
 {id:1,state:'active',supplierMapping:'not_verified',sku:['SP-EL-001-COUNTING']},
 {id:2,state:'active',supplierMapping:'not_verified',sku:['SP-EL-002-SHAPES']},
 {id:3,state:'active',supplierMapping:'not_verified',sku:['SP-EL-003-DINO']},
 {id:4,state:'active',supplierMapping:'recorded',sku:['SP-LIVE']}
];
test('supplier lookup is read-only, bounded and preserves the Etsy identity',async()=>{
 const requests=[];
 const result=await checkLegacySupplier({listings:legacy,apiKey:'private',request:async(url,options)=>{
  requests.push({url,options});
  const sku=new URL(url).searchParams.get('sku');
  if(sku==='SP-EL-001-COUNTING')return Response.json({success:true,product:{sku,product_id:'Supplier-001',variants:['A3','A4','A5'].map(size=>({size,image_url:'https://assets.printshrimp.com/a.png'}))}});
  if(sku==='SP-EL-002-SHAPES')return new Response(null,{status:404});
  return Response.json({success:true,product:{sku,product_id:'Supplier-003',variants:[{size:'A3',image_url:'https://assets.printshrimp.com/a.png'}]}});
 }});
 assert.equal(requests.length,3);
 assert.ok(requests.every(v=>v.options.method==='GET'&&v.options.headers['x-api-key']==='private'));
 assert.equal(result.find(x=>x.id===1).supplierCheck,'product_found');
 assert.equal(result.find(x=>x.id===1).supplierProductId,'Supplier-001');
 assert.equal(result.find(x=>x.id===2).supplierCheck,'not_found');
 assert.equal(result.find(x=>x.id===3).supplierCheck,'supplier_incomplete');
 assert.equal(result.find(x=>x.id===4).supplierCheck,undefined);
 assert.equal(result[0].id,1);
});
test('ambiguous Etsy SKUs are not guessed and API failures are not misreported as absent',async()=>{
 const rows=[{id:10,state:'active',supplierMapping:'not_verified',sku:['A','B']},{id:11,state:'active',supplierMapping:'not_verified',sku:['SKU-1']}];
 const result=await checkLegacySupplier({listings:rows,apiKey:'private',request:async()=>new Response('bad',{status:503})});
 assert.equal(result[0].supplierCheck,'sku_ambiguous');
 assert.equal(result[1].supplierCheck,'lookup_unavailable');
});

test('a saved bulk product reference is checked against the current PrintShrimp product ID',async()=>{
 const rows=[{id:123,state:'active',supplierMapping:'existing_bulk_linked',supplierProductId:'Saved-ID',sku:['SP-BULK-001']}];
 const request=async(url)=>Response.json({success:true,product:{sku:new URL(url).searchParams.get('sku'),product_id:'Different-ID',variants:['A3','A4','A5'].map(size=>({size,image_url:'https://example.com/master.png'}))}});
 const result=await checkLegacySupplier({listings:rows,apiKey:'private',request});
 assert.equal(result[0].supplierCheck,'link_conflict');
 assert.equal(result[0].supplierProductId,'Saved-ID');
 const verified=await checkLegacySupplier({listings:rows,apiKey:'private',request:async(url)=>Response.json({success:true,product:{sku:new URL(url).searchParams.get('sku'),product_id:'Saved-ID',variants:['A3','A4','A5'].map(size=>({size,image_url:'https://example.com/master.png'}))}})});
 assert.equal(verified[0].supplierCheck,'link_verified');
});
