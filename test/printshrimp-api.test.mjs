import test from 'node:test';
import assert from 'node:assert/strict';
import {supplierPayload,transferOneMaster} from '../lib/printshrimp-api.mjs';
import {inspectPNG} from '../lib/print-check.mjs';
import {PRINT_PRODUCT} from '../lib/printshrimp-product.mjs';
import {createMasterStreamHandler} from '../lib/master-stream.mjs';
function fixture(){
 const bytes=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(13,8);bytes.write('IHDR',12);bytes.writeUInt32BE(3508,16);bytes.writeUInt32BE(4961,20);
 const report={phase:'ready_for_review',design_id:PRINT_PRODUCT.designId,approved_updated_at:PRINT_PRODUCT.approvedUpdatedAt,file_key:PRINT_PRODUCT.blobKey,image:inspectPNG(bytes),printshrimp:{meets_measured_upload_checks:true},readiness:{print_sizes:Object.fromEntries(['A5','A4','A3'].map(s=>[s,{passes_300ppi:true}]))}};
 const records=new Map(),store={setJSON:async(k,v,options)=>{if(options?.onlyIfNew&&records.has(k))return {modified:false};records.set(k,v);return {modified:true};}};
 const options={store,report,readMaster:async()=>bytes,verifyEtsyDraft:async()=>({shop_name:'SapiverPrints',state:'draft',sharedSku:PRINT_PRODUCT.sku,sizes:['A5','A4','A3']}),draftListingId:123,visualApproved:true,apiKey:'private-key',origin:'https://poster.example.test'};
 return {options,records,bytes};
}
test('one supplier product uses the same master URL for all three A sizes',()=>{
 const p=supplierPayload('Dinosaurs Across Time',PRINT_PRODUCT.sku,'https://poster.example.test/print/master.png?ticket=private');assert.equal(p.sku,PRINT_PRODUCT.sku);assert.deepEqual(p.variants.map(v=>v.size),['A5','A4','A3']);assert.equal(new Set(p.variants.map(v=>v.image_url)).size,1);assert.throws(()=>supplierPayload('name','bad sku','https://poster.example.test/file'));assert.throws(()=>supplierPayload('name','SKU','http://poster.example.test/file'));
});
test('real transfer control reserves one POST, verifies supplier copies and revokes master access',async()=>{
 const {options,records}=fixture();let gets=0,posts=0,payload;
 options.request=async(url,opts)=>{
  assert.equal(opts.headers['x-api-key'],'private-key');assert.equal(opts.redirect,'error');
  if(opts.method==='POST'){posts++;assert.equal(url,'https://api.printshrimp.com/functions/v1/api-create-product');payload=JSON.parse(opts.body);return Response.json({success:true},{status:201});}
  gets++;if(gets===1)return new Response(null,{status:404});
  return Response.json({success:true,product:{product_id:'provider-id',sku:PRINT_PRODUCT.sku,variants:['A5','A4','A3'].map(size=>({size,image_url:'https://supplier.example.test/master-'+size+'.png'}))}});
 };
 const result=await transferOneMaster(options);assert.equal(posts,1);assert.equal(result.ordersEnabled,false);assert.equal(result.productId,'provider-id');assert.equal(new Set(payload.variants.map(v=>v.image_url)).size,1);assert.ok([...records.entries()].some(([k,v])=>k.startsWith('transfers/')&&v.revoked));assert.doesNotMatch(JSON.stringify(result),/ticket|private-key/);
 options.request=async()=>new Response(null,{status:404});await assert.rejects(transferOneMaster(options),/already reserved/);
});
test('wrong or missing Etsy draft and corrupt master fail before any supplier request',async()=>{
 const {options}=fixture();let calls=0;options.request=async()=>{calls++;throw Error();};
 await assert.rejects(transferOneMaster({...options,visualApproved:false}),/Visual/);
 await assert.rejects(transferOneMaster({...options,draftListingId:null}),/draft/);
 await assert.rejects(transferOneMaster({...options,verifyEtsyDraft:async()=>({state:'active'})}),/mapping/);
 await assert.rejects(transferOneMaster({...options,report:{...options.report,image:{...options.report.image,sha256:'a'.repeat(64)}}}),/checksum/);assert.equal(calls,0);
});
test('ambiguous upload cannot retry and supplier must persist its own image URLs',async()=>{
 const {options,records}=fixture();let calls=0;
 options.request=async()=>{calls++;if(calls===1)return new Response(null,{status:404});throw Error('private-key');};
 await assert.rejects(transferOneMaster(options),/investigation/);assert.equal(records.get('supplier/'+PRINT_PRODUCT.sku).phase,'uncertain');assert.ok([...records.values()].some(v=>v.revoked));
});
test('master stream denies invalid, expired and revoked tickets and serves only pinned private master',async()=>{
 const ticket='a'.repeat(43),bytes=new Uint8Array([1,2,3]);let streams=0;let grant={fileKey:PRINT_PRODUCT.blobKey,bytes:3,sha256:'b'.repeat(64),expiresAt:Date.now()+10000};
 const handler=createMasterStreamHandler({store:()=>({get:async(key,opts)=>{if(opts.type==='json')return grant;streams++;return new ReadableStream({start(c){c.enqueue(bytes);c.close();}});}})});
 const req=()=>new Request('https://poster.example.test/print/master.png?ticket='+ticket);
 assert.equal((await handler(new Request('https://poster.example.test/print/master.png'))).status,403);
 grant.revoked=true;assert.equal((await handler(req())).status,403);grant.revoked=false;grant.expiresAt=0;assert.equal((await handler(req())).status,403);grant.expiresAt=Date.now()+10000;
 const response=await handler(req());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);assert.equal(streams,1);
});
