import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {seal} from '../lib/oauth.mjs';
import {monthlyUploadStatus} from '../lib/monthly-upload-limit.mjs';
const origin='https://poster.example.test',secret='a-test-encryption-key-of-sufficient-length',now=Date.parse('2026-10-16T06:00:00Z');
const env=n=>({CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'owner-password',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',POSTER_PUBLICATION_ENABLED:'true'}[n]);
function store(){const m=new Map();return {m,get:async k=>m.get(k)??null,setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&m.has(k))return{modified:false};m.set(k,v);return{modified:true};},list:async function*({prefix=''}){yield {blobs:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}};}
const cookie='__Host-poster_owner='+seal({csrf:'bulk-csrf',expiry:now+3600000},secret,'poster-owner');
function req(path,method='GET',body,headers={}){return new Request(origin+path,{method,body,headers:{cookie,origin,'X-Poster-CSRF':'bulk-csrf',...headers}});}
const context={waitUntil:()=>{}};
test('six physical products remain distinct, consume six slots and approve exactly once each',async()=>{
 const uploads=store(),dispatched=[];
 const handler=createPosterUploadHandler({env,uploads,clock:()=>now,dispatchJob:async(id,action,hash)=>{dispatched.push({id,action,hash});}});
 const ids=[],tags='jazz art,music wall art,saxophone print,jazz club,music room,saxophone,jazz poster,vintage jazz,art print,listening room,warm decor,music gift,home bar';
 for(let n=0;n<6;n++){
  const meta={name:'Jazz Poster '+n,etsyTitle:'Nocturne '+n,description:'Original jazz art print with saxophone.',tags,kind:'artwork',sectionTitle:'Wall Art'};
  const response=await handler(req('/poster/uploads','POST',JSON.stringify({type:'physical',filename:'0'+(n+1)+'-Jazz.png',bytes:40,metadata:meta}),{'Content-Type':'application/json'}),context);
  assert.equal(response.status,201);const created=await response.json();ids.push(created.id);
  const key='uploads/'+created.id+'/state',state=uploads.m.get(key);
  assert.equal(state.metadata.etsyTitle,'Nocturne '+n);
  const approvalHash='hash-'+n;
  uploads.m.set(key,{...state,phase:'ready_for_approval',approvalHash,
   plan:{body:{title:'Nocturne '+n,description:meta.description,tags},identity:{sku:'SP-JAZZ-'+n}}});
  const review=await handler(req('/poster/uploads/'+created.id),context);
  assert.equal((await review.json()).review.title,'Nocturne '+n);
 }
 assert.equal(new Set(ids).size,6);
 assert.equal((await monthlyUploadStatus({uploads,clock:()=>now})).used,6);
 for(let n=0;n<6;n++){
  const body=new URLSearchParams({csrf:'bulk-csrf',approvalHash:'hash-'+n}).toString();
  const response=await handler(req('/poster/uploads/'+ids[n]+'/approve','POST',body,{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'}),context);
  assert.equal(response.status,202);
  const again=await handler(req('/poster/uploads/'+ids[n]+'/approve','POST',body,{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'}),context);
  assert.equal(again.status,409);
  assert.equal(uploads.m.get('uploads/'+ids[n]+'/state').phase,'publishing');
 }
 assert.equal(dispatched.filter(d=>d.action==='publish').length,6);
 assert.equal((await monthlyUploadStatus({uploads,clock:()=>now})).used,6);
});
test('superseded corrected review returns exact next revision without creating new upload slot',async()=>{
 const uploads=store(),handler=createPosterUploadHandler({env,uploads,clock:()=>now,dispatchJob:async()=>{}});
 const old='a'.repeat(32),next='b'.repeat(32);
 uploads.m.set('uploads/'+old+'/state',{phase:'superseded',supersededBy:next});
 uploads.m.set('uploads/'+next+'/state',{phase:'ready_for_approval',approvalHash:'approved',
  plan:{body:{title:'Corrected poster',description:'Approved text',tags:'tag'},identity:{sku:'SP-CORRECTED'}}});
 const out=await handler(req('/poster/uploads/'+old),context);
 assert.equal((await out.json()).supersededBy,next);
 const current=await handler(req('/poster/uploads/'+next),context);
 assert.equal((await current.json()).review.title,'Corrected poster');
 assert.equal((await monthlyUploadStatus({uploads,clock:()=>now})).used,0);
});
