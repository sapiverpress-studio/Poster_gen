import test from 'node:test';
import assert from 'node:assert/strict';
import yauzl from 'yauzl';
import {collectMockups,zipMockupJpegs,validateMockupGroups} from '../public/mockup-download.mjs';
import {mockupDownloadControls} from '../lib/product-web.mjs';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {seal} from '../lib/oauth.mjs';
const id='a'.repeat(32),trio='b'.repeat(32),origin='https://poster.example.test';
const jpeg=n=>Uint8Array.of(0xff,0xd8,0xff,0xe0,n,0xff,0xd9);
async function unpack(bytes){
 return new Promise((resolve,reject)=>{
  yauzl.fromBuffer(Buffer.from(bytes),{lazyEntries:true},(err,zip)=>{
   if(err)return reject(err);
   const files=new Map();
   zip.on('error',reject);
   zip.on('entry',entry=>zip.openReadStream(entry,(error,stream)=>{
    if(error)return reject(error);
    const buffers=[];
    stream.on('data',part=>buffers.push(part));
    stream.on('error',reject);
    stream.on('end',()=>{files.set(entry.fileName,Buffer.concat(buffers));zip.readEntry();});
   }));
   zip.on('end',()=>resolve(files));zip.readEntry();
  });
 });
}
test('single poster mock-ups ZIP holds 4 original byte-identical JPEGs',async()=>{
 const calls=[];
 const result=await collectMockups([{id,name:'Morning Ritual',type:'poster'}],{
  fetcher:async (url,options)=>{
   calls.push({url,options});
   return new Response(jpeg(Number(url.slice(-1))),{headers:{'Content-Type':'image/jpeg'}});
  }
 });
 assert.equal(result.count,4);
 assert.match(result.filename,/Morning_Ritual_4_Mockups\.zip/);
 assert.equal(result.blob.type,'application/zip');
 const files=await unpack(new Uint8Array(await result.blob.arrayBuffer()));
 assert.deepEqual([...files.keys()],[1,2,3,4].map((x,i)=>'01_Morning_Ritual__'+String(x).padStart(2,'0')+'_'
  +['Print_Only','Black_Frame','White_Frame','Oak_Frame'][i]+'.jpg'));
 for(let i=0;i<4;i++)assert.deepEqual(files.values().toArray()[i],Buffer.from(jpeg(i)));
 assert.ok(calls.every(x=>x.options.credentials==='same-origin'&&x.options.redirect==='error'));
});
test('entire singular trio collects all sixteen originals in deterministic order',async()=>{
 const groups=[{id,name:'Morning Ritual'},{id:'c'.repeat(32),name:'Amethyst Study'},
  {id:'d'.repeat(32),name:'The Long Way Round'},{id:trio,name:'Violet and Gold',type:'trio'}];
 const paths=[];
 const result=await collectMockups(groups,{fetcher:async(url)=>{paths.push(url);return new Response(jpeg(Number(url.slice(-1))),{headers:{'Content-Type':'image/jpeg'}});}});
 const names=[...(await unpack(new Uint8Array(await result.blob.arrayBuffer()))).keys()];
 assert.equal(result.count,16);assert.equal(names.length,16);
 assert.equal(names[0],'01_Morning_Ritual__01_Print_Only.jpg');
 assert.equal(names[12],'04_Violet_and_Gold__01_Trio_Overview.jpg');
 assert.equal(names.at(-1),'04_Violet_and_Gold__04_Artwork_3.jpg');
 assert.deepEqual(paths,[...groups.flatMap(group=>[0,1,2,3].map(n=>'/poster/uploads/'+group.id+'/mockups/'+n))]);
});
test('never packages partial or redirected mock-up responses',async()=>{
 let got=0;
 await assert.rejects(collectMockups([{id,name:'Poster'}],{fetcher:async()=>{
  got++;return got===3?new Response('Not ready',{status:404}):new Response(jpeg(0),{headers:{'Content-Type':'image/jpeg'}});
 }}),/not ready/);
 assert.equal(got,3);
 await assert.rejects(collectMockups([{id,name:'Poster'}],{fetcher:async()=>new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}})}),/did not return a JPG/);
 assert.throws(()=>zipMockupJpegs([{name:'../wrong.jpg',bytes:jpeg(1)}]),/valid bounded JPG/);
 assert.throws(()=>validateMockupGroups([{id},{id}]),/repeated saved product ID/);
});
test('single review button escapes title attributes; digital reviews have no physical download button',()=>{
 const html=mockupDownloadControls(id,'Coffee "Art" & Friends','poster');
 assert.match(html,/Download all 4 mock-ups/);
 assert.match(html,/&quot;|&amp;/);
 assert.doesNotMatch(html,/onerror=/);
 assert.equal(mockupDownloadControls('bad','Whatever'), '');
});
test('the existing owner-only mock-up endpoint supplies bytes; anonymous visitors cannot access them',async()=>{
 const secret='test-secret-sufficiently-long',uploads=new Map();
 const env=n=>({CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'test-owner'}[n]);
 const store={get:async key=>uploads.get(key)??null};
 const handler=createPosterUploadHandler({env,uploads:store});
 uploads.set('uploads/'+id+'/state',{phase:'published',type:'physical',plan:{body:{title:'Art Print'}}});
 for(let i=0;i<4;i++)uploads.set('uploads/'+id+'/mockups/'+i+'.jpg',jpeg(i));
 const cookie='__Host-poster_owner='+seal({csrf:'xyz',expiry:Date.now()+3600000},secret,'poster-owner');
 const req=path=>new Request(origin+path,{headers:{cookie}});
 const res=await handler(req('/poster/uploads/'+id+'/mockups/0'),{waitUntil(){}});
 assert.equal(res.status,200);
 assert.equal(res.headers.get('Content-Type'),'image/jpeg');
 const denied=await handler(new Request(origin+'/poster/uploads/'+id+'/mockups/0'),{waitUntil(){}});
 assert.equal(denied.status,401);
 const view=await handler(req('/poster/upload?id='+id),{waitUntil(){}});
 assert.equal(view.status,200);
 assert.match(await view.text(),/Download all 4 mock-ups \(ZIP\)/);
});
