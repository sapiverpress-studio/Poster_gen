const csrf=document.querySelector('meta[name="poster-csrf"]')?.content,status=document.getElementById('upload-status'),form=document.getElementById('poster-upload-form'),configure=document.getElementById('product-configure-form');
const SESSION_ERROR='Your product-studio session has expired. Reopen the studio, then retry. Saved uploads are retained.';
async function api(path,options={}){
 const method=options.method||'GET',safe=method==='GET'||method==='PUT';
 let response;
 for(let attempt=0;attempt<(safe?3:1);attempt++){
  try{response=await fetch(path,{...options,credentials:'same-origin',headers:{...options.headers,'X-Poster-CSRF':csrf}});break;}
  catch{
   if(safe&&attempt<2){await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));continue;}
   const stage=path.includes('/chunks/')?'sending artwork':path.endsWith('/finish')?'submitting preparation':path==='/poster/uploads'?'starting the upload':'checking saved progress';
   throw Error('Connection interrupted while '+stage+'. '+(path==='/poster/uploads'?'Check the product dashboard before starting again; the upload may have been created.':'Your saved upload is retained. Keep this page open and retry Prepare my product to check its status.'));
  }
 }
 if(response.status===429)throw Error('Too many upload requests. Keep this page open, wait three minutes, then retry Prepare my product.');
 if(response.status>=500)throw Error('The product service is temporarily unavailable. Your saved progress is retained. Check the product dashboard before retrying.');
 if(response.status===401||(response.redirected&&/\/poster\/workflow(?:[?#]|$)/.test(response.url||'')))throw Error(SESSION_ERROR);
 let body;try{body=await response.json();}catch{throw Error('The product service did not return upload data. Check saved progress before retrying.');}
 if(!response.ok)throw Error(body?.error||'Request failed. Check saved product status before retrying.');
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('The product service returned invalid upload data. Check saved progress before retrying.');
 return body;
}
function validUploadReceipt(upload){return upload&&/^[A-Za-z0-9_-]{32}$/.test(upload.id||'')&&['uploading','preparing'].includes(upload.phase)&&Number.isSafeInteger(upload.chunkBytes)&&upload.chunkBytes>0&&upload.chunkBytes<=2_000_000;}
function metadata(f){return {useEmbeddedText:f.elements.useEmbeddedText?.checked===true,name:f.elements.name.value,description:f.elements.description?.value||'',subject:f.elements.subject.value,etsyTitle:f.elements.etsyTitle?.value||'',kind:f.elements.kind.value,sectionTitle:f.elements.sectionTitle?.value,printSizes:f.elements.printSizes?.value.split(',')||undefined,websiteFolder:f.elements.websiteFolder?.value||'',price:f.elements.price.value,licence:f.elements.licence.value,instructions:f.elements.instructions.value,tags:f.elements.tags.value,taxonomyId:f.elements.taxonomyId.value,seamlessConfirmed:f.elements.seamlessConfirmed.checked};}
function showType(f,type){const supplierStep=document.getElementById('physical-fulfilment-step');if(supplierStep)supplierStep.hidden=type==='digital';f.querySelectorAll('[data-digital]').forEach(e=>{e.hidden=type!=='digital';e.querySelectorAll('input,textarea').forEach(i=>i.disabled=type!=='digital');});f.querySelectorAll('[data-physical]').forEach(e=>e.hidden=type!=='physical');const options=[...f.elements.kind.options];options.forEach(o=>{o.hidden=o.dataset.type!==type;o.disabled=o.hidden;});if(f.elements.kind.selectedOptions[0]?.disabled)f.elements.kind.value=options.find(o=>!o.disabled).value;const kindLabel=document.getElementById('poster-kind-label');if(kindLabel)kindLabel.textContent=type==='physical'?'Poster type':'Product group';if(f.elements.poster)f.elements.poster.accept=type==='digital'?'.zip':'.png';}
function bindSectionGuidance(f){
 const select=f?.elements.sectionTitle,note=document.getElementById('print-section-description');
 if(!select||!note)return;
 const update=()=>{note.textContent=select.selectedOptions[0]?.dataset.description||'';};
 select.addEventListener('change',update);update();
}
bindSectionGuidance(form);bindSectionGuidance(configure);
async function readArtworkChunk(file,start,end){
 try{return await file.slice(start,end).arrayBuffer();}
 catch{throw Error('The phone could not read the selected file. Download it to this device, then choose it again from Downloads. Keep your product details; any saved upload is retained.');}
}
if(form){showType(form,form.elements.type.value);form.elements.type.addEventListener('change',()=>showType(form,form.elements.type.value));}
const refresh=document.getElementById('refresh-etsy-catalog'),catalogStatus=document.getElementById('catalog-status'),catalogAuth=document.getElementById('catalog-auth-note');
const catalogueMessages={
 pending:'Etsy API check queued. Waiting for the GitHub worker; this page checks again automatically.',
 available:'Etsy API connection checked. Select an Etsy physical listing below; its twelve variations will be validated during preparation.',
 empty:'Etsy is connected. Prepare your first print using your saved shop settings; no previous listing is required.',
 seller_consent_required:'The Etsy developer keys exist, but seller approval is missing. Authorise the existing SapiverPrints app once.',
 seller_consent_invalid:'Your saved Etsy seller authorisation is invalid. Renew approval for the existing SapiverPrints app.',
 seller_refresh_error:'Etsy seller token renewal failed. The saved authorisation requires review.',
 etsy_api_unavailable:'Etsy API listing retrieval failed. The existing seller connection needs investigation.',
 worker_delayed:'The GitHub worker has not confirmed this Etsy check after ten minutes. You can retry the read-only check; no poster was uploaded.',
 worker_finished_no_result:'The GitHub worker marked the Etsy check complete but the result is missing. We need to repair the worker result transfer; do not upload a poster yet.',
 worker_failed:'The GitHub worker could not complete the Etsy API check. Your poster is unchanged; inspect the worker report before retrying.',
 not_checked:'Etsy API connection has not been checked yet.'
};
let catalogCheckInFlight=false;
async function checkCatalog(){
 if(!catalogStatus||catalogCheckInFlight)return;
 catalogCheckInFlight=true;
 try{
  const result=await api('/poster/catalog/status'),phase=result.phase||'not_checked';
  catalogStatus.dataset.phase=phase;catalogStatus.textContent=catalogueMessages[phase]||'Etsy catalogue status unavailable.';
  if(catalogAuth)catalogAuth.hidden=!['seller_consent_required','seller_consent_invalid','seller_refresh_error'].includes(phase);
  if(refresh)refresh.disabled=phase==='pending';
  // Populate choices without reloading the page and losing the selected Canva file or typed listing details.
  const select=form?.elements?.referenceListingId;
  if(select&&Array.isArray(result.listings)){
   const existing=new Set([...select.options].map(o=>o.value));
   for(const listing of result.listings){
    if(!Number.isSafeInteger(listing.id)||listing.id<=0||existing.has(String(listing.id)))continue;
    const option=document.createElement('option');option.value=String(listing.id);option.textContent=String(listing.title||'Etsy reference');select.appendChild(option);existing.add(option.value);
   }
  }
  if(phase==='pending')setTimeout(checkCatalog,20000);
 }catch{catalogStatus.textContent='Cannot check Etsy status right now. Your original artwork has not been uploaded.';if(refresh)refresh.disabled=false;}
 finally{catalogCheckInFlight=false;}
}
if(catalogStatus){
 checkCatalog();
 document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)checkCatalog();});
}
if(refresh)refresh.addEventListener('click',async()=>{
 refresh.disabled=true;
 try{const result=await api('/poster/catalog/refresh',{method:'POST'});if(catalogStatus){catalogStatus.dataset.phase='pending';catalogStatus.textContent=result.message||catalogueMessages.pending;}setTimeout(checkCatalog,1500);}
 catch(error){if(catalogStatus)catalogStatus.textContent=error.message;refresh.disabled=false;}
});
if(configure){const type=configure.elements.kind.selectedOptions[0].dataset.type;showType(configure,type);configure.addEventListener('submit',async event=>{event.preventDefault();const button=configure.querySelector('button');button.disabled=true;try{const result=await api('/poster/uploads/'+configure.dataset.upload+'/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({metadata:metadata(configure)})});location.assign('/poster/upload?id='+result.id);}catch(error){status.textContent=error.message;button.disabled=false;}});}
async function previewJpeg(file){if(!['image/png','image/jpeg'].includes(file.type)||file.size>20_000_000)throw Error('Use PNG/JPG previews under 20 MB.');const bitmap=await createImageBitmap(file),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));if(!blob||blob.size>2_000_000)throw Error('Preview could not be prepared.');return blob;}
if(form)form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button[type="submit"]')||form.querySelector('button:not([type="button"])');button.disabled=true;try{
 const type=form.elements.type.value,file=form.elements.poster.files[0],maximum=type==='digital'?100_000_000:50_000_000,updateProductId=form.dataset.update||null;
 if(!file&&!updateProductId)throw Error('Choose your finished file.');if(file&&(file.size>maximum||!file.name.toLowerCase().endsWith(type==='digital'?'.zip':'.png')))throw Error(type==='digital'?'Choose a ZIP no larger than 100 MB.':'Choose a PNG no larger than 50 MB.');
 const previews=type==='digital'?[...(form.elements.previews?.files||[])]:[];if(previews.length>3)throw Error('Choose up to three previews.');status.textContent='Preparing upload…';const data=metadata(form);if(type==='physical'&&/^\d+\.png$/i.test(file?.name||'')&&!data.name.trim())throw Error('Enter an artwork Name for numbered PNG downloads.');let upload,saved;
 // Receipt is bound to configuration and update target. Only IDs/metadata are stored here, never credentials.
 const signature=JSON.stringify({filename:file?.name,bytes:file?.size,type,updateProductId,metadata:data,referenceListingId:form.elements.referenceListingId?.value,storeOnly:form.elements.storeOnly?.checked===true,previews:previews.map(f=>[f.name,f.size])});try{saved=JSON.parse(sessionStorage.getItem('poster-upload')||'null');}catch{}
 if(saved&&!validUploadReceipt(saved)){saved=null;try{sessionStorage.removeItem('poster-upload');}catch{}}
 if(saved?.signature===signature&&file){upload=saved;const prior=await api('/poster/uploads/'+upload.id);if(prior.phase==='cancelled'){upload=null;try{sessionStorage.removeItem('poster-upload');}catch{}}else{if(!['uploading','stored','preparing','ready_for_approval','publishing','published','needs_investigation','superseded'].includes(prior.phase))throw Error('Saved upload status is unavailable. Check the product dashboard before retrying.');if(prior.phase!=='uploading'){location.assign('/poster/upload?id='+upload.id);return;}}}
 // Read the file explicitly so mobile file-provider failures are not disguised as fetch errors.
 let firstChunk;
 if(file&&(!upload||upload.phase==='uploading')){
  status.textContent='Reading selected file…';
  firstChunk=await readArtworkChunk(file,0,upload?.chunkBytes||2_000_000);
 }
 if(!upload){upload=await api('/poster/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file?.name,bytes:file?.size,type,metadata:data,previewCount:previews.length,referenceListingId:form.elements.referenceListingId?.value,storeOnly:type==='physical'&&form.elements.storeOnly?.checked===true,updateProductId,reuseOriginal:!file})});if(!validUploadReceipt(upload))throw Error('The product service did not confirm an upload ID. Check the product dashboard before retrying.');try{sessionStorage.setItem('poster-upload',JSON.stringify({...upload,signature}));}catch{}}
 if(upload.phase==='preparing'){location.assign('/poster/upload?id='+upload.id);return;}
 for(let offset=0,i=0;offset<file.size;offset+=upload.chunkBytes,i++){await api('/poster/uploads/'+upload.id+'/chunks/'+i,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:offset===0&&firstChunk?.byteLength===Math.min(upload.chunkBytes,file.size)?firstChunk:await readArtworkChunk(file,offset,offset+upload.chunkBytes)});status.textContent='Uploaded '+Math.round(Math.min(offset+upload.chunkBytes,file.size)/file.size*100)+'%';}
 for(let i=0;i<previews.length;i++)await api('/poster/uploads/'+upload.id+'/preview-input/'+i,{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:await previewJpeg(previews[i])});
 await api('/poster/uploads/'+upload.id+'/finish',{method:'POST'});location.assign('/poster/upload?id='+upload.id);
 }catch(error){status.textContent=error.message;button.disabled=false;}});
if(status?.dataset.upload){const id=status.dataset.upload;let stopped=false;async function poll(){try{const a=await api('/poster/uploads/'+id);if(a.progress){const run=document.getElementById('worker-run-link');if(run&&/^https:\/\/github\.com\/sapiverpress-studio\/Poster_gen\/actions\/runs\/\d+$/.test(a.progress.runUrl||'')){run.href=a.progress.runUrl;run.textContent='View this worker run';}const stage=document.getElementById('product-stage'),note=document.getElementById('product-progress-note'),time=document.getElementById('product-progress-time');if(stage)stage.textContent=a.progress.label;if(note)note.textContent=a.progress.note;if(time){const elapsed=a.progress.elapsedSeconds;time.textContent='Elapsed: '+Math.floor(elapsed/60)+'m '+(elapsed%60)+'s'+(a.progress.updatedAt?' • Last update: '+new Date(a.progress.updatedAt).toLocaleTimeString(): '');}}if(a.phase==='ready_for_approval'){location.assign('/poster/upload?id='+id);return;}if(['published','needs_investigation'].includes(a.phase)){if(!stopped&&status.dataset.phase!==a.phase){stopped=true;location.assign('/poster/upload?id='+id);}return;}if(['uploading','preparing','publishing'].includes(a.phase))setTimeout(poll,5000);}catch{status.textContent='Refresh status to check saved progress.';}}poll();}
