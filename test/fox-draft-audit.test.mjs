import test from 'node:test';
import assert from 'node:assert/strict';
import {auditFoxDraft} from '../lib/fox-draft-audit.mjs';
test('fox audit uses only bounded GETs and refuses changed identity',async()=>{
 const sku='SP-FOX-PRINT-WITH-ORIGINAL-WOODLAND-VERSE',listingId=4595277551,calls=[];
 const asset={listingId,phase:'needs_investigation',stage:'etsy_draft',plan:{identity:{sku},inventory:{products:Array.from({length:12},()=>({sku}))}}};
 const args={etsyStore:{get:async()=>({listingId,uploadId:'a'.repeat(32)})},uploads:{get:async()=>asset},client:{session:async()=>({shop_id:50893070}),api:async(path,options)=>{assert.equal(options,undefined);calls.push(path);return path.endsWith('/inventory')?{products:[{sku:''}]}:{shop_id:50893070,state:'draft',images:[],shop_section_id:60890222};}}};
 const result=await auditFoxDraft(args);assert.equal(result.imageCount,0);assert.equal(result.inventoryProducts,1);assert.equal(result.expectedProducts,12);assert.equal(calls.length,2);
 asset.listingId=123;calls.length=0;await assert.rejects(auditFoxDraft(args),/identity mismatch/);assert.equal(calls.length,0);
});
