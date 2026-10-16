import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {seal} from '../lib/oauth.mjs';
const origin='https://poster.example.test',secret='a-test-encryption-key-of-sufficient-length';
const env=n=>({CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'owner-password',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',POSTER_PUBLICATION_ENABLED:'true'}[n]);
const cookie='__Host-poster_owner='+seal({csrf:'owner-csrf',expiry:Date.now()+3600000},secret,'poster-owner');
function store(){const entries=new Map();return {entries,get:async k=>entries.get(k)??null,setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&entries.has(k))return {modified:false};entries.set(k,v);return {modified:true};},list:async function*({prefix=''}){yield {blobs:[...entries.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}};}
const request=(path,method='GET',body,headers={})=>new Request(origin+path,{method,body,headers:{cookie,origin,'X-Poster-CSRF':'owner-csrf',...headers}});
const context={waitUntil:()=>{}};
test('bulk page is authenticated and shows the 52-product quota without creating any product',async()=>{
 const uploads=store(),handler=createPosterUploadHandler({env,uploads});
 let res=await handler(request('/poster/bulk'),context);
 assert.equal(res.status,200);const html=await res.text();
 assert.match(html,/0 of 52 products started/);assert.match(html,/Bulk Collection Upload/);assert.match(html,/bulk-collection-form/);
 assert.match(html,/bulk-upload\.mjs/);
 res=await handler(request('/poster/bulk/status'),context);const data=await res.json();
 assert.deepEqual({used:data.used,remaining:data.remaining,limit:data.limit},{used:0,remaining:52,limit:52});
 assert.equal(uploads.entries.size,0);
});
test('six prepared upload hashes and original text are owner-visible only, never token data',async()=>{
 const uploads=store(),handler=createPosterUploadHandler({env,uploads});
 const id='a'.repeat(32);
 uploads.entries.set('uploads/'+id+'/state',{phase:'ready_for_approval',approvalHash:'approved-hash',
  plan:{body:{title:'Midnight Saxophone',description:'Approved physical print only',tags:'jazz art,music room'},
   identity:{sku:'SP-MIDNIGHT-SAXOPHONE'}}});
 let res=await handler(request('/poster/uploads/'+id),context);assert.equal(res.status,200);
 const body=await res.json();assert.equal(body.review.approvalHash,'approved-hash');
 assert.equal(body.review.title,'Midnight Saxophone');
 assert.equal(body.review.imageUrls.length,4);
 const guest=await handler(new Request(origin+'/poster/uploads/'+id),context);assert.equal(guest.status,401);
});
test('JSON approval for batch uses the same atomic single-use claim and preserves single-poster redirects',async()=>{
 const uploads=store(),handler=createPosterUploadHandler({env,uploads,dispatchJob:async()=>{}});
 const id='a'.repeat(32);uploads.entries.set('uploads/'+id+'/state',{phase:'ready_for_approval',approvalHash:'x'});
 const payload=new URLSearchParams({csrf:'owner-csrf',approvalHash:'x'}).toString();
 const res=await handler(request('/poster/uploads/'+id+'/approve','POST',payload,{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'}),context);
 assert.equal(res.status,202);assert.deepEqual(await res.json(),{id,phase:'publishing'});
 assert.equal(uploads.entries.get('uploads/'+id+'/state').phase,'publishing');
 const retry=await handler(request('/poster/uploads/'+id+'/approve','POST',payload,{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'}),context);
 assert.equal(retry.status,409);
 assert.equal([...uploads.entries.keys()].filter(k=>k.startsWith('claims/'+id+'/publish')).length,1);
});
test('browser bulk scripts parse under node without executing seller actions',()=>{
 const scripts=['bulk-upload.mjs','bulk-zip.mjs'];
 for(const name of scripts){
  const path=fileURLToPath(new URL('../public/'+name,import.meta.url));
  execFileSync(process.execPath,['--check',path],{timeout:10000});
 }
 const client=readFileSync(new URL('../public/bulk-upload.mjs',import.meta.url),'utf8');
 assert.match(client,/state\.items/);assert.match(client,/item\.creating=true/);
 assert.match(client,/if\(!confirm\(/);assert.match(client,/approvalHash:review\.approvalHash/);
 assert.doesNotMatch(client,/api-create-product|shops\/[0-9]+\/listings/);
});

test('saved eight-poster sessions retain all links and cannot start duplicate bulk work',()=>{
 const script=`
 import assert from 'node:assert/strict';
 const nodes=new Map(),links=[];
 function element(tag='div'){return {tag,children:[],style:{},listeners:{},append(...v){this.children.push(...v);},replaceChildren(){this.children=[];},addEventListener(k,v){this.listeners[k]=v;},querySelector(){return submit;}};}
 const submit=element('button');
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelector(){return {content:'csrf'};},createElement(tag){const el=element(tag);if(tag==='a')links.push(el);return el;}};
 const saved=JSON.stringify({version:1,items:Array.from({length:8},(_,n)=>({filename:n+'.png',id:String(n).padStart(32,'a')}))});
 globalThis.sessionStorage={getItem(){return saved;},setItem(){throw Error('Must not overwrite saved receipts');}};
 globalThis.fetch=()=>{throw Error('Must not request any merchant or upload work');};
 await import('./public/bulk-upload.mjs');
 assert.equal(submit.disabled,true);assert.equal(nodes.get('bulk-deploy').hidden,true);
 assert.equal(links.length,8);assert.equal(nodes.get('bulk-cards').children.length,8);
 assert.match(nodes.get('bulk-status').textContent,/saved legacy collection is retained/);
 await nodes.get('bulk-collection-form').listeners.submit({preventDefault(){}});
 await nodes.get('bulk-deploy').listeners.click();
 assert.equal(sessionStorage.getItem(),saved);
 `;
 execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:fileURLToPath(new URL('../',import.meta.url)),timeout:10000});
});
