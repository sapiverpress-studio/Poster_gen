const button=document.getElementById('catalogue-refresh');
const status=document.getElementById('catalogue-message');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content||'';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function state(){
 const res=await fetch('/poster/catalogue/status',{credentials:'same-origin',cache:'no-store'});
 if(!res.ok)throw Error('Unable to read audit status');
 return res.json();
}
if(button&&status){
 button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='Queueing a read-only audit of every Etsy listing...';
  try{
   const r=await fetch('/poster/catalog/refresh',{method:'POST',credentials:'same-origin',headers:{'x-poster-csrf':csrf},cache:'no-store'});
   const body=await r.json();
   if(!r.ok)throw Error(body.error||'Could not queue seller audit');
   status.textContent='Audit queued in GitHub. Waiting for complete seller read-back; no merchant changes are being made.';
   for(let attempt=0;attempt<35;attempt++){
    await sleep(8000);
    const check=await state();
    if(check.phase==='available'){location.reload();return;}
    if(check.phase==='needs_investigation')throw Error('The GitHub audit failed. No listings were changed. You can retry.');
    if(check.phase==='worker_finished_no_result')throw Error('The worker ended without a complete audit. No listings were changed.');
    if(check.phase==='worker_delayed')throw Error('The GitHub worker has not finished after four minutes. Review the worker run before retrying.');
   }
   status.textContent='Audit is still queued. Return to this page later; do not queue duplicates.';
  }catch(error){status.textContent='Audit not completed: '+error.message;}
  finally{button.disabled=false;}
 });
}

document.querySelectorAll('.catalogue-labels').forEach(form=>{
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]');
  const id=Number(form.dataset.id);
  const seasons=[...form.querySelectorAll('input[name="season"]:checked')].map(x=>x.value);
  button.disabled=true;
  try{
   const response=await fetch('/poster/catalogue/labels',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-poster-csrf':csrf},body:JSON.stringify({id,seasons})});
   const result=await response.json();
   if(!response.ok||result.phase!=='saved')throw Error(result.error||'Seasonal labels not saved');
   status.textContent='Seasonal labels saved for listing '+id+'. Etsy listing visibility remains unchanged.';
  }catch(error){status.textContent='Labels not saved: '+error.message;}
  finally{button.disabled=false;}
 });
});

const repairForm=document.getElementById('legacy-shipping-fix');
if(repairForm){
 repairForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!confirm('Update only Animal Alphabet listing 4589715100 from Etsy delivery profile 316847314881 to the verified PrintShrimp — Posters profile? This does not switch on customer-order fulfilment.'))return;
  const button=repairForm.querySelector('button[type="submit"]');
  button.disabled=true;
  status.textContent='Requesting the single-listing delivery correction...';
  try{
   const res=await fetch('/poster/catalogue/repair',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-poster-csrf':csrf},body:JSON.stringify({listingId:4589715100,confirm:true})});
   const result=await res.json();
   if(!res.ok||result.phase!=='pending')throw Error(result.error||'Correction could not be queued');
   status.textContent='Etsy correction queued. Waiting for verified seller read-back. Do not click twice.';
   for(let attempt=0;attempt<65;attempt++){
    await sleep(6000);
    const reply=await fetch('/poster/catalogue/repair/status',{credentials:'same-origin',cache:'no-store'});
    if(!reply.ok)throw Error('Could not check correction status');
    const check=await reply.json();
    if(check.phase==='complete'){
     status.textContent='Animal Alphabet delivery profile corrected and verified. Refresh the full shop audit to update counts.';
     button.remove();
     return;
    }
    if(check.phase==='needs_investigation'||check.phase==='worker_delayed')throw Error('Correction needs investigation. Do not retry until Etsy is checked.');
   }
   throw Error('Correction remains pending beyond the normal wait. Do not retry yet.');
  }catch(error){status.textContent='Delivery correction not confirmed: '+error.message;}
  finally{button.disabled=false;}
 });
}

const bulkLinkForm=document.getElementById('link-existing-bulk');
if(bulkLinkForm){
 bulkLinkForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const ids=String(bulkLinkForm.dataset.ids||'').split(',').map(Number);
  if(!ids.length||ids.some(id=>!Number.isSafeInteger(id)))return;
  if(!confirm('Save existing PrintShrimp product references for '+ids.length+' verified listings? This will NOT change Etsy, create supplier products or enable automatic orders.'))return;
  const button=bulkLinkForm.querySelector('button[type="submit"]');
  button.disabled=true;
  try{
   const res=await fetch('/poster/catalogue/link-existing',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-poster-csrf':csrf},body:JSON.stringify({confirm:true,ids})});
   const body=await res.json();
   if(!res.ok||body.phase!=='linked')throw Error(body.error||'Could not save supplier references');
   status.textContent='Saved '+body.linked.length+' existing supplier references. No marketplace settings changed. Run the audit again to confirm linked records.';
   bulkLinkForm.remove();
  }catch(error){status.textContent='Supplier links not saved: '+error.message;}
  finally{button.disabled=false;}
 });
}
