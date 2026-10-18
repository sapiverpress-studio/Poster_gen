const root=document.querySelector('.catalogue-manager');
const status=document.getElementById('visibility-message');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content||'';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cards=[...document.querySelectorAll('.poster-card')];
const allSwitches=[...document.querySelectorAll('.poster-toggle')];
let busy=false;
const tell=s=>{if(status)status.textContent=s;};
const buttons=[...document.querySelectorAll('#batch-on,#batch-off')];
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
