const form=document.getElementById('sapiver-video-form');
const state=document.getElementById('video-status');
const results=document.getElementById('video-results');
const csrf=document.querySelector('meta[name="poster-csrf"]')?.content;
const headers={'X-Poster-CSRF':csrf};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(url,opts={}){
 const res=await fetch(url,{credentials:'same-origin',...opts,headers:{...headers,...opts.headers}});
 const data=await res.json().catch(()=>({error:'The video service did not respond'}));
 if(!res.ok)throw Error(data.error||'Request failed');
 return data;
}
async function validateVideo(file){
 if(!file||!file.name.toLowerCase().endsWith('.mp4')||file.size>25000000||file.size<1000)throw Error('Choose an MP4 video under 25 MB');
 const object=URL.createObjectURL(file);
 try{
  const video=document.createElement('video');video.preload='metadata';video.src=object;
  await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Cannot read the video'));});
  if(!Number.isFinite(video.duration)||video.duration<8||video.duration>12)throw Error('Use a 10-second video (8–12 seconds)');
  if(video.videoWidth>=video.videoHeight)throw Error('Use a vertical video for Shorts and Pinterest');
 }finally{URL.revokeObjectURL(object);}
}
async function poll(id){
 for(let attempt=0;attempt<180;attempt++){
  await sleep(5000);
  const s=await call('/poster/video/'+id+'/status');
  const youtube=s.platforms?.youtube?.id,pinterest=s.platforms?.pinterest?.id;
  state.textContent=s.phase==='published'?'Published to both platforms. Temporary MP4 deleted.':s.phase==='cleanup_failed'?'Both published, but cleanup needs attention.':s.phase==='needs_attention'||s.phase==='dispatch_failed'?'Publication needs attention: '+(s.error||'Check GitHub Actions'):'Publishing: '+s.phase+'…';
  results.replaceChildren();
  if(youtube){const a=document.createElement('a');a.href='https://www.youtube.com/watch?v='+encodeURIComponent(youtube);a.target='_blank';a.rel='noopener noreferrer';a.textContent='View YouTube video';results.append(a,document.createTextNode(' '));}
  if(pinterest){const a=document.createElement('a');a.href='https://www.pinterest.com/pin/'+encodeURIComponent(pinterest)+'/';a.target='_blank';a.rel='noopener noreferrer';a.textContent='View Pinterest video';results.append(a);}
  if(['published','cleanup_failed','needs_attention','dispatch_failed'].includes(s.phase))return;
 }
 state.textContent='Still processing. Check this page or the GitHub workflow before uploading again.';
}
form?.addEventListener('submit',async event=>{
 event.preventDefault();
 const button=form.querySelector('button[type=submit]')||form.querySelector('button');
 button.disabled=true;
 try{
  const video=form.elements.video.files[0];
  await validateVideo(video);
  state.textContent='Uploading video…';
  const started=await call('/poster/video/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:video.name,bytes:video.size,title:form.elements.title.value,description:form.elements.description.value})});
  const count=Math.ceil(video.size/started.chunkBytes);
  for(let n=0;n<count;n++){
   const chunk=video.slice(n*started.chunkBytes,Math.min(video.size,(n+1)*started.chunkBytes));
   await call('/poster/video/'+started.id+'/chunk/'+n,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:chunk});
   state.textContent='Uploading '+Math.round((n+1)/count*100)+'%…';
  }
  state.textContent='Handing over to Comic…';
  try{await call('/poster/video/'+started.id+'/deploy',{method:'POST'});}
  catch(e){state.textContent=e.message+' — video ID: '+started.id;return;}
  state.textContent='Publishing to Pinterest and YouTube…';
  await poll(started.id);
 }catch(e){state.textContent=String(e.message||e);}
 finally{button.disabled=false;}
});
