import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyUploadStatus,reserveMonthlyUpload,ukUploadMonth,MONTHLY_UPLOAD_LIMIT} from '../lib/monthly-upload-limit.mjs';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {seal} from '../lib/oauth.mjs';

function memory(){
 const map=new Map();
 return {map,
  get:async key=>map.get(key)??null,
  setJSON:async(key,data,opts)=>{if(opts?.onlyIfNew&&map.has(key))return {modified:false};map.set(key,data);return {modified:true};},
  list:async function*({prefix=''}){yield {blobs:[...map.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}
 };
}
const id=i=>String(i).padStart(32,'a');
const monthStart=Date.parse('2026-10-15T08:00:00Z');
test('UK calendar months reset at local midnight, not UTC or after rolling 30 days',()=>{
 assert.equal(ukUploadMonth(Date.parse('2026-03-31T22:59:00Z')),'2026-03');
 assert.equal(ukUploadMonth(Date.parse('2026-03-31T23:00:00Z')),'2026-04');
 assert.equal(ukUploadMonth(Date.parse('2026-10-31T23:59:00Z')),'2026-10');
 assert.equal(ukUploadMonth(Date.parse('2026-11-01T00:00:00Z')),'2026-11');
});
test('legacy new products count without double-counting their new reservation',async()=>{
 const uploads=memory();
 for(let i=0;i<39;i++){const productId=id(i);await uploads.setJSON('products/'+productId+'/record',{productId,type:i%2?'digital':'physical',createdAt:monthStart});}
 let used=await monthlyUploadStatus({uploads,clock:()=>monthStart});
 assert.equal(used.used,39);assert.equal(used.remaining,1);assert.equal(used.label,'October 2026');
 const final=await reserveMonthlyUpload({uploads,productId:id(40),clock:()=>monthStart});
 assert.equal(final.accepted,true);
 await uploads.setJSON('products/'+id(40)+'/record',{productId:id(40),createdAt:monthStart});
 used=await monthlyUploadStatus({uploads,clock:()=>monthStart});
 assert.equal(used.used,40);assert.equal(used.remaining,0);
 const blocked=await reserveMonthlyUpload({uploads,productId:id(41),clock:()=>monthStart});
 assert.equal(blocked.accepted,false);assert.equal(blocked.status.used,40);
});
test('concurrent tabs cannot allocate more than forty distinct slots',async()=>{
 const uploads=memory();
 const results=await Promise.all(Array.from({length:55},(_,i)=>reserveMonthlyUpload({uploads,productId:id(i),clock:()=>monthStart})));
 assert.equal(results.filter(r=>r.accepted).length,MONTHLY_UPLOAD_LIMIT);
 assert.equal(results.filter(r=>!r.accepted).length,15);
 assert.equal((await monthlyUploadStatus({uploads,clock:()=>monthStart})).used,40);
});
test('a new UK calendar month opens new reservations while earlier month remains capped',async()=>{
 const uploads=memory();
 for(let i=0;i<40;i++)assert.equal((await reserveMonthlyUpload({uploads,productId:id(i),clock:()=>monthStart})).accepted,true);
 const november=Date.parse('2026-11-01T00:00:00Z');
 const status=await monthlyUploadStatus({uploads,clock:()=>november});
 assert.equal(status.used,0);assert.equal(status.remaining,40);
 assert.equal((await reserveMonthlyUpload({uploads,productId:id(41),clock:()=>november})).accepted,true);
 assert.equal((await monthlyUploadStatus({uploads,clock:()=>monthStart})).used,40);
});
test('authenticated new-upload form and API block the forty-first product but permit editing saved products',async()=>{
 const uploads=memory(),origin='https://poster.example.test',secret='a-test-encryption-key-of-sufficient-length';
 const env=n=>({CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'test-password',
  ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',POSTER_PUBLICATION_ENABLED:'true'}[n]);
 const owner=seal({csrf:'csrf',expiry:monthStart+3600000},secret,'poster-owner');
 const request=(path,method='GET',body)=>new Request(origin+path,{method,body,headers:{cookie:'__Host-poster_owner='+owner,origin,'X-Poster-CSRF':'csrf'}});
 const pending=[],handler=createPosterUploadHandler({uploads,env,clock:()=>monthStart,request:async()=>new Response(null,{status:202})});
 const context={waitUntil:p=>pending.push(p)};
 for(let i=0;i<40;i++)await reserveMonthlyUpload({uploads,productId:id(i),clock:()=>monthStart});
 let page=await handler(request('/poster/upload'),context);
 assert.equal(page.status,200);
 let markup=await page.text();
 assert.match(markup,/40 of 40 new products/);
 assert.match(markup,/Monthly limit reached/);
 assert.match(markup,/<button type="submit" disabled aria-disabled="true">Prepare my product/);
 const json=JSON.stringify({type:'physical',filename:'Another.png',bytes:33});
 const blocked=await handler(request('/poster/uploads','POST',json),context);
 assert.equal(blocked.status,409);assert.equal((await blocked.json()).code,'monthly_upload_limit');
 const previousId=id(60);
 await uploads.setJSON('products/'+previousId+'/record',{productId:previousId,type:'physical',metadata:{name:'Old Poster',kind:'artwork'},createdAt:Date.parse('2026-09-10T12:00:00Z'),currentRevision:previousId});
 await uploads.setJSON('uploads/'+previousId+'/state',{phase:'published',type:'physical',filename:'Old.png',sourceFilename:'Old.png',bytes:33,masterKey:'uploads/'+previousId+'/master.png',metadata:{name:'Old Poster',kind:'artwork'}});
 page=await handler(request('/poster/upload?update='+previousId),context);
 markup=await page.text();assert.doesNotMatch(markup,/<button type="submit" disabled aria-disabled="true">Prepare my product/);
 const edit=await handler(request('/poster/uploads','POST',JSON.stringify({type:'physical',updateProductId:previousId,reuseOriginal:true})),context);
 assert.equal(edit.status,201);
 assert.equal((await monthlyUploadStatus({uploads,clock:()=>monthStart})).used,40);
 await Promise.all(pending);
});
