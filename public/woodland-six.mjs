import {makeWoodlandZip} from './woodland-six-zip.mjs';
const root=document.getElementById('woodland-tools'),start=document.getElementById('woodland-start'),download=document.getElementById('woodland-download'),status=document.getElementById('woodland-status');
const csrf=root?.dataset.csrf||'';
function render(phase){
 if(phase==='ready'){start.hidden=true;download.hidden=false;status.textContent='Six original PNG files verified. Download builds the ZIP safely in your browser.';}
 else if(phase==='needs_review'){start.disabled=false;download.hidden=true;status.textContent='Your previous export exceeded the old size limit. Export again to use the corrected download system.';}
 else if(['exporting','in_progress','finalizing'].includes(phase)){start.disabled=true;download.hidden=true;status.textContent='Export running. Original artwork remains unchanged.';}
 else {start.disabled=false;download.hidden=true;status.textContent='No export started.';}
}
async function post(path){
 const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'x-poster-csrf':csrf}});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Export failed');return data;
}
async function poll(){
 for(let i=0;i<45;i++){
  const value=await post('/poster/woodland-six/finish');render(value.phase);
  if(value.phase==='ready')return;
  await new Promise(resolve=>setTimeout(resolve,7000));
 }
 status.textContent='Still processing. Open this page later to check.';
}
start?.addEventListener('click',async()=>{
 start.disabled=true;status.textContent='Starting original Canva PNG exports...';
 try{const r=await post('/poster/woodland-six/start');render(r.phase);if(r.phase==='in_progress')await poll();}
 catch(e){status.textContent=e.message;start.disabled=false;}
});
download?.addEventListener('click',async()=>{
 download.disabled=true;status.textContent='Preparing private PNG downloads...';
 try{
  const r=await fetch('/poster/woodland-six/manifest',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('Canva originals not ready');const m=await r.json();
  const result=await makeWoodlandZip(m,async(img,part)=>{
   const p=await fetch('/poster/woodland-six/chunk?'+new URLSearchParams({slug:img.slug,part:String(part)}),{credentials:'same-origin',cache:'no-store'});
   if(!p.ok)throw Error('Original artwork download interrupted');return new Uint8Array(await p.arrayBuffer());
  },msg=>{status.textContent=msg});
  const url=URL.createObjectURL(result),a=document.createElement('a');a.href=url;
  a.download='Sapiver_Woodland_Verses_Six_Posters_Two_A4_Trios.zip';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status.textContent='Original ZIP prepared. Reuse existing Fox, Robin and Hedgehog supplier products. Do not create duplicate listings.';
 }catch(e){status.textContent='Download failed: '+e.message;}finally{download.disabled=false;}
});
render(root?.dataset.phase);
if(['exporting','in_progress','finalizing'].includes(root?.dataset.phase))poll().catch(e=>{status.textContent=e.message;});
