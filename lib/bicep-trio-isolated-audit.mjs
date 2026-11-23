// Owner-authorised, single saved Bicep Heart trio diagnostic.
// Never creates or updates merchant products. The original three single
// listings, artwork, reserved SKU and publish claims are not modified.
export const BICEP_TRIO_ID='smUUJvn3WAOdVkttbMGQTu4OHUVcVNLi';
export const BICEP_TRIO_SKU='SP-TRIO-E35320566565B78FB61FB9B88';

export async function auditOriginalBicepTrio({uploads,diagnose,clock=()=>Date.now()}){
 const id=BICEP_TRIO_ID,key='uploads/'+id+'/state';
 const saved=await uploads.get(key,{type:'json',consistency:'strong'});
 if(saved?.type!=='physical_bundle'||saved.phase!=='needs_investigation'||
    saved.failureAction!=='prepare'||saved.sku!==BICEP_TRIO_SKU||
    saved.listingId||saved.supplierProductId||saved.approvalHash||
    !Array.isArray(saved.memberIds)||saved.memberIds.length!==3||
    new Set(saved.memberIds).size!==3)
  return {phase:'blocked',stage:'saved_trio',reason:'saved_trio_identity_changed'};
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
