import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareExistingBicepTrioReview} from '../lib/bicep-trio-review-recovery.mjs';
import {BICEP_TRIO_ID} from '../lib/bicep-trio-isolated-audit.mjs';
import {deriveTrioSku} from '../lib/collection-bundle-sku.mjs';

function fixture(){
 const values=new Map(),writes=[];
 const uploads={get:async k=>values.get(k)||null,setJSON:async(k,v)=>{writes.push(k);values.set(k,v);return {modified:true};}};
 const ids=['A','B','C'].map(x=>x.repeat(32));
 const refs=['a','b','c'].map((hex,i)=>({id:ids[i],sku:'SP-POSTER-'+i,sha256:hex.repeat(64),listingId:100+i}));
 const sku=deriveTrioSku({members:refs,size:'A4'});
 const asset={type:'physical_bundle',phase:'needs_investigation',failureAction:'prepare',
  sku,trio:{framed:true,size:'A4',description:'Three original bicep heart posters with print-only and framed finish choices'},
  memberIds:ids,memberRefs:refs,listingId:null,supplierProductId:null,approvalHash:null};
 values.set('uploads/'+BICEP_TRIO_ID+'/state',asset);
 values.set('trio-prepare-audit/'+BICEP_TRIO_ID,{id:BICEP_TRIO_ID,phase:'blocked',
  stage:'etsy_trio_section_and_profiles',reason:'framed_description_conflict',source:'isolated_read_only_recovery'});
 return {uploads,values,writes,asset};
}
test('exact saved bicep trio becomes review-ready with same SKU and no merchant action',async()=>{
 const f=fixture(),before=structuredClone(f.asset),calls=[];
 const outcome=await prepareExistingBicepTrioReview({uploads:f.uploads,clock:()=>123,
  diagnose:async({id})=>{calls.push('diagnose');assert.equal(id,BICEP_TRIO_ID);return {phase:'ready',stage:'complete',reason:'all_read_only_trio_preparation_checks_passed'};},
  prepare:async({id})=>{
   calls.push('prepare');assert.equal(id,BICEP_TRIO_ID);
   const preparing=await f.uploads.get('uploads/'+id+'/state');
   assert.equal(preparing.phase,'preparing');assert.equal(preparing.sku,before.sku);
   await f.uploads.setJSON('uploads/'+id+'/state',{...preparing,phase:'ready_for_approval',plan:{version:2},approvalHash:'review-hash'});
  }
 });
 assert.equal(outcome.phase,'ready_for_approval');
 assert.deepEqual(calls,['diagnose','prepare']);
 assert.equal(f.values.get('uploads/'+BICEP_TRIO_ID+'/state').sku,before.sku);
 assert.deepEqual(f.values.get('uploads/'+BICEP_TRIO_ID+'/state').memberRefs,before.memberRefs);
 assert.deepEqual(f.writes,['uploads/'+BICEP_TRIO_ID+'/state','uploads/'+BICEP_TRIO_ID+'/state']);
});
test('unverified source or non-merchant diagnosis refuses recovery before any write',async()=>{
 for(const change of [f=>{f.asset.sku='SP-CHANGED';},f=>{f.asset.listingId=500;},
  f=>{f.asset.phase='published';},f=>{f.asset.trio.framed=false;},
  f=>{f.values.get('trio-prepare-audit/'+BICEP_TRIO_ID).reason='another_reason';}]){
  const f=fixture();change(f);let seen=0;
  const outcome=await prepareExistingBicepTrioReview({uploads:f.uploads,
   diagnose:async()=>{seen++;throw Error('unexpected');},
   prepare:async()=>{throw Error('unexpected');}});
  assert.equal(outcome.phase,'blocked');assert.equal(seen,0);assert.deepEqual(f.writes,[]);
 }
 const f=fixture(),outcome=await prepareExistingBicepTrioReview({uploads:f.uploads,
  diagnose:async()=>({phase:'blocked',stage:'source',reason:'unavailable'}),
  prepare:async()=>{throw Error('must not prepare');}});
 assert.equal(outcome.reason,'unavailable');assert.deepEqual(f.writes,[]);
});
test('failed review generation restores investigation state and keeps same original SKU',async()=>{
 const f=fixture(),before=structuredClone(f.asset);
 const outcome=await prepareExistingBicepTrioReview({uploads:f.uploads,
  diagnose:async()=>({phase:'ready',stage:'complete',reason:'verified'}),
  prepare:async()=>{throw Error('unexpected private provider details');}});
 assert.equal(outcome.reason,'original_trio_review_not_verified');
 const result=await f.uploads.get('uploads/'+BICEP_TRIO_ID+'/state');
 assert.equal(result.phase,'needs_investigation');assert.equal(result.sku,before.sku);
 assert.deepEqual(result.memberRefs,before.memberRefs);
 assert.doesNotMatch(JSON.stringify(result),/unexpected private provider details/);
});
