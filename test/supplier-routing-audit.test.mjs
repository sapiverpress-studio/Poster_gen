import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSupplierSnapshot,collectSupplierSnapshot,safeAuditSummary} from '../lib/supplier-routing-audit.mjs';

const listing=(id,type='physical',state='active')=>({listing_id:id,shop_id:50893070,listing_type:type,state});
const inv=(sku,sizes=['A5','A4','A3'])=>({products:sizes.map(s=>({sku,offerings:[{is_enabled:true}],property_values:[{values:[s]}]}))});
const product=(sku,sizes=['A5','A4','A3'])=>({sku,variants:sizes.map(s=>({size:s,image_url:'https://api.printshrimp.com/storage/test'}))});

test('poster matches PrintShrimp and card is separate in declared route registry',()=>{
 const r=compareSupplierSnapshot({listings:[listing(1),listing(2)],inventories:{1:inv('SP-POST-A'),2:inv('SC-CARD-B',['A5'])},products:[product('SP-POST-A')],expectedRoutes:{1:'printshrimp',2:'prodigi'}});
 assert.equal(r.complete,true);
 assert.equal(r.rows[0].expectedSupplier,'printshrimp');
 assert.equal(r.rows[1].expectedSupplier,'prodigi');
 assert.equal(r.rows[1].printshrimpProductPresent,false);
});
test('do not infer supplier from an unregistered card SKU',()=>{
 const r=compareSupplierSnapshot({listings:[listing(2)],inventories:{2:inv('SC-CARD-B',['A5'])},products:[]});
 assert.equal(r.complete,false);
 assert.deepEqual(r.issueCounts,{supplier_route_unassigned:1});
});
test('missing SKUs, missing size and mixed SKUs all fail closed',()=>{
 const mixed={products:[inv('X',['A4']).products[0],inv('Y',['A3']).products[0]]};
 const r=compareSupplierSnapshot({listings:[listing(1),listing(2),listing(3)],inventories:{1:inv('',['A4']),2:inv('P',['A3']),3:mixed},products:[product('P',['A4'])],expectedRoutes:{1:'printshrimp',2:'printshrimp',3:'printshrimp'}});
 assert.equal(r.complete,false);
 assert.equal(r.issueCounts.missing_etsy_sku,1);
 assert.equal(r.issueCounts.missing_or_duplicate_printshrimp_size_file,1);
 assert.equal(r.issueCounts.mixed_variant_skus,1);
});
test('duplicate Etsy SKUs are flagged',()=>{
 const r=compareSupplierSnapshot({listings:[listing(1),listing(2)],inventories:{1:inv('S'),2:inv('S')},products:[product('S')],expectedRoutes:{1:'printshrimp',2:'printshrimp'}});
 assert.equal(r.issueCounts.sku_shared_across_etsy_listings,2);
});
test('card SKU saved in PrintShrimp is a collision',()=>{
 const r=compareSupplierSnapshot({listings:[listing(2)],inventories:{2:inv('SC-CARD-B')},products:[product('SC-CARD-B')],expectedRoutes:{2:'prodigi'}});
 assert.equal(r.issueCounts.prodigi_sku_also_exists_in_printshrimp,1);
});
test('digital listings do not require supplier inventory',()=>{
 const r=compareSupplierSnapshot({listings:[listing(9,'download')],inventories:{},products:[]});
 assert.equal(r.complete,true);assert.equal(r.rows[0].expectedSupplier,'none');
});
test('collection calls seller read methods and PrintShrimp GET only',async()=>{
 const supplierUrls=[],etsyPaths=[];
 const client={session:async()=>({shop_id:50893070,shop_name:'SapiverPrints'}),api:async path=>{
  etsyPaths.push(path);
  if(path.includes('/inventory'))return inv('SP-POST');
  return path.includes('state=active')?{results:[listing(1)]}:{results:[]};
 }};
 const request=async(url,opts)=>{supplierUrls.push({url,method:opts.method});return {ok:true,json:async()=>({success:true,total_products:1,products:[product('SP-POST')]})};};
 const r=await collectSupplierSnapshot({client,apiKey:'test_readonly_key',request,expectedRoutes:{1:'printshrimp'}});
 assert.equal(r.complete,true);
 assert.equal(supplierUrls.length,1);
 assert.ok(supplierUrls.every(x=>x.method==='GET'&&x.url.includes('/api-get-product?')));
 assert.equal(etsyPaths.filter(x=>x.includes('/inventory')).length,1);
 assert.equal(etsyPaths.filter(x=>x.includes('/shops/')).length,5);
 assert.deepEqual(Object.keys(safeAuditSummary(r)),['audit','totalEtsyListings','totalPrintShrimpProducts','issueCounts','complete','limitations']);
});
test('wrong Etsy shop and failed supplier call stop the audit',async()=>{
 const wrong={session:async()=>({shop_id:50893070,shop_name:'OtherShop'}),api:async()=>({results:[]})};
 await assert.rejects(()=>collectSupplierSnapshot({client:wrong,apiKey:'test_readonly_key'}),/Wrong Etsy shop/);
 const good={session:async()=>({shop_id:50893070,shop_name:'SapiverPrints'}),api:async()=>({results:[]})};
 await assert.rejects(()=>collectSupplierSnapshot({client:good,apiKey:'test_readonly_key',request:async()=>({ok:false})}),/PrintShrimp read failed/);
});
