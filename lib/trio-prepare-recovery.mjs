// Owner-triggered second preparation of the SAME saved trio.
// Preparation reads Etsy and PrintShrimp but does not create either merchant resource.
// A one-use private claim prevents two workers from preparing the same failed review.
import {assetKey} from './uploaded-poster.mjs';
import {recordKey,recordRevision,validId} from './product-records.mjs';

const fail=message=>{throw Error(message);};
export function trioPreparationRetryEligible(asset){
 return asset?.type==='physical_bundle'&&asset.phase==='needs_investigation'&&
  asset.failureAction==='prepare'&&!asset.listingId&&!asset.supplierProductId&&
  !asset.plan&&!asset.approvalHash&&/^[A-Za-z0-9_-]{1,100}$/.test(asset.sku||'')&&
  Array.isArray(asset.memberIds)&&asset.memberIds.length===3&&
  new Set(asset.memberIds).size===3&&asset.memberIds.every(validId)&&
  Array.isArray(asset.memberRefs)&&asset.memberRefs.length===3;
}
export async function retryFailedTrioPreparation({id,uploads,dispatch,clock=()=>Date.now()}){
 if(!validId(id))fail('Invalid trio record');
 const key=assetKey(id),asset=await uploads.get(key,{type:'json',consistency:'strong'});
 if(!trioPreparationRetryEligible(asset))
  fail('This trio is not eligible for preparation-only recovery. Check its retained Etsy and supplier records.');
 const current=await uploads.get(recordKey(asset.productId||id),{type:'json',consistency:'strong'});
 if(current?.pendingRevision&&current.pendingRevision!==id)
  fail('A newer trio review exists; open that review instead.');
 if(await uploads.get('claims/'+id+'/publish',{type:'json',consistency:'strong'})||
    await uploads.get('supplier-bundles/'+asset.sku,{type:'json',consistency:'strong'}))
  fail('A supplier or Etsy publication reservation exists. Inspect it without retrying.');
 for(let n=0;n<3;n++){
  const member=await uploads.get(assetKey(asset.memberIds[n]),{type:'json',consistency:'strong'});
  const ref=asset.memberRefs[n];
  if(!member||member.phase!=='published'||!member.listingId||!member.supplierProductId||
     member.plan?.identity?.sku!==ref?.sku||member.image?.sha256!==ref?.sha256||
     member.listingId!==ref?.listingId||ref?.id!==asset.memberIds[n])
   fail('An individual poster changed or is not supplier-verified. No trio retry was queued.');
 }
 const lock=await uploads.setJSON('claims/'+id+'/trio-preparation-retry-once',
  {id,sku:asset.sku,at:clock()},{onlyIfNew:true});
 if(lock?.modified!==true)
  fail('A preparation retry was already requested. Do not start another.');
 await uploads.setJSON(key,{...asset,phase:'preparing',stage:'queued',
  failureAction:null,failureCode:null,failedAt:null,updatedAt:clock()});
 await recordRevision(uploads,id);
 // A failed dispatch is ambiguous once sent: retain the one-use lock and
 // inspect the saved worker receipt. Never launch a second independent trio.
 await dispatch(id,'prepare');
 return {id,phase:'preparing',sku:asset.sku};
}
