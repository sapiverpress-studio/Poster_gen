const button=document.getElementById('seo-audit');
const status=document.getElementById('seo-status');
const results=document.getElementById('seo-results');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content||'';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const message=s=>{status.textContent=s;};
const line=(tag,content)=>{const el=document.createElement(tag);el.textContent=content;return el;};
function render(rows){
 results.replaceChildren();
 results.append(line('p','Authenticated seller read-back: '+rows.length+' listings. Proposed search phrases are not verified demand. No listings have been modified.'));
 for(const row of rows){
  const article=document.createElement('article');
  article.append(line('h3',row.title),line('p','Etsy listing '+row.id+' · '+row.state));
  const link=document.createElement('a');link.href='https://www.etsy.com/listing/'+row.id;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Inspect Etsy artwork';article.append(link);
  article.append(line('p','Current title: '+row.before.title),line('p','Proposed title: '+row.title),line('p','Current tags: '+row.before.tags.join(', ')),line('p','Proposed tags: '+row.tags.join(', ')));
  if(row.note)article.append(line('p','Artwork review: '+row.note));
  if(row.state!=='ready')article.append(line('p','BLOCKED: the listing differs from the proposal snapshot.'));
  results.append(article);
 }
}
async function readStatus(){
 const response=await fetch('/poster/seo/status',{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw Error('Could not read the private seller audit status');
 return response.json();
}
async function poll(){
 for(let attempt=0;attempt<35;attempt++){
  await pause(8000);
  const result=await readStatus();
  if(result.phase==='available'&&result.rows?.length){
   render(result.rows);
   message('All '+result.rows.length+' listings compared through the authenticated Etsy seller worker. Read-only; no edits applied.');
   return;
  }
  if(result.phase==='needs_investigation')throw Error('The seller audit could not be completed. No listing updates were made. If your active listing count has changed, the 20-product proposal file must be refreshed.');
 }
 message('The seller audit is still queued; return later rather than creating duplicate jobs.');
}
button.addEventListener('click',async()=>{
 button.disabled=true;results.replaceChildren();message('Queueing the seller-authenticated Etsy comparison; no listing changes will be made...');
 try{
  const response=await fetch('/poster/seo/prepare',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-poster-csrf':csrf},body:'{}'});
  const data=await response.json();
  if(!response.ok||data.phase!=='pending')throw Error(data.error||'Could not queue the seller audit');
  message('Audit queued. Waiting for the GitHub seller worker...');
  await poll();
 }catch(error){message('Audit not completed: '+error.message);}
 finally{button.disabled=false;}
});
readStatus().then(result=>{
 if(result.phase==='available'&&result.rows?.length){render(result.rows);message('Previous verified seller audit loaded. No changes were applied.');}
 else if(result.phase==='pending')message('Seller audit already queued. Wait for it to finish before requesting another.');
 else if(result.phase==='needs_investigation')message('Last seller audit requires investigation; no listings were changed.');
}).catch(()=>{});
