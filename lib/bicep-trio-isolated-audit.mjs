import {deriveTrioSku} from './collection-bundle-sku.mjs';
// Owner-authorised, single saved Bicep Heart trio diagnostic.
// Never creates or updates merchant products. The original three single
// listings, artwork, reserved SKU and publish claims are not modified.
export const BICEP_TRIO_ID='smUUJvn3WAOdVkttbMGQTu4OHUVcVNLi';
// The SKU must be derived from the exact three preserved component identities,
// not a copied literal that could be wrong for this saved collection.

export async function auditOriginalBicepTrio({uploads,diagnose,clock=()=>Date.now()}){
 const id=BICEP_TRIO_ID,key='uploads/'+id+'/state';
 const saved=await uploads.get(key,{type:'json',consistency:'strong'});
 if(saved?.type!=='physical_bundle'||saved.phase!=='needs_investigation'||
    saved.failureAction!=='prepare'||
    saved.listingId||saved.supplierProductId||saved.approvalHash||
    !Array.isArray(saved.memberIds)||saved.memberIds.length!==3||
    new Set(saved.memberIds).size!==3)
  return {phase:'blocked',stage:'saved_trio',reason:'saved_trio_identity_changed'};
 let derived;
 try{
  if(!Array.isArray(saved.memberRefs)||saved.memberRefs.length!==3||!saved.trio?.size)
   return {phase:'blocked',stage:'saved_trio',reason:'saved_trio_member_refs_missing'};
  derived=deriveTrioSku({members:saved.memberRefs.map(x=>({sku:x.sku,sha256:x.sha256})),
   size:saved.trio.size});
 }catch{return {phase:'blocked',stage:'saved_trio',reason:'saved_trio_components_invalid'};}
 if(saved.sku!==derived)
  return {phase:'blocked',stage:'saved_trio',reason:'saved_trio_sku_derivation_mismatch'};
 const prior=await uploads.get('trio-prepare-audit/'+id,{type:'json',consistency:'strong'});
 if(prior?.id!==id||prior.phase!=='queued')
  return {phase:'blocked',stage:'diagnostic_record',reason:'diagnostic_state_changed'};
 const result=await diagnose({id});
 if(!['ready','blocked'].includes(result?.phase)||typeof result?.reason!=='string'||
    typeof result?.stage!=='string')throw Error('Invalid read-only diagnostic result');
 const latest=await uploads.get(key,{type:'json',consistency:'strong'});
 if(latest?.sku!==saved.sku||latest?.type!==saved.type||latest?.phase!==saved.phase||
    latest?.listingId||latest?.supplierProductId||
    JSON.stringify(latest.memberIds)!==JSON.stringify(saved.memberIds))
  return {phase:'blocked',stage:'saved_trio',reason:'saved_trio_changed_during_diagnostic'};
 const report={id,phase:result.phase,stage:result.stage,reason:result.reason,checkedAt:clock(),
  source:'isolated_read_only_recovery'};
 await uploads.setJSON('trio-prepare-audit/'+id,report);
 return report;
}
