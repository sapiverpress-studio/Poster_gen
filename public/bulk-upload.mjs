import {openPosterCollectionZip,collectionUploadFilename,BULK_MIN_COUNT,BULK_MAX_COUNT} from './bulk-zip.mjs';
import {makeEightListingPlan} from './collection-trios.mjs';

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
 try{const v=JSON.parse(sessionStorage.getItem(KEY)||'null');return [1,2,3].includes(v?.version)&&(v.items?.length>=BULK_MIN_COUNT&&v.items?.length<=BULK_MAX_COUNT||v.items?.length===8)&&v.items.every(i=>typeof i.filename==='string'&&(!i.id||ID.test(i.id)))?v:null;}catch{return null;}
}
function message(value){status.textContent=value;}
let previewSignature='',previewArchive=null,preparingTrios=false;
function trioInput(n,key){return form?.elements?.namedItem('trio'+n+key);}
function showTrioFields(archive,signature){
 previewArchive=archive;previewSignature=signature;trioForm?.replaceChildren();
 if(!archive.bundles?.length){return;}
 const heading=text('h3','This ZIP contains 8 Etsy listings: six individual posters and two different sets of three.');
 trioForm.append(heading,text('p','The two sets will each have their own Etsy title, description, 13 tags, fixed print size and PrintShrimp SKU. All three prints in a set are unframed.'));
 for(let i=0;i<2;i++){
  const b=archive.bundles[i],n=i+1,fieldset=document.createElement('fieldset');
  const legend=text('legend','Trio '+n+': '+b.title);
  fieldset.append(legend,text('p','Includes: '+b.members.join(', ')+' · '+b.size+' · '+b.sectionTitle));
  const skuLabel=document.createElement('label');skuLabel.append(text('span','PrintShrimp bundle SKU '+n+' (required)'));
  const sku=document.createElement('input');sku.name='trio'+n+'Sku';sku.required=true;sku.maxLength=100;sku.pattern='[A-Za-z0-9_-]{1,100}';sku.autocomplete='off';
  sku.placeholder='SP-COLLECTION-'+n;sku.value=state?.bundles?.[i]?.input?.sku||'';skuLabel.append(sku);fieldset.append(skuLabel);
  const titleLabel=document.createElement('label');titleLabel.append(text('span','Etsy listing title '+n));
  const title=document.createElement('input');title.name='trio'+n+'Title';title.required=true;title.maxLength=140;
  title.value=state?.bundles?.[i]?.input?.title||b.listingTitle;titleLabel.append(title);fieldset.append(titleLabel);
  const discountLabel=document.createElement('label');discountLabel.append(text('span','Discount from the three live individual print prices'));
  const discount=document.createElement('select');discount.name='trio'+n+'Discount';
  for(const pct of [0,10,15]){const option=document.createElement('option');option.value=String(pct);option.textContent=pct+'%';if(Number(state?.bundles?.[i]?.input?.discount??15)===pct)option.selected=true;discount.append(option);}
  discountLabel.append(discount);fieldset.append(discountLabel);
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
  message('Validating six artworks and two different trio descriptions…');
  const archive=await openPosterCollectionZip(file,{allowLegacySix:state?.version===2});
  showTrioFields(archive,signature(file));
  message(archive.listingCount===8?'Eight products detected: six individual posters and two separate three-print sets. Check both SKU fields and titles before uploading.':archive.items.length+' individual posters detected.');
 }catch(error){previewArchive=null;previewSignature='';trioForm?.replaceChildren();message('ZIP rejected: '+error.message+'. No products created.');}
}
form?.elements?.collection?.addEventListener('change',()=>{onZipChosen().catch(e=>message(e.message));});
function inputPlans(archive){
 if(!archive.bundles.length)return null;
 const inputs=archive.bundles.map((_,i)=>({sku:trioInput(i+1,'Sku')?.value?.trim(),title:trioInput(i+1,'Title')?.value?.trim(),discount:Number(trioInput(i+1,'Discount')?.value)}));
 return makeEightListingPlan({items:archive.items,trios:archive.bundles,inputs});
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
async function prepareTwoTrios(){
 if(!state||state.version!==3||state.storeOnly||state.trioIds?.length===2||preparingTrios)return;
 if(!state.items.every((x,i)=>seen[i]?.phase==='published'&&x.id))return;
 preparingTrios=true;
 try{
  message('All six single posters are published. Reserving two separate supplier-bundle reviews…');
  const submitted={
   items:state.items.map(x=>({id:x.id,sha256:x.sha256,folder:x.folder,listingTitle:x.listingTitle,sectionTitle:x.sectionTitle,printSizes:x.printSizes})),
   trios:state.bundles.map(b=>({title:b.title,listingTitle:b.listingTitle,sectionTitle:b.sectionTitle,size:b.size,
    members:b.members,tags:b.tags,description:b.description})),
   inputs:state.bundles.map(b=>b.input)
  };
  const result=await api('/poster/bulk/trios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(submitted)});
  if(result.ids?.length!==2)throw Error('Two bundle records were not confirmed');
  state.trioIds=result.ids;save();
 }finally{preparingTrios=false;}
}
async function showTrioReviews(){
 if(!trioReviews||!state?.trioIds?.length)return;
 const statuses=await Promise.all(state.trioIds.map(id=>api('/poster/uploads/'+id)));
 trioReviews.replaceChildren(text('h3','Two distinct three-print collection listings'));
 let ready=0;
 for(let i=0;i<2;i++){
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
 const all= statuses.every(x=>x&&['ready_for_approval','publishing','published'].includes(x.phase));
 const canDeploy=all&&statuses.some(x=>x.phase==='ready_for_approval');
 if(deployTrios){deployTrios.hidden=!canDeploy;deployTrios.disabled=!canDeploy||busy;}
 if(!all&&statuses.some(x=>['preparing','publishing'].includes(x.phase))){
  clearTimeout(pollHandle);pollHandle=setTimeout(()=>inspect().catch(e=>message(e.message)),9000);
 }
 if(statuses.every(x=>x.phase==='published'))message('Complete: eight Etsy listings verified — six individual prints and two separate three-print bundles.');
 else if(ready===2)message('Both trio-specific Etsy reviews are ready. Check their different descriptions, tags and supplier costs before deploying.');
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
 if(state.version===3&&results.every(r=>r?.phase==='published')&&!state.trioIds?.length&&!state.storeOnly)await prepareTwoTrios();
 const ready=results.filter(r=>r?.phase==='ready_for_approval').length;
 const allReviewed=results.every(r=>r&&['ready_for_approval','publishing','published'].includes(r.phase));
 const allStored=results.every(r=>r?.phase==='stored');
 const canApprove=allReviewed&&ready>0;
 buildCards(results);
 if(state.version===3&&state.trioIds?.length===2)await showTrioReviews();
 deploy.hidden=!canApprove;deploy.disabled=!canApprove||busy;
 deploy.textContent=ready===state.items.length?'Deploy all '+state.items.length+' approved posters':'Deploy remaining '+ready+' reviewed posters';
 if(allStored)message('All '+state.items.length+' posters are stored privately. No Etsy listings were created or monthly slots used. Open Catalogue to publish later.');
 else if(canApprove)message('Check the remaining '+ready+' approved reviews, their titles, descriptions, 13 tags and four mockups. Previously accepted approvals will not be repeated.');
 else if(allReviewed)message('Publication is underway or complete. Check the individual listings below.');
 else if(results.some(r=>r?.phase==='needs_investigation'))message('An item needs investigation. Existing product IDs are retained. Do not re-create failed merchant listings.');
 else message('Collection saved. Preparation continues in GitHub. Keep this page open, or return to refresh progress.');
 if(!allReviewed&&results.some(r=>r?.phase==='preparing'||r?.phase==='publishing')){
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
  const file=form.elements.collection.files[0];
  if(!file||!file.name.toLowerCase().endsWith('.zip'))throw Error('Choose a ZIP containing 2 to 6 posters.');
  const sig=signature(file);
  if(state&&state.signature!==sig)throw Error('A different collection is already saved in this browser. Finish or inspect it before starting another. To avoid duplicates, do not overwrite its receipts.');
  message('Reading ZIP and validating names, artwork and descriptions…');
  const archive=previewSignature===sig&&previewArchive?previewArchive:await openPosterCollectionZip(file,{allowLegacySix:state?.version===2});
  if(!state&&archive.bundles.length&&previewSignature!==sig){showTrioFields(archive,sig);throw Error('Check both bundle SKUs and titles above, then submit again. Nothing has been uploaded yet.');}
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
   state={version:archive.bundles.length?3:2,signature:sig,kind:form.elements.kind.value,selectedShopSection:selected,websiteFolder:form.elements.websiteFolder?.value||'',storeOnly,
    bundles:archive.bundles.map((b,i)=>({...b,input:{sku:collectionPlan.bundleListings[i].sku,title:collectionPlan.bundleListings[i].listingTitle,discount:collectionPlan.bundleListings[i].discount}})),trioIds:[],
    items:archive.items.map((i,n)=>({filename:i.filename,folder:i.folder,title:i.title,listingTitle:i.listingTitle,sectionTitle:i.sectionTitle,description:i.description,tags:i.tags,printSizes:i.printSizes,sha256:artworkHashes[n],uploadFilename:collectionUploadFilename(i.title,artworkHashes[n]),id:null}))};save();
  }else{
   if(state.items.some((v,i)=>v.filename!==archive.items[i].filename||v.folder!==archive.items[i].folder||v.listingTitle!==archive.items[i].listingTitle||v.sectionTitle!==archive.items[i].sectionTitle||v.title!==archive.items[i].title||v.description!==archive.items[i].description||v.tags.join(',')!==archive.items[i].tags.join(',')||JSON.stringify(v.printSizes||['A5','A4','A3'])!==JSON.stringify(archive.items[i].printSizes)))
    throw Error('This ZIP differs from the saved collection. Do not reuse existing product receipts with different descriptions.');
   const artworkHashes=await checkAll(archive);
   if(state.version===3&&JSON.stringify(state.bundles.map(b=>({...b,input:null})))!==JSON.stringify(archive.bundles.map(b=>({...b,input:null}))))
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
  message(state.storeOnly?'The six originals are safely stored privately; no listing slots used.':'Six individual posters queued; the two separate trio products will be prepared once all six have been published.');await inspect();
 }catch(err){message('Stopped safely: '+err.message+' All successfully started products are retained; check the product dashboard.');}
 finally{busy=false;form.querySelector('button[type="submit"]').disabled=false;
  if(seen.every(r=>r&&['ready_for_approval','publishing','published'].includes(r.phase))&&seen.some(r=>r.phase==='ready_for_approval')){deploy.hidden=false;deploy.disabled=false;}
 }
}
form?.addEventListener('submit',start);
deploy?.addEventListener('click',async()=>{
 if(busy||!state)return;busy=true;deploy.disabled=true;
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
  if(seen.every(r=>r&&['ready_for_approval','publishing','published'].includes(r.phase))&&seen.some(r=>r.phase==='ready_for_approval')){deploy.hidden=false;deploy.disabled=false;}
 }
});
state=read();
if(state&&form?.elements?.websiteFolder)form.elements.websiteFolder.value=state.websiteFolder||'';
if(state&&form?.elements?.storeOnly)form.elements.storeOnly.checked=state.storeOnly===true;
if(state&&form?.elements?.shopSection){
 const chosen=state.selectedShopSection||'';
 if([...form.elements.shopSection.options].some(x=>x.value===chosen))form.elements.shopSection.value=chosen;
}
if(state&&(![2,3].includes(state.version)||(state.items.length<BULK_MIN_COUNT||state.items.length>BULK_MAX_COUNT))){
 busy=true;form.querySelector('button[type="submit"]').disabled=true;deploy.hidden=true;
 buildCards();
 message('Your saved legacy collection is retained. New collections use 2 to 6 folders with poster.png and details.md. Open the individual product links below or the saved-products dashboard to finish existing work; do not upload it again.');
}else if(state){
 message('Saved '+state.items.length+'-poster collection found. Re-select the SAME ZIP if upload is incomplete, or wait for the existing product reviews.');
 inspect().catch(e=>message('Could not load saved collection status: '+e.message));
}

deployTrios?.addEventListener('click',async()=>{
 if(busy||!state?.trioIds||state.trioIds.length!==2)return;
 busy=true;deployTrios.disabled=true;
 try{
  const live=await Promise.all(state.trioIds.map(id=>api('/poster/uploads/'+id)));
  if(!live.every(r=>['ready_for_approval','publishing','published'].includes(r.phase)))throw Error('Trio review still preparing; wait for both exact prices and images');
  const pending=live.filter(r=>r.phase==='ready_for_approval');
  if(!pending.length)return;
  if(!confirm('Deploy '+pending.length+' reviewed supplier bundle listings to Etsy? Each trio has its own title, description, three SKUs and quoted profit. Up to '+pending.length+' new Etsy listing fees apply. No paid PrintShrimp order is created.'))return;
  for(let i=0;i<2;i++){
   if(live[i].phase!=='ready_for_approval')continue;
   const r=await api('/poster/uploads/'+state.trioIds[i]+'/approve',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
    body:new URLSearchParams({csrf,approvalHash:live[i].review.approvalHash})});
   if(r.phase!=='publishing')throw Error('Trio '+(i+1)+' approval needs investigation; do not recreate it');
  }
  message('Both distinct trio listings have been approved and queued; waiting for Etsy IDs and supplier read-back.');
  await inspect();
 }catch(error){message('Trio publication stopped safely: '+error.message+' Existing records are retained.');}
 finally{busy=false;deployTrios.disabled=false;}
});
