const root=document.getElementById('woodland-tools'),start=document.getElementById('woodland-start'),download=document.getElementById('woodland-download'),status=document.getElementById('woodland-status');
const csrf=root?.dataset.csrf||'';
const render=phase=>{
 if(phase==='ready'){start.hidden=true;download.hidden=false;status.textContent='Three original Canva PNGs verified. Download the A4/A5 ZIP and upload it through Bulk collection upload.';}
 else if(phase==='needs_review'){start.disabled=true;status.textContent='Export requires investigation. No posters were published. Reopen the Canva project or check the connected account.';}
 else if(phase==='in_progress'||phase==='exporting'||phase==='finalizing'){start.disabled=true;status.textContent='Export processing in Canva. Original artwork remains unchanged.';}
 else {start.disabled=false;status.textContent='The three poster artworks are saved in Canva; export is not started.';}
};
async function call(path){
 const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'x-poster-csrf':csrf}});
 const body=await response.json();if(!response.ok)throw Error(body.error||'Export unavailable');
 return body;
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(){
 for(let attempt=0;attempt<45;attempt++){
  const result=await call('/poster/woodland/finish');
  render(result.phase);
  if(result.phase==='ready')return;
  await delay(7000);
 }
 status.textContent='The export is still processing. Reopen this page to check it; nothing has been published.';
}
start?.addEventListener('click',async()=>{
 start.disabled=true;status.textContent='Requesting the three original full-resolution Canva pages...';
 try{const r=await call('/poster/woodland/start');render(r.phase);if(r.phase==='in_progress')await poll();}
 catch(e){status.textContent=e.message;start.disabled=false;}
});
render(root?.dataset.phase);
if(['in_progress','exporting','finalizing'].includes(root?.dataset.phase))poll().catch(e=>{status.textContent=e.message;});
