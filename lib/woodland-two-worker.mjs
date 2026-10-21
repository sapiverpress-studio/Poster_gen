// Runs only inside the GitHub Actions worker holding Etsy and PrintShrimp credentials.
// The site never receives supplier secrets or attempts to create six Etsy singles.
export async function processWoodlandTwo({id,uploads,client,env,request=fetch,clock=()=>Date.now(),dependencies=null}){
 const key='woodland-request/'+id,entry=await uploads.get(key,{type:'json',consistency:'strong'});
 if(entry?.phase!=='queued'||entry.input?.existingOnly!==true||entry.input?.confirmed!==true)
  throw Error('No confirmed two-bundle setup request');
 await uploads.setJSON(key,{...entry,phase:'verifying',stage:'existing_three_etsy_listings',updatedAt:clock()});
 const {discoverExistingWoodlandEtsy,reserveWoodlandBundlesOnly}=dependencies||await import('./woodland-bundles-only.mjs');
 const listingIds=await discoverExistingWoodlandEtsy({client});
 const reserved=await reserveWoodlandBundlesOnly({
  incoming:{...entry.input,etsyListingIds:listingIds},
  uploads,client,env,request,clock,
  // Prepare both through this SAME authorised worker after one reservation.
  dispatch:async()=>{}
 });
 if(reserved.ids?.length!==2||reserved.skus?.length!==2||reserved.newSingles!==0)
  throw Error('Two distinct bundle records not confirmed');
 await uploads.setJSON(key,{...entry,phase:'preparing',stage:'supplier_only_component_verification',
  ids:reserved.ids,skus:reserved.skus,missingSupplier:reserved.pendingSupplier||[],updatedAt:clock()});
 const {prepareCollectionBundle}=dependencies||await import('./collection-bundle-publication.mjs');
 for(const bundleId of reserved.ids){
  const state=await uploads.get('uploads/'+bundleId+'/state',{type:'json',consistency:'strong'});
  if(state?.phase!=='preparing'||state.bundlesOnly!==true)
   throw Error('Unrecognised or already prepared Woodland bundle');
  await prepareCollectionBundle({id:bundleId,uploads,client,env,request,clock});
 }
 const results=await Promise.all(reserved.ids.map(x=>uploads.get('uploads/'+x+'/state',{type:'json',consistency:'strong'})));
 if(results.some(x=>x?.phase!=='ready_for_approval'||!x.plan||!x.approvalHash))
  throw Error('Both separate bundle reviews not confirmed');
 await uploads.setJSON(key,{phase:'ready_for_review',ids:reserved.ids,skus:reserved.skus,
  missingSupplier:reserved.pendingSupplier||[],updatedAt:clock(),
  notice:'Two three-print bundles ready for review; no individual Etsy listings created.'});
 return {phase:'ready_for_review',ids:reserved.ids};
}
