import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {diagnoseFailedTrioPreparation} from '../lib/collection-bundle-publication.mjs';
import {seal} from '../lib/oauth.mjs';
import {assetKey} from '../lib/uploaded-poster.mjs';

const id='D'.repeat(32),origin='https://poster.example.test';
const secret='owner-test-secret-long-enough-for-diagnosis';
const env=name=>({CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'owner-only',ETSY_PRINTS_KEYSTRING:'key',ETSY_PRINTS_SHARED_SECRET:'shared'}[name]);
function memory(){const m=new Map();return {m,get:async k=>m.get(k)||null,setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&m.has(k))return {modified:false};m.set(k,v);return {modified:true};}};}
const saved=()=>({type:'physical_bundle',phase:'needs_investigation',failureAction:'prepare',
 sku:'SP-TRIO-EXISTING',productId:id,memberIds:['A','B','C'].map(x=>x.repeat(32)),
 memberRefs:['A','B','C'].map(x=>({id:x.repeat(32),sku:x,sha256:'0'.repeat(64),listingId:100})),
 failureCode:'Previously stopped',metadata:{name:'Bicep Heart'},trio:{title:'Bicep Heart',size:'A4',framed:true}});
function fixture(){
 const uploads=memory(),jobs=[];uploads.m.set(assetKey(id),saved());
 const handler=createPosterUploadHandler({env,uploads,dispatchJob:async(jobId,action)=>{jobs.push({jobId,action});return 'jobs/'+'x'.repeat(32);}});
 const cookie='__Host-poster_owner='+seal({csrf:'csrf123',expiry:Date.now()+100000},secret,'poster-owner');
 const req=(path,method='GET',body)=>new Request(origin+path,{method,body,headers:{cookie,origin,'Content-Type':'application/x-www-form-urlencoded'}});
 return {uploads,jobs,handler,req};
}
test('failed trio has a read-only diagnostic action and does not offer generic correction',async()=>{
 const f=fixture();const response=await f.handler(f.req('/poster/upload?id='+id),{});
 const html=await response.text();
 assert.match(html,/Diagnose saved trio \(read-only\)/);
 assert.doesNotMatch(html,/Prepare corrected review/);
 assert.equal(f.jobs.length,0);
});
test('diagnostic requests are owner-controlled, once-only and do not advance trio state',async()=>{
 const f=fixture(),route='/poster/uploads/'+id+'/diagnose-trio';
 const form=new URLSearchParams({csrf:'csrf123'}).toString();
 const first=await f.handler(f.req(route,'POST',form),{});
 assert.equal(first.status,303);
 assert.deepEqual(f.jobs,[{jobId:id,action:'trio_prepare_audit'}]);
 assert.equal((await f.uploads.get(assetKey(id))).phase,'needs_investigation');
 const second=await f.handler(f.req(route,'POST',form),{});
 assert.equal(second.status,409);assert.equal(f.jobs.length,1);
 const html=await (await f.handler(f.req('/poster/upload?id='+id),{})).text();
 assert.match(html,/Diagnostic requested/);
 assert.doesNotMatch(html,/Diagnose saved trio \(read-only\)/);
});
test('diagnostic blocks invalid CSRF and does not save a claim',async()=>{
 const f=fixture(),route='/poster/uploads/'+id+'/diagnose-trio';
 const bad=await f.handler(f.req(route,'POST','csrf=invalid'),{});
 assert.equal(bad.status,403);assert.equal(f.jobs.length,0);
 assert.equal(f.uploads.m.has('trio-prepare-audit/'+id),false);
});
test('read-only backend returns a stage-specific classification without writing merchant data',async()=>{
 const uploads=memory();uploads.m.set(assetKey(id),saved());
 let calls=0,requests=0;
 const diagnosis=await diagnoseFailedTrioPreparation({id,uploads,client:{session:async()=>{calls++;return {shop_name:'SapiverPrints',shop_id:1};},api:async()=>{calls++;throw Error('Should not fetch a missing member');}},env,request:async()=>{requests++;throw Error('Not allowed');}});
 assert.equal(diagnosis.phase,'blocked');
 assert.equal(diagnosis.stage,'member_etsy_inventory_and_price');
 assert.equal(diagnosis.reason,'member_publication_or_supplier_unverified');
 assert.equal(calls,1);assert.equal(requests,0);
 assert.equal(uploads.m.size,1);
 assert.equal((await uploads.get(assetKey(id))).phase,'needs_investigation');
});
