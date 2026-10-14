import {workerFailure} from './worker-diagnostics.mjs';
import {recordRevision,recordKey} from './product-records.mjs';
import {flattenTaxonomy} from './product-metadata.mjs';
import {etsySetup,ETSY_SCOPES} from './etsy-oauth.mjs';
import {seal,unseal} from './oauth.mjs';
import {createEtsySession} from './etsy-session.mjs';
import {verifiedSapiverPrintsShop} from './etsy-shop-response.mjs';
export async function runGithubJobs({jobs,queue,uploads,etsyStore,env,request=fetch,prepare,publish,prepareDigital,publishDigital,clock=()=>Date.now(),runId}){
 const client=createEtsySession({store:etsyStore,config:etsySetup(env),request,clock});let completed=0,skipped=0;const failures=[];let catalogueChecked=false,cataloguePhase='not_checked',catalogueCount=null;
 async function refreshCatalogue(){
  try{
   const seller=await client.session(),listings=[];
   // The established Sapiver Etsy uploader uses Etsy's /listings/active route.
   // Page through active inventory rather than losing references after page 1.
   for(const state of ['active','draft','inactive'])for(let offset=0;offset<1000;offset+=100){
    const path=state==='active'?'/shops/'+seller.shop_id+'/listings/active':'/shops/'+seller.shop_id+'/listings';
    const refs=await client.api(path+'?'+new URLSearchParams({...(state==='active'?{}:{state}),limit:'100',offset:String(offset)}));
    if(!Array.isArray(refs?.results)||refs.results.length>100)throw Error('Etsy catalogue response invalid');
    for(const l of refs.results){
     if(l.shop_id===seller.shop_id&&l.state===state&&(l.listing_type==='physical'||l.type==='physical')&&Number.isSafeInteger(l.listing_id)&&l.listing_id>0){
      if(listings.some(entry=>entry.listing_id===l.listing_id))throw Error('Etsy catalogue duplicate listing ID');
      listings.push({listing_id:l.listing_id,shop_id:l.shop_id,listing_type:'physical',state,title:(state==='active'?'':state==='draft'?'[Draft] ':'[Inactive] ')+l.title});
     }
    }
    if(refs.results.length<100)break;
    if(offset===900)throw Error('Etsy catalogue pagination exceeds safe limit');
   }
   await uploads.setJSON('template/catalog',{shopId:seller.shop_id,listings,updatedAt:clock()});
   catalogueCount=listings.length;cataloguePhase=listings.length?'available':'empty';
  }catch(error){
   const message=String(error?.message||'');
   cataloguePhase=message==='Etsy seller connection required'?'seller_consent_required':
    message==='Invalid Etsy seller connection'?'seller_consent_invalid':
    message.includes('refresh')?'seller_refresh_error':'etsy_api_unavailable';
  }
  // No job is marked complete before the safely classified result is saved.
  await uploads.setJSON('template/catalog-status',{phase:cataloguePhase,...(catalogueCount===null?{}:{count:catalogueCount}),checkedAt:clock()});
  catalogueChecked=true;
 }


 async function verifyPendingSeller(job){
  if(! /^oauth-status\/[A-Za-z0-9_-]+$/.test(job.statusKey||'')||job.pendingKey!=='oauth-pending/'+job.statusKey.slice('oauth-status/'.length))throw Error('Invalid pending Etsy verification');
  const cfg=etsySetup(env),blob=await etsyStore.get(job.pendingKey,{type:'text',consistency:'strong'});
  if(!blob)throw Error('Missing pending Etsy grant');
  let pending=unseal(blob,cfg.secret,'etsy-pending-grant');
  const granted=new Set(String(pending?.scope||'').split(/\s+/));
  if(! /^([1-9][0-9]*)$/.test(pending?.user_id||'')||!String(pending.access_token||'').startsWith(pending.user_id+'.')||!String(pending.refresh_token||'').startsWith(pending.user_id+'.')||ETSY_SCOPES.split(' ').some(scope=>!granted.has(scope)))throw Error('Invalid pending Etsy grant');
  if(!Number.isFinite(pending.expires_at)||pending.expires_at<=clock()+120000){
   const refresh=await request('https://api.etsy.com/v3/public/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:cfg.clientId,refresh_token:pending.refresh_token}).toString()});
   if(!refresh.ok)throw Error('Etsy pending grant refresh unavailable');
   const token=await refresh.json(),perms=new Set(String(token.scope||'').split(/\s+/));
   if(!String(token.access_token||'').startsWith(pending.user_id+'.')||!String(token.refresh_token||'').startsWith(pending.user_id+'.')||token.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(token.expires_in)||token.expires_in<=0||ETSY_SCOPES.split(' ').some(scope=>!perms.has(scope)))throw Error('Etsy pending grant refresh invalid');
   pending={...pending,access_token:token.access_token,refresh_token:token.refresh_token,scope:token.scope,expires_at:clock()+token.expires_in*1000};
  }
  const response=await request('https://openapi.etsy.com/v3/application/users/'+pending.user_id+'/shops',{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'x-api-key':cfg.clientId+':'+cfg.sharedSecret,Authorization:'Bearer '+pending.access_token,Accept:'application/json'}});
  if(!response.ok)throw Error('Etsy shop verification unavailable');
  const shop=verifiedSapiverPrintsShop(await response.json(),pending.user_id);
  // An older delayed OAuth job must never replace a newer verified connection.
  const previous=await etsyStore.get('primary',{type:'text',consistency:'strong'});
  if(previous){const old=unseal(previous,cfg.secret,'etsy-stored-tokens');if(Number(old.connected_at)>Number(pending.connected_at))throw Error('Stale pending Etsy grant');}
  const record={...pending,shop_id:shop.shop_id,shop_name:shop.shop_name,connected_at:pending.connected_at};
  await etsyStore.set('primary',seal(record,cfg.secret,'etsy-stored-tokens'));
  await etsyStore.setJSON(job.statusKey,{phase:'complete',at:clock()});
 }

 for(const job of jobs){
  if(! /^jobs\/[A-Za-z0-9_-]{32}$/.test(job.key)||!['oauth','prepare','publish','catalog'].includes(job.action)||job.phase!=='queued')continue;
  const saved=await queue.get(job.key,{type:'json',consistency:'strong'});if(saved?.phase!=='queued'||JSON.stringify(saved)!==JSON.stringify(Object.fromEntries(Object.entries(job).filter(([k])=>k!=='key')))){skipped++;continue;}
  const claim=await queue.setJSON(job.key.replace('jobs/','claims/'),{at:clock()},{onlyIfNew:true});if(claim?.modified!==true){skipped++;continue;}
  await queue.setJSON(job.key,{...saved,phase:'running',startedAt:clock()});
  try{
   if(job.action==='oauth'){
    await verifyPendingSeller(job);
   }else if(job.action==='catalog'){
    await refreshCatalogue();
   }else{
    if(! /^[A-Za-z0-9_-]{32}$/.test(job.id))throw Error('Invalid task');
    const state=await uploads.get('uploads/'+job.id+'/state',{type:'json',consistency:'strong'});
    if(job.action==='prepare'){const product=await uploads.get(recordKey(state?.productId||job.id),{type:'json',consistency:'strong'});if(product?.pendingRevision&&product.pendingRevision!==job.id)throw Error('Product review superseded');if(state?.phase!=='preparing')throw Error('Not ready');await uploads.setJSON('uploads/'+job.id+'/state',{...state,stage:state.stage&&state.stage!=='queued'?state.stage:'starting',updatedAt:clock(),...(/^\d+$/.test(String(runId||''))?{workerRunId:String(runId)}:{})});await (state.type==='digital'?prepareDigital:prepare)({id:job.id,uploads,client});const ready=await uploads.get('uploads/'+job.id+'/state',{type:'json',consistency:'strong'});if(state.type!=='digital'&&ready.referenceListingId){const settings=await uploads.get('template/settings',{type:'json',consistency:'strong'});await uploads.setJSON('template/settings',{...(settings||{}),referenceListingId:ready.referenceListingId});}}
    else{
     const approval=await uploads.get('claims/'+job.id+'/publish',{type:'json',consistency:'strong'});
     if(state?.phase!=='publishing'||!Number.isFinite(state.approvedAt)||approval?.approvalHash!==job.approvalHash||state.approvalHash!==job.approvalHash)throw Error('No owner approval');
     await (state.type==='digital'?publishDigital:publish)({id:job.id,approvalHash:job.approvalHash,uploads,etsyStore,client,env,request,clock});
    }
   }
   await queue.setJSON(job.key,{phase:'complete',action:job.action,id:job.id||null,completedAt:clock()});completed++;
  }catch(error){
   failures.push({action:job.action,...workerFailure(error)});
   // Retain the claim after any ambiguous outcome. Never repeat merchant writes.
   await queue.setJSON(job.key,{phase:'needs_investigation',action:job.action,id:job.id||null,failedAt:clock()});
   if(job.action==='oauth'&& /^oauth-status\/[A-Za-z0-9_-]+$/.test(job.statusKey||''))await etsyStore.setJSON(job.statusKey,{phase:'needs_investigation'});
   if(job.id&& /^[A-Za-z0-9_-]{32}$/.test(job.id)){const state=await uploads.get('uploads/'+job.id+'/state',{type:'json',consistency:'strong'});if(state)await uploads.setJSON('uploads/'+job.id+'/state',{...state,phase:'needs_investigation',failureAction:job.action,failureCode:safeProductFailure(error),failedAt:clock(),updatedAt:clock()});const product=await uploads.get(recordKey(state?.productId||job.id),{type:'json',consistency:'strong'});if(!product?.pendingRevision||product.pendingRevision===job.id)await recordRevision(uploads,job.id);}
  }
 }
 try{const taxonomy=await client.api('/seller-taxonomy/nodes');await uploads.setJSON('template/taxonomy',{nodes:flattenTaxonomy(taxonomy.results),updatedAt:clock()});}catch{}
 if(!catalogueChecked)await refreshCatalogue();
 return {completed,skipped,failures,cataloguePhase};
}

function safeProductFailure(error){
 if(error?.message==='Etsy request failed'&&Number.isInteger(error.etsyStatus)&&error.etsyStatus>=400&&error.etsyStatus<=599&&['inventory','images','listing','catalogue'].includes(error.etsyOperation)){
  const next=[401,403].includes(error.etsyStatus)?'Check seller authorisation and permissions.':'Inspect the existing draft before retrying; do not create a duplicate.';
  return 'Etsy '+error.etsyOperation+' request failed (HTTP '+error.etsyStatus+'). Saved progress is retained. '+next;
 }
 const text=String(error?.message||'');const known={'PNG must match A-series and meet at least 270 PPI at A3':'Your PNG must use the A-series shape and provide at least 270 PPI at A3. For a 4800-pixel height use about 3394 pixels wide.','Invalid PNG signature':'The uploaded file is not a valid PNG. Export your artwork as PNG and upload that file.','Missing upload chunk':'Part of the saved upload is missing. Upload the original file again.','Upload chunk size mismatch':'Part of the saved upload is incomplete. Upload the original file again.','Upload length mismatch':'The saved upload length is incorrect. Upload the original file again.','Etsy seller connection required':'Connect Etsy before preparing your product.','Invalid Etsy seller connection':'Reconnect the SapiverPrints Etsy account before preparing your product.','Etsy refresh needs investigation or reconnection':'Reconnect Etsy: the saved seller session could not be refreshed.','Etsy request failed':'Etsy rejected a product request. Saved progress and any Etsy draft are retained. Inspect the existing draft before retrying.','Bridge unavailable':'The worker could not access the private product files. Your upload is retained.'};if(known[text])return known[text];if(text.length<=300&&/^(Seller kit|Digital package needs valid|Use a valid ZIP|ZIP |Unsupported customer file|Unsafe archive|Duplicate archive|Archive |Encrypted or unsupported|Invalid or active PDF|Active PDF|SVG |Active SVG|External SVG|Image content|Package needs|An individual file|Include a PNG|Reserved guide|Review and select|Choose the verified category|Selected marketplace|Physical artwork replacement|Physical shop setup|Physical marketplace category|Digital file count|Customer file read-back|Digital listing|Existing listing changed|Duplicate existing shop sections|Etsy shop already|Section creation already|This digital SKU)/.test(text))return text;return 'Processing stopped safely. Check the retained Etsy / PrintShrimp IDs before retrying.';}
