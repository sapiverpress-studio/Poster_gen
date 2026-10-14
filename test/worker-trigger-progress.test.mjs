import test from 'node:test';
import assert from 'node:assert/strict';
import {githubDispatch,triggerGithubWorker} from '../lib/github-web.mjs';
import {progressSummary} from '../lib/product-progress.mjs';
import {supplierStatusBody} from '../lib/product-web.mjs';
import {renderOwnerPage} from '../lib/owner-page.mjs';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {seal} from '../lib/oauth.mjs';
const id='a'.repeat(32),now=1800000000000;
function memory(){const map=new Map();return {map,get:async k=>map.get(k),setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&map.has(k))return {modified:false};map.set(k,v);return {modified:true};}};}
test('upload is saved and associated before a fixed main-branch worker dispatch; no artwork or secrets in body',async()=>{
 const queue=memory(),uploads=memory();await uploads.setJSON('uploads/'+id+'/state',{phase:'preparing',type:'physical'});
 let count=0;
 const key=await githubDispatch(queue,{env:()=> 'private-test-token',uploads,clock:()=>now,request:async(url,o)=>{
  count++;assert.equal(url,'https://api.github.com/repos/sapiverpress-studio/Poster_gen/actions/workflows/poster-publication.yml/dispatches');
  assert.equal(o.redirect,'error');assert.equal(o.headers.Authorization,'Bearer private-test-token');assert.deepEqual(JSON.parse(o.body),{ref:'main'});
  const a=await uploads.get('uploads/'+id+'/state');assert.equal((await queue.get(a.workerJobKey)).phase,'queued');
  // Emulate a fast worker while dispatch is in flight: completion must never be overwritten.
  await uploads.setJSON('uploads/'+id+'/state',{...a,phase:'ready_for_approval'});return new Response(null,{status:204});
 }})(id,'prepare');
 assert.equal(count,1);assert.equal((await uploads.get('uploads/'+id+'/state')).phase,'ready_for_approval');
 assert.equal((await queue.get('dispatch/'+key.slice(5))).phase,'requested');
 assert.doesNotMatch(JSON.stringify([...queue.map.values()]),/private-test-token/);
});
test('missing, rejected and interrupted dispatches retain queued upload and report safe distinct outcomes',async()=>{
 for(const [token,request,expected] of [[undefined,()=>{throw Error('must not contact GitHub');},'not_configured'],['secret',async()=>new Response('private body',{status:403}),'failed'],['secret',async()=>{throw Error('secret-provider-error');},'uncertain']]){
  const queue=memory(),uploads=memory();await uploads.setJSON('uploads/'+id+'/state',{phase:'preparing'});
  const key=await githubDispatch(queue,{env:()=>token,uploads,request,clock:()=>now})(id,'prepare');
  assert.equal((await queue.get(key)).phase,'queued');assert.equal((await uploads.get('uploads/'+id+'/state')).phase,'preparing');
  assert.deepEqual(await queue.get('dispatch/'+key.slice(5)),{phase:expected,at:now});
 }
});
test('failure to persist queue prevents any dispatch request',async()=>{
 let calls=0;await assert.rejects(githubDispatch({setJSON:async()=>({modified:false})},{env:()=> 'secret',request:async()=>{calls++;}})(id,'prepare'),/Queue unavailable/);assert.equal(calls,0);
});
test('real authenticated finish route starts one run only after saved chunks and reports its queued status',async()=>{
 const queue=memory(),uploads=memory(),origin='https://poster.example.test',secret='owner-fixture-secret-long-enough';
 await uploads.setJSON('uploads/'+id+'/state',{type:'physical',phase:'uploading',bytes:4,chunks:1,productId:id,metadata:{name:'Coast'}});
 await uploads.setJSON('uploads/'+id+'/chunks/0',Buffer.from('test'));
 const env=n=>({CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'fixture-password',ETSY_PRINTS_KEYSTRING:'key',ETSY_PRINTS_SHARED_SECRET:'shared',POSTER_GITHUB_ACTIONS_TOKEN:'dispatch-fixture'}[n]);
 let starts=0;const dispatch=githubDispatch(queue,{env,uploads,clock:()=>now,request:async()=>{starts++;assert.equal((await uploads.get('uploads/'+id+'/state')).phase,'preparing');return new Response(null,{status:204});}});
 const handler=createPosterUploadHandler({env,uploads,queue,dispatchJob:dispatch,clock:()=>now}),cookie='__Host-poster_owner='+seal({csrf:'csrf',expiry:now+600000},secret,'poster-owner');
 const headers={Cookie:cookie,Origin:origin,'X-Poster-CSRF':'csrf'};
 assert.equal((await handler(new Request(origin+'/poster/uploads/'+id+'/finish',{method:'POST'}),{})).status,401);assert.equal(starts,0);
 assert.equal((await handler(new Request(origin+'/poster/uploads/'+id+'/finish',{method:'POST',headers}),{})).status,202);assert.equal(starts,1);
 assert.equal((await handler(new Request(origin+'/poster/uploads/'+id+'/finish',{method:'POST',headers}),{})).status,409);assert.equal(starts,1);
 const response=await handler(new Request(origin+'/poster/uploads/'+id,{headers:{Cookie:cookie}}),{}),status=await response.json();assert.equal(status.progress.waiting,true);assert.match(status.progress.note,/Start requested/);assert.doesNotMatch(JSON.stringify(status),/dispatch-fixture|workerJobKey/);
});
test('untrusted task arguments cannot trigger a workflow',async()=>{
 let calls=0;const dispatch=githubDispatch(memory(),{env:()=> 'secret',request:async()=>{calls++;}});
 await assert.rejects(dispatch('bad','prepare'));await assert.rejects(dispatch(id,'delete'));assert.equal(calls,0);
});
test('status distinguishes queued, active, overdue and ready without fabricated percentages',()=>{
 const asset={phase:'preparing',stage:'creating_previews',queuedAt:now-720000,updatedAt:now-1000};
 const waiting=progressSummary(asset,{phase:'queued'},{phase:'failed'},now);assert.equal(waiting.stage,'queued');assert.match(waiting.note,/could not be started/);assert.equal(waiting.elapsedSeconds,720);
 const active=progressSummary(asset,{phase:'running'},null,now);assert.equal(active.waiting,false);assert.equal(active.label,'Creating listing previews');assert.equal(active.overdue,false);
 assert.equal(progressSummary({...asset,updatedAt:now-720000},{phase:'running'},null,now).overdue,true);
 assert.equal(progressSummary({...asset,phase:'ready_for_approval'},{phase:'complete'},null,now).label,'Ready for your review');assert.equal(progressSummary({...asset,workerRunId:'123'},null,null,now).runUrl,'https://github.com/sapiverpress-studio/Poster_gen/actions/runs/123');assert.equal(progressSummary({...asset,workerRunId:'evil/path'},null,null,now).runUrl,null);
});
test('stage four shows physical SKU and genuine transfer evidence; digital products skip supplier UI',()=>{
 assert.match(supplierStatusBody({type:'physical',plan:{identity:{sku:'coast-print'}}}),/Pending.*SKU: coast-print/s);
 assert.match(supplierStatusBody({type:'physical',supplierProductId:'supplier-1',stage:'supplier_verified'}),/Artwork transfer verified/);
 assert.equal(supplierStatusBody({type:'digital'}),'');
 assert.match(renderOwnerPage({body:'',productType:'physical'}),/PrintShrimp setup/);
 assert.doesNotMatch(renderOwnerPage({body:'',productType:'digital'}),/PrintShrimp setup/);
});
