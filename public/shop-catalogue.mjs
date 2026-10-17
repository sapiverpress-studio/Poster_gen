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
    if(check.phase==='needs_investigation')throw Error('The seller audit failed. No listings were changed.');
   }
   status.textContent='Audit is still queued. Return to this page later; do not queue duplicates.';
  }catch(error){status.textContent='Audit not completed: '+error.message;}
  finally{button.disabled=false;}
 });
}
