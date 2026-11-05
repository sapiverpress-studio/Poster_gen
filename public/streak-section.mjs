// Owner-only Etsy API section creation. No implicit writes on page load.
const button=document.getElementById('streak-create-section');
const status=document.getElementById('streak-section-status');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content;
const endpoint='/poster/bulk/sections/streak';
const text=message=>{if(status)status.textContent=message;};
async function readStatus(){
 const r=await fetch(endpoint,{credentials:'same-origin'});
 if(!r.ok)throw Error('Cannot read Streak seller-section status');
 return r.json();
}
function show(s){
 if(!s||typeof s.phase!=='string'){text('Section status unavailable.');return;}
 if(s.phase==='verified'){
  text('Streak verified in Etsy. Section ID: '+s.sectionId+'. Refresh this page to select it.');
  if(button)button.disabled=true;
 }else if(s.phase==='queued'||s.phase==='running'){
  text('Etsy API section request queued. No listing has been published.');
  if(button)button.disabled=true;
 }else if(s.phase==='needs_investigation'){
  text('Etsy API result uncertain. Do not request again; inspect the worker and existing Etsy sections.');
  if(button)button.disabled=true;
 }else{
  text('Streak has not been created or checked through the API yet.');
 }
}
async function poll(){
 for(let i=0;i<15;i++){
  await new Promise(resolve=>setTimeout(resolve,3500));
  let s;try{s=await readStatus();}catch{continue;}
  show(s);
  if(!['queued','running'].includes(s.phase))return;
 }
 text('The section request may still be running. Reopen the uploader to check the saved status; do not submit another request.');
}
if(button&&status){
 readStatus().then(show).catch(()=>text('Unable to check section status.'));
 button.addEventListener('click',async()=>{
  if(button.disabled)return;
  button.disabled=true;
  text('Sending one owner-approved Streak section request to the Etsy API worker…');
  try{
   const r=await fetch(endpoint,{method:'POST',credentials:'same-origin',
    headers:{'X-Poster-CSRF':csrf||''}});
   let result;try{result=await r.json();}catch{throw Error('Unexpected section API response');}
   if(!r.ok){show(result);throw Error(result.error||'Section request not accepted');}
   show(result);
   if(result.phase==='queued')void poll();
  }catch(e){
   text(String(e.message||'Section API response uncertain')+' Check saved status before any retry.');
  }
 });
}


// Independent owner-approved section setup for three-print bundle listings.
const trioButton=document.getElementById('trio-create-section');
const trioStatus=document.getElementById('trio-section-status');
const trioEndpoint='/poster/bulk/sections/trio';
const trioMessage=value=>{if(trioStatus)trioStatus.textContent=value;};
function showTrioSectionState(value){
 if(value?.phase==='verified'){
  trioMessage('Trio Collection verified on Etsy (section '+value.sectionId+'). New trio sets will use it.');
  if(trioButton)trioButton.disabled=true;
 }else if(['queued','running'].includes(value?.phase)){
  trioMessage('Etsy section request is queued. No poster listings have been created.');
  if(trioButton)trioButton.disabled=true;
 }else if(value?.phase==='needs_investigation'){
  trioMessage('The Etsy result needs investigation. Do not repeat the request.');
  if(trioButton)trioButton.disabled=true;
 }else trioMessage('Trio Collection has not yet been verified on Etsy.');
}
async function trioRead(){
 const r=await fetch(trioEndpoint,{credentials:'same-origin'});
 if(!r.ok)throw Error('Trio section status unavailable');
 return r.json();
}
async function trioPoll(){
 for(let n=0;n<15;n++){
  await new Promise(resolve=>setTimeout(resolve,3500));
  let state;try{state=await trioRead();}catch{continue;}
  showTrioSectionState(state);
  if(!['queued','running'].includes(state?.phase))return;
 }
 trioMessage('The section request may still be processing. Reopen this page to check; do not retry.');
}
if(trioButton&&trioStatus){
 trioRead().then(showTrioSectionState).catch(()=>trioMessage('Section status could not be checked.'));
 trioButton.addEventListener('click',async()=>{
  if(trioButton.disabled)return;
  trioButton.disabled=true;
  trioMessage('Requesting one verified Trio Collection section through the Etsy API…');
  try{
   const r=await fetch(trioEndpoint,{method:'POST',credentials:'same-origin',headers:{'X-Poster-CSRF':csrf||''}});
   const result=await r.json();
   showTrioSectionState(result);
   if(!r.ok)throw Error(result.error||'Etsy section request was not accepted');
   if(result.phase==='queued')void trioPoll();
  }catch(error){
   trioMessage(String(error.message||'Etsy response uncertain')+'. Check status before retrying.');
  }
 });
}
