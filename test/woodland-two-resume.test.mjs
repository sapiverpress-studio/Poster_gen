import test from 'node:test';import assert from 'node:assert/strict';
import {safelyResumeWoodlandTwo} from '../lib/woodland-two-resume.mjs';
const slugs=['fox','robin','hedgehog','badger','red-squirrel','roe-deer'];
function setup(){
 const id='a'.repeat(32),uploadsMap=new Map(),claims=[];
 const items=slugs.map((slug,i)=>({folder:slug,id:String(i+1).repeat(32),sha256:String(i+1).repeat(64)}));
 uploadsMap.set('woodland-request/'+id,{phase:'needs_investigation',stage:'stopped_safely',
  input:{existingOnly:true,confirmed:true,items},ids:[]});
 uploadsMap.set('woodland-six-20261021/state',{phase:'ready',pages:items.map(x=>({slug:x.folder,sha256:x.sha256}))});
 const uploads={
  get:async key=>uploadsMap.get(key)||null,
  getWithMetadata:async key=>uploadsMap.has(key)?{data:uploadsMap.get(key),etag:'unchanged'}:null,
  setJSON:async(key,value,opts={})=>{if(opts.onlyIfMatch&&opts.onlyIfMatch!=='unchanged')return {modified:false};uploadsMap.set(key,value);return{modified:true}},
  list:async function*(){yield {blobs:[...uploadsMap.keys()].filter(k=>k.startsWith('products/')).map(key=>({key}))}}
 };
 const dispatch=async(x,act)=>claims.push({x,act});
 return {id,items,uploadsMap,uploads,claims,dispatch};
}
test('recovery of worker 403 before any merchant registration reuses original request ID',async()=>{
 const x=setup();
 const result=await safelyResumeWoodlandTwo({id:x.id,uploads:x.uploads,dispatch:x.dispatch});
 assert.equal(result.id,x.id);assert.equal(result.phase,'queued');
 assert.equal(x.uploadsMap.get('woodland-request/'+x.id).phase,'queued');
 assert.deepEqual(x.claims,[{x:x.id,act:'woodland_two_setup'}]);
 assert.equal(x.uploadsMap.size,2);
});
test('existing supplier create claim prevents all retry attempts',async()=>{
 const x=setup();x.uploadsMap.set('supplier-only/SP-WOOD-BADGER-4444444444',{phase:'needs_investigation'});
 await assert.rejects(safelyResumeWoodlandTwo({id:x.id,uploads:x.uploads,dispatch:x.dispatch}),/supplier registration requires investigation/);
 assert.equal(x.claims.length,0);assert.equal(x.uploadsMap.get('woodland-request/'+x.id).phase,'needs_investigation');
});
test('existing bundle reservation prevents retries even if request never copied bundle IDs',async()=>{
 const x=setup(),revision='b'.repeat(32);
 x.uploadsMap.set('products/'+revision+'/record',{productId:revision,type:'physical_bundle',pendingRevision:revision,updatedAt:Date.now()});
 x.uploadsMap.set('uploads/'+revision+'/state',{bundlesOnly:true,memberRefs:[{sha256:x.items[4].sha256}]});
 await assert.rejects(safelyResumeWoodlandTwo({id:x.id,uploads:x.uploads,dispatch:x.dispatch}),/bundle review is already reserved/);
 assert.equal(x.claims.length,0);
});
test('uncertain worker trigger locks the same approved setup, no duplicate dispatch',async()=>{
 const x=setup();
 const result=await safelyResumeWoodlandTwo({id:x.id,uploads:x.uploads,dispatch:async()=>{throw Error('network')}});
 assert.equal(result.phase,'dispatch_uncertain');assert.equal(x.uploadsMap.get('woodland-request/'+x.id).phase,'dispatch_uncertain');
 await assert.rejects(safelyResumeWoodlandTwo({id:x.id,uploads:x.uploads,dispatch:x.dispatch}),/not safe to restart/);
 assert.equal(x.claims.length,0);
});
test('recovery rejects a different source hash before any merchant work',async()=>{
 const x=setup();x.items[3].sha256='f'.repeat(64);
 await assert.rejects(safelyResumeWoodlandTwo({id:x.id,uploads:x.uploads,dispatch:x.dispatch}),/artwork differs/);
 assert.equal(x.claims.length,0);
});
