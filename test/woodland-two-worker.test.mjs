import test from 'node:test';import assert from 'node:assert/strict';
import {processWoodlandTwo} from '../lib/woodland-two-worker.mjs';
const setup=()=>{
 const id='a'.repeat(32),ids=['b'.repeat(32),'c'.repeat(32)],store=new Map();
 store.set('woodland-request/'+id,{phase:'queued',input:{confirmed:true,existingOnly:true,items:[{},{}]}});
 const uploads={get:async key=>store.get(key)||null,setJSON:async(key,data)=>{store.set(key,data);return {modified:true}}};
 for(const item of ids)store.set('uploads/'+item+'/state',{phase:'preparing',bundlesOnly:true});
 const calls={discover:0,reserve:0,prepare:[]};
 const dependencies={
  discoverExistingWoodlandEtsy:async()=>{calls.discover++;return [1,2,3,0,0,0];},
  reserveWoodlandBundlesOnly:async({incoming})=>{calls.reserve++;assert.deepEqual(incoming.etsyListingIds,[1,2,3,0,0,0]);return {ids,skus:['SKU-TRIO-A','SKU-TRIO-B'],newSingles:0,pendingSupplier:['badger','red-squirrel','roe-deer']};},
  prepareCollectionBundle:async({id})=>{calls.prepare.push(id);store.set('uploads/'+id+'/state',{phase:'ready_for_approval',plan:{quote:{grossGbp:29}},approvalHash:'ok'})}
 };
 return {id,ids,store,uploads,calls,dependencies};
};
test('one authenticated worker request prepares exactly two independent bundle reviews; no individual Etsy tasks',async()=>{
 const x=setup();
 const result=await processWoodlandTwo({id:x.id,uploads:x.uploads,client:{},env:()=>null,dependencies:x.dependencies});
 assert.equal(result.phase,'ready_for_review');
 assert.deepEqual(result.ids,x.ids);
 assert.deepEqual(x.calls.prepare,x.ids);
 assert.equal(x.calls.discover,1);assert.equal(x.calls.reserve,1);
 const status=x.store.get('woodland-request/'+x.id);
 assert.equal(status.phase,'ready_for_review');assert.equal(status.ids.length,2);
 assert.equal(status.missingSupplier.length,3);
});
test('missing second bundle identity blocks all bundle preparation',async()=>{
 const x=setup();x.dependencies.reserveWoodlandBundlesOnly=async()=>({ids:[x.ids[0]],skus:['A'],newSingles:0});
 await assert.rejects(processWoodlandTwo({id:x.id,uploads:x.uploads,dependencies:x.dependencies}),/Two distinct bundle records/);
 assert.equal(x.calls.prepare.length,0);
});
test('interrupted second review retains both reserved bundle IDs for investigation and never declares success',async()=>{
 const x=setup();
 x.dependencies.prepareCollectionBundle=async({id})=>{x.calls.prepare.push(id);if(id===x.ids[1])throw Error('Supplier offline');x.store.set('uploads/'+id+'/state',{phase:'ready_for_approval',plan:{},approvalHash:'ok'});};
 await assert.rejects(processWoodlandTwo({id:x.id,uploads:x.uploads,dependencies:x.dependencies}),/Supplier offline/);
 assert.equal(x.store.get('woodland-request/'+x.id).phase,'preparing');
 assert.deepEqual(x.store.get('woodland-request/'+x.id).ids,x.ids);
});
test('worker cannot run without the saved owner-confirmed two-bundle request',async()=>{
 const x=setup();x.store.get('woodland-request/'+x.id).input.confirmed=false;
 await assert.rejects(processWoodlandTwo({id:x.id,uploads:x.uploads,dependencies:x.dependencies}),/No confirmed/);
 assert.equal(x.calls.discover,0);
});
