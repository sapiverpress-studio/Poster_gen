import {openPosterCollectionZip,collectionUploadFilename,BULK_MIN_COUNT,BULK_MAX_COUNT} from './bulk-zip.mjs';
import {makeFourListingPlan,makeEightListingPlan} from './collection-trios.mjs';

const form=document.getElementById('bulk-collection-form'),status=document.getElementById('bulk-status');
const cards=document.getElementById('bulk-cards'),deploy=document.getElementById('bulk-deploy');
const trioForm=document.getElementById('bulk-trios'),trioReviews=document.getElementById('bulk-trio-reviews'),deployTrios=document.getElementById('bulk-deploy-trios');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content;
const KEY='sapiver-physical-bulk-v1',ID=/^[A-Za-z0-9_-]{32}$/;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let state=null,seen=[],pollHandle=null,busy=false;

function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
function save(){try{sessionStorage.setItem(KEY,JSON.stringify(state));}catch{throw Error('Session storage unavailable. Use the single uploader to avoid duplicate products.');}}
function read(){
 try{const v=JSON.parse(sessionStorage.getItem(KEY)||'null');return [1,2,3,4].includes(v?.version)&&(v.items?.length>=BULK_MIN_COUNT&&v.items?.length<=BULK_MAX_COUNT||v.items?.length===8)&&v.items.every(i=>typeof i.filename==='string'&&(!i.id||ID.test(i.id)))?v:null;}catch{return null;}
}
function message(value){status.textContent=value;}
let previewSignature='',previewArchive=null,preparingTrios=false;
const modeChoices=['single','four-listings','eight-listings'];
const chosenMode=()=>form?.elements?.uploadMode?.value||'';
function showSelectedMode(){
 const selected=chosenMode(),fields=document.getElementById('bulk-upload-fields');
 if(fields)fields.hidden=!modeChoices.includes(selected);
 const trioSetup=document.getElementById('bulk-trio-section-setup');if(trioSetup)trioSetup.hidden=!['four-listings','eight-listings'].includes(selected);
 if(state?.uploadMode&&selected!==state.uploadMode)message('An earlier collection is saved. Resume or inspect it before choosing a different upload.');
}
document.getElementById('bulk-mode-choices')?.addEventListener?.('change',()=>{
 previewSignature='';previewArchive=null;trioForm?.replaceChildren();
 if(form?.elements?.collection)form.elements.collection.value='';
 showSelectedMode();
});
function trioInput(n,key){return form?.elements?.namedItem('trio'+n+key);}
function showTrioFields(archive,signature){
 previewArchive=archive;previewSignature=signature;trioForm?.replaceChildren();
 if(!archive.bundles?.length){return;}
 const heading=text('h3',archive.bundles.length===1?'This ZIP creates 4 Etsy listings: three individual posters and one collection of three.':'This ZIP creates 8 Etsy listings: six individual posters and two collections of three.');
 trioForm.append(heading,text('p','Each trio has separate descriptions, tags and a distinct verified PrintShrimp bundle SKU. Choose whether all three can also be purchased together with matching Black, White or Oak frames.'));
 for(let i=0;i<archive.bundles.length;i++){
  const b=archive.bundles[i],n=i+1,fieldset=document.createElement('fieldset');
  const legend=text('legend','Trio '+n+': '+b.title);
  fieldset.append(legend,text('p','Includes: '+b.members.join(', ')+' · '+b.size+' · '+b.sectionTitle));
  fieldset.append(text('p','PrintShrimp bundle SKU: assigned automatically from the verified component products after review. No manual SKU entry.'));
  const titleLabel=document.createElement('label');titleLabel.append(text('span','Etsy listing title '+n));
  const title=document.createElement('input');title.name='trio'+n+'Title';title.required=true;title.maxLength=140;
  title.value=state?.bundles?.[i]?.input?.title||b.listingTitle;titleLabel.append(title);fieldset.append(titleLabel);
  const discountLabel=document.createElement('label');discountLabel.append(text('span','Discount from the three live individual print prices'));
  const discount=document.createElement('select');discount.name='trio'+n+'Discount';
  for(const pct of [0,10,15]){const option=document.createElement('option');option.value=String(pct);option.textContent=pct+'%';if(Number(state?.bundles?.[i]?.input?.discount??15)===pct)option.selected=true;discount.append(option);}
  discountLabel.append(discount);fieldset.append(discountLabel);
  const frameLabel=document.createElement('label'),frame=document.createElement('input');
  frame.type='checkbox';frame.name='trio'+n+'Frames';frame.checked=state?.bundles?.[i]?.framed??true;
  frameLabel.append(frame,text('span',' Offer Print Only and sets of three matching Black, White or Oak frames'));
  fieldset.append(frameLabel);
  const details=document.createElement('details');details.append(text('summary','Read this trio’s distinct Etsy description and tags'));
  details.append(text('pre',b.description),text('p','Tags: '+b.tags.join(', ')));fieldset.append(details);
  trioForm.append(fieldset);
 }
}
async function onZipChosen(){
 if(busy)return;
 const file=form?.elements?.collection?.files?.[0];
 if(!file)return;
 try{
  const mode=chosenMode();if(!modeChoices.includes(mode))throw Error('Choose Individual, Singular trio or Six-pack first');
  message('Checking ZIP against the selected upload type…');
  const archive=await openPosterCollectionZip(file,{mode});
  showTrioFields(archive,signature(file));
  message(archive.bundles.length?archive.listingCount+' Etsy listings detected: '+archive.items.length+' individual posters and '+archive.bundles.length+' trio collection'+(archive.bundles.length===1?'':'s')+'. Review each trio title before uploading.':archive.listingCount+' individual poster listing detected.');
 }catch(error){previewArchive=null;previewSignature='';trioForm?.replaceChildren();message('ZIP rejected: '+error.message+'. No products created.');}
}
form?.elements?.collection?.addEventListener?.('change',()=>{onZipChosen().catch(e=>message(e.message));});
function inputPlans(archive){
 if(!archive.bundles.length)return null;
 const inputs=archive.bundles.map((_,i)=>({sku:'SP-PENDING-TRIO-'+(i+1),title:trioInput(i+1,'Title')?.value?.trim(),discount:Number(trioInput(i+1,'Discount')?.value)}));
 const trios=archive.bundles.map((b,i)=>({...b,framed:trioInput(i+1,'Frames')?.checked===true}));
 return (archive.bundles.length===1?makeFourListingPlan:makeEightListingPlan)({items:archive.items,trios,inputs});
}
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
const signature=file=>[file.name,file.size].join('|');
const validReceipt=data=>data&&ID.test(data.id)&&data.chunkBytes>0&&data.chunkBytes<=2_000_000;
function buildCards(results=[]){
 cards.replaceChildren();
 for(let n=0;n<state.items.length;n++){
  const item=state.items[n],live=results[n],review=live?.review,article=document.createElement('article');
  article.append(text('h3',(n+1)+'. '+(item.title||item.filename)));
  article.append(text('p','Listing title: '+(review?.title||item.listingTitle||item.title)));
  if(item.uploadFilename)article.append(text('p','SKU: '+item.uploadFilename.slice(0,-4)));
  if(item.sectionTitle)article.append(text('p','Shop section: '+item.sectionTitle));
  article.append(text('p','Product '+(item.id?item.id:'not created')+' · '+(live?.phase||item.phase||'not started')));
  if(item.id){
   const link=document.createElement('a');link.href='/poster/upload?id='+item.id;link.textContent='Open individual product / edit';article.append(link);
  }
  if(review){
   const imgs=document.createElement('details');
   imgs.append(text('summary','See all four listing mockups'));
   const grid=document.createElement('div');grid.style.display='grid';grid.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';grid.style.gap='8px';
   for(const [index,url] of review.imageUrls.entries()){
    const img=document.createElement('img');img.src=url;img.alt='Listing mockup '+(index+1);img.loading='lazy';img.style.width='100%';img.style.margin='0';grid.append(img);
   }
   imgs.append(grid);article.append(imgs);
   const detail=document.createElement('details');const label=text('summary','Read full description and all 13 tags');detail.append(label);
   const description=text('pre',review.description);detail.append(description,text('p','Tags: '+review.tags));
   article.append(detail);
  }else if(live?.progress?.note){article.append(text('p',live.progress.note));}
  if(live?.phase==='needs_investigation')article.append(text('p','This item needs investigation. Do not start it again or recreate its Etsy draft.'));
  cards.append(article);
 }
}
async function prepareCollectionTrios(){
 const needed=state?.bundles?.length||0;
 if(!state||![3,4].includes(state.version)||!needed||state.storeOnly||state.bundlesOnly||state.trioIds?.length||preparingTrios)return;
 if(state.items.length!==needed*3)throw Error('Saved collection mode does not match poster count');
 if(!state.items.every((x,i)=>seen[i]?.phase==='published'&&x.id))return;
 preparingTrios=true;
 try{
  message('All '+state.items.length+' individual posters are published. Reserving '+needed+' trio collection reviews…');
  const submitted={
   items:state.items.map(x=>({id:x.id,sha256:x.sha256,folder:x.folder,listingTitle:x.listingTitle,sectionTitle:x.sectionTitle,printSizes:x.printSizes})),
   trios:state.bundles.map(b=>({title:b.title,listingTitle:b.listingTitle,sectionTitle:b.sectionTitle,size:b.size,
    members:b.members,tags:b.tags,description:b.description,framed:b.framed===true})),
   inputs:state.bundles.map(b=>b.input)
  };
  const result=await api('/poster/bulk/trios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(submitted)});
  if(result.ids?.length!==needed||result.skus?.length!==needed||result.skus.some(s=>!/^[A-Za-z0-9_-]{1,100}$/.test(s))||new Set(result.skus.map(s=>s.toLowerCase())).size!==needed)throw Error('Supplier bundle identities not confirmed. Inspect saved products before retrying');
  state.bundles.forEach((b,i)=>{b.input.sku=result.skus[i];});
  state.trioIds=result.ids;save();
 }finally{preparingTrios=false;}
}
async function showTrioReviews(){
 if(!trioReviews||!state?.trioIds?.length)return;
 const statuses=await Promise.all(state.trioIds.map(id=>api('/poster/uploads/'+id)));
 trioReviews.replaceChildren(text('h3',state.trioIds.length+' separate three-print Etsy collection listing'+(state.trioIds.length===1?'':'s')));
 let ready=0;
 for(let i=0;i<state.trioIds.length;i++){
  const b=state.bundles[i],r=statuses[i],card=document.createElement('article'),rev=r.review;
  card.append(text('h4','Trio '+(i+1)+': '+b.title));
  card.append(text('p','Includes: '+b.members.join(', ')+' · fixed '+b.size+' · PrintShrimp '+b.input.sku));
  card.append(text('p','Etsy title: '+(rev?.title||b.input.title)));
  card.append(text('p','Status: '+r.phase+(r.listingId?' · Etsy listing '+r.listingId:'')));
  const link=document.createElement('a');link.href='/poster/upload?id='+state.trioIds[i];link.textContent='Review this individual trio and all four images';card.append(link);
  if(rev){
   const details=document.createElement('details');details.append(text('summary','Read separate Etsy description and thirteen tags'));
   details.append(text('pre',rev.description),text('p','Tags: '+rev.tags));card.append(details);
   if(rev.quote)card.append(text('p','Customer price £'+rev.quote.grossGbp.toFixed(2)+' · Supplier cost £'+rev.quote.supplierCostGbp.toFixed(2)+' · Estimated UK contribution £'+rev.quote.contributionGbp.toFixed(2)));
   ready++;
  }
  trioReviews.append(card);
 }
 const all= statuses.every(x=>x&&['ready_for_approval','publishing','draft_verified','published'].includes(x.phase));
 const canDeploy=all&&statuses.some(x=>x.phase==='ready_for_approval');
 if(deployTrios){deployTrios.hidden=!canDeploy;deployTrios.disabled=!canDeploy||busy;}
 if(!all&&statuses.some(x=>['preparing','publishing'].includes(x.phase))){
  clearTimeout(pollHandle);pollHandle=setTimeout(()=>inspect().catch(e=>message(e.message)),9000);
 }
 if(statuses.every(x=>x.phase==='draft_verified'))message(state.items.length+' individual Etsy listings published; '+statuses.length+' trio draft'+(statuses.length===1?' is':'s are')+' verified but inactive.');
 else if(statuses.every(x=>x.phase==='published'))message((state.items.length+statuses.length)+' Etsy listings active. PrintShrimp order fulfilment still needs real-order testing.');
 else if(ready===statuses.length)message('Trio review'+(ready===1?' is':'s are')+' ready. Check the descriptions, costs and frame options.');
}
async function inspect(){
 if(!state)return;
 const results=await Promise.all(state.items.map(i=>i.id?api('/poster/uploads/'+i.id):Promise.resolve(null)));
 for(let n=0;n<results.length;n++){
  const next=results[n];
  if(next?.phase==='superseded'&&ID.test(next.supersededBy||'')){
   state.items[n].id=next.supersededBy;save();
   results[n]=await api('/poster/uploads/'+next.supersededBy);
  }
 }
 seen=results;
 if(state.bundles?.length&&results.every(r=>r?.phase==='published')&&!state.trioIds?.length&&!state.storeOnly&&!state.bundlesOnly)await prepareCollectionTrios();
 const ready=results.filter(r=>r?.phase==='ready_for_approval').length;
 const allReviewed=results.every(r=>r&&['ready_for_approval','publishing','published'].includes(r.phase));
 const allStored=results.every(r=>r?.phase==='stored');
 const canApprove=allReviewed&&ready>0;
 buildCards(results);
 drawOnly();
 if(state.bundles?.length&&state.trioIds?.length===state.bundles.length)await showTrioReviews();
 deploy.hidden=!canApprove||state.bundlesOnly===true;deploy.disabled=!canApprove||busy||state.bundlesOnly===true;
 deploy.textContent=ready===state.items.length?'Deploy all '+state.items.length+' approved posters':'Deploy remaining '+ready+' reviewed posters';
 if(state.bundlesOnly===true)message(state.trioIds?.length===2?'Only TWO bundle reviews reserved. No new singles were created.':'Bundles-only selected: verify six existing Etsy and PrintShrimp products. Do not deploy six singles.');
 else if(allStored)message('All '+state.items.length+' posters are stored privately. No Etsy listings were created or monthly slots used. Open Catalogue to publish later.');
 else if(canApprove)message('Check the remaining '+ready+' approved reviews, their titles, descriptions, 13 tags and four mockups. Previously accepted approvals will not be repeated.');
 else if(allReviewed)message('Publication is underway or complete. Check the individual listings below.');
 else if(results.some(r=>r?.phase==='needs_investigation'))message('An item needs investigation. Existing product IDs are retained. Do not re-create failed merchant listings.');
 else message('Collection saved. Preparation continues in GitHub. Keep this page open, or return to refresh progress.');
 if(results.some(r=>r?.phase==='preparing'||r?.phase==='publishing')){
  clearTimeout(pollHandle);pollHandle=setTimeout(()=>inspect().catch(e=>message(e.message)),8000);
 }
}
async function checkAll(archive){
 const hashes=[],unique=new Set();
 for(let i=0;i<archive.items.length;i++){
  message('Checking PNG integrity, print dimensions and SHA-256 '+(i+1)+'/'+archive.items.length+' (nothing uploaded)…');
  const file=await archive.artwork(archive.items[i]);
  // Bind every saved upload receipt to the artwork bytes, not just its ZIP name.
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  if(unique.has(hash))throw Error('The ZIP repeats identical artwork. Each poster must have distinct artwork.');
  hashes.push(hash);unique.add(hash);
 }
 return hashes;
}
async function uploadItem(item,file,index){
 if(item.creating&&!item.id)throw Error('Creation of poster '+(index+1)+' had an uncertain response. Inspect the dashboard before continuing; never create it twice.');
 if(!item.id){
  item.creating=true;save();
  message((state.storeOnly?'Storing':'Preparing')+' poster '+(index+1)+' of '+state.items.length+'…');
  const meta={name:item.title,etsyTitle:item.listingTitle,description:item.description,tags:item.tags.join(','),
   subject:item.title,kind:state.kind,sectionTitle:item.sectionTitle,websiteFolder:state.websiteFolder||'',printSizes:item.printSizes};
  const receipt=await api('/poster/uploads',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({filename:item.uploadFilename,bytes:file.size,type:'physical',metadata:meta,previewCount:0,storeOnly:state.storeOnly===true})});
  if(!validReceipt(receipt))throw Error('Uncertain new-product receipt. Stop and inspect the product dashboard.');
  item.id=receipt.id;item.chunkBytes=receipt.chunkBytes;item.creating=false;save();
 }
 const live=await api('/poster/uploads/'+item.id);
 if(live.phase!=='uploading'){
  if(['preparing','ready_for_approval','publishing','published','stored','needs_investigation'].includes(live.phase))return;
  throw Error('Product '+(index+1)+' has an unexpected state. Stop and inspect its individual page.');
 }
 const chunk=item.chunkBytes||2_000_000;
 for(let offset=0,n=0;offset<file.size;offset+=chunk,n++){
  await api('/poster/uploads/'+item.id+'/chunks/'+n,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:await file.slice(offset,Math.min(offset+chunk,file.size)).arrayBuffer()});
  message('Uploading poster '+(index+1)+'/'+state.items.length+' — '+Math.round(100*Math.min(offset+chunk,file.size)/file.size)+'%');
 }
 try{await api('/poster/uploads/'+item.id+'/finish',{method:'POST'});}
 catch(error){
  const status=await api('/poster/uploads/'+item.id);
  if(!['preparing','stored','ready_for_approval','publishing','published'].includes(status.phase))throw error;
 }
 item.phase=state.storeOnly?'stored':'preparing';save();
}
async function start(e){
 e.preventDefault();
 if(busy)return;
 busy=true;form.querySelector('button[type="submit"]').disabled=true;deploy.disabled=true;
 try{
  const mode=chosenMode();if(!modeChoices.includes(mode))throw Error('Select Individual poster, Singular trio or Six-pack before choosing a ZIP.');
  if(state?.uploadMode&&mode!==state.uploadMode)throw Error('An earlier upload type is saved. Do not overwrite its product receipts.');
  const file=form.elements.collection.files[0];
  if(!file||!file.name.toLowerCase().endsWith('.zip'))throw Error('Choose a ZIP matching the selected upload type.');
  const sig=signature(file);
  if(state&&state.signature!==sig)throw Error('A different collection is already saved in this browser. Finish or inspect it before starting another. To avoid duplicates, do not overwrite its receipts.');
  message('Reading ZIP and validating names, artwork and descriptions…');
  const archive=previewSignature===sig&&previewArchive&&previewArchive.mode===mode?previewArchive:await openPosterCollectionZip(file,{mode});
  if(!state&&archive.bundles.length&&previewSignature!==sig){showTrioFields(archive,sig);throw Error('Review the trio collection titles above, then submit again. Nothing has been uploaded yet.');}
  const collectionPlan=archive.bundles.length?inputPlans(archive):null;
  // Never reserve monthly slots or create merchant products for an unverified section.
  const shop=await api('/poster/bulk/sections');
  if(shop.phase!=='available'||!Array.isArray(shop.sections)||!shop.sections.length)throw Error('Verified Etsy shop sections unavailable. Run the catalogue audit and return here.');
  const allowed=new Set(shop.sections.map(x=>x.title));
  const selected=form.elements.shopSection?.value||'';
  if(selected&&!allowed.has(selected))throw Error('This shop section is no longer on Etsy. Refresh the catalogue before uploading.');
  for(const poster of archive.items){
   if(!allowed.has(poster.sectionTitle))throw Error('Section: '+poster.sectionTitle+' in '+poster.folder+'/details.md is not an existing Etsy shop section. Refresh the Etsy catalogue or correct the ZIP; no slots used.');
   if(selected&&poster.sectionTitle!==selected)throw Error('You selected '+selected+', but '+poster.folder+'/details.md specifies '+poster.sectionTitle+'. Update details.md or use the per-poster selection. No products started.');
  }
  if(!state){
   const quota=await api('/poster/bulk/status');
   const storeOnly=form.elements.storeOnly?.checked===true||quota.remaining<archive.listingCount;
   const artworkHashes=await checkAll(archive);
   state={version:4,uploadMode:mode,signature:sig,kind:form.elements.kind.value,selectedShopSection:selected,websiteFolder:form.elements.websiteFolder?.value||'',storeOnly,
    bundles:archive.bundles.map((b,i)=>({...b,framed:collectionPlan.bundleListings[i].framed===true,input:{sku:collectionPlan.bundleListings[i].sku,title:collectionPlan.bundleListings[i].listingTitle,discount:collectionPlan.bundleListings[i].discount}})),trioIds:[],
    items:archive.items.map((i,n)=>({filename:i.filename,folder:i.folder,title:i.title,listingTitle:i.listingTitle,sectionTitle:i.sectionTitle,description:i.description,tags:i.tags,printSizes:i.printSizes,sha256:artworkHashes[n],uploadFilename:collectionUploadFilename(i.title,artworkHashes[n]),id:null}))};save();
  }else{
   if(state.items.some((v,i)=>v.filename!==archive.items[i].filename||v.folder!==archive.items[i].folder||v.listingTitle!==archive.items[i].listingTitle||v.sectionTitle!==archive.items[i].sectionTitle||v.title!==archive.items[i].title||v.description!==archive.items[i].description||v.tags.join(',')!==archive.items[i].tags.join(',')||JSON.stringify(v.printSizes||['A5','A4','A3'])!==JSON.stringify(archive.items[i].printSizes)))
    throw Error('This ZIP differs from the saved collection. Do not reuse existing product receipts with different descriptions.');
   const artworkHashes=await checkAll(archive);
   if(state.bundles?.length&&JSON.stringify(state.bundles.map(b=>({...b,input:null,framed:false})))!==JSON.stringify(archive.bundles.map(b=>({...b,input:null,framed:false}))))
     throw Error('Trio descriptions, member assignments or tags changed since first upload; do not replace the saved eight-product collection.');
    if(state.items.some((v,i)=>v.sha256!==artworkHashes[i]))
    throw Error('Artwork differs from the original saved ZIP. Do not reuse an existing upload ID with changed images.');
  }
  for(let i=0;i<archive.items.length;i++){
   const item=state.items[i],live=item.id?await api('/poster/uploads/'+item.id):null;
   if(live&&live.phase!=='uploading')continue;
   const artwork=await archive.artwork(archive.items[i]);
   await uploadItem(item,artwork,i);
  }
  message(state.storeOnly?'All '+state.items.length+' posters are stored privately; no Etsy listing slots used.':state.items.length+' individual poster'+(state.items.length===1?'':'s')+' queued; '+state.bundles.length+' trio collection'+(state.bundles.length===1?'':'s')+' will be prepared after individual publication.');await inspect();
 }catch(err){message('Stopped safely: '+err.message+' All successfully started products are retained; check the product dashboard.');}
 finally{busy=false;form.querySelector('button[type="submit"]').disabled=false;
  if(!state?.bundlesOnly&&seen.every(r=>r&&['ready_for_approval','publishing','published'].includes(r.phase))&&seen.some(r=>r.phase==='ready_for_approval')){deploy.hidden=false;deploy.disabled=false;}
 }
}
// Recover the two Streak bundles using six *existing* published master records.
// The protected first call is read-only; the existing bundle route reserves
// exactly two new review records and is idempotent for identical six inputs.
const streakRecoveryButton=document.getElementById('streak-recover-two-trios');
const streakRecoveryStatus=document.getElementById('streak-trio-recovery-status');
streakRecoveryButton?.addEventListener('click',async()=>{
 if(busy)return;
 if(state?.trioIds?.length===2){
  streakRecoveryStatus.textContent='Two trio records are already saved. Opening existing reviews; no new records created.';
  await inspect().catch(e=>message('Cannot check the saved trio reviews: '+e.message));
  return;
 }
 busy=true;streakRecoveryButton.disabled=true;
 try{
  streakRecoveryStatus.textContent='Finding the five original posters and the existing published The Blame listing. No PNGs will be uploaded…';
  const recovered=await api('/poster/bulk/streak-trios/recover',{method:'POST'});
  if(recovered?.phase!=='recovered'||recovered.sourceCount!==6||recovered.bundleCount!==2||
     recovered.items?.length!==6||recovered.trios?.length!==2||recovered.inputs?.length!==2)
   throw Error('Exact six-poster Streak recovery is incomplete. No new bundles requested.');
  // A saved older Streak tab can reference the one failed original
  // upload for The Blame. Replace only that pointer, never other products.
  if(state?.items?.some(x=>x.id)){
   const oldBlame='kvKouwHsR_qX2JUa4tWaM7A9EyTbBUar';
   const otherIds=['MTLLSgqzYTFxW9ncjbnPumIzQGigHFon','lr8EJelnbwar0m88Ptoj0AvF7eA8FuQ2','YAOBgMka_vvvJ9St5M5X9J9NLZeUn_Lf','zmInOlFQGvzdiTbt2M7aQGflUbUIAgHp','WZdlBvUE-8IRIegj4Y9m9CMirYFPVH4b'];
   const same=state.items.length===6&&state.items.every((x,i)=>
    !x.id||x.id===recovered.items[i].id);
   const staleBlameOnly=state.version===3&&state.selectedShopSection==='Streak'&&
    state.items.length===6&&state.items[0]?.id===oldBlame&&
    recovered.blameListingId===4609470767&&
    otherIds.every((id,i)=>state.items[i+1]?.id===id&&recovered.items[i+1]?.id===id);
   if(!same&&!staleBlameOnly)
    throw Error('A different collection is saved in this browser tab. Open Streak in a fresh tab without re-uploading any posters.');
  }
  const quota=await api('/poster/bulk/status');
  if(quota.remaining<2)throw Error('Only '+quota.remaining+' monthly slots remain. The two bundle reviews require two free slots; your published singles remain unchanged.');
  streakRecoveryStatus.textContent='Six published, supplier-linked originals found. Reserving exactly two A4 trio reviews…';
  const request={
   items:recovered.items.map(({id,sha256,folder,listingTitle,sectionTitle,printSizes})=>({id,sha256,folder,listingTitle,sectionTitle,printSizes})),
   trios:recovered.trios.map(({title,listingTitle,sectionTitle,size,members,tags,description})=>({title,listingTitle,sectionTitle,size,members,tags,description})),
   inputs:recovered.inputs.map(({title,discount})=>({title,discount}))
  };
  const result=await api('/poster/bulk/trios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
  if(result.ids?.length!==2||result.skus?.length!==2)
   throw Error('Two distinct bundle receipts were not confirmed. Inspect saved records; never upload the singles again.');
  const recoveredState={
   version:3,signature:'streak-existing-six-20261103',kind:'artwork',
   selectedShopSection:'Streak',websiteFolder:'',storeOnly:false,
   bundles:recovered.trios.map((b,i)=>({...b,input:{title:recovered.inputs[i].title,discount:recovered.inputs[i].discount,sku:result.skus[i]}})),
   trioIds:result.ids,items:recovered.items.map(x=>({...x,id:x.id}))
  };
  state=recoveredState;
  save();
  streakRecoveryStatus.textContent='Two Streak bundle reviews are reserved using your existing six published posters. Nothing has been republished.'+(recovered.sourceDifferences?.length?' The currently published images for '+recovered.sourceDifferences.join(', ')+' differ from the original ZIP fingerprints; check the bundle previews before approval.':'');
  await inspect();
  message('Streak recovered: the six original listings are retained. Review the TWO new trio products below as their supplier quotes become available.');
 }catch(err){
  streakRecoveryStatus.textContent='Recovery stopped safely: '+err.message+' Do not re-upload the six existing posters.';
 }finally{busy=false;streakRecoveryButton.disabled=false;}
});

form?.addEventListener('submit',start);
deploy?.addEventListener('click',async()=>{
 if(busy||!state||state.bundlesOnly)return;busy=true;deploy.disabled=true;
 try{
  const fresh=await Promise.all(state.items.map(i=>api('/poster/uploads/'+i.id)));
  if(!fresh.every((r,n)=>
   r.phase==='ready_for_approval'&&r.review?.approvalHash===seen[n]?.review?.approvalHash||
   ['publishing','published'].includes(r.phase)&&['publishing','published'].includes(seen[n]?.phase)))
   throw Error('One review changed or is no longer available. Refresh the collection before approving.');
  const count=fresh.filter(r=>r.phase==='ready_for_approval').length;
  if(!count)return;
  if(!confirm('Deploy '+count+' reviewed posters to Etsy and PrintShrimp? Up to '+count+' new listing fees may apply. Already accepted approvals will be skipped. Automatic customer orders remain off.'))return;
  for(let n=0;n<state.items.length;n++){
   if(fresh[n].phase!=='ready_for_approval')continue;
   const item=state.items[n],review=fresh[n].review;
   message('Approving product '+(n+1)+' of '+state.items.length+'…');
   const result=await api('/poster/uploads/'+item.id+'/approve',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
    body:new URLSearchParams({csrf,approvalHash:review.approvalHash})});
   if(result.phase!=='publishing')throw Error('Approval not confirmed for '+item.filename+'; inspect its individual product before retrying.');
   item.phase='publishing';seen[n]={...seen[n],phase:'publishing'};save();
  }
  message('All '+count+' exact reviews were approved. Etsy and PrintShrimp processing is queued. Check each saved product for final publication status.');
  await inspect();
 }catch(err){
  try{await inspect();}catch{/* Offline or expired session; retain all product IDs. */}
  message('Approval stopped safely: '+err.message+' Earlier accepted approvals remain retained. Inspect current records; use Deploy remaining only for still-ready products.');
 }
 finally{busy=false;
  if(!state?.bundlesOnly&&seen.every(r=>r&&['ready_for_approval','publishing','published'].includes(r.phase))&&seen.some(r=>r.phase==='ready_for_approval')){deploy.hidden=false;deploy.disabled=false;}
 }
});

const only=document.getElementById('bulk-woodland-exception'),onlyRecover=document.getElementById('bulk-only-recover'),
 onlyRecoveryStatus=document.getElementById('bulk-only-recovery-status'),onlySwitch=document.getElementById('bulk-only-switch'),
 onlyPrepare=document.getElementById('bulk-only-prepare'),onlyJobStatus=document.getElementById('bulk-only-job-status'),onlyResume=document.getElementById('bulk-only-resume');
const animalSlugs=['fox','robin','hedgehog','badger','red-squirrel','roe-deer'];
let checkingWoodlandJob=false;
function woodlandOneOffReady(){
 if(state?.version!==3||state.items?.length!==6||state.bundles?.length!==2)return false;
 const all=state.items.map(x=>String(x.folder||'').split('/').at(-1));
 return animalSlugs.every(x=>all.includes(x))&&new Set(all).size===6&&state.items.every(x=>ID.test(x.id||''));
}
function drawOnly(){
 if(!only)return;
 only.hidden=false;
 const ready=woodlandOneOffReady();
 onlyRecover.hidden=ready;
 onlySwitch.hidden=!ready||state.bundlesOnly===true;
 onlyPrepare.hidden=!ready||state.bundlesOnly!==true||state.trioIds?.length===2;
 onlyPrepare.disabled=!!state?.woodlandRequestId;
 if(ready&&state.bundlesOnly===true){deploy.hidden=true;deploy.disabled=true;}
}

onlyRecover?.addEventListener('click',async()=>{
 if(busy)return;
 if(woodlandOneOffReady()){
  drawOnly();onlyRecoveryStatus.textContent='Six verified original reviews are already loaded. Prepare the TWO bundles below.';
  return;
 }
 if(state){
  onlyRecoveryStatus.textContent='A different upload session is already saved in this tab. Your existing records are safe; open this page in another tab to recover Woodland without replacing the current session.';
  return;
 }
 busy=true;onlyRecover.disabled=true;
 try{
  onlyRecoveryStatus.textContent='Checking the six original Canva hashes against existing saved product reviews. Nothing will be re-uploaded.';
  const response=await api('/poster/bulk/woodland-existing/recover');
  if(response.phase!=='recovered'||response.originalsVerified!==true||response.state?.items?.length!==6||response.state.bundlesOnly!==true){
   onlyRecoveryStatus.textContent='Recovery on HOLD: '+(response.message||'Not all six original reviews were found.')+' No new products have been created.';
   return;
  }
  state=response.state;
  save();drawOnly();
  if(form?.elements?.kind)form.elements.kind.value='artwork';
  onlyRecoveryStatus.textContent='Six saved original reviews recovered. Only TWO new bundles are permitted in this setup. The two-bundle option is now available below.';
  await inspect();
 }catch(error){
  onlyRecoveryStatus.textContent='Recovery unavailable: '+error.message+'. Your saved records have not been changed.';
 }finally{busy=false;onlyRecover.disabled=false;}
});

onlySwitch?.addEventListener('click',()=>{
 if(!woodlandOneOffReady()||busy||state.trioIds?.length)return;
 if(seen.some(x=>x&&['publishing','published'].includes(x.phase))){message('An individual may already have been published. Inspect the saved product before switching.');return;}
 if(!confirm('ONE-OFF WOODLAND SETUP: create only TWO bundle drafts from six existing Etsy and PrintShrimp products? No new singles will be published.'))return;
 state.bundlesOnly=true;save();drawOnly();
 message('Bundles-only selected. The authenticated worker will verify the three existing Etsy singles and the six PrintShrimp artwork records.');
});

async function pollWoodlandSetup(){
 if(!state?.woodlandRequestId||checkingWoodlandJob)return;
 checkingWoodlandJob=true;
 try{
  for(let count=0;count<40;count++){
   const r=await api('/poster/bulk/woodland-existing/status?'+new URLSearchParams({id:state.woodlandRequestId}));
   const stage=r.stage?(' · '+r.stage.replaceAll('_',' ')):'';
   onlyJobStatus.textContent='Two bundles: '+r.phase.replaceAll('_',' ')+stage+'. '+(r.notice||'');
   if(r.phase==='ready_for_review'){
    if(r.ids?.length!==2||r.skus?.length!==2)throw Error('Two reviews did not pass identity checks');
    state.trioIds=[...r.ids];
    state.bundles.forEach((b,i)=>{b.input.sku=r.skus[i];});
    save();drawOnly();await inspect();return;
   }
   if(['needs_investigation','dispatch_uncertain'].includes(r.phase)){
    onlyJobStatus.textContent='HOLD: '+(r.notice||'Existing product requires review')+'. No individual listings were requested.';
    onlyResume.hidden=!(r.phase==='needs_investigation'&&r.stage==='stopped_safely'&&!(r.ids||[]).length);
    return;
   }
   await pause(6000);
  }
  onlyJobStatus.textContent='Worker is still processing. Refresh this page to resume status; do not reupload or create another setup.';
 }catch(error){onlyJobStatus.textContent='Status check interrupted: '+error.message+'. Saved IDs remain retained.';}
 finally{checkingWoodlandJob=false;}
}
onlyPrepare?.addEventListener('click',async()=>{
 if(busy||!woodlandOneOffReady()||!state.bundlesOnly||state.trioIds?.length===2||state.woodlandRequestId)return;
 if(!confirm('Prepare ONLY TWO three-print bundle reviews? The worker may register the three missing PrintShrimp artworks, reusing existing Fox/Robin/Hedgehog products. No individual Etsy listings or paid orders will be created.'))return;
 busy=true;onlyPrepare.disabled=true;
 try{
  const data={existingOnly:true,confirmed:true,
   items:state.items.map(x=>({id:x.id,sha256:x.sha256,folder:x.folder,listingTitle:x.listingTitle,sectionTitle:x.sectionTitle,printSizes:x.printSizes})),
   trios:state.bundles.map(x=>({title:x.title,listingTitle:x.listingTitle,sectionTitle:x.sectionTitle,size:x.size,members:x.members,tags:x.tags,description:x.description})),
   inputs:state.bundles.map(x=>x.input)};
  const result=await api('/poster/bulk/woodland-existing/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(!/^[a-f0-9]{32}$/.test(result.id||''))throw Error('No verifiable setup reservation receipt');
  state.woodlandRequestId=result.id;save();drawOnly();
  onlyResume.hidden=true;
  onlyJobStatus.textContent='One authenticated worker request saved. No six-poster publication.';
  await pollWoodlandSetup();
 }catch(error){onlyJobStatus.textContent='Two-bundle setup stopped: '+error.message+'. Check saved product IDs before retrying.';}
 finally{busy=false;onlyPrepare.disabled=!!state?.woodlandRequestId;}
});

onlyResume?.addEventListener('click',async()=>{
 if(!state?.woodlandRequestId||busy||checkingWoodlandJob)return;
 if(!confirm('Resume the SAME saved two-bundle request? The site checks there are no supplier registrations or bundle reservations first. It will refuse any unsafe retry.'))return;
 busy=true;onlyResume.disabled=true;
 try{
  const data=await api('/poster/bulk/woodland-existing/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:state.woodlandRequestId})});
  onlyJobStatus.textContent=(data.notice||'Worker state '+data.phase)+'. No six-individual publication.';
  onlyResume.hidden=true;
  if(data.phase==='queued')await pollWoodlandSetup();
 }catch(error){onlyJobStatus.textContent='Recovery blocked: '+error.message+'. Nothing else was created.';}
 finally{busy=false;onlyResume.disabled=false;}
});
state=read();
drawOnly();
if(state?.woodlandRequestId)pollWoodlandSetup().catch(()=>{});
if(state?.uploadMode&&form?.elements?.uploadMode)form.elements.uploadMode.value=state.uploadMode;
else if(state?.version===3&&state.items?.length===6&&form?.elements?.uploadMode)form.elements.uploadMode.value='eight-listings';
showSelectedMode();
if(state&&form?.elements?.websiteFolder)form.elements.websiteFolder.value=state.websiteFolder||'';
if(state&&form?.elements?.storeOnly)form.elements.storeOnly.checked=state.storeOnly===true;
if(state&&form?.elements?.shopSection){
 const chosen=state.selectedShopSection||'';
 if([...form.elements.shopSection.options].some(x=>x.value===chosen))form.elements.shopSection.value=chosen;
}
if(state&&(![2,3,4].includes(state.version)||(state.items.length<BULK_MIN_COUNT||state.items.length>BULK_MAX_COUNT))){
 busy=true;form.querySelector('button[type="submit"]').disabled=true;deploy.hidden=true;
 buildCards();
 message('Your saved legacy collection is retained. New uploads use 1, 3 or 6 folders. Open saved product links to complete existing work; do not upload again.');
}else if(state){
 message('Saved '+state.items.length+'-poster collection found. Re-select the SAME ZIP if upload is incomplete, or wait for the existing product reviews.');
 inspect().catch(e=>message('Could not load saved collection status: '+e.message));
}

deployTrios?.addEventListener('click',async()=>{
 if(busy||!state?.trioIds?.length||state.trioIds.length!==state.bundles?.length)return;
 busy=true;deployTrios.disabled=true;
 try{
  const live=await Promise.all(state.trioIds.map(id=>api('/poster/uploads/'+id)));
  if(!live.every(r=>['ready_for_approval','publishing','published'].includes(r.phase)))throw Error('Trio review still preparing; wait for both exact prices and images');
  const pending=live.filter(r=>r.phase==='ready_for_approval');
  if(!pending.length)return;
  if(!confirm('Deploy '+pending.length+' reviewed three-print collection listing(s) to Etsy? Each has its own supplier bundle SKU and priced listing. No PrintShrimp order is created.'))return;
  for(let i=0;i<state.trioIds.length;i++){
   if(live[i].phase!=='ready_for_approval')continue;
   const r=await api('/poster/uploads/'+state.trioIds[i]+'/approve',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
    body:new URLSearchParams({csrf,approvalHash:live[i].review.approvalHash})});
   if(r.phase!=='publishing')throw Error('Trio '+(i+1)+' approval needs investigation; do not recreate it');
  }
  message(pending.length+' trio collection listing'+(pending.length===1?'':'s')+' queued; awaiting Etsy IDs and supplier read-back.');
  await inspect();
 }catch(error){message('Trio publication stopped safely: '+error.message+' Existing records are retained.');}
 finally{busy=false;deployTrios.disabled=false;}
});
