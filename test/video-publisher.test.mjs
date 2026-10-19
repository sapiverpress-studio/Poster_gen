import test from 'node:test';
import assert from 'node:assert/strict';
import { seal } from '../lib/oauth.mjs';
import { createVideoPublisher, VIDEO_CHUNK_BYTES } from '../lib/video-publisher.mjs';

const origin='https://'+'sapiver-poster-gen-auth.netlify.app';
const secret='an-existing-server-side-secret-which-is-at-least-20-bytes';
function store(){
 const m=new Map(),etags=new Map();
 let n=0;
 const save=(key,data,o={})=>{
  if(o.onlyIfNew&&m.has(key))return {modified:false};
  if(o.onlyIfMatch&&etags.get(key)!==o.onlyIfMatch)return {modified:false};
  m.set(key,data);etags.set(key,'e'+(++n));return {modified:true};
 };
 return {
  get:async(key)=>m.get(key)??null,
  getWithMetadata:async(key)=>m.has(key)?{data:m.get(key),etag:etags.get(key)}:null,
  set:async(key,v,o)=>save(key,v,o),
  setJSON:async(key,v,o)=>save(key,v,o),
  delete:async(key)=>m.delete(key),
  contains:key=>m.has(key)
 };
}
const csrf='owner-csrf';
function session(){
 const cookie=seal({csrf,expiry:Date.now()+600000},secret,'poster-owner');
 return '__Host-poster_owner='+cookie;
}
function ownerRequest(path,method='GET',body=null,csrfHeader=csrf){
 return new Request(origin+path,{method,headers:{cookie:session(),...(method==='GET'?{}:{'x-poster-csrf':csrfHeader,origin,'content-type':typeof body==='string'?'application/json':'application/octet-stream'})},body});
}
function workerRequest(path,ticket,method='GET',body=null){
 return new Request(origin+path,{method,headers:{authorization:'Bearer '+ticket,...(method==='POST'?{'content-type':'application/json'}:{})},body});
}
async function createUploaded(handler){
 const fake=Buffer.alloc(2020,9);
 fake.write('ftyp',4,'ascii');
 const started=await handler(ownerRequest('/poster/video/start','POST',JSON.stringify({title:'Neo Deco Jazz',description:'Timeless music posters',filename:'jazz.mp4',bytes:fake.length})));
 assert.equal(started.status,201);
 const {id}=await started.json();
 const put=await handler(ownerRequest('/poster/video/'+id+'/chunk/0','PUT',fake));
 assert.equal(put.status,200);
 return {id,fake};
}
test('same existing owner session protects video page and does not require another password',async()=>{
 const s=store(),handler=createVideoPublisher({store:s,env:n=>n==='CANVA_CLIENT_SECRET'?secret:undefined});
 const denied=await handler(new Request(origin+'/poster/video'));
 assert.equal(denied.status,303);
 const allowed=await handler(ownerRequest('/poster/video'));
 assert.equal(allowed.status,200);
 assert.match(await allowed.text(),/Video Publisher/);
 const csrfRejected=await handler(ownerRequest('/poster/video/start','POST',JSON.stringify({title:'Jazz',description:'Jazz poster',filename:'jazz.mp4',bytes:2020}),'incorrect'));
 assert.equal(csrfRejected.status,403);
});
test('one deploy dispatches to Comic, both receipts publish, then MP4 is deleted',async()=>{
 const s=store();let dispatchCount=0,ticket;
 const request=async(url,opts)=>{
  assert.match(url,/SapiverPress_comic_public/);
  dispatchCount++;
  const sent=JSON.parse(opts.body);
  assert.equal(sent.ref,'main');
  ticket=sent.inputs.ticket;
  assert.equal(sent.inputs.video_id,upload.id);
  return new Response(null,{status:204});
 };
 const handler=createVideoPublisher({store:s,env:n=>n==='CANVA_CLIENT_SECRET'?secret:n==='POSTER_GITHUB_ACTIONS_TOKEN'?'fake-token':undefined,request});
 const upload=await createUploaded(handler);
 const deployed=await handler(ownerRequest('/poster/video/'+upload.id+'/deploy','POST'));
 assert.equal(deployed.status,202);
 assert.equal(dispatchCount,1);
 const job=await handler(workerRequest('/poster/video/'+upload.id+'/job',ticket));
 assert.equal(job.status,200);
 const file=await handler(workerRequest('/poster/video/'+upload.id+'/source/0',ticket));
 assert.equal(file.status,200);
 assert.deepEqual(Buffer.from(await file.arrayBuffer()),upload.fake);
 const unauthorised=await handler(workerRequest('/poster/video/'+upload.id+'/source/0','bad'));
 assert.equal(unauthorised.status,403);
 const again=await handler(ownerRequest('/poster/video/'+upload.id+'/deploy','POST'));
 assert.equal(again.status,409);
 const reportYT=await handler(workerRequest('/poster/video/'+upload.id+'/report',ticket,'POST',JSON.stringify({platform:'youtube',id:'abc12345678'})));
 assert.equal(reportYT.status,200);
 assert.equal((await reportYT.json()).complete,false);
 assert.equal(s.contains('videos/'+upload.id+'/video.mp4'),true);
 const reportPinterest=await handler(workerRequest('/poster/video/'+upload.id+'/report',ticket,'POST',JSON.stringify({platform:'pinterest',id:'1234567890123'})));
 assert.equal(reportPinterest.status,200);
 assert.equal((await reportPinterest.json()).complete,true);
 assert.equal(s.contains('videos/'+upload.id+'/video.mp4'),false);
 const status=await handler(ownerRequest('/poster/video/'+upload.id+'/status'));
 assert.deepEqual((await status.json()).platforms.youtube.id,'abc12345678');
});
test('failed dispatch retains original MP4 and never claims publication',async()=>{
 const s=store(),handler=createVideoPublisher({store:s,env:n=>n==='CANVA_CLIENT_SECRET'?secret:'token',request:async()=>new Response(null,{status:403})});
 const {id}=await createUploaded(handler);
 const res=await handler(ownerRequest('/poster/video/'+id+'/deploy','POST'));
 assert.equal(res.status,503);
 assert.equal(s.contains('videos/'+id+'/video.mp4'),true);
 const status=await handler(ownerRequest('/poster/video/'+id+'/status'));
 assert.equal((await status.json()).phase,'dispatch_failed');
});

test('private media transfer uses segments under 2 MB, not a single oversized function response',async()=>{
 const s=store();let ticket='';
 const handler=createVideoPublisher({store:s,env:n=>n==='CANVA_CLIENT_SECRET'?secret:n==='POSTER_GITHUB_ACTIONS_TOKEN'?'stub':undefined,request:async(_url,opts)=>{ticket=JSON.parse(opts.body).inputs.ticket;return new Response(null,{status:204});}});
 const video=Buffer.alloc(VIDEO_CHUNK_BYTES+9,2);video.write('ftyp',4,'ascii');
 const res=await handler(ownerRequest('/poster/video/start','POST',JSON.stringify({title:'Jazz',description:'Video print collection',filename:'jazz.mp4',bytes:video.length})));
 const {id}=await res.json();
 for(let n=0;n<2;n++){
  const part=video.subarray(n*VIDEO_CHUNK_BYTES,Math.min(video.length,(n+1)*VIDEO_CHUNK_BYTES));
  assert.equal((await handler(ownerRequest('/poster/video/'+id+'/chunk/'+n,'PUT',part))).status,200);
 }
 assert.equal((await handler(ownerRequest('/poster/video/'+id+'/deploy','POST'))).status,202);
 const first=await handler(workerRequest('/poster/video/'+id+'/source/0',ticket));
 const second=await handler(workerRequest('/poster/video/'+id+'/source/1',ticket));
 assert.equal(Buffer.from(await first.arrayBuffer()).length,VIDEO_CHUNK_BYTES);
 assert.equal(Buffer.from(await second.arrayBuffer()).length,9);
});


test('recovery re-dispatches the retained MP4 to Pinterest only, never a second YouTube upload',async()=>{
 const s=store(),dispatches=[];
 const handler=createVideoPublisher({
  store:s,
  env:n=>n==='CANVA_CLIENT_SECRET'?secret:n==='POSTER_GITHUB_ACTIONS_TOKEN'?'stub':undefined,
  request:async(url,opts)=>{
   assert.match(url,/sapiverprints-video\.yml\/dispatches/);
   dispatches.push(JSON.parse(opts.body).inputs);
   return new Response(null,{status:204});
  }
 });
 const {id}=await createUploaded(handler);
 assert.equal((await handler(ownerRequest('/poster/video/'+id+'/deploy','POST'))).status,202);
 assert.equal(dispatches.length,1);
 assert.equal((await handler(workerRequest('/poster/video/'+id+'/fail',dispatches[0].ticket,'POST','{}'))).status,200);
 const before=await handler(ownerRequest('/poster/video/'+id+'/status'));
 assert.equal((await before.json()).phase,'needs_attention');
 assert.equal(s.contains('videos/'+id+'/video.mp4'),true);
 const confirm=JSON.stringify({youtubeId:'abcdefghijk',confirmExisting:true});
 const resumed=await handler(ownerRequest('/poster/video/'+id+'/recover','POST',confirm));
 assert.equal(resumed.status,202);
 assert.equal((await resumed.json()).pinterestOnly,true);
 assert.equal(dispatches.length,2);
 assert.equal(dispatches[1].video_id,id);
 const job=await handler(workerRequest('/poster/video/'+id+'/job',dispatches[1].ticket));
 assert.equal(job.status,200);
 const data=await job.json();
 assert.equal(data.platforms.youtube.id,'abcdefghijk');
 assert.equal(data.platforms.pinterest,undefined);
 assert.equal(data.platforms.youtube.source,'owner-confirmed');
 const downloaded=await handler(workerRequest('/poster/video/'+id+'/source/0',dispatches[1].ticket));
 assert.equal(downloaded.status,200);
 assert.equal((await handler(ownerRequest('/poster/video/'+id+'/recover','POST',confirm))).status,409);
 const done=await handler(workerRequest('/poster/video/'+id+'/report',dispatches[1].ticket,'POST',JSON.stringify({platform:'pinterest',id:'1234567890123'})));
 assert.equal(done.status,200);
 assert.equal((await done.json()).complete,true);
 assert.equal(s.contains('videos/'+id+'/video.mp4'),false);
 const status=await (await handler(ownerRequest('/poster/video/'+id+'/status'))).json();
 assert.equal(status.phase,'published');
 assert.equal(status.cleaned,true);
});
test('Pinterest-only recovery requires owner session, CSRF and a confirmed existing YouTube ID',async()=>{
 const s=store();let dispatches=0,ticket='';
 const handler=createVideoPublisher({
  store:s,
  env:n=>n==='CANVA_CLIENT_SECRET'?secret:n==='POSTER_GITHUB_ACTIONS_TOKEN'?'stub':undefined,
  request:async(_url,opts)=>{dispatches++;ticket=JSON.parse(opts.body).inputs.ticket;return new Response(null,{status:204});}
 });
 const {id}=await createUploaded(handler);
 const path='/poster/video/'+id+'/recover';
 const confirmed=JSON.stringify({youtubeId:'abcdefghijk',confirmExisting:true});
 assert.equal((await handler(ownerRequest(path,'POST',confirmed))).status,409);
 assert.equal((await handler(ownerRequest('/poster/video/'+id+'/deploy','POST'))).status,202);
 assert.equal((await handler(workerRequest('/poster/video/'+id+'/fail',ticket,'POST','{}'))).status,200);
 assert.equal((await handler(new Request(origin+path,{method:'POST',body:confirmed}))).status,303);
 assert.equal((await handler(ownerRequest(path,'POST',confirmed,'incorrect'))).status,403);
 assert.equal((await handler(ownerRequest(path,'POST',JSON.stringify({youtubeId:'abcdefghijk',confirmExisting:false})))).status,400);
 assert.equal((await handler(ownerRequest(path,'POST',JSON.stringify({youtubeId:'bad',confirmExisting:true})))).status,400);
 assert.equal(dispatches,1);
 assert.equal(s.contains('videos/'+id+'/video.mp4'),true);
 assert.equal((await handler(ownerRequest(path,'POST',confirmed))).status,202);
 assert.equal(dispatches,2);
});
test('recovery rejects conflicting YouTube IDs and missing source; failed dispatch retains video',async()=>{
 const s=store(),dispatches=[];
 const handler=createVideoPublisher({
  store:s,
  env:n=>n==='CANVA_CLIENT_SECRET'?secret:n==='POSTER_GITHUB_ACTIONS_TOKEN'?'stub':undefined,
  request:async(_url,opts)=>{dispatches.push(JSON.parse(opts.body).inputs);return new Response(null,{status:dispatches.length===1?204:403});}
 });
 const {id}=await createUploaded(handler);
 assert.equal((await handler(ownerRequest('/poster/video/'+id+'/deploy','POST'))).status,202);
 const originalTicket=dispatches[0].ticket;
 assert.equal((await handler(workerRequest('/poster/video/'+id+'/report',originalTicket,'POST',JSON.stringify({platform:'youtube',id:'abcdefghijk'})))).status,200);
 assert.equal((await handler(workerRequest('/poster/video/'+id+'/fail',originalTicket,'POST','{}'))).status,200);
 const path='/poster/video/'+id+'/recover';
 assert.equal((await handler(ownerRequest(path,'POST',JSON.stringify({youtubeId:'zzzzzzzzzzz',confirmExisting:true})))).status,409);
 assert.equal((await handler(ownerRequest(path,'POST',JSON.stringify({youtubeId:'abcdefghijk',confirmExisting:true})))).status,503);
 const status=await (await handler(ownerRequest('/poster/video/'+id+'/status'))).json();
 assert.equal(status.phase,'needs_attention');
 assert.equal(status.platforms.youtube.id,'abcdefghijk');
 assert.equal(s.contains('videos/'+id+'/video.mp4'),true);
 await s.delete('videos/'+id+'/video.mp4');
 assert.equal((await handler(ownerRequest(path,'POST',JSON.stringify({youtubeId:'abcdefghijk',confirmExisting:true})))).status,409);
 assert.equal(dispatches.length,2);
});
test('uncertain GitHub recovery dispatch blocks blind retries',async()=>{
 const s=store();let dispatches=0,ticket='';
 const handler=createVideoPublisher({
  store:s,
  env:n=>n==='CANVA_CLIENT_SECRET'?secret:n==='POSTER_GITHUB_ACTIONS_TOKEN'?'stub':undefined,
  request:async(_url,opts)=>{dispatches++;ticket=JSON.parse(opts.body).inputs.ticket;if(dispatches>1)throw Error('Network timeout');return new Response(null,{status:204});}
 });
 const {id}=await createUploaded(handler);
 assert.equal((await handler(ownerRequest('/poster/video/'+id+'/deploy','POST'))).status,202);
 assert.equal((await handler(workerRequest('/poster/video/'+id+'/fail',ticket,'POST','{}'))).status,200);
 const body=JSON.stringify({youtubeId:'abcdefghijk',confirmExisting:true});
 assert.equal((await handler(ownerRequest('/poster/video/'+id+'/recover','POST',body))).status,503);
 const status=await (await handler(ownerRequest('/poster/video/'+id+'/status'))).json();
 assert.equal(status.phase,'dispatch_unknown');
 assert.equal(s.contains('videos/'+id+'/video.mp4'),true);
 assert.equal((await handler(ownerRequest('/poster/video/'+id+'/recover','POST',body))).status,409);
 assert.equal(dispatches,2);
});
