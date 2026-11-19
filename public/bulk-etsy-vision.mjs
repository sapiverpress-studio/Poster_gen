import {applyBulkEtsySeo} from './bulk-etsy-seo.mjs';

// Visual analysis is optional. Successful suggestions stay in memory until ZIP upload.
export function createBulkEtsyVision({form,csrf,getSavedState}){
 const button=document.getElementById('bulk-analyse-etsy');
 const notice=document.getElementById('bulk-analyse-status');
 const review=document.getElementById('bulk-seo-review');
 let current=null,working=false;
 const setNotice=message=>{if(notice)notice.textContent=message;};
 function clear(){
  current=null;
  review?.replaceChildren();
  if(review)review.hidden=true;
  if(button)button.disabled=true;
  setNotice('Select and validate a ZIP first. Analysis is optional; no listing is created.');
 }
 function attach(archive,signature){
  if(current?.signature===signature&&current?.archive===archive)return;
  current={archive,signature,previews:[],items:[],bundles:[],complete:false};
  if(review){review.replaceChildren();review.hidden=true;}
  if(button)button.disabled=!!getSavedState();
  setNotice(getSavedState()?'This collection has saved product receipts; analyse only before creating a new collection.':'Optional: visually analyse '+archive.items.length+' poster'+(archive.items.length===1?'':'s')+' and '+archive.bundles.length+' trio'+(archive.bundles.length===1?'':'s')+'. The analyser may retry once. AI usage is billed to your separate OpenAI API account, not Netlify AI Gateway; repeated unchanged artwork can reuse cached suggestions.');
 }
 async function jpegPreview(file){
  const bitmap=await createImageBitmap(file);
  try{
   const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));
   canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('This browser cannot prepare an image preview');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const url=canvas.toDataURL('image/jpeg',0.6);
   canvas.width=canvas.height=0;
   if(url.length>260000)throw Error('One image preview is too large; use a smaller poster preview');
   return url;
  }finally{bitmap.close();}
 }
 async function ask(payload){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
  try{
   const response=await fetch('/poster/etsy/preview',{method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','X-Poster-CSRF':csrf},body:JSON.stringify(payload),signal:controller.signal});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'Visual Etsy analysis was unavailable');
   if(!data.title||!Array.isArray(data.tags)||data.tags.length!==13||!data.description)throw Error('Incomplete Etsy metadata returned');
   return data;
  }finally{clearTimeout(timer);}
 }
 function field(parent,caption,value,multiline){
  const label=document.createElement('label');
  label.append(document.createTextNode(caption));
  const el=document.createElement(multiline?'textarea':'input');
  if(multiline)el.rows=multiline==='tags'?3:4;
  el.value=String(value||'');
  if(!multiline)el.maxLength=140;
  label.append(el);parent.append(label);return el;
 }
 function render(){
  if(!review||!current?.complete)return;
  review.replaceChildren();
  review.append(Object.assign(document.createElement('h3'),{textContent:'Review Etsy wording before uploading'}));
  review.append(Object.assign(document.createElement('p'),{textContent:'Every poster and trio has its own image-based title, 13 tags and opening paragraph. Existing details.md and bundle descriptions remain underneath each opening paragraph. Check all facts, especially text within artwork and product type. No search volumes are measured.'}));
  for(const [type,list,originals] of [['items',current.items,current.archive.items],['bundles',current.bundles,current.archive.bundles]]){
   list.forEach((data,i)=>{
    const fs=document.createElement('fieldset'),heading=document.createElement('legend');
    heading.textContent=(type==='items'?'Poster ':'Trio ')+(i+1)+' — '+originals[i].title;
    fs.append(heading);
    const imageRow=document.createElement('div');imageRow.style.display='flex';imageRow.style.flexWrap='wrap';imageRow.style.gap='8px';
    const previews=type==='items'?[current.previews[i]]:originals[i].members.map(member=>{
     const index=current.archive.items.findIndex(it=>it.folder.split('/').at(-1).toLowerCase()===member.toLowerCase());
     return current.previews[index];
    });
    for(const [n,src] of previews.entries()){
     const image=document.createElement('img');image.src=src;image.alt=(type==='items'?'Poster artwork':'Trio member '+(n+1));
     image.width=112;image.style.maxWidth='30%';image.style.height='auto';imageRow.append(image);
    }
    fs.append(imageRow);
    data.titleInput=field(fs,'Etsy title',data.title,false);
    data.tagsInput=field(fs,'13 Etsy tags, comma-separated',data.tags.join(', '),'tags');
    data.leadInput=field(fs,'SEO description opening (existing product facts stay below)',data.description,'lead');
    if(type==='items'){data.altInput=field(fs,'Alt text for the clean front image (up to 250 characters)',data.altText||'','lead');data.altInput.maxLength=250;}
    review.append(fs);
   });
  }
  const label=document.createElement('label'),checkbox=document.createElement('input');
  checkbox.type='checkbox';checkbox.id='bulk-etsy-use-suggestions';checkbox.checked=false;
  label.append(checkbox,document.createTextNode(' Use my reviewed Etsy wording for these listings when I press Check and upload. Keep the original artwork and customer ZIP unchanged.'));
  review.append(label);
  review.hidden=false;
  setNotice('Analysis complete. Review '+(current.items.length+current.bundles.length)+' listing suggestions, then tick the checkbox to use them. Unticked means original ZIP wording is used.');
 }
 async function analyse(){
  if(working||!current||getSavedState())return;
  working=true;if(button)button.disabled=true;
  try{
   const target=current;
   for(let i=0;i<target.archive.items.length;i++){
    if(target!==current)throw Error('The selected ZIP changed');
    if(!target.previews[i]){
     setNotice('Preparing visual preview '+(i+1)+'/'+target.archive.items.length+' locally…');
     const file=await target.archive.artwork(target.archive.items[i]);
     target.previews[i]=await jpegPreview(file);
    }
   }
   const jobs=[
    ...target.archive.items.map((item,i)=>({type:'items',i,payload:{imageDataUrl:target.previews[i],name:item.title,subject:item.title,kind:form.elements.kind.value}})),
    ...target.archive.bundles.map((bundle,i)=>{
     const images=bundle.members.map(member=>{
      const index=target.archive.items.findIndex(it=>it.folder.split('/').at(-1).toLowerCase()===member.toLowerCase());
      if(index<0)throw Error('The trio references an artwork not present in the ZIP');
      return target.previews[index];
     });
     return {type:'bundles',i,payload:{imageDataUrls:images,name:bundle.title,subject:bundle.members.join(', '),kind:'trio',size:bundle.size}};
    })
   ];
   let next=0,finished=jobs.filter(job=>target[job.type][job.i]).length,failed=null;
   const worker=async()=>{
    while(!failed&&next<jobs.length){
     const job=jobs[next++];
     if(target[job.type][job.i])continue;
     try{
      const result=await ask(job.payload);
      if(target!==current)throw Error('The selected ZIP changed');
      target[job.type][job.i]=result;finished++;
      setNotice('Analysed '+finished+'/'+jobs.length+' Etsy listings. Checking each set separately…');
     }catch(error){failed=new Error((job.type==='items'?'Poster ':'Trio ')+(job.i+1)+': '+String(error?.message||'analysis unavailable'));break;}
    }
   };
   await Promise.all(Array.from({length:Math.min(2,jobs.length)},worker));
   if(failed)throw failed;
   target.complete=true;
   render();
  }catch(error){
   setNotice('Image analysis stopped: '+String(error?.message||'unavailable')+'. No listings changed. Any successful suggestions are retained for retry; alternatively upload the existing ZIP.');
  }finally{working=false;if(button)button.disabled=!current||!!getSavedState();}
 }
 function resolve(archive,signature){
  if(!current||current.signature!==signature||current.archive!==archive||!current.complete||
     !document.getElementById('bulk-etsy-use-suggestions')?.checked)return {archive,applied:false};
  const extract=list=>list.map(x=>({title:x.titleInput.value,tags:x.tagsInput.value,lead:x.leadInput.value,altText:x.altInput?.value||''}));
  const next=applyBulkEtsySeo(archive,{items:extract(current.items),bundles:extract(current.bundles)});
  return {archive:next,applied:true};
 }
 button?.addEventListener('click',()=>analyse().catch(error=>setNotice('Analysis unavailable: '+error.message)));
 return {clear,attach,resolve};
}
