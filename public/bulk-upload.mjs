import {openEightPosterZip,BULK_COUNT} from './bulk-zip.mjs';

const form=document.getElementById('bulk-collection-form'),status=document.getElementById('bulk-status');
const cards=document.getElementById('bulk-cards'),deploy=document.getElementById('bulk-deploy');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content;
const KEY='sapiver-physical-bulk-v1',ID=/^[A-Za-z0-9_-]{32}$/;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let state=null,seen=[],pollHandle=null,busy=false;

function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
function save(){try{sessionStorage.setItem(KEY,JSON.stringify(state));}catch{throw Error('Session storage unavailable. Use the single uploader to avoid duplicate products.');}}
function read(){
 try{const v=JSON.parse(sessionStorage.getItem(KEY)||'null');return v?.version===1&&v.items?.length===BULK_COUNT&&v.items.every(i=>typeof i.filename==='string'&&(!i.id||ID.test(i.id)))?v:null;}catch{return null;}
}
function message(value){status.textContent=value;}
async function api(url,{method='GET',body,headers={}}={}){
 let res;try{res=await fetch(url,{method,body,credentials:'same-origin',headers:{'X-Poster-CSRF':csrf,...headers}});}
 catch{throw Error('Connection interrupted. Do not start a second collection; reopen this page to inspect existing product IDs.');}
 if(res.status===401||res.redirected&&res.url?.includes('/poster/workflow'))throw Error('Owner session expired. Sign in again; existing products are retained.');
 if(res.status===429)throw Error('Upload rate limit reached. Wait three minutes before resuming this saved collection.');
 if(res.status>=500)throw Error('Upload service temporarily unavailable. Saved products and reservations remain. Resume after checking the dashboard.');
 let data;try{data=await res.json();}catch{throw Error('Unexpected response. Inspect existing products before retrying a create/approval request.');}
 if(!res.ok)throw Error(data.error||'Product request failed; check the saved dashboard.');
 return data;
}
const signature=file=>[file.name,file.size,file.lastModified].join('|');
const validReceipt=data=>data&&ID.test(data.id)&&data.chunkBytes>0&&data.chunkBytes<=2_000_000;
function buildCards(results=[]){
 cards.replaceChildren();
 for(let n=0;n<BULK_COUNT;n++){
  const item=state.items[n],live=results[n],review=live?.review,article=document.createElement('article');
  article.append(text('h3',(n+1)+'. '+(review?.title||item.title||item.filename)));
  article.append(text('p','Product '+(item.id?item.id:'not created')+' · '+(live?.phase||item.phase||'not started')));
  if(item.id){
   const link=document.createElement('a');link.href='/poster/upload?id='+item.id;link.textContent='Open individual product / edit';article.append(link);
  }
  if(review){
   const imgs=document.createElement('div');imgs.style.display='flex';imgs.style.flexWrap='wrap';imgs.style.gap='6px';
   for(const [index,url] of review.imageUrls.entries()){
    const img=document.createElement('img');img.src=url;img.alt='Listing mockup '+(index+1);img.loading='lazy';img.width=110;imgs.append(img);
   }
   article.append(imgs);
   const detail=document.createElement('details');const label=text('summary','Read full description and all 13 tags');detail.append(label);
   const description=text('pre',review.description);detail.append(description,text('p','Tags: '+review.tags));
   article.append(detail);
  }else if(live?.progress?.note){article.append(text('p',live.progress.note));}
  if(live?.phase==='needs_investigation')article.append(text('p','This item needs investigation. Do not start it again or recreate its Etsy draft.'));
  cards.append(article);
 }
}
async function inspect(){
 if(!state)return;
 const results=await Promise.all(state.items.map(i=>i.id?api('/poster/uploads/'+i.id):Promise.resolve(null)));
 seen=results;
 const complete=results.every(r=>r&&r.phase==='ready_for_approval');
 const begun=results.every(r=>r&&['ready_for_approval','publishing','published'].includes(r.phase));
 buildCards(results);
 deploy.hidden=!complete;deploy.disabled=!complete||busy;
 if(complete)message('All eight reviews are ready. Check every title, full description, 13 tags and mockups. Deploy all eight only when satisfied.');
 else if(begun)message('Publication is underway or complete. Check the individual listings below.');
 else if(results.some(r=>r?.phase==='needs_investigation'))message('An item needs investigation. Existing product IDs are retained. Do not re-create failed merchant listings.');
 else message('Collection saved. Preparation continues in GitHub. Keep this page open, or return to refresh progress.');
 if(!complete&&!begun&&results.some(r=>r?.phase==='preparing'||r?.phase==='publishing')){
  clearTimeout(pollHandle);pollHandle=setTimeout(()=>inspect().catch(e=>message(e.message)),8000);
 }
}
async function checkAll(archive){
 const hashes=[],unique=new Set();
 for(let i=0;i<BULK_COUNT;i++){
  message('Checking PNG integrity, print dimensions and SHA-256 '+(i+1)+'/8 (nothing uploaded)…');
  const file=await archive.artwork(archive.items[i]);
  // Bind every saved upload receipt to the artwork bytes, not just its ZIP name.
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  if(unique.has(hash))throw Error('The ZIP repeats identical artwork. Eight different designs are required.');
  hashes.push(hash);unique.add(hash);
 }
 return hashes;
}
async function uploadItem(item,file,index){
 if(item.creating&&!item.id)throw Error('Creation of poster '+(index+1)+' had an uncertain response. Inspect the dashboard before continuing; never create it twice.');
 if(!item.id){
  item.creating=true;save();
  message('Creating product '+(index+1)+' of eight (monthly slot '+(index+1)+')…');
  const meta={name:item.title,etsyTitle:item.title,description:item.description,tags:item.tags.join(','),
   subject:item.title,kind:state.kind,sectionTitle:state.sectionTitle};
  const receipt=await api('/poster/uploads',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({filename:item.filename,bytes:file.size,type:'physical',metadata:meta,previewCount:0})});
  if(!validReceipt(receipt))throw Error('Uncertain new-product receipt. Stop and inspect the product dashboard.');
  item.id=receipt.id;item.chunkBytes=receipt.chunkBytes;item.creating=false;save();
 }
 const live=await api('/poster/uploads/'+item.id);
 if(live.phase!=='uploading'){
  if(['preparing','ready_for_approval','publishing','published','needs_investigation'].includes(live.phase))return;
  throw Error('Product '+(index+1)+' has an unexpected state. Stop and inspect its individual page.');
 }
 const chunk=item.chunkBytes||2_000_000;
 for(let offset=0,n=0;offset<file.size;offset+=chunk,n++){
  await api('/poster/uploads/'+item.id+'/chunks/'+n,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:await file.slice(offset,Math.min(offset+chunk,file.size)).arrayBuffer()});
  message('Uploading poster '+(index+1)+'/8 — '+Math.round(100*Math.min(offset+chunk,file.size)/file.size)+'%');
 }
 try{await api('/poster/uploads/'+item.id+'/finish',{method:'POST'});}
 catch(error){
  const status=await api('/poster/uploads/'+item.id);
  if(!['preparing','ready_for_approval','publishing','published'].includes(status.phase))throw error;
 }
 item.phase='preparing';save();
}
async function start(e){
 e.preventDefault();
 if(busy)return;
 busy=true;form.querySelector('button[type="submit"]').disabled=true;deploy.disabled=true;
 try{
  const file=form.elements.collection.files[0];
  if(!file||!file.name.toLowerCase().endsWith('.zip'))throw Error('Choose your eight-poster ZIP.');
  const sig=signature(file);
  if(state&&state.signature!==sig)throw Error('A different collection is already saved in this browser. Finish or inspect it before starting another. To avoid duplicates, do not overwrite its receipts.');
  message('Reading ZIP and validating names, artwork and descriptions…');
  const archive=await openEightPosterZip(file);
  if(!state){
   const quota=await api('/poster/bulk/status');
   if(quota.remaining<BULK_COUNT)throw Error('Not enough monthly slots. '+quota.remaining+' remain; eight are required.');
   const artworkHashes=await checkAll(archive);
   state={version:1,signature:sig,kind:form.elements.kind.value,sectionTitle:form.elements.sectionTitle.value,
    items:archive.items.map((i,n)=>({filename:i.filename,title:i.title,description:i.description,tags:i.tags,sha256:artworkHashes[n],id:null}))};save();
  }else{
   if(state.items.some((v,i)=>v.filename!==archive.items[i].filename||v.title!==archive.items[i].title||v.description!==archive.items[i].description||v.tags.join(',')!==archive.items[i].tags.join(',')))
    throw Error('This ZIP differs from the saved collection. Do not reuse existing product receipts with different descriptions.');
   const artworkHashes=await checkAll(archive);
   if(state.items.some((v,i)=>v.sha256!==artworkHashes[i]))
    throw Error('Artwork differs from the original saved ZIP. Do not reuse an existing upload ID with changed images.');
  }
  for(let i=0;i<BULK_COUNT;i++){
   const item=state.items[i],live=item.id?await api('/poster/uploads/'+item.id):null;
   if(live&&live.phase!=='uploading')continue;
   const artwork=await archive.artwork(archive.items[i]);
   await uploadItem(item,artwork,i);
  }
  message('All eight uploads were submitted. Preparing their individual Etsy reviews…');await inspect();
 }catch(err){message('Stopped safely: '+err.message+' All successfully started products are retained; check the product dashboard.');}
 finally{busy=false;form.querySelector('button[type="submit"]').disabled=false;
  if(seen.every(r=>r?.phase==='ready_for_approval')){deploy.hidden=false;deploy.disabled=false;}
 }
}
form?.addEventListener('submit',start);
deploy?.addEventListener('click',async()=>{
 if(busy||!state)return;busy=true;deploy.disabled=true;
 try{
  const fresh=await Promise.all(state.items.map(i=>api('/poster/uploads/'+i.id)));
  if(!fresh.every((r,n)=>r.phase==='ready_for_approval'&&r.review?.approvalHash===seen[n]?.review?.approvalHash))
   throw Error('One review has changed or is no longer available. Refresh and inspect the individual products before approving.');
  if(!confirm('Deploy all eight reviewed products to Etsy and PrintShrimp? This can incur eight listing fees. No automatic customer orders will be enabled.'))return;
  for(let n=0;n<BULK_COUNT;n++){
   const item=state.items[n],review=fresh[n].review;
   message('Approving product '+(n+1)+' of eight…');
   const result=await api('/poster/uploads/'+item.id+'/approve',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
    body:new URLSearchParams({csrf,approvalHash:review.approvalHash})});
   if(result.phase!=='publishing')throw Error('Approval not confirmed for '+item.filename+'; inspect its individual product before retrying.');
   item.phase='publishing';save();
  }
  message('All eight exact reviews were approved. Etsy and PrintShrimp processing is queued. Check each saved product for final publication status.');
  await inspect();
 }catch(err){message('Approval stopped safely: '+err.message+' Earlier accepted approvals remain retained. Inspect existing records; do not recreate products.');}
 finally{busy=false;
  if(seen.every(r=>r?.phase==='ready_for_approval')){deploy.hidden=false;deploy.disabled=false;}
 }
});
state=read();
if(state){
 message('Saved eight-poster collection found. Re-select the SAME ZIP if upload is incomplete, or wait for the existing product reviews.');
 inspect().catch(e=>message('Could not load saved collection status: '+e.message));
}
