// The ONE owner-approved batch for existing Etsy trio bundles.
// Preflight every eligible trio before the first Etsy write. No creation,
// supplier changes, new listing IDs or automatic retries.
import {listProducts} from './product-records.mjs';
import {assetKey} from './uploaded-poster.mjs';
import {prepareExistingTrioFrames,verifyExistingTrioFramePlan,applyExistingTrioFrames} from './collection-bundle-publication.mjs';
export const EXISTING_TRIO_BATCH_KEY='trio-frame-batch/20261104';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{32}$/.test(id);
const fail=s=>{throw Error(s);};
export async function runExistingTrioBatch({uploads,client,env,request=fetch,clock=()=>Date.now(),jobId}){
 if(!validId(jobId))fail('Invalid existing trio batch task ID');
 const batch=await uploads.get(EXISTING_TRIO_BATCH_KEY,{type:'json',consistency:'strong'});
 if(batch?.phase!=='queued'||batch?.jobId!==jobId||batch.confirmed!==true)
  fail('No matching authenticated owner batch authorisation');
 const records=(await listProducts(uploads)).filter(x=>x.type==='physical_bundle'&&Number.isSafeInteger(x.etsyListingId)&&x.etsyListingId>0);
 const candidates=[];
 for(const row of records){
  const id=row.currentRevision||row.pendingRevision;
  if(!validId(id))fail('Saved trio product has invalid revision; do not upgrade');
  const a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
  if(!a||a.type!=='physical_bundle'||a.productId!==row.productId||a.listingId!==row.etsyListingId)
   fail('A saved Etsy trio record differs from its approved publication revision');
  if(!['published','draft_verified'].includes(a.phase))fail('Existing trio '+a.listingId+' requires investigation before changes');
  candidates.push({id,listingId:a.listingId,sku:a.sku});
 }
 if(!candidates.length||candidates.length>8||new Set(candidates.map(x=>x.listingId)).size!==candidates.length||
    new Set(candidates.map(x=>x.sku)).size!==candidates.length)
  fail('Expected distinct saved Etsy trio listings; no merchant changes');
 await uploads.setJSON(EXISTING_TRIO_BATCH_KEY,{...batch,phase:'auditing',count:candidates.length,
  listings:candidates.map(x=>x.listingId),startedAt:clock(),results:[]});
 const ready=[],completed=[];
 for(const candidate of candidates){
  const key='trio-frames/'+candidate.id;
  const previous=await uploads.get(key,{type:'json',consistency:'strong'});
  if(previous?.phase==='complete'){completed.push({listingId:candidate.listingId,phase:'already_updated'});continue;}
  if(previous&&!['ready'].includes(previous.phase))
   fail('Existing trio '+candidate.listingId+' has a pending or uncertain frame update. No merchant writes started.');
  if(!previous)await prepareExistingTrioFrames({id:candidate.id,uploads,client,env,request,clock});
  await verifyExistingTrioFramePlan({id:candidate.id,uploads,client,env,request});
  ready.push(candidate);
 }
 // All applicable Etsy listings, supplier bundles and new prices checked;
 // any failure above prevented *all* Etsy PUT/PATCH requests.
 await uploads.setJSON(EXISTING_TRIO_BATCH_KEY,{...batch,phase:'applying',
  count:candidates.length,listings:candidates.map(x=>x.listingId),
  results:completed,approvedAt:clock()});
 for(const candidate of ready){
  const key='trio-frames/'+candidate.id;
  const saved=await uploads.get(key,{type:'json',consistency:'strong'});
  if(saved?.phase!=='ready'||saved.listingId!==candidate.listingId)
   fail('Price approval changed; no further existing listings will be modified');
  await uploads.setJSON(key,{...saved,phase:'applying',approvedAt:clock(),
   approvalMode:'one_owner_batch',batchId:jobId});
  const result=await applyExistingTrioFrames({id:candidate.id,uploads,client,env,request,clock});
  completed.push({listingId:result.listingId,phase:'complete',frameOptions:result.frameOptions});
  await uploads.setJSON(EXISTING_TRIO_BATCH_KEY,{...batch,phase:'applying',
   count:candidates.length,listings:candidates.map(x=>x.listingId),results:completed,updatedAt:clock()});
 }
 const result={...batch,phase:'complete',count:candidates.length,
  listings:candidates.map(x=>x.listingId),results:completed,verifiedAt:clock()};
 await uploads.setJSON(EXISTING_TRIO_BATCH_KEY,result);
 return {phase:'complete',count:result.count,results:completed};
}
