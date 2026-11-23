import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {retryFailedTrioPreparation} from '../lib/trio-prepare-recovery.mjs';
import {assetKey,} from '../lib/uploaded-poster.mjs';
import {seal} from '../lib/oauth.mjs';

const origin='https://poster.example.test',secret='test-trio-recovery-owner-secret-that-is-long-enough';
const env=name=>({CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'private-owner-password',ETSY_PRINTS_KEYSTRING:'etsy-app',ETSY_PRINTS_SHARED_SECRET:'shared'}[name]);
const id='T'.repeat(32),members=['A','B','C'].map(c=>c.repeat(32));
function store(){const m=new Map();return {m,get:async k=>m.get(k)||null,setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&m.has(k))return {modified:false};m.set(k,v);return {modified:true};}};}
function fixture(){
 const uploads=store(),calls=[];
 const refs=members.map((memberId,i)=>({id:memberId,sku:'SP-COLOUR-'+i,sha256:String(i).repeat(64),listingId:400+i}));
 members.forEach((memberId,i)=>uploads.m.set(assetKey(memberId),{
  type:'physical',phase:'published',listingId:400+i,supplierProductId:'supplier-'+i,
  image:{sha256:refs[i].sha256},plan:{identity:{sku:refs[i].sku}},
  masterKey:'original-'+i,metadata:{name:'Colour '+i,printSizes:['A4','A5']}
 }));
 const trio={type:'physical_bundle',phase:'needs_investigation',failureAction:'prepare',
  failureCode:'Processing stopped safely. Check retained IDs.',sku:'SP-TRIO-SAVED',
  productId:id,metadata:{name:'Bicep Heart Trio'},memberIds:members,memberRefs:refs,
  trio:{size:'A4',framed:true},listingId:null,supplierProductId:null,plan:null,approvalHash:null};
 uploads.m.set(assetKey(id),trio);
 const handler=createPosterUploadHandler({env,uploads,dispatchJob:async(uploadId,action)=>{
  calls.push({uploadId,action});return 'jobs/'+'z'.repeat(32);
 }});
 const cookie='__Host-poster_owner='+seal({csrf:'owner-csrf',expiry:Date.now()+600000},secret,'poster-owner');
 const req=(path,method='GET',body,extra={})=>new Request(origin+path,{method,body,headers:{
  cookie,origin,'X-Poster-CSRF':'owner-csrf',...extra}});
 return {uploads,calls,handler,req,trio};
}
const postBody=new URLSearchParams({csrf:'owner-csrf'}).toString();

test('failed trio displays bundle recovery, not a physical/digital correction form',async()=>{
 const f=fixture();
 const response=await f.handler(f.req('/poster/upload?id='+id),{});
 assert.equal(response.status,200);
 const html=await response.text();
 assert.match(html,/Optional trio — preparation stopped safely/);
 assert.match(html,/SP-TRIO-SAVED/);
 assert.match(html,/Recheck this saved trio \(once\)/);
 assert.doesNotMatch(html,/Prepare corrected review/);
 assert.doesNotMatch(html,/product-configure-form/);
 assert.equal(f.calls.length,0);
});
test('explicit one-time retry preserves same trio, member references and supplier SKU',async()=>{
 const f=fixture(),path='/poster/uploads/'+id+'/retry-trio-prepare';
 const before=structuredClone(await f.uploads.get(assetKey(id)));
 const response=await f.handler(f.req(path,'POST',postBody,{'Content-Type':'application/x-www-form-urlencoded'}),{});
 assert.equal(response.status,303);
 assert.equal(response.headers.get('Location'),'/poster/upload?id='+id);
 const after=await f.uploads.get(assetKey(id));
 assert.equal(after.phase,'preparing');assert.equal(after.sku,before.sku);
 assert.deepEqual(after.memberIds,before.memberIds);
 assert.deepEqual(after.memberRefs,before.memberRefs);
 assert.equal(after.listingId,null);assert.equal(after.supplierProductId,null);
 assert.deepEqual(f.calls,[{uploadId:id,action:'prepare'}]);
 const second=await f.handler(f.req(path,'POST',postBody,{'Content-Type':'application/x-www-form-urlencoded'}),{});
 assert.equal(second.status,409);assert.equal(f.calls.length,1);
});
test('trio cannot use generic correction or prepare another product revision',async()=>{
 const f=fixture();
 const response=await f.handler(f.req('/poster/uploads/'+id+'/configure','POST',JSON.stringify({metadata:{kind:'artwork'}})),{});
 assert.equal(response.status,409);
 assert.equal((await f.uploads.get(assetKey(id))).phase,'needs_investigation');
 assert.equal(f.calls.length,0);
});
test('failed trio retry is blocked if a merchant reservation or source drift exists',async()=>{
 for(const issue of ['supplier','publish','source']){
  const f=fixture();
  if(issue==='supplier')f.uploads.m.set('supplier-bundles/SP-TRIO-SAVED',{phase:'reserved'});
  if(issue==='publish')f.uploads.m.set('claims/'+id+'/publish',{at:1});
  if(issue==='source')f.uploads.m.set(assetKey(members[0]),{phase:'published',listingId:400,supplierProductId:'supplier-0',plan:{identity:{sku:'wrong'}},image:{sha256:'0'.repeat(64)}});
  await assert.rejects(retryFailedTrioPreparation({id,uploads:f.uploads,dispatch:async()=>f.calls.push(true)}));
  assert.equal((await f.uploads.get(assetKey(id))).phase,'needs_investigation');
  assert.equal(f.uploads.m.has('claims/'+id+'/trio-preparation-retry-once'),false);
  assert.equal(f.calls.length,0);
 }
});
test('unsigned retry cannot bypass studio owner session or CSRF',async()=>{
 const f=fixture(),path='/poster/uploads/'+id+'/retry-trio-prepare';
 const unauth=await f.handler(new Request(origin+path,{method:'POST',body:postBody}),{});
 assert.equal(unauth.status,401);
 const invalid=await f.handler(f.req(path,'POST',new URLSearchParams({csrf:'wrong'}).toString(),{'Content-Type':'application/x-www-form-urlencoded'}),{});
 assert.equal(invalid.status,403);
 assert.equal(f.calls.length,0);
});

test('one-use retry is no longer offered after its reservation, but diagnosis remains available',async()=>{
 const f=fixture();
 f.uploads.m.set('claims/'+id+'/trio-preparation-retry-once',{id,at:1});
 const html=await (await f.handler(f.req('/poster/upload?id='+id),{})).text();
 assert.doesNotMatch(html,/Recheck this saved trio \(once\)/);
 assert.match(html,/Diagnose saved trio \(read-only\)/);
 assert.match(html,/SP-TRIO-SAVED/);
});
