import test from 'node:test';
import assert from 'node:assert/strict';
import {BULK_ETS_IDS,externalRecordKey,linkExistingBulkProducts} from '../lib/existing-supplier-links.mjs';
const now=1800000000000,shopId=456;
function fixture({stale=false,supplierCheck='product_found',wrongId=false}={}){
 const rows=BULK_ETS_IDS.map((id,i)=>({id,state:'active',supplierMapping:'not_verified',supplierCheck,supplierProductId:'BulkProd-'+(i+1),sku:['SP-EL-'+(i+1)+'-EXAMPLE']}));
 const audit={version:1,shopId,checkedAt:now-(stale?1000000:5000),listings:rows};
 const data=new Map();
 const uploads={get:async key=>data.get(key)||null,setJSON:async(key,record,options={})=>{if(options.onlyIfNew&&data.has(key))return {modified:false};data.set(key,record);return {modified:true};}};
 if(wrongId)data.set(externalRecordKey(BULK_ETS_IDS[0]),{shopId,sku:rows[0].sku[0],supplierProductId:'DIFFERENT'});
 return {uploads,audit,clock:()=>now,data};
}
test('imports only five verified legacy references, without merchant operations or duplicate records',async()=>{
 const f=fixture(),out=await linkExistingBulkProducts({...f,ids:BULK_ETS_IDS});
 assert.equal(out.linked.length,5);
 assert.equal(out.ordersVerified,false);
 for(const id of BULK_ETS_IDS){
  const saved=f.data.get(externalRecordKey(id));
  assert.equal(saved.etsyListingId,id);
  assert.equal(saved.source,'printshrimp_bulk');
  assert.equal(saved.ordersVerified,false);
 }
 const repeat=await linkExistingBulkProducts({...f,ids:BULK_ETS_IDS});
 assert.ok(repeat.linked.every(x=>x.phase==='already_linked'));
 assert.equal(f.data.size,5);
});
test('stale supplier evidence, unknown IDs and non-matching supplier data cannot be linked',async()=>{
 const stale=fixture({stale:true});
 await assert.rejects(linkExistingBulkProducts({...stale,ids:[BULK_ETS_IDS[0]]}),/Fresh authenticated/);
 const unknown=fixture();
 await assert.rejects(linkExistingBulkProducts({...unknown,ids:[9999999999]}),/five known/);
 const incomplete=fixture({supplierCheck:'not_found'});
 await assert.rejects(linkExistingBulkProducts({...incomplete,ids:BULK_ETS_IDS}),/incomplete/);
 assert.equal(incomplete.data.size,0);
});
test('existing differing supplier reference blocks the entire batch before any mutation',async()=>{
 const f=fixture({wrongId:true});
 await assert.rejects(linkExistingBulkProducts({...f,ids:BULK_ETS_IDS}),/Conflicting/);
 assert.equal(f.data.size,1);
});
