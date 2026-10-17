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
