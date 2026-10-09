import {createEtsyHandler,etsySetup} from './etsy-oauth.mjs';
import {createEtsySession} from './etsy-session.mjs';
export async function runGithubJobs({jobs,queue,uploads,etsyStore,env,request=fetch,prepare,publish,clock=()=>Date.now()}){
 const client=createEtsySession({store:etsyStore,config:etsySetup(env),request,clock});let completed=0;
 for(const job of jobs){
  if(! /^jobs\/[A-Za-z0-9_-]{32}$/.test(job.key)||!['oauth','prepare','publish'].includes(job.action)||job.phase!=='queued')continue;
  const saved=await queue.get(job.key,{type:'json',consistency:'strong'});if(saved?.phase!=='queued'||JSON.stringify(saved)!==JSON.stringify(Object.fromEntries(Object.entries(job).filter(([k])=>k!=='key'))))continue;
  const claim=await queue.setJSON(job.key.replace('jobs/','claims/'),{at:clock()},{onlyIfNew:true});if(claim?.modified!==true)continue;
  await queue.setJSON(job.key,{...saved,phase:'running',startedAt:clock()});
  try{
   if(job.action==='oauth'){
    const url=new URL(job.url);if(url.origin!==env('CANVA_SITE_ORIGIN')||url.pathname!=='/etsy/callback'||! /^oauth-status\/[A-Za-z0-9_-]+$/.test(job.statusKey))throw Error('Invalid OAuth task');
    const r=await createEtsyHandler({env,store:()=>etsyStore,request,clock})(new Request(job.url,{headers:{cookie:job.cookie}}));
    if(r.status!==200)throw Error('OAuth unavailable');await etsyStore.setJSON(job.statusKey,{phase:'complete',at:clock()});
   }else{
    if(! /^[A-Za-z0-9_-]{32}$/.test(job.id))throw Error('Invalid task');
    const state=await uploads.get('uploads/'+job.id+'/state',{type:'json',consistency:'strong'});
    if(job.action==='prepare'){if(state?.phase!=='preparing')throw Error('Not ready');await prepare({id:job.id,uploads,client});const ready=await uploads.get('uploads/'+job.id+'/state',{type:'json',consistency:'strong'});await uploads.setJSON('template/settings',{referenceListingId:ready.referenceListingId});}
    else{
     const approval=await uploads.get('claims/'+job.id+'/publish',{type:'json',consistency:'strong'});
     if(state?.phase!=='publishing'||!Number.isFinite(state.approvedAt)||approval?.approvalHash!==job.approvalHash||state.approvalHash!==job.approvalHash)throw Error('No owner approval');
     await publish({id:job.id,approvalHash:job.approvalHash,uploads,etsyStore,client,env,request,clock});
    }
   }
   await queue.setJSON(job.key,{phase:'complete',action:job.action,id:job.id||null,completedAt:clock()});completed++;
  }catch{
   // Retain the claim after any ambiguous outcome. Never repeat merchant writes.
   await queue.setJSON(job.key,{phase:'needs_investigation',action:job.action,id:job.id||null,failedAt:clock()});
   if(job.action==='oauth'&& /^oauth-status\/[A-Za-z0-9_-]+$/.test(job.statusKey||''))await etsyStore.setJSON(job.statusKey,{phase:'needs_investigation'});
   if(job.id&& /^[A-Za-z0-9_-]{32}$/.test(job.id)){const state=await uploads.get('uploads/'+job.id+'/state',{type:'json',consistency:'strong'});if(state)await uploads.setJSON('uploads/'+job.id+'/state',{...state,phase:'needs_investigation',failedAt:clock()});}
  }
 }
 try{const seller=await client.session(),refs=await client.api('/shops/'+seller.shop_id+'/listings?state=active&limit=100');await uploads.setJSON('template/catalog',{shopId:seller.shop_id,listings:refs.results.filter(l=>l.shop_id===seller.shop_id&&l.listing_type==='physical').map(l=>({listing_id:l.listing_id,shop_id:l.shop_id,listing_type:l.listing_type,title:l.title})),updatedAt:clock()});}catch{/* No seller consent yet; upload UI offers Connect Etsy. */}
 return {completed};
}
