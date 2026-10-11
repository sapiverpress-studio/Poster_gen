import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {createUploadRunner} from '../lib/poster-upload-runner.mjs';
import {seal} from '../lib/oauth.mjs';
import {assetKey,CHUNK_BYTES} from '../lib/uploaded-poster.mjs';
import {recordRevision} from '../lib/product-records.mjs';
const origin='https://poster.example.test',secret='a-test-encryption-key-of-sufficient-length';
const values={CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'owner-password',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',POSTER_PUBLICATION_ENABLED:'true'};
const env=n=>values[n];
const cookie=()=> '__Host-poster_owner='+seal({csrf:'owner-csrf',expiry:Date.now()+3600000},secret,'poster-owner');
function memory(){const map=new Map();return {map,get:async k=>map.get(k),set:async(k,v,o)=>{if(o?.onlyIfNew&&map.has(k))return {modified:false};map.set(k,v);return {modified:true};},setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&map.has(k))return {modified:false};map.set(k,v);return {modified:true};}};}
function request(path,method='GET',body,extra={}){return new Request(origin+path,{method,body,headers:{cookie:cookie(),origin,'X-Poster-CSRF':'owner-csrf',...extra}});}
function fixture(){const uploads=memory(),pending=[],sent=[];const handler=createPosterUploadHandler({env,uploads,request:async(url,o)=>{sent.push([url,o]);return new Response(null,{status:202});}});return {uploads,pending,sent,handler,context:{waitUntil:p=>pending.push(p)}};}
test('upload creation rejects unauthenticated, cross-site, missing CSRF and oversized files',async()=>{const f=fixture();assert.equal((await f.handler(new Request(origin+'/poster/uploads',{method:'POST',body:'{}'}),f.context)).status,303);const body=JSON.stringify({filename:'Space.png',bytes:50000001,referenceListingId:789});assert.equal((await f.handler(request('/poster/uploads','POST',body),f.context)).status,400);assert.equal((await f.handler(request('/poster/uploads','POST',body,{origin:'https://evil.example.test'}),f.context)).status,403);assert.equal((await f.handler(request('/poster/uploads','POST',body,{'X-Poster-CSRF':'wrong'}),f.context)).status,403);assert.equal(f.uploads.map.size,0);});
test('upload chunks are exact-sized and idempotent; different repeated content is rejected',async()=>{const f=fixture();const r=await f.handler(request('/poster/uploads','POST',JSON.stringify({filename:'Space.png',bytes:33,referenceListingId:789})),f.context);const {id,chunkBytes}=await r.json();assert.equal(chunkBytes,CHUNK_BYTES);const path='/poster/uploads/'+id+'/chunks/0',bytes=new Uint8Array(33);assert.equal((await f.handler(request(path,'PUT',bytes),f.context)).status,200);assert.equal((await f.handler(request(path,'PUT',bytes),f.context)).status,200);bytes[0]=1;assert.equal((await f.handler(request(path,'PUT',bytes),f.context)).status,409);assert.equal((await f.handler(request(path,'PUT',new Uint8Array(32)),f.context)).status,400);});
test('finish queues preparation once with signed private dispatch and no API credentials',async()=>{const f=fixture(),r=await f.handler(request('/poster/uploads','POST',JSON.stringify({filename:'Space.png',bytes:33,referenceListingId:789})),f.context),{id}=await r.json();assert.equal((await f.handler(request('/poster/uploads/'+id+'/finish','POST'),f.context)).status,202);assert.equal((await f.handler(request('/poster/uploads/'+id+'/finish','POST'),f.context)).status,409);await Promise.all(f.pending);assert.equal(f.sent.length,1);assert.equal(f.sent[0][0],origin+'/poster/upload-run');assert.doesNotMatch(f.sent[0][1].body,/owner-password|shared/);});
test('approval requires reviewed hash, configured publication and a single atomic claim',async()=>{const f=fixture(),id='a'.repeat(32),asset={phase:'ready_for_approval',approvalHash:'review-hash'};await f.uploads.setJSON(assetKey(id),asset);const post=hash=>request('/poster/uploads/'+id+'/approve','POST',new URLSearchParams({csrf:'owner-csrf',approvalHash:hash}).toString(),{'Content-Type':'application/x-www-form-urlencoded'});assert.equal((await f.handler(post('wrong'),f.context)).status,409);assert.equal((await f.handler(post('review-hash'),f.context)).status,303);assert.equal((await f.handler(post('review-hash'),f.context)).status,409);await Promise.all(f.pending);assert.equal(f.sent.length,1);assert.equal((await f.uploads.get(assetKey(id))).phase,'publishing');});
test('upload runner ignores forged/expired work and never retries a claimed failing prepare',async()=>{const uploads=memory(),id='b'.repeat(32);await uploads.setJSON(assetKey(id),{phase:'preparing',chunks:1,bytes:33});const runner=createUploadRunner({env,uploads,client:{}});const req=body=>new Request(origin+'/poster/upload-run',{method:'POST',body});await runner(req('forged'));await runner(req(seal({id,action:'prepare',expiry:Date.now()-1},secret,'poster-upload-run')));assert.equal((await uploads.get(assetKey(id))).phase,'preparing');const token=seal({id,action:'prepare',expiry:Date.now()+60000},secret,'poster-upload-run');await runner(req(token));assert.equal((await uploads.get(assetKey(id))).phase,'needs_investigation');await runner(req(token));assert.equal(uploads.map.has('runner/'+id+'/prepare'),true);});

test('authenticated uploader allows same-origin API fetches while retaining restrictive CSP',async()=>{const f=fixture(),r=await f.handler(request('/poster/upload'),f.context);assert.equal(r.status,200);const directives=Object.fromEntries(r.headers.get('Content-Security-Policy').split(';').map(s=>s.trim().split(/\s+/)).filter(a=>a[0]).map(([key,...v])=>[key,v]));assert.deepEqual(directives['connect-src'],["'self'"]);assert.deepEqual(directives['default-src'],["'none'"]);assert.deepEqual(directives['script-src'],["'self'"]);assert.deepEqual(directives['frame-ancestors'],["'none'"]);assert.deepEqual(directives['form-action'],["'self'"]);});

test('Pattern Forge project creates one authoritative server-side product link across browsers',async()=>{
 const f=fixture(),sourceProjectId='pf-project-mgkk1122-abcd123',sourceKey='pattern-links/'+sourceProjectId;
 const input={type:'digital',filename:'sapiver-autumn-leaves-etsy-kit.zip',bytes:4096,sourceProjectId,
   metadata:{kind:'pattern',name:'Autumn Leaves',price:'3.95',useEmbeddedText:true,seamlessConfirmed:true}};
 const send=payload=>f.handler(request('/poster/uploads','POST',JSON.stringify(payload)),f.context);
 const first=await send(input);assert.equal(first.status,201);
 const created=await first.json();assert.equal(created.productId,created.id);
 assert.equal((await f.uploads.get(sourceKey)).productId,created.id);
 // A second browser does not have a local ID: it must not create another product
 // while the first transfer is still uploading.
 const retry=await send(input);assert.equal(retry.status,409);
 assert.match((await retry.json()).error,/active upload/);
 assert.equal((await f.uploads.get(sourceKey)).productId,created.id);
 const fakeOther=await send({...input,updateProductId:'Q'.repeat(32)});
 assert.equal(fakeOther.status,409);
 const original=await f.uploads.get(assetKey(created.id));
 await f.uploads.setJSON(assetKey(created.id),{...original,phase:'ready_for_approval'});
 await recordRevision(f.uploads,created.id);
 const revision=await send(input);assert.equal(revision.status,201);
 const next=await revision.json();assert.notEqual(next.id,created.id);
 assert.equal(next.productId,created.id);
 const nextRecord=await f.uploads.get('products/'+created.id+'/record');
 assert.equal(nextRecord.pendingRevision,next.id);
 assert.equal((await f.uploads.get(sourceKey)).productId,created.id);
});
test('Pattern Forge source identity cannot be malformed or added to physical poster flows',async()=>{
 const f=fixture();
 const bad={filename:'sapiver-leaves-etsy-kit.zip',type:'digital',bytes:4096,
   metadata:{kind:'pattern',price:3.95,useEmbeddedText:true,seamlessConfirmed:true}};
 const send=body=>f.handler(request('/poster/uploads','POST',JSON.stringify(body)),f.context);
 assert.equal((await send({...bad,sourceProjectId:'../../unsafe'})).status,400);
 assert.equal((await send({...bad,type:'physical',filename:'SP-EL-123.PNG',sourceProjectId:'pf-project-mgkk1122-abcd123'})).status,400);
 assert.equal(f.uploads.map.size,0);
});
test('concurrent first transfers reserve only one source link',async()=>{
 const f=fixture(),sourceProjectId='pf-project-mgkk1122-abcd123';
 const body=JSON.stringify({type:'digital',filename:'sapiver-leaves-etsy-kit.zip',bytes:4096,sourceProjectId,
   metadata:{kind:'pattern',price:3.95,useEmbeddedText:true,seamlessConfirmed:true}});
 const [a,b]=await Promise.all([f.handler(request('/poster/uploads','POST',body),f.context),f.handler(request('/poster/uploads','POST',body),f.context)]);
 assert.deepEqual([a.status,b.status].sort(),[201,409]);
 const map=f.uploads.map;
 assert.equal([...map.keys()].filter(k=>k==='pattern-links/'+sourceProjectId).length,1);
 assert.equal([...map.keys()].filter(k=>/^products\/[A-Za-z0-9_-]{32}\/record$/.test(k)).length,1);
});
