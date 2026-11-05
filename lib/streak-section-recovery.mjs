// One-off recovery of the 2026-11-03 Streak section request.
// The approved GitHub job 41682084491 failed on a denied storage-bridge
// key BEFORE reaching the Etsy seller API operation. Do not replay generic
// merchant tasks or clear any existing queue claims to recover it.
import {createHash} from 'node:crypto';
import {createStreakSectionThroughEtsyApi,createTrioCollectionSectionThroughEtsyApi} from './streak-section-api.mjs';

const ORIGINAL_RUN='41682084491';
const ORIGINAL_ATTEMPT='2';
const STATUS_KEY='streak-section/status';
const FIRST_REQUEST_START=Date.parse('2026-11-03T17:12:00Z');
const FIRST_REQUEST_END=Date.parse('2026-11-03T17:15:00Z');
const ID=/^[A-Za-z0-9_-]{32}$/;

export async function recoverOriginalStreakSection({runId,attempt,uploads,etsyStore,client,clock=()=>Date.now()}){
 if(String(runId)!==ORIGINAL_RUN||String(attempt)!==ORIGINAL_ATTEMPT)throw Error('Streak recovery is restricted to the original failed GitHub job and its second attempt');
 if(!uploads?.get||!uploads?.setJSON||!etsyStore?.setJSON||!client?.api)throw Error('Authenticated private recovery dependencies required');
 const prior=await uploads.get(STATUS_KEY,{type:'json',consistency:'strong'});
 if(prior?.phase==='verified'&&prior.title==='Streak'&&Number.isSafeInteger(prior.sectionId)&&prior.sectionId>0)return {...prior,reusedVerified:true};
 if(prior?.phase!=='queued'||prior.title!=='Streak'||!ID.test(prior.id||'')||
   !Number.isFinite(prior.checkedAt)||prior.checkedAt<FIRST_REQUEST_START||prior.checkedAt>FIRST_REQUEST_END)
  throw Error('Original owner-confirmed Streak request not found; recovery refused');
 // This independent, single-use lock prevents a second worker attempt from
 // replaying an ambiguous Etsy POST. Existing ensureSection() also claims the
 // actual shop-section title before posting it.
 const claimKey='sections/'+createHash('sha256').update('recover-original-streak-section:'+ORIGINAL_RUN).digest('hex');
 const claim=await etsyStore.setJSON(claimKey,{phase:'reconciling',originalRequestId:prior.id,runId:ORIGINAL_RUN,at:clock()},{onlyIfNew:true});
 if(claim?.modified!==true)throw Error('Original Streak recovery was already claimed; inspect Etsy readback before any further action');
 try{
  const result=await createStreakSectionThroughEtsyApi({client,uploads,etsyStore,clock});
  const final={...result,id:prior.id,recoveryRunId:ORIGINAL_RUN,recoveredAt:clock()};
  await uploads.setJSON(STATUS_KEY,final);
  return final;
 }catch(error){
  try{await uploads.setJSON(STATUS_KEY,{phase:'needs_investigation',id:prior.id,title:'Streak',checkedAt:clock(),notice:'Original Streak seller API request needs manual inspection; do not resubmit.'});}catch{}
  throw error;
 }
}


// Isolated, single-use recovery of the owner-approved Trio Collection
// section request on 2026-11-05. Original worker run 41998001142 exited
// before the Etsy API because trio-section/status was denied by the bridge.
// Never replay ordinary queued merchant work or remove existing claims.
export async function recoverOriginalTrioSection({runId,attempt,uploads,etsyStore,client,clock=()=>Date.now()}){
 const ORIGINAL='41998001142',KEY='trio-section/status';
 if(String(runId)!==ORIGINAL||String(attempt)!=='2')
  throw Error('Trio section recovery is restricted to the original failed run, attempt two');
 if(!uploads?.get||!uploads?.setJSON||!etsyStore?.setJSON||!client?.api)
  throw Error('Authenticated private Etsy section recovery required');
 const prior=await uploads.get(KEY,{type:'json',consistency:'strong'});
 if(prior?.phase==='verified'&&prior.title==='Trio Collection'&&Number.isSafeInteger(prior.sectionId)&&prior.sectionId>0)
  return {...prior,reusedVerified:true};
 const withinWindow=Number.isFinite(prior?.checkedAt)&&
  prior.checkedAt>=Date.parse('2026-11-05T08:53:30Z')&&
  prior.checkedAt<=Date.parse('2026-11-05T08:54:05Z');
 if(prior?.phase!=='queued'||prior.title!=='Trio Collection'||!ID.test(prior.id||'')||!withinWindow)
  throw Error('Original owner-approved Trio Collection request is not safely recoverable');
 const key='sections/'+createHash('sha256').update('recover-original-trio-section:'+ORIGINAL).digest('hex');
 const claim=await etsyStore.setJSON(key,{phase:'reconciling',originalRequestId:prior.id,runId:ORIGINAL,at:clock()},{onlyIfNew:true});
 if(claim?.modified!==true)throw Error('Original trio recovery already claimed; inspect Etsy section');
 try{
  const verified=await createTrioCollectionSectionThroughEtsyApi({client,uploads,etsyStore,clock});
  const result={...verified,id:prior.id,recoveryRunId:ORIGINAL,recoveredAt:clock()};
  await uploads.setJSON(KEY,result);
  return result;
 }catch(error){
  try{await uploads.setJSON(KEY,{phase:'needs_investigation',id:prior.id,title:'Trio Collection',checkedAt:clock(),notice:'Trio Collection Etsy section outcome requires manual readback; do not retry.'});}catch{}
  throw error;
 }
}
