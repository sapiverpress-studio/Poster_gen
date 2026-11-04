// Deliberate, owner-authenticated two-step operation on existing Etsy
// listings only. Does not create single posters, bundles or supplier products.
const panel=document.getElementById('existing-trio-frames');
const rows=document.getElementById('existing-trio-frame-rows');
const status=document.getElementById('existing-trio-frame-status');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content||'';
const endpoint='/poster/bulk/existing-trios';
const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=String(text);return n;};
let busy=false;
async function api(path,{method='GET',data}={}){
 const r=await fetch(endpoint+path,{method,credentials:'same-origin',
  headers:{'X-Poster-CSRF':csrf,...(data?{'Content-Type':'application/json'}:{})},
  ...(data?{body:JSON.stringify(data)}:{})});
 let payload;try{payload=await r.json();}catch{throw Error('Server response unavailable; check saved status before retrying');}
 if(!r.ok)throw Error(payload.error||'Request stopped safely; no confirmation of changed Etsy products');
 return payload;
}
function pound(value){return typeof value==='number'&&Number.isFinite(value)?'£'+value.toFixed(2):'Not verified';}
async function draw(){
 const result=await api('');
 if(result.phase!=='available')throw Error('Saved Etsy trio status unavailable');
 rows.replaceChildren();
 const eligible=result.rows||[];
 if(!eligible.length){rows.append(el('p','No uploader-linked trio Etsy listings found. Refresh the Catalogue; never re-create a supplier bundle to resolve this.'));return;}
 for(const item of eligible){
  const card=el('article',''),heading=el('h4',item.title+' · Etsy #'+item.listingId);
  const detail=el('p','PrintShrimp bundle SKU: '+item.sku+' · Uploader: '+item.phase+' · Frame upgrade: '+item.framePhase);
  card.append(heading,detail);
  if(item.framePhase==='ready'&&item.quote?.variants){
   const list=el('p','');
   for(const key of ['Print Only','Black Frame','White Frame','Oak Frame']){
    const itemPrice=item.quote.variants[key];
    list.append(el('div',key+': '+pound(itemPrice?.grossGbp)+' (estimated contribution '+pound(itemPrice?.contributionGbp)+')'));
   }
   card.append(list,el('p','Every framed option includes THREE individually framed A4 prints. The existing supplier bundle SKU stays unchanged.'));
   const confirmation=document.createElement('label'),check=document.createElement('input');
   check.type='checkbox';
   confirmation.append(check,el('span',' I have reviewed the four prices and want to update this existing Etsy listing.'));
   const approve=el('button','Apply framed + unframed options to Etsy #'+item.listingId);
   approve.type='button';approve.disabled=true;
   check.addEventListener('change',()=>{approve.disabled=!check.checked||busy;});
   approve.addEventListener('click',()=>perform(item,'apply',item.approvalHash));
   card.append(confirmation,approve);
  }else if(item.framePhase==='not_started'){
   const prepare=el('button','Check existing Etsy trio and show framed prices');
   prepare.type='button';
   prepare.addEventListener('click',()=>perform(item,'prepare'));
   card.append(prepare);
  }else if(item.framePhase==='complete'){
   card.append(el('p','Four Etsy finish choices verified. Existing listing ID and PrintShrimp bundle SKU retained.'));
  }else{
   card.append(el('p',item.notice||'A seller or supplier verification is in progress or needs investigation. Do not retry automatically.'));
  }
  rows.append(card);
 }
}
async function perform(item,mode,approvalHash){
 if(busy)return;
 busy=true;
 try{
  status.textContent=(mode==='prepare'?'Checking':'Updating')+' Etsy trio #'+item.listingId+' using its existing PrintShrimp bundle; no new listings are created.';
  const r=await api('/'+mode,{method:'POST',data:{id:item.id,...(approvalHash?{approvalHash}:{})}});
  if(r.phase!=='queued')throw Error('Queued task was not confirmed. Inspect the existing listing.');
  status.textContent='Saved request queued. Checking the result…';
  for(let i=0;i<18;i++){
   await new Promise(resolve=>setTimeout(resolve,3000));
   const result=await api('');
   const target=result.rows?.find(x=>x.id===item.id);
   if(target?.framePhase&&target.framePhase!=='queued'&&target.framePhase!=='applying'){
    await draw();
    status.textContent=target.framePhase==='complete'?'Existing Etsy trio updated and read back.':target.framePhase==='ready'?'Price review ready. Confirm the change separately.':'Update needs investigation; do not create another listing.';
    return;
   }
  }
  await draw();
  status.textContent='Job still running. Reopen this page to see the saved result, without submitting again.';
 }catch(error){status.textContent=error.message;try{await draw();}catch{}}
 finally{busy=false;}
}
if(panel&&rows&&status){
 const load=()=>draw().catch(e=>{status.textContent='Could not retrieve saved trio listings: '+e.message;});
 panel.addEventListener('toggle',()=>{if(panel.open)void load();});
 if(panel.open)void load();
}
