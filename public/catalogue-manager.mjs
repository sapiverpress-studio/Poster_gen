const root=document.querySelector('.catalogue-manager');
const status=document.getElementById('visibility-message');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content||'';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cards=[...document.querySelectorAll('.poster-card')];
const allSwitches=[...document.querySelectorAll('.poster-toggle')];
let busy=false;
const tell=s=>{if(status)status.textContent=s;};
const buttons=[...document.querySelectorAll('#batch-on,#batch-off')];
const refresh=document.getElementById('manager-refresh');
refresh?.addEventListener('click',async()=>{
 if(busy)return;busy=true;refresh.disabled=true;tell('Refreshing Etsy listing status…');
 try{
  const res=await fetch('/poster/catalog/refresh',{method:'POST',credentials:'same-origin',headers:{'x-poster-csrf':csrf},cache:'no-store'});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Refresh was not accepted');
  for(let i=0;i<45;i++){
   await sleep(6000);
   const check=await fetch('/poster/catalogue/status',{credentials:'same-origin',cache:'no-store'});
   const result=await check.json();if(!check.ok)throw Error('Audit status unavailable');
   if(result.phase==='available'){location.reload();return;}
   if(result.phase==='needs_investigation'||result.phase==='worker_finished_no_result'||result.phase==='worker_delayed')throw Error('Etsy audit failed or delayed. Inspect worker before retry.');
  }
  tell('Audit is still pending. Return later; do not start duplicate refreshes.');
 }catch(error){tell('Refresh not confirmed: '+error.message);}finally{busy=false;refresh.disabled=false;}
});
function disableAll(yes){for(const control of [...allSwitches,...document.querySelectorAll('.poster-choose'),...buttons,document.getElementById('select-visible')].filter(Boolean))control.disabled=yes||root?.dataset.fresh!=='true';}
async function plan(target,ids){
 if(busy||root?.dataset.fresh!=='true')return;
 if(!ids.length){tell('Select a poster that needs a change.');return;}
 if(ids.length>20){tell('Choose a maximum of 20 posters per change.');return;}
 const word=target==='active'?'ON':'OFF';
 if(!confirm('Change '+ids.length+' existing Etsy poster'+(ids.length===1?'':'s')+' '+word+'?\n\nThis changes live shop visibility after seller verification. Turning posters ON may incur Etsy listing/renewal fees. Existing orders and PrintShrimp products are untouched.'))return;
 busy=true;disableAll(true);tell('Confirming your selection with the private Etsy worker…');
 try{
  const res=await fetch('/poster/catalogue/visibility',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-poster-csrf':csrf},body:JSON.stringify({target,ids,confirm:true})});
  const data=await res.json();
  if(!res.ok||!data.id)throw Error(data.error||'Could not queue verified listing change');
  for(let attempt=0;attempt<45;attempt++){
   const r=await fetch('/poster/catalogue/visibility/status?id='+encodeURIComponent(data.id),{credentials:'same-origin',cache:'no-store'});
   const item=await r.json();
   if(!r.ok)throw Error(item.error||'Listing status cannot be verified');
   if(item.phase==='complete'){tell('Etsy confirmed '+item.verified+' listing changes. Reloading folder…');location.reload();return;}
   if(item.phase==='needs_investigation')throw Error('Etsy changes need investigation. '+(item.verified||0)+' confirmed; do not retry until you inspect affected listings.');
   tell('Etsy is checking your listings. '+(item.verified||0)+'/'+ids.length+' confirmed.');
   await sleep(6000);
  }
  throw Error('Seller worker is still processing. Check status before any new attempt; do not retry blindly.');
 }catch(e){tell('Listing change not confirmed: '+e.message);}
 finally{busy=false;disableAll(false);}
}
for(const toggle of allSwitches){
 toggle.addEventListener('change',()=>{
  const id=Number(toggle.dataset.id);
  const old=toggle.dataset.state;
  const target=toggle.checked?'active':'inactive';
  toggle.checked=old==='active'; // Only show a new state after Etsy has confirmed it.
  if(target!==old)plan(target,[id]);
 });
}
for(const [id,target] of [['batch-on','active'],['batch-off','inactive']]){
 const button=document.getElementById(id);
 button?.addEventListener('click',()=>{
  const ids=cards.filter(card=>card.querySelector('.poster-choose:checked')&&card.dataset.state!==target).map(card=>Number(card.dataset.listing));
  plan(target,ids);
 });
}
document.getElementById('select-visible')?.addEventListener('change',event=>{
 for(const card of cards){
  const check=card.querySelector('.poster-choose');
  if(check&&!check.disabled&&card.hidden!==true)check.checked=event.target.checked;
 }
});
document.getElementById('poster-filter')?.addEventListener('input',event=>{
 const q=event.target.value.toLocaleLowerCase().trim();
 for(const card of cards){card.hidden=!!q&&!card.dataset.title.includes(q);if(card.hidden){const check=card.querySelector('.poster-choose');if(check)check.checked=false;}}
});

document.getElementById('create-website-folder')?.addEventListener('submit',async event=>{
 event.preventDefault();const f=event.currentTarget,button=f.querySelector('button');button.disabled=true;
 try{
  const response=await fetch('/poster/catalogue/website-folders',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-poster-csrf':csrf},body:JSON.stringify({title:f.elements.title.value})});
  const body=await response.json();
  if(!response.ok)throw Error(body.error||'Website folder not saved');
  location.reload();
 }catch(error){tell('Folder not created: '+error.message);button.disabled=false;}
});
if(document.querySelector('.stored-first-on'))import('/stored-poster.mjs');
