import {recordRevision,recordKey} from './product-records.mjs';
import {flattenTaxonomy} from './product-metadata.mjs';
import {createEtsyHandler,etsySetup} from './etsy-oauth.mjs';
import {createEtsySession} from './etsy-session.mjs';
export async function runGithubJobs({jobs,queue,uploads,etsyStore,env,request=fetch,prepare,publish,prepareDigital,publishDigital,clock=()=>Date.now()}){
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
    if(job.action==='prepare'){const product=await uploads.get(recordKey(state?.productId||job.id),{type:'json',consistency:'strong'});if(product?.pendingRevision&&product.pendingRevision!==job.id)throw Error('Product review superseded');if(state?.phase!=='preparing')throw Error('Not ready');await (state.type==='digital'?prepareDigital:prepare)({id:job.id,uploads,client});const ready=await uploads.get('uploads/'+job.id+'/state',{type:'json',consistency:'strong'});if(state.type!=='digital')await uploads.setJSON('template/settings',{referenceListingId:ready.referenceListingId});}
    else{
     const approval=await uploads.get('claims/'+job.id+'/publish',{type:'json',consistency:'strong'});
     if(state?.phase!=='publishing'||!Number.isFinite(state.approvedAt)||approval?.approvalHash!==job.approvalHash||state.approvalHash!==job.approvalHash)throw Error('No owner approval');
     await (state.type==='digital'?publishDigital:publish)({id:job.id,approvalHash:job.approvalHash,uploads,etsyStore,client,env,request,clock});
    }
   }
   await queue.setJSON(job.key,{phase:'complete',action:job.action,id:job.id||null,completedAt:clock()});completed++;
  }catch(error){
   // Retain the claim after any ambiguous outcome. Never repeat merchant writes.
   await queue.setJSON(job.key,{phase:'needs_investigation',action:job.action,id:job.id||null,failedAt:clock()});
   if(job.action==='oauth'&& /^oauth-status\/[A-Za-z0-9_-]+$/.test(job.statusKey||''))await etsyStore.setJSON(job.statusKey,{phase:'needs_investigation'});
   if(job.id&& /^[A-Za-z0-9_-]{32}$/.test(job.id)){const state=await uploads.get('uploads/'+job.id+'/state',{type:'json',consistency:'strong'});if(state)await uploads.setJSON('uploads/'+job.id+'/state',{...state,phase:'needs_investigation',failureAction:job.action,failureCode:safeProductFailure(error),failedAt:clock()});const product=await uploads.get(recordKey(state?.productId||job.id),{type:'json',consistency:'strong'});if(!product?.pendingRevision||product.pendingRevision===job.id)await recordRevision(uploads,job.id);}
  }
 }
 try{const taxonomy=await client.api('/seller-taxonomy/nodes');await uploads.setJSON('template/taxonomy',{nodes:flattenTaxonomy(taxonomy.results),updatedAt:clock()});}catch{}
 try{const seller=await client.session(),refs=await client.api('/shops/'+seller.shop_id+'/listings?state=active&limit=100');await uploads.setJSON('template/catalog',{shopId:seller.shop_id,listings:refs.results.filter(l=>l.shop_id===seller.shop_id&&l.listing_type==='physical').map(l=>({listing_id:l.listing_id,shop_id:l.shop_id,listing_type:l.listing_type,title:l.title})),updatedAt:clock()});}catch{/* No seller consent yet; upload UI offers Connect Etsy. */}
 return {completed};
}

function safeProductFailure(error){const text=String(error?.message||'');const known={'Etsy seller connection required':'Connect Etsy before preparing your product.','Invalid Etsy seller connection':'Reconnect the SapiverPrints Etsy account before preparing your product.','Etsy refresh needs investigation or reconnection':'Reconnect Etsy: the saved seller session could not be refreshed.','Etsy request failed':'Etsy could not provide the required product information. Check the seller connection before retrying.','Bridge unavailable':'The worker could not access the private product files. Your upload is retained.'};if(known[text])return known[text];if(text.length<=300&&/^(Seller kit|Digital package needs valid|Use a valid ZIP|ZIP |Unsupported customer file|Unsafe archive|Duplicate archive|Archive |Encrypted or unsupported|Invalid or active PDF|Active PDF|SVG |Active SVG|External SVG|Image content|Package needs|An individual file|Include a PNG|Reserved guide|Review and select|Choose the verified category|Selected marketplace|Physical artwork replacement|Digital file count|Customer file read-back|Digital listing|Existing listing changed|Duplicate existing shop sections|Etsy shop already|Section creation already|This digital SKU)/.test(text))return text;return 'Processing stopped safely. Check the retained Etsy / PrintShrimp IDs before retrying.';}
