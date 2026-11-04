// Read-only Streak original-upload diagnosis. Never retries publication.
const btn=document.getElementById('streak-check-original-blame');
const msg=document.getElementById('streak-original-diagnostic-status');
const detail=document.getElementById('streak-original-diagnostic-details');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content||'';
const base='/poster/bulk/streak-publication';
const label=value=>String(value??'Unknown');
const safeText=(parent,tag,value)=>{
 const node=document.createElement(tag);
 node.textContent=value;parent.append(node);return node;
};
function show(result){
 if(!result){msg.textContent='Status unavailable.';return;}
 detail.replaceChildren();
 if(result.phase==='available'){
  const r=result;
  msg.textContent='Etsy and PrintShrimp checks finished. No existing products were changed.';
  safeText(detail,'p','Result: '+label(r.classification).replaceAll('_',' '));
  safeText(detail,'p','Uploader: '+label(r.local?.phase)+' / '+label(r.local?.stage));
  safeText(detail,'p','Original Etsy listing ID: '+label(r.local?.listingId||'not saved'));
  safeText(detail,'p','PrintShrimp: '+label(r.supplier?.phase)+
   (r.supplier?.productId?' (product '+r.supplier.productId+')':''));
  safeText(detail,'p','Existing publication claim: '+label(r.locks?.draftPhase)+
   '; supplier claim: '+label(r.locks?.supplierPhase));
  const found=r.etsy?.matches||[];
  if(found.length){
   const list=safeText(detail,'p','Exact-SKU Etsy listings:');
   for(const item of found)safeText(detail,'p',label(item.listingId)+' — '+label(item.state)+' — '+label(item.title));
  }else safeText(detail,'p','No exact SKU match in any Etsy listing state examined.');
  if(r.etsy?.directListing)safeText(detail,'p','Saved Etsy listing ID was found separately: '+
   label(r.etsy.directListing.listingId)+' ('+label(r.etsy.directListing.state)+').');
  safeText(detail,'p',label(r.notice));
  btn.disabled=true;
 }else if(result.phase==='queued'){
  msg.textContent='Read-only audit queued. Checking the original SKU against Etsy and PrintShrimp.';
  btn.disabled=true;
 }else if(result.phase==='needs_investigation'){
  msg.textContent='Audit could not be verified. No products changed. Do not retry until the saved job is checked.';
  safeText(detail,'p',label(result.notice));
  btn.disabled=true;
 }else{
  msg.textContent='No audit has been requested yet.';
  btn.disabled=false;
 }
}
async function getStatus(){
 const r=await fetch(base+'/status',{credentials:'same-origin'});
 if(!r.ok)throw Error('Cannot read saved audit');
 return r.json();
}
async function poll(){
 for(let i=0;i<24;i++){
  await new Promise(done=>setTimeout(done,2500));
  let data;try{data=await getStatus();}catch{continue;}
  show(data);
  if(data.phase!=='queued')return;
 }
 msg.textContent='Audit is still being processed. Reopen this page to see its saved result; do not submit a duplicate request.';
}
if(btn&&msg&&detail){
 getStatus().then(show).catch(()=>{msg.textContent='Unable to check original Streak audit status.';});
 btn.addEventListener('click',async()=>{
  if(btn.disabled)return;
  btn.disabled=true;
  msg.textContent='Checking The Blame; this performs no seller or supplier writes.';
  try{
   const response=await fetch(base+'/audit',{method:'POST',credentials:'same-origin',
    headers:{'X-Poster-CSRF':csrf}});
   const result=await response.json();
   if(!response.ok){show(result);throw Error(result.error||'Audit request refused');}
   show(result);
   if(result.phase==='queued')void poll();
  }catch(e){
   msg.textContent='Request could not be confirmed: '+e.message+' Check saved status, do not re-submit blindly.';
  }
 });
}
