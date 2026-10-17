import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {createUploadRunner} from '../lib/poster-upload-runner.mjs';
import {seal} from '../lib/oauth.mjs';
import {assetKey,CHUNK_BYTES} from '../lib/uploaded-poster.mjs';
import {uploadBody,metadataFields} from '../lib/product-web.mjs';

const origin='https://poster.example.test',secret='a-test-encryption-key-of-sufficient-length';
const values={CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'owner-password',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',POSTER_PUBLICATION_ENABLED:'true'};
const env=n=>values[n];
const cookie=()=> '__Host-poster_owner='+seal({csrf:'owner-csrf',expiry:Date.now()+3600000},secret,'poster-owner');
function memory(){const map=new Map();return {map,get:async k=>map.get(k),set:async(k,v,o)=>{if(o?.onlyIfNew&&map.has(k))return {modified:false};map.set(k,v);return {modified:true};},setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&map.has(k))return {modified:false};map.set(k,v);return {modified:true};},list:async function*({prefix=''}){yield {blobs:[...map.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}};}
function request(path,method='GET',body,extra={}){return new Request(origin+path,{method,body,headers:{cookie:cookie(),origin,'X-Poster-CSRF':'owner-csrf',...extra}});}
function fixture(){const uploads=memory(),pending=[],sent=[];const handler=createPosterUploadHandler({env,uploads,request:async(url,o)=>{sent.push([url,o]);return new Response(null,{status:202});}});return {uploads,pending,sent,handler,context:{waitUntil:p=>pending.push(p)}};}
test('upload creation rejects unauthenticated, cross-site, missing CSRF and oversized files',async()=>{const f=fixture();assert.equal((await f.handler(new Request(origin+'/poster/uploads',{method:'POST',body:'{}'}),f.context)).status,401);const body=JSON.stringify({filename:'Space.png',bytes:50000001,referenceListingId:789});assert.equal((await f.handler(request('/poster/uploads','POST',body),f.context)).status,400);assert.equal((await f.handler(request('/poster/uploads','POST',body,{origin:'https://evil.example.test'}),f.context)).status,403);assert.equal((await f.handler(request('/poster/uploads','POST',body,{'X-Poster-CSRF':'wrong'}),f.context)).status,403);assert.equal(f.uploads.map.size,0);});
test('upload chunks are exact-sized and idempotent; different repeated content is rejected',async()=>{const f=fixture();const r=await f.handler(request('/poster/uploads','POST',JSON.stringify({filename:'Space.png',bytes:33,referenceListingId:789})),f.context);const {id,chunkBytes}=await r.json();assert.equal(chunkBytes,CHUNK_BYTES);const path='/poster/uploads/'+id+'/chunks/0',bytes=new Uint8Array(33);assert.equal((await f.handler(request(path,'PUT',bytes),f.context)).status,200);assert.equal((await f.handler(request(path,'PUT',bytes),f.context)).status,200);bytes[0]=1;assert.equal((await f.handler(request(path,'PUT',bytes),f.context)).status,409);assert.equal((await f.handler(request(path,'PUT',new Uint8Array(32)),f.context)).status,400);});
test('finish queues preparation once with signed private dispatch and no API credentials',async()=>{const f=fixture(),r=await f.handler(request('/poster/uploads','POST',JSON.stringify({filename:'Space.png',bytes:33,referenceListingId:789})),f.context),{id}=await r.json();assert.equal((await f.handler(request('/poster/uploads/'+id+'/finish','POST'),f.context)).status,202);assert.equal((await f.handler(request('/poster/uploads/'+id+'/finish','POST'),f.context)).status,409);await Promise.all(f.pending);assert.equal(f.sent.length,1);assert.equal(f.sent[0][0],origin+'/poster/upload-run');assert.doesNotMatch(f.sent[0][1].body,/owner-password|shared/);});
test('approval requires reviewed hash, configured publication and a single atomic claim',async()=>{const f=fixture(),id='a'.repeat(32),asset={phase:'ready_for_approval',approvalHash:'review-hash'};await f.uploads.setJSON(assetKey(id),asset);const post=hash=>request('/poster/uploads/'+id+'/approve','POST',new URLSearchParams({csrf:'owner-csrf',approvalHash:hash}).toString(),{'Content-Type':'application/x-www-form-urlencoded'});assert.equal((await f.handler(post('wrong'),f.context)).status,409);assert.equal((await f.handler(post('review-hash'),f.context)).status,303);assert.equal((await f.handler(post('review-hash'),f.context)).status,409);await Promise.all(f.pending);assert.equal(f.sent.length,1);assert.equal((await f.uploads.get(assetKey(id))).phase,'publishing');});
test('upload runner ignores forged/expired work and never retries a claimed failing prepare',async()=>{const uploads=memory(),id='b'.repeat(32);await uploads.setJSON(assetKey(id),{phase:'preparing',chunks:1,bytes:33});const runner=createUploadRunner({env,uploads,client:{}});const req=body=>new Request(origin+'/poster/upload-run',{method:'POST',body});await runner(req('forged'));await runner(req(seal({id,action:'prepare',expiry:Date.now()-1},secret,'poster-upload-run')));assert.equal((await uploads.get(assetKey(id))).phase,'preparing');const token=seal({id,action:'prepare',expiry:Date.now()+60000},secret,'poster-upload-run');await runner(req(token));assert.equal((await uploads.get(assetKey(id))).phase,'needs_investigation');await runner(req(token));assert.equal(uploads.map.has('runner/'+id+'/prepare'),true);});

test('authenticated uploader allows same-origin API fetches while retaining restrictive CSP',async()=>{const f=fixture(),r=await f.handler(request('/poster/upload'),f.context);assert.equal(r.status,200);const directives=Object.fromEntries(r.headers.get('Content-Security-Policy').split(';').map(s=>s.trim().split(/\s+/)).filter(a=>a[0]).map(([key,...v])=>[key,v]));assert.deepEqual(directives['connect-src'],["'self'"]);assert.deepEqual(directives['default-src'],["'none'"]);assert.deepEqual(directives['script-src'],["'self'"]);assert.deepEqual(directives['frame-ancestors'],["'none'"]);assert.deepEqual(directives['form-action'],["'self'"]);});


test('new physical listing shows Printed artwork first and labels its field Poster type',()=>{
 const html=uploadBody({defaults:{referenceListingId:789},catalog:{listings:[]},taxonomy:[],update:null});
 assert.ok(html.includes('id="poster-kind-label">Poster type'));
 const artwork=html.indexOf('value="artwork"'),educational=html.indexOf('value="educational"'),dinosaur=html.indexOf('value="dinosaur"');
 assert.ok(artwork>=0&&artwork<educational&&educational<dinosaur);
 assert.match(html,/Printed artwork is for travel posters/);
 assert.equal(metadataFields({kind:'pattern'}).includes('id="poster-kind-label">Product group'),true);
});
test('numbered Canva PNG creates stable descriptive filename and SKU when Name is supplied',async()=>{
 const f=fixture(),body={filename:'47271.png',bytes:100,referenceListingId:789,metadata:{name:'Coast to Coast Walk Poster',subject:'Walks'}};
 let result=await f.handler(request('/poster/uploads','POST',JSON.stringify(body)),f.context);
 assert.equal(result.status,201);const {id}=await result.json();const state=await f.uploads.get(assetKey(id));
 assert.equal(state.filename,'Coast to Coast Walk Poster.png');assert.equal(state.sourceFilename,'47271.png');
 assert.equal(state.metadata.sku,'SP-COAST-TO-COAST-WALK-POSTER');assert.equal(state.metadata.kind,'artwork');
 result=await f.handler(request('/poster/uploads','POST',JSON.stringify({...body,metadata:{subject:'Walks'}})),f.context);
 assert.equal(result.status,400);assert.match((await result.json()).error,/Name/);
});
test('fourth framed option preview is available to authenticated owner',async()=>{
 const f=fixture(),id='c'.repeat(32);
 await f.uploads.setJSON(assetKey(id),{phase:'ready_for_approval'});
 await f.uploads.set('uploads/'+id+'/mockups/3.jpg',new Uint8Array([255,216,255]));
 const response=await f.handler(request('/poster/uploads/'+id+'/mockups/3'),f.context);
 assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/jpeg/);
});

test('first physical upload needs no reference while seller status remains owner-only',async()=>{
 const f=fixture(),state={phase:'seller_consent_required',checkedAt:Date.now()};await f.uploads.setJSON('template/catalog-status',state);
 const page=await f.handler(request('/poster/upload'),f.context);assert.equal(page.status,200);
 const html=await page.text();assert.match(html,/seller authorisation has not been established/);assert.match(html,/Check Etsy connection/);assert.match(html,/no previous listing needed/i);
 const status=await f.handler(request('/poster/catalog/status'),f.context);assert.equal((await status.json()).phase,'seller_consent_required');
 const payload=JSON.stringify({filename:'47271.png',bytes:12345,metadata:{name:'Coast to Coast Walk Poster',kind:'artwork'}});
 const rejected=await f.handler(request('/poster/uploads','POST',payload),f.context);assert.equal(rejected.status,201);const {id}=await rejected.json();assert.equal((await f.uploads.get(assetKey(id))).referenceListingId,null);
 assert.equal(f.uploads.map.has('template/settings'),false);
});
test('catalogue refresh is private, CSRF protected and never creates a product or merchant listing',async()=>{
 const f=fixture();assert.equal((await f.handler(new Request(origin+'/poster/catalog/refresh',{method:'POST'}),f.context)).status,401);
 assert.equal((await f.handler(request('/poster/catalog/refresh','POST',null,{'X-Poster-CSRF':'wrong'}),f.context)).status,403);
 const r=await f.handler(request('/poster/catalog/refresh','POST'),f.context);assert.equal(r.status,202);
 assert.equal((await r.json()).phase,'pending');assert.equal((await f.uploads.get('template/catalog-status')).phase,'pending');
 await Promise.all(f.pending);assert.equal(f.sent.length,1);
 assert.doesNotMatch(JSON.stringify(f.sent),/PrintShrimp|etsy.com\/v3|\/approve/);
});

test('owner status endpoint safely includes the physical Etsy choices already synced by GitHub',async()=>{
 const f=fixture();await f.uploads.setJSON('template/catalog-status',{phase:'available',count:2,checkedAt:12345});
 await f.uploads.setJSON('template/catalog',{shopId:444,listings:[{listing_id:123,shop_id:444,listing_type:'physical',title:'Travel poster reference'},{listing_id:124,shop_id:444,listing_type:'digital',title:'Digital ZIP'},{listing_id:125,shop_id:999,listing_type:'physical',title:'Other shop'}]});
 const res=await f.handler(request('/poster/catalog/status'),f.context);
 assert.equal(res.status,200);const d=await res.json();assert.equal(d.phase,'available');assert.deepEqual(d.listings,[{id:123,title:'Travel poster reference'}]);
 const page=await f.handler(request('/poster/upload'),f.context);
 assert.match(await page.text(),/data-phase="available"/);
 const denied=await f.handler(new Request(origin+'/poster/catalog/status'),f.context);
 assert.equal(denied.status,401);
});
test('pending Etsy reference status exposes no stale listings or seller credentials',async()=>{
 const f=fixture();await f.uploads.setJSON('template/catalog-status',{phase:'pending',checkedAt:Date.now()});
 await f.uploads.setJSON('template/catalog',{shopId:444,listings:[{listing_id:123,shop_id:444,listing_type:'physical',title:'Old listing'}]});
 const res=await f.handler(request('/poster/catalog/status'),f.context);
 const d=await res.json();assert.equal(d.phase,'pending');assert.deepEqual(d.listings,[]);
 assert.doesNotMatch(JSON.stringify(d),/token|secret|Old listing/);
});

test('old pending Etsy API status becomes a useful stalled warning instead of indefinitely queued',async()=>{
 const f=fixture();await f.uploads.setJSON('template/catalog-status',{phase:'pending',checkedAt:Date.now()-20*60*1000});
 const res=await f.handler(request('/poster/catalog/status'),f.context);
 assert.equal(res.status,200);assert.equal((await res.json()).phase,'worker_delayed');
});
test('a completed private queue job without its final Etsy API status is identified safely',async()=>{
 const queue=memory(),uploads=memory(),pending=[],sent=[],key='jobs/'+'q'.repeat(32);
 await queue.setJSON(key,{phase:'complete',action:'catalog',id:'q'.repeat(32)});
 await uploads.setJSON('template/catalog-status',{phase:'pending',jobKey:key,checkedAt:Date.now()});
 const handler=createPosterUploadHandler({env,uploads,queue,request:async(url,o)=>{sent.push([url,o]);return new Response(null,{status:202});}});
 const response=await handler(request('/poster/catalog/status'),{waitUntil:p=>pending.push(p)});
 assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.phase,'worker_finished_no_result');
 assert.equal(data.listings.length,0);assert.doesNotMatch(JSON.stringify(data),/jobs\//);
});

test('new first-product upload ignores a stale reference default and rejects an invalid explicit reference',async()=>{
 const f=fixture();await f.uploads.setJSON('template/settings',{referenceListingId:789,physicalSetup:{phase:'ready'}});
 const body={filename:'Coast.png',bytes:100,metadata:{kind:'artwork'}};
 const response=await f.handler(request('/poster/uploads','POST',JSON.stringify(body)),f.context);assert.equal(response.status,201);
 const {id}=await response.json();assert.equal((await f.uploads.get(assetKey(id))).referenceListingId,null);assert.equal((await f.uploads.get('template/settings')).referenceListingId,789);
 const invalid=await f.handler(request('/poster/uploads','POST',JSON.stringify({...body,referenceListingId:'wrong'})),f.context);assert.equal(invalid.status,400);
});

test('expired API session returns a typed JSON error while normal studio navigation still redirects to login',async()=>{
 const f=fixture();const api=await f.handler(new Request(origin+'/poster/uploads',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}}),f.context);
 assert.equal(api.status,401);assert.match(api.headers.get('Content-Type'),/application\/json/);assert.equal((await api.json()).code,'studio_session_required');assert.equal(api.headers.get('Location'),null);assert.equal(f.uploads.map.size,0);
 const page=await f.handler(new Request(origin+'/poster/upload'),f.context);assert.equal(page.status,303);assert.equal(page.headers.get('Location'),'/poster/workflow');
});

test('seasonal labels are private and cannot alter Etsy listings',async()=>{
 const f=fixture(),now=Date.now();
 const audit={version:1,shopId:456,checkedAt:now,intendedProfile:{id:11},summary:{activePhysical:1,activeCorrectDelivery:1,activeOtherDelivery:0,unverifiedSupplier:0},listings:[{id:123,title:'Robin',section:'Nature',state:'active',deliveryMatches:true,shippingProfileId:11,supplierMapping:'recorded',sku:['SP-ROBIN']}]};
 await f.uploads.setJSON('catalogue/audit-status',{phase:'available',checkedAt:now,summary:audit.summary});
 await f.uploads.setJSON('catalogue/audit',audit);
 const page=await f.handler(request('/poster/catalogue'),f.context);
 assert.equal(page.status,200);
 assert.match(await page.text(),/Seasonal group labels/);
 const path='/poster/catalogue/labels';
 const bad=await f.handler(request(path,'POST',JSON.stringify({id:123,seasons:['All year','Christmas']})),f.context);
 assert.equal(bad.status,409);
 assert.equal((await f.handler(request(path,'POST',JSON.stringify({id:124,seasons:['Spring']})),f.context)).status,409);
 assert.equal((await f.handler(request(path,'POST',JSON.stringify({id:123,seasons:['Spring']}),{'X-Poster-CSRF':'wrong'}),f.context)).status,403);
 const saved=await f.handler(request(path,'POST',JSON.stringify({id:123,seasons:['Spring','Easter']})),f.context);
 assert.equal(saved.status,200);
 assert.deepEqual((await f.uploads.get('catalogue/labels/123')).seasons,['Spring','Easter']);
 assert.equal(f.sent.length,0);
 const again=await f.handler(request('/poster/catalogue'),f.context);
 assert.match(await again.text(),/value="Spring" checked/);
});

test('SEO comparison is queued for seller-authorised worker and never uses the limited website client',async()=>{
 const f=fixture();
 const result=await f.handler(request('/poster/seo/prepare','POST','{}',{'Content-Type':'application/json'}),f.context);
 assert.equal(result.status,202);assert.equal((await result.json()).phase,'pending');
 assert.equal((await f.uploads.get('seo/audit-status')).phase,'pending');
 assert.equal((await f.handler(request('/poster/seo/status'),f.context)).status,200);
 assert.equal((await f.handler(request('/poster/seo/apply','POST','{}',{'Content-Type':'application/json'}),f.context)).status,503);
 await Promise.all(f.pending);
 assert.equal(f.sent.length,1);
 assert.doesNotMatch(JSON.stringify(f.sent),/openapi.etsy.com|printshrimp.com/);
 const repeat=await f.handler(request('/poster/seo/prepare','POST','{}',{'Content-Type':'application/json'}),f.context);
 assert.equal(repeat.status,202);
 assert.equal(f.sent.length,1);
});

test('stalled delivery audits are reported and repeated button presses do not double queue work',async()=>{
 const f=fixture();
 await f.uploads.setJSON('catalogue/audit-status',{phase:'pending',checkedAt:Date.now()-20*60*1000});
 const stalled=await f.handler(request('/poster/catalogue/status'),f.context);
 assert.equal((await stalled.json()).phase,'worker_delayed');
 const page=await f.handler(request('/poster/catalogue'),f.context);
 assert.match(await page.text(),/not finished after four minutes/);
 const retry=await f.handler(request('/poster/catalog/refresh','POST'),f.context);
 assert.equal(retry.status,202);
 assert.equal((await retry.json()).phase,'pending');
 const current=await f.handler(request('/poster/catalogue/status'),f.context);
 assert.equal((await current.json()).phase,'pending');
 const duplicate=await f.handler(request('/poster/catalog/refresh','POST'),f.context);
 assert.equal(duplicate.status,202);
 await Promise.all(f.pending);
 assert.equal(f.sent.length,1);
});
test('a delivery audit dispatch error is not left in a pending state',async()=>{
 const f=fixture();
 const handler=createPosterUploadHandler({env,uploads:f.uploads,dispatchJob:async()=>{throw Error('simulated dispatch failure');}});
 const res=await handler(request('/poster/catalog/refresh','POST'),f.context);
 assert.equal(res.status,503);
 assert.equal((await f.uploads.get('catalogue/audit-status')).phase,'needs_investigation');
});

test('Animal Alphabet shipping correction is single-confirmation and dispatched only to seller worker',async()=>{
 const f=fixture(),now=Date.now();
 const audit={version:1,shopId:456,checkedAt:now,intendedProfile:{id:316400055692},summary:{activePhysical:1,activeCorrectDelivery:0,activeOtherDelivery:1,unverifiedSupplier:1},listings:[{id:4589715100,title:'Animal Alphabet',section:'Early Learning',state:'active',deliveryMatches:false,shippingProfileId:316847314881,supplierMapping:'not_verified',sku:['SP-EL-005-ANIMAL-ALPHABET']}]};
 await f.uploads.setJSON('catalogue/audit-status',{phase:'available',checkedAt:now,summary:audit.summary});
 await f.uploads.setJSON('catalogue/audit',audit);
 const page=await f.handler(request('/poster/catalogue'),f.context);
 assert.equal(page.status,200);assert.match(await page.text(),/Confirm delivery profile correction/);
 const endpoint='/poster/catalogue/repair';
 assert.equal((await f.handler(request(endpoint,'POST',JSON.stringify({listingId:4589715100,confirm:false}),{'Content-Type':'application/json'}),f.context)).status,409);
 assert.equal((await f.handler(request(endpoint,'POST',JSON.stringify({listingId:4589715101,confirm:true}),{'Content-Type':'application/json'}),f.context)).status,409);
 assert.equal((await f.handler(request(endpoint,'POST',JSON.stringify({listingId:4589715100,confirm:true}),{'Content-Type':'application/json','X-Poster-CSRF':'bad'}),f.context)).status,403);
 assert.equal(f.sent.length,0);
 const accepted=await f.handler(request(endpoint,'POST',JSON.stringify({listingId:4589715100,confirm:true}),{'Content-Type':'application/json'}),f.context);
 assert.equal(accepted.status,202);assert.equal((await accepted.json()).phase,'pending');
 assert.equal((await f.uploads.get('catalogue/repair-status')).phase,'pending');
 await Promise.all(f.pending);
 assert.equal(f.sent.length,1);
 assert.equal((await f.handler(request(endpoint,'POST',JSON.stringify({listingId:4589715100,confirm:true}),{'Content-Type':'application/json'}),f.context)).status,409);
 assert.equal((await f.handler(request('/poster/catalogue/repair/status'),f.context)).status,200);
});

test('link existing bulk products requires owner approval and a recent matching catalogue',async()=>{
 const f=fixture(),time=Date.now();
 const ids=[4589703441,4589703919];
 const audit={version:1,shopId:456,checkedAt:time,intendedProfile:{id:316400055692},summary:{activePhysical:2,activeCorrectDelivery:2,activeOtherDelivery:0,unverifiedSupplier:2},listings:ids.map((id,i)=>({id,state:'active',supplierMapping:'not_verified',supplierCheck:'product_found',supplierProductId:'Supplier-'+i,sku:['SP-EL-'+i]}))};
 await f.uploads.setJSON('catalogue/audit-status',{phase:'available',checkedAt:time,summary:audit.summary});
 await f.uploads.setJSON('catalogue/audit',audit);
 await f.uploads.setJSON('template/catalog',{shopId:456});
 const p='/poster/catalogue/link-existing';
 assert.equal((await f.handler(request(p,'POST',JSON.stringify({confirm:false,ids})),f.context)).status,409);
 assert.equal((await f.handler(request(p,'POST',JSON.stringify({confirm:true,ids:[9999999999]})),f.context)).status,409);
 assert.equal((await f.handler(request(p,'POST',JSON.stringify({confirm:true,ids}),{'X-Poster-CSRF':'bad'}),f.context)).status,403);
 const page=await f.handler(request('/poster/catalogue'),f.context);
 assert.match(await page.text(),/Save verified existing product references/);
 const r=await f.handler(request(p,'POST',JSON.stringify({confirm:true,ids})),f.context);
 assert.equal(r.status,200);
 assert.equal((await r.json()).linked.length,2);
 assert.equal((await f.uploads.get('catalogue/external/'+ids[0])).source,'printshrimp_bulk');
 assert.equal(f.sent.length,0);
 assert.equal(f.pending.length,0);
});
