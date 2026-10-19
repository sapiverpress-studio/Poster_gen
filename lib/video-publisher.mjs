import { randomBytes, createHash } from 'node:crypto';
import { unseal, seal, equal, acceptedRequestContext } from './oauth.mjs';
import { renderOwnerPage } from './owner-page.mjs';

export const VIDEO_MAX_BYTES = 25_000_000;
export const VIDEO_CHUNK_BYTES = 2_000_000;
const ORIGIN = 'https://'+'sapiver-poster-gen-auth.netlify.app';
const ID = /^[A-Za-z0-9_-]{32}$/;
const LINK = 'https://sapiverprints.etsy.com';
const key = id => 'videos/' + id + '/state';
const part = (id, n) => 'videos/' + id + '/chunks/' + n;
const media = id => 'videos/' + id + '/video.mp4';
const reply = (data, code=200) => Response.json(data,{status:code,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const sha = v => createHash('sha256').update(v).digest('hex');
const validTitle = v => typeof v==='string'&&v.trim().length>0&&v.trim().length<=100;
const validDescription = v => typeof v==='string'&&v.trim().length>0&&v.trim().length<=2200;
const maxBody = async (req,max=5000) => {
  if (Number(req.headers.get('content-length')||0)>max) throw Error('Request too large');
  const s=await req.text();if(Buffer.byteLength(s)>max)throw Error('Request too large');return JSON.parse(s);
};
function videoPage(csrf) {
  const body = '<h2>Video Publisher</h2><p>Upload one 10-second MP4. Deploy posts to the Sapiver Prints Pinterest board and YouTube Shorts using the existing social connections. No Etsy product or PrintShrimp changes.</p>'+
    '<form id="sapiver-video-form"><label>MP4 video<input name="video" type="file" accept=".mp4,video/mp4" required></label>'+
    '<label>Title<input name="title" maxlength="100" required placeholder="Neo-Deco Jazz"></label>'+
    '<label>Description<textarea name="description" maxlength="2200" required placeholder="Describe this poster collection."></textarea></label>'+
    '<p>Shop link added automatically: <a href="'+LINK+'">'+LINK+'</a></p><button type="submit">Deploy to Pinterest and YouTube</button></form>'+
    '<p id="video-status" role="status" aria-live="polite"></p><div id="video-results"></div>'+
    '<script type="module" src="/video-publisher.mjs"></script>';
  return new Response(renderOwnerPage({title:'Video Publisher',body,csrf,active:'video'}),{
    headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; connect-src 'self'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none"}
  });
}
function ownerFrom(req,secret,clock) {
 const cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-poster_owner='));
 if(!cookie)throw Error('Unauthenticated');
 const owner=unseal(cookie.slice('__Host-poster_owner='.length),secret,'poster-owner');
 if(!owner.csrf||!Number.isFinite(owner.expiry)||owner.expiry<clock())throw Error('Unauthenticated');
 return owner;
}
function permitWorker(req,secret,id,clock) {
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 const grant=unseal(token,secret,'sapiver-video-ticket');
 if(grant.id!==id||!Number.isFinite(grant.expiry)||grant.expiry<clock()||grant.expiry>clock()+2*3600000||grant.origin!==ORIGIN)throw Error('Invalid ticket');
}
function safeState(state) {
 return {id:state.id,phase:state.phase,platforms:state.platforms||{},error:state.error||null,uploadedAt:state.createdAt,completedAt:state.completedAt||null,cleaned:state.cleaned===true,pinterestMediaUploaded:Boolean(state.pinterestMedia?.id)};
}
export function createVideoPublisher({store,env,request=fetch,clock=()=>Date.now()}) {
 return async req => {
  const url=new URL(req.url),path=url.pathname,secret=env('CANVA_CLIENT_SECRET');
  if(!secret||secret.length<20)return reply({error:'Video publisher configuration unavailable'},503);
  const match=/^\/poster\/video\/([A-Za-z0-9_-]{32})\/(chunk\/(\d+)|source\/(\d+)|deploy|status|job|source|report|fail|recover)$/.exec(path);
  const id=match?.[1],action=match?.[2];
  const worker=!!match&&(['job','report','fail'].includes(action)||action.startsWith('source/'));
  let owner;
  try {if(worker)permitWorker(req,secret,id,clock);else owner=ownerFrom(req,secret,clock);}
  catch{return worker?reply({error:'Access denied'},403):new Response(null,{status:303,headers:{Location:'/poster/workflow','Cache-Control':'no-store'}});}
  if(path==='/poster/video'&&req.method==='GET')return videoPage(owner.csrf);
  if(worker&&req.method==='GET'&&action==='job'){
   const state=await store.get(key(id),{type:'json',consistency:'strong'});
   if(!state||!['dispatched','posting','published','cleanup_failed'].includes(state.phase))return reply({error:'Not available'},404);
   return reply({id,title:state.title,description:state.description,link:LINK,sha256:state.sha256,bytes:state.bytes,platforms:state.platforms||{},pinterestMedia:state.pinterestMedia||null});
  }
  if(worker&&req.method==='GET'&&action.startsWith('source/')){
   const state=await store.get(key(id),{type:'json',consistency:'strong'});
   if(!state||!['dispatched','posting'].includes(state.phase))return reply({error:'Not available'},404);
   const bytes=await store.get(media(id),{type:'arrayBuffer',consistency:'strong'});
   if(!bytes)return reply({error:'File unavailable'},404);
   const n=Number(match[4]),buffer=Buffer.from(bytes),start=n*VIDEO_CHUNK_BYTES;
   if(!Number.isSafeInteger(n)||n<0||start>=buffer.length)return reply({error:'Invalid video segment'},400);
   return new Response(buffer.subarray(start,Math.min(start+VIDEO_CHUNK_BYTES,buffer.length)),{headers:{'Content-Type':'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(worker&&req.method==='POST'&&action==='fail'){
   const previous=await store.get(key(id),{type:'json',consistency:'strong'});
   if(!previous||!['dispatched','posting'].includes(previous.phase))return reply({error:'Unexpected publisher state'},409);
   await store.setJSON(key(id),{...previous,phase:'needs_attention',error:'Comic publishing workflow failed; review the GitHub Action before retrying'});
   return reply({recorded:true});
  }
  if(worker&&req.method==='POST'&&action==='report'){
   try{
    const body=await maxBody(req,1300),platform=body.platform;
    if(platform==='pinterest_media'){
      if(typeof body.id!=='string'||!(/^[0-9]{4,40}$/.test(body.id)))throw Error('Invalid Pinterest media checkpoint');
      const state=await store.get(key(id),{type:'json',consistency:'strong'});
      if(!state||!['dispatched','posting'].includes(state.phase)||state.platforms?.pinterest?.id)
        throw Error('Unexpected Pinterest media checkpoint');
      if(state.pinterestMedia?.id&&state.pinterestMedia.id!==body.id)
        throw Error('Conflicting Pinterest media ID; do not re-upload');
      await store.setJSON(key(id),{...state,phase:'posting',pinterestMedia:state.pinterestMedia||{id:body.id,at:clock()}});
      return reply({confirmed:true,complete:false});
    }
    if(!['youtube','pinterest'].includes(platform)||typeof body.id!=='string'||!(/^[A-Za-z0-9_-]{4,100}$/.test(body.id)))throw Error('Invalid platform receipt');
    const state=await store.get(key(id),{type:'json',consistency:'strong'});
    if(!state||!['dispatched','posting','published','cleanup_failed'].includes(state.phase))throw Error('Unexpected state');
    const prior=state.platforms?.[platform];
    if(prior&&prior.id!==body.id)throw Error('Conflicting platform receipt');
    const platforms={...(state.platforms||{}),[platform]:{id:body.id,at:clock()}};
    const complete=Boolean(platforms.youtube?.id&&platforms.pinterest?.id);
    const next={...state,platforms,phase:complete?'published':'posting',completedAt:complete?clock():undefined};
    await store.setJSON(key(id),next);
    if(complete){
      try{
        await store.delete(media(id));
        if(await store.get(media(id),{type:'arrayBuffer',consistency:'strong'})!==null)throw Error('Delete not verified');
        await store.setJSON(key(id),{...next,cleaned:true});
      }catch{await store.setJSON(key(id),{...next,phase:'cleanup_failed',error:'Both posts succeeded; private video cleanup needs attention'});}
    }
    return reply({confirmed:true,complete});
   }catch{return reply({error:'Receipt rejected; do not repost automatically'},409);}
  }
  if(worker)return reply({error:'Method not allowed'},405);
  if(match&&action==='status'&&req.method==='GET'){
   const state=await store.get(key(id),{type:'json',consistency:'strong'});
   return state?reply(safeState(state)):reply({error:'Unknown video'},404);
  }
  if(req.method!=='POST'&&req.method!=='PUT')return reply({error:'Method not allowed'},405);
  if(!acceptedRequestContext(req.headers.get('origin'),ORIGIN,req.headers.get('sec-fetch-site'))||!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return reply({error:'Request denied'},403);
  if(match&&action==='recover'&&req.method==='POST'){
   // Owner explicitly confirms the EXISTING YouTube Short. Never call YouTube upload again.
   let input;
   try{input=await maxBody(req,500);}catch{return reply({error:'Provide the existing YouTube video ID'},400);}
   const youtubeId=input?.youtubeId;
   if(typeof youtubeId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(youtubeId)||input.confirmExisting!==true)
     return reply({error:'Confirm the published YouTube video ID before Pinterest-only recovery'},400);
   const previous=await store.getWithMetadata(key(id),{type:'json',consistency:'strong'});
   const saved=previous?.data;
   if(!previous?.etag||!saved||saved.phase!=='needs_attention'||saved.platforms?.pinterest?.id)
     return reply({error:'This upload cannot be recovered automatically; check its current status'},409);
   if(saved.platforms?.youtube?.id&&saved.platforms.youtube.id!==youtubeId)
     return reply({error:'YouTube ID conflicts with the existing publication record'},409);
   if(!saved.sha256||!Number.isSafeInteger(saved.bytes)||saved.bytes<1000)
     return reply({error:'Original upload metadata unavailable; no repost attempted'},409);
   const stored=await store.get(media(id),{type:'arrayBuffer',consistency:'strong'});
   if(!stored||stored.byteLength!==saved.bytes||sha(Buffer.from(stored))!==saved.sha256)
     return reply({error:'Original MP4 missing or invalid; no repost attempted'},409);
   const next={...saved,phase:'dispatched',error:null,
    platforms:{...(saved.platforms||{}),youtube:saved.platforms?.youtube||{id:youtubeId,at:clock(),source:'owner-confirmed'}}};
   const reserved=await store.setJSON(key(id),next,{onlyIfMatch:previous.etag});
   if(reserved?.modified!==true)return reply({error:'Recovery already in progress; refresh status'},409);
   const token=env('COMIC_GITHUB_TOKEN')||env('POSTER_GITHUB_ACTIONS_TOKEN');
   if(!token){await store.setJSON(key(id),{...next,phase:'needs_attention',error:'GitHub dispatch credential unavailable'});return reply({error:'GitHub dispatch credential unavailable; video retained'},503);}
   const ticket=seal({id,origin:ORIGIN,expiry:clock()+45*60000},secret,'sapiver-video-ticket');
   let response;
   try{
    response=await request('https://api.github.com/repos/sapiverpress-studio/SapiverPress_comic_public/actions/workflows/sapiverprints-video.yml/dispatches',{
     method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
     headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
     body:JSON.stringify({ref:'main',inputs:{video_id:id,ticket}})
    });
   }catch{
    // A timed-out dispatch may have been accepted: do not automatically retry.
    await store.setJSON(key(id),{...next,phase:'dispatch_unknown',error:'GitHub dispatch outcome uncertain; inspect Actions before another attempt'});
    return reply({error:'Dispatch outcome uncertain. Check GitHub Actions; video retained'},503);
   }
   if(response.status!==204){
    await store.setJSON(key(id),{...next,phase:'needs_attention',error:'Pinterest-only dispatch rejected by GitHub (HTTP '+response.status+')'});
    return reply({error:'GitHub rejected Pinterest-only recovery (HTTP '+response.status+'); video retained'},503);
   }
   return reply({id,phase:'dispatched',youtubeId,pinterestOnly:true},202);
  }
  if(path==='/poster/video/start'&&req.method==='POST'){
   try{
    const data=await maxBody(req),bytes=data.bytes;
    if(!validTitle(data.title)||!validDescription(data.description)||!Number.isSafeInteger(bytes)||bytes<1000||bytes>VIDEO_MAX_BYTES||!/\.mp4$/i.test(String(data.filename||'')))throw Error('Use a ten-second MP4 under 25 MB and enter a title and description');
    const newId=randomBytes(24).toString('base64url');
    const state={id:newId,title:data.title.trim(),description:data.description.trim(),bytes,chunks:Math.ceil(bytes/VIDEO_CHUNK_BYTES),createdAt:clock(),phase:'uploading',platforms:{}};
    await store.setJSON(key(newId),state,{onlyIfNew:true});
    return reply({id:newId,chunkBytes:VIDEO_CHUNK_BYTES},201);
   }catch(e){return reply({error:String(e.message||'Invalid upload')},400);}
  }
  if(!match)return reply({error:'Not found'},404);
  const state=await store.get(key(id),{type:'json',consistency:'strong'});
  if(!state)return reply({error:'Unknown upload'},404);
  if(action.startsWith('chunk/')&&req.method==='PUT'){
   const n=Number(match[3]),expected=Math.min(VIDEO_CHUNK_BYTES,state.bytes-n*VIDEO_CHUNK_BYTES);
   if(state.phase!=='uploading'||!Number.isSafeInteger(n)||n<0||n>=state.chunks||Number(req.headers.get('content-length')||0)>VIDEO_CHUNK_BYTES||expected<=0)return reply({error:'Invalid video chunk'},409);
   const bytes=await req.arrayBuffer();
   if(bytes.byteLength!==expected)return reply({error:'Video chunk size mismatch'},400);
   const saved=await store.set(part(id,n),bytes,{onlyIfNew:true});
   if(!saved?.modified){
     const prior=await store.get(part(id,n),{type:'arrayBuffer',consistency:'strong'});
     if(!prior||sha(Buffer.from(prior))!==sha(Buffer.from(bytes)))return reply({error:'Conflicting video chunk'},409);
   }
   return reply({stored:true});
  }
  if(action==='deploy'&&req.method==='POST'){
   if(state.phase!=='uploading')return reply({error:'Already submitted; check the saved status before retrying'},409);
   const existing=await store.getWithMetadata(key(id),{type:'json',consistency:'strong'});
   if(existing?.data?.phase!=='uploading')return reply({error:'Already submitted'},409);
   const reserved=await store.setJSON(key(id),{...state,phase:'assembling'},{onlyIfMatch:existing.etag});
   if(reserved?.modified!==true)return reply({error:'Deploy already in progress'},409);
   try{
     const chunks=[];for(let i=0;i<state.chunks;i++){
       const buf=await store.get(part(id,i),{type:'arrayBuffer',consistency:'strong'});if(!buf)throw Error('A video chunk is missing');
       chunks.push(Buffer.from(buf));
     }
     const video=Buffer.concat(chunks);
     if(video.byteLength!==state.bytes||video.subarray(4,8).toString('ascii')!=='ftyp')throw Error('Uploaded MP4 failed verification');
     await store.set(media(id),video);
     for(let i=0;i<state.chunks;i++)await store.delete(part(id,i));
     const final={...state,sha256:sha(video),phase:'dispatched'};
     await store.setJSON(key(id),final);
     const token=env('COMIC_GITHUB_TOKEN')||env('POSTER_GITHUB_ACTIONS_TOKEN');
     if(!token){await store.setJSON(key(id),{...final,phase:'dispatch_failed',error:'GitHub dispatch credential missing'});return reply({error:'Existing GitHub dispatch credential does not reach Comic; no video was posted'},503);}
     const ticket=seal({id,origin:ORIGIN,expiry:clock()+45*60000},secret,'sapiver-video-ticket');
     let response;
     try{response=await request('https://api.github.com/repos/sapiverpress-studio/SapiverPress_comic_public/actions/workflows/sapiverprints-video.yml/dispatches',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({ref:'main',inputs:{video_id:id,ticket}})
     });}catch{return reply({error:'GitHub request uncertain; check Actions before attempting any retry'},503);}
     if(response.status!==204){
       await store.setJSON(key(id),{...final,phase:'dispatch_failed',error:'GitHub workflow dispatch HTTP '+response.status});
       return reply({error:'GitHub video publishing workflow unavailable (HTTP '+response.status+'). Check token permissions and workflow release.'},503);
     }
     return reply({id,phase:'dispatched'},202);
   }catch(e){await store.setJSON(key(id),{...state,phase:'needs_attention',error:String(e.message||'Assembly failed').slice(0,200)});return reply({error:'Video preparation needs investigation; original upload retained'},503);}
  }
  return reply({error:'Method not allowed'},405);
 };
}
