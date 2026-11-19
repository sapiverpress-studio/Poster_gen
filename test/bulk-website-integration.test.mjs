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
test('mobile ZIP submit renders immediate status and reviews before legacy recovery panels',async()=>{
 const handler=createPosterUploadHandler({env,uploads:store()});
 const res=await handler(request('/poster/bulk'),context);
 assert.equal(res.status,200);
 const html=await res.text();
 const submit=html.indexOf('Check and upload this ZIP');
 const status=html.indexOf('id="bulk-status"');
 const recovery=html.indexOf('id="previous-collection-recovery"');
 const cards=html.indexOf('id="bulk-cards"');
 assert.ok(submit>0&&status>0&&recovery>0&&cards>0);
 assert.ok(status<submit,'Status must be beside the action, not below the legacy panels');
 assert.ok(cards<recovery,'Review cards must appear before recovery tools');
 assert.equal((html.match(/id="bulk-status"/g)||[]).length,1);
 assert.match(html,/<form id="bulk-collection-form" novalidate>/);
 assert.match(html,/id="bulk-status" role="status" aria-live="polite"/);
 assert.match(html,/id="bulk-analyse-etsy" disabled/);
 assert.match(html,/id="bulk-seo-review" hidden/);
 assert.match(html,/Analyse each poster and matching trio for Etsy/);
 assert.match(html,/id="trio-create-section"/);
 assert.match(html,/id="bulk-zip-validation-status" role="status" aria-live="polite"/);
 assert.match(html,/id="bulk-check-zip"/);
 assert.ok(html.indexOf('id="bulk-zip-validation-status"')<html.indexOf('id="bulk-analyse-etsy"'),
  'ZIP validation must appear immediately beside the file input before the disabled analyse button');

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

test('bulk section API serves every verified shop section without client-side fixed lists',async()=>{
 const uploads=store(),handler=createPosterUploadHandler({env,uploads});
 uploads.entries.set('template/catalog',{shopId:456,listings:[],updatedAt:Date.now()});
 uploads.entries.set('catalogue/audit',{shopId:456,checkedAt:Date.now(),sections:[{id:11,title:'Nature'},{id:12,title:'Christmas'},{id:13,title:'Wall Art'}]});
 let r=await handler(request('/poster/bulk'),context),html=await r.text();
 assert.match(html,/<option value="Nature">Nature<\/option>/);
 assert.match(html,/<option value="Christmas">Christmas<\/option>/);
 assert.doesNotMatch(html,/name="shopSection" disabled/);
 r=await handler(request('/poster/bulk/sections'),context);
 assert.equal(r.status,200);const data=await r.json();
 assert.deepEqual(data.sections.map(x=>x.title),['Christmas','Nature','Wall Art']);
 const outsider=await handler(new Request(origin+'/poster/bulk/sections'),context);
 assert.notEqual(outsider.status,200);
 uploads.entries.set('catalogue/audit',{shopId:456,checkedAt:Date.now()-90000000,sections:[{id:11,title:'Nature'}]});
 r=await handler(request('/poster/bulk/sections'),context);
 assert.equal(r.status,409);
});

test('folder-based studio has four permanent mobile navigation links and protected catalogue',async()=>{
 const uploads=store(),handler=createPosterUploadHandler({env,uploads});
 const destinations=[
  {path:'/poster/home',active:'home'},
  {path:'/poster/upload',active:'upload'},
  {path:'/poster/bulk',active:'bulk'},
  {path:'/poster/catalogue',active:'catalogue'}
 ];
 for(const {path} of destinations){
  const res=await handler(request(path),context);
  assert.equal(res.status,200,path);
  const body=await res.text();
  for(const [label,href] of [['Dashboard','/poster/home'],['New poster','/poster/upload'],['Bulk upload','/poster/bulk'],['Catalogue','/poster/catalogue']])
   assert.ok(body.includes('href="'+href+'"'),path+' missing '+label);
  assert.ok(body.includes('href="'+path+'" aria-current="page"'),path+' not highlighted');
  assert.ok(body.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
 }
 const guest=await handler(new Request(origin+'/poster/catalogue'),context);
 assert.notEqual(guest.status,200);
});

test('fresh bulk restart checks saved products and orphan upload assets before allowing reset',async()=>{
 const uploads=store(),handler=createPosterUploadHandler({env,uploads});
 const filename='SP-THE-DOORBELL-KNEW-B4D1856D.png';
 const body=JSON.stringify({filenames:[filename]});
 const check=()=>handler(request('/poster/bulk/restart-check','POST',body,{'Content-Type':'application/json'}),context);
 let response=await check(),result=await response.json();
 assert.equal(response.status,200);assert.equal(result.safeToRestart,true);
 assert.equal(uploads.entries.size,0);
 const id='a'.repeat(32);
 uploads.entries.set('uploads/'+id+'/state',{productId:id,type:'physical',filename,phase:'uploading'});
 response=await check();result=await response.json();
 assert.equal(result.safeToRestart,false);assert.equal(result.matchCount,1);
 uploads.entries.delete('uploads/'+id+'/state');
 uploads.entries.set('products/'+id+'/record',{productId:id,type:'physical',files:[{name:filename,bytes:20000}],phase:'uploading'});
 response=await check();result=await response.json();
 assert.equal(result.safeToRestart,false);assert.equal(result.matchCount,1);
 assert.equal(uploads.entries.size,1,'restart check must not mutate or delete any product');
 const wrongCsrf=await handler(request('/poster/bulk/restart-check','POST',body,{'X-Poster-CSRF':'bad'}),context);
 assert.equal(wrongCsrf.status,403);
 const malicious=await handler(request('/poster/bulk/restart-check','POST',JSON.stringify({filenames:['../a.png']}),{'Content-Type':'application/json'}),context);
 assert.equal(malicious.status,409);
});


test('failed collection reset button refuses duplicate records and clears only a safe browser session',()=>{
 const script=String.raw`
 import assert from 'node:assert/strict';
 const nodes=new Map(),calls=[],saved=new Map();
 function element(){return {children:[],style:{},listeners:{},append(...v){this.children.push(...v);},replaceChildren(){this.children=[];},addEventListener(k,v){this.listeners[k]=v;},querySelector(){return submit;}};}
 const submit=element();
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelector(){return {content:'csrf'};},createElement:element};
 const form=document.getElementById('bulk-collection-form');
 form.elements={uploadMode:{value:'single'},collection:{value:''},kind:{value:'artwork'}};
 saved.set('sapiver-physical-bulk-v1',JSON.stringify({version:4,uploadMode:'single',
   items:[{filename:'poster.png',uploadFilename:'SP-THE-DOORBELL-KNEW-B4D1856D.png',title:'Doorbell',listingTitle:'Sloth Art Print',sectionTitle:'Streak',creating:true,id:null}],
   bundles:[],trioIds:[]}));
 globalThis.sessionStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 let safe=false;
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({safeToRestart:safe,notice:'Matching product exists'});};
 await import('./public/bulk-upload.mjs');
 const reset=nodes.get('bulk-restart-failed');
 assert.equal(reset.hidden,false);
 await reset.listeners.click();
 assert.ok(saved.has('sapiver-physical-bulk-v1'),'uncertain existing product must retain the browser state');
 safe=true;await reset.listeners.click();
 assert.equal(saved.has('sapiver-physical-bulk-v1'),false,'only a verified empty session may clear');
 assert.equal(calls.length,2);
 assert.ok(calls.every(c=>c.url==='/poster/bulk/restart-check'&&c.options.method==='POST'));
 assert.match(nodes.get('bulk-restart-note').textContent,/Failed browser session cleared/);
 `;
 execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:fileURLToPath(new URL('../',import.meta.url)),timeout:10000});
});
