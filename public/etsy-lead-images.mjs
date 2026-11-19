const root=document.querySelector('[data-lead-images]');
if(root){
 const csrf=root.dataset.csrf,output=document.getElementById('lead-state'),
  preview=document.getElementById('lead-preview'),apply=document.getElementById('lead-apply'),reconcile=document.getElementById('lead-reconcile');
 let busy=false;
 async function send(path,body){
  const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'x-poster-csrf':csrf,'Content-Type':'application/json'},body:JSON.stringify(body||{})});
  const payload=await response.json().catch(()=>({error:'Website returned HTTP '+response.status+' instead of the expected JSON response. Refresh the page; do not repeat Etsy image updates blindly.'}));
  if(!response.ok)throw Error(payload.error||'Etsy image operation unavailable');
  return payload;
 }
 async function poll(){
  try{
   const response=await fetch('/poster/lead-images/status',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();
   const processed=(data.results||[]).length;
   const report=data.reconciliation;
   output.textContent='Status: '+data.phase+' · '+data.verified+'/'+data.ready+' originally verified · '+
    (report?report.checked+'/'+report.eligible+' rechecked · '+report.confirmed+' confirmed updated · '+report.unchanged+' unchanged · '+report.uncertain+' uncertain':processed+' processed')+' · '+data.skipped+' need artwork review';
   if(['ready','complete','needs_investigation','reconciled'].includes(data.phase)){location.reload();}
   else if(['preview_queued','apply_queued','running','reconcile_queued','reconciling'].includes(data.phase))setTimeout(poll,5000);
  }catch(e){output.textContent='Unable to retrieve image update status. Refresh this page.';}
 }
 reconcile?.addEventListener('click',async()=>{
  if(busy)return;busy=true;reconcile.disabled=true;
  try{
   output.textContent='Checking previous Etsy updates without changing listings…';
   await send('/poster/lead-images/reconcile',{});
   setTimeout(poll,1500);
  }catch(error){output.textContent=error.message;reconcile.disabled=false;busy=false;}
 });
 preview?.addEventListener('click',async()=>{
  if(busy)return;busy=true;preview.disabled=true;
  try{output.textContent='Checking Etsy images and original source files…';await send('/poster/lead-images/preview',{});setTimeout(poll,1500);}
  catch(error){output.textContent=error.message;preview.disabled=false;busy=false;}
 });
 apply?.addEventListener('click',async()=>{
  if(busy)return;
  const replacingTrio=apply.dataset.mode==='replace-trio';
  if(!window.confirm(replacingTrio?
   'Replace the cropped first image on the verified trio listings with a new square cover? The other listing photos will remain unchanged.':
   'Make the verified artwork image the first Etsy photo on all eligible listings? Existing mockups will remain.'))return;
  busy=true;apply.disabled=true;
  try{output.textContent='Applying clean artwork-first images to eligible listings…';await send('/poster/lead-images/apply',{confirm:true,approvalHash:apply.dataset.hash});setTimeout(poll,1500);}
  catch(error){output.textContent=error.message;apply.disabled=false;busy=false;}
 });
 if(/^(preview_queued|apply_queued|running|reconcile_queued|reconciling)$/.test(output.textContent.replace(/^Status:\s*/,'')))setTimeout(poll,1500);
}
