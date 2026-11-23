import test from 'node:test';
import assert from 'node:assert/strict';
import {auditOriginalBicepTrio,BICEP_TRIO_ID} from '../lib/bicep-trio-isolated-audit.mjs';
import {deriveTrioSku} from '../lib/collection-bundle-sku.mjs';

function fixture(){
 const map=new Map(),writes=[],reads=[];
 const store={
  async get(k){reads.push(k);return map.get(k)||null;},
  async setJSON(k,value){writes.push(k);map.set(k,value);return {modified:true};}
 };
 const memberIds=['A','B','C'].map(x=>x.repeat(32));
 const memberRefs=['a','b','c'].map((x,i)=>({id:memberIds[i],sku:'SP-SINGLE-'+x.toUpperCase(),sha256:x.repeat(64),listingId:100+i}));
 const trio={type:'physical_bundle',phase:'needs_investigation',failureAction:'prepare',
  sku:deriveTrioSku({members:memberRefs,size:'A4'}),trio:{size:'A4'},
  memberIds,memberRefs,listingId:null,supplierProductId:null,approvalHash:null};
 map.set('uploads/'+BICEP_TRIO_ID+'/state',trio);
 map.set('trio-prepare-audit/'+BICEP_TRIO_ID,{id:BICEP_TRIO_ID,phase:'queued',queuedAt:12345,redriveCount:1});
 return {store,map,writes,reads,trio};
}
test('isolated Bicep diagnostic changes only the report, never trio state or SKU',async()=>{
 const f=fixture(),before=structuredClone(f.trio);let calls=0;
 const r=await auditOriginalBicepTrio({uploads:f.store,clock:()=>2000,diagnose:async({id})=>{
  calls++;assert.equal(id,BICEP_TRIO_ID);
  return {phase:'blocked',stage:'member_etsy_inventory_and_price',reason:'source_member_unavailable'};
 }});
 assert.equal(calls,1);assert.equal(r.phase,'blocked');
 assert.deepEqual(f.writes,['trio-prepare-audit/'+BICEP_TRIO_ID]);
 assert.deepEqual(f.map.get('uploads/'+BICEP_TRIO_ID+'/state'),before);
 assert.equal(f.map.get('trio-prepare-audit/'+BICEP_TRIO_ID).reason,'source_member_unavailable');
});
test('isolated diagnostic refuses missing, replaced, approved or published trio identity',async()=>{
 for(const mutation of [
  a=>a.phase='publishing',a=>a.type='physical',
  a=>a.listingId=123,a=>a.supplierProductId='existing',a=>a.approvalHash='hash',
  a=>a.memberIds=['A'.repeat(32)],a=>a.failureAction='publish'
 ]){
  const f=fixture();mutation(f.trio);let calls=0;
  const r=await auditOriginalBicepTrio({uploads:f.store,diagnose:async()=>{calls++;throw Error('Should not inspect');}});
  assert.equal(r.reason,'saved_trio_identity_changed');assert.equal(calls,0);assert.deepEqual(f.writes,[]);
 }
});
test('isolated diagnostic refuses a completed or altered diagnostic record',async()=>{
 for(const phase of ['blocked','ready','complete']){
  const f=fixture();f.map.get('trio-prepare-audit/'+BICEP_TRIO_ID).phase=phase;
  const r=await auditOriginalBicepTrio({uploads:f.store,diagnose:async()=>{throw Error('Should not run');}});
  assert.equal(r.reason,'diagnostic_state_changed');assert.deepEqual(f.writes,[]);
 }
});
test('isolated audit never reports success when original trio changed while reading',async()=>{
 const f=fixture();
 const r=await auditOriginalBicepTrio({uploads:f.store,diagnose:async()=>{
  f.map.set('uploads/'+BICEP_TRIO_ID+'/state',{...f.trio,listingId:10001});
  return {phase:'ready',stage:'complete',reason:'checks_passed'};
 }});
 assert.equal(r.reason,'saved_trio_changed_during_diagnostic');
 assert.deepEqual(f.writes,[]);
});

test('derived SKU mismatch is refused without touching the saved trio or merchant data',async()=>{
 const f=fixture();f.trio.sku='SP-TRIO-WRONG';
 let calls=0;
 const r=await auditOriginalBicepTrio({uploads:f.store,diagnose:async()=>{calls++;}});
 assert.equal(r.reason,'saved_trio_sku_derivation_mismatch');
 assert.equal(calls,0);assert.deepEqual(f.writes,[]);
});

test('repaired bridge may replace only its exact failed read-only audit report',async()=>{
 const f=fixture(),prior=f.map.get('trio-prepare-audit/'+BICEP_TRIO_ID);
 Object.assign(prior,{phase:'blocked',stage:'member_etsy_inventory_and_price',
  reason:'provider_readback_failure_unclassified',source:'isolated_read_only_recovery'});
 const original=structuredClone(f.trio);
 let calls=0;
 const response=await auditOriginalBicepTrio({uploads:f.store,diagnose:async()=>{
  calls++;return {phase:'blocked',stage:'supplier_member_artwork',reason:'supplier_artwork_unavailable'};
 }});
 assert.equal(calls,1);
 assert.equal(response.stage,'supplier_member_artwork');
 assert.deepEqual(f.writes,['trio-prepare-audit/'+BICEP_TRIO_ID]);
 assert.deepEqual(f.map.get('uploads/'+BICEP_TRIO_ID+'/state'),original);
});
test('unrelated old failures never unlock isolated trio reinspection',async()=>{
 for(const change of [
  p=>p.source='other',
  p=>p.reason='unknown',
  p=>p.stage='publishing_etsy',
  p=>p.phase='ready'
 ]){
  const f=fixture(),prior=f.map.get('trio-prepare-audit/'+BICEP_TRIO_ID);
  Object.assign(prior,{phase:'blocked',stage:'member_etsy_inventory_and_price',
   reason:'provider_readback_failure_unclassified',source:'isolated_read_only_recovery'});
  change(prior);let calls=0;
  const answer=await auditOriginalBicepTrio({uploads:f.store,diagnose:async()=>{calls++;return {phase:'ready',stage:'complete',reason:'ready'};}});
  assert.equal(answer.reason,'diagnostic_state_changed');
  assert.equal(calls,0);assert.deepEqual(f.writes,[]);
 }
});
