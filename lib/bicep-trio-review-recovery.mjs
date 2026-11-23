// One exact, owner-requested recovery of the existing Bicep Heart trio
// after the correct "Print Only OR framed" description validator is deployed.
// This prepares a review only. It must never call merchant write endpoints,
// create a second SKU, unlock publication claims, or approve Etsy publication.
import {deriveTrioSku} from './collection-bundle-sku.mjs';
import {BICEP_TRIO_ID} from './bicep-trio-isolated-audit.mjs';

const blocked=(stage,reason)=>({phase:'blocked',stage,reason});
export async function prepareExistingBicepTrioReview({uploads,diagnose,prepare,clock=()=>Date.now()}){
 const id=BICEP_TRIO_ID,key='uploads/'+id+'/state';
 const asset=await uploads.get(key,{type:'json',consistency:'strong'});
 const audit=await uploads.get('trio-prepare-audit/'+id,{type:'json',consistency:'strong'});
 if(asset?.type!=='physical_bundle'||asset.phase!=='needs_investigation'||
    asset.failureAction!=='prepare'||asset.trio?.framed!==true||
    asset.listingId||asset.supplierProductId||asset.approvalHash||asset.plan||
    !Array.isArray(asset.memberIds)||asset.memberIds.length!==3||
    new Set(asset.memberIds).size!==3||!Array.isArray(asset.memberRefs)||
    asset.memberRefs.length!==3||!asset.memberRefs.every((ref,i)=>ref.id===asset.memberIds[i]))
  return blocked('saved_trio','original_trio_record_changed');
 if(audit?.id!==id||audit.phase!=='blocked'||
    audit.stage!=='etsy_trio_section_and_profiles'||
    audit.reason!=='framed_description_conflict'||
    audit.source!=='isolated_read_only_recovery')
  return blocked('saved_diagnostic','not_the_verified_framed_description_failure');
 let derived;
 try{derived=deriveTrioSku({members:asset.memberRefs,size:asset.trio.size});}
 catch{return blocked('saved_trio','original_component_identity_invalid');}
 if(derived!==asset.sku)return blocked('saved_trio','original_trio_sku_mismatch');
 const report=await diagnose({id});
 if(report?.phase!=='ready')return blocked(report?.stage||'read_only_preflight',report?.reason||'preflight_incomplete');
 const still=await uploads.get(key,{type:'json',consistency:'strong'});
 if(still?.phase!==asset.phase||still?.sku!==asset.sku||
    JSON.stringify(still.memberRefs)!==JSON.stringify(asset.memberRefs)||
    still.listingId||still.supplierProductId||still.approvalHash)
  return blocked('saved_trio','saved_trio_changed_during_preflight');
 await uploads.setJSON(key,{...still,phase:'preparing',stage:'recovering_existing_review',
  updatedAt:clock()});
 try{
  await prepare({id});
  const reviewed=await uploads.get(key,{type:'json',consistency:'strong'});
  if(reviewed?.phase!=='ready_for_approval'||reviewed.sku!==asset.sku||
     !reviewed.plan||!reviewed.approvalHash||reviewed.listingId||reviewed.supplierProductId)
   throw Error('Saved review not confirmed');
  return {phase:'ready_for_approval',stage:'saved_review_prepared',reason:'original_trio_review_ready'};
 }catch{
  const current=await uploads.get(key,{type:'json',consistency:'strong'});
  if(current?.phase==='preparing'&&current.sku===asset.sku)
   await uploads.setJSON(key,{...current,phase:'needs_investigation',
    failureAction:'prepare',failureCode:'Trio review preparation did not complete. Original SKU and artwork retained.',
    updatedAt:clock()});
  return blocked('saving_review','original_trio_review_not_verified');
 }
}
