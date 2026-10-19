import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {seal} from '../lib/oauth.mjs';

const origin='https://poster.example.test',secret='a-test-encryption-key-of-sufficient-length';
const env=n=>({CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'owner-password',POSTER_PUBLICATION_ENABLED:'true',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared'}[n]);
function store(){
 const db=new Map();
 return {db,get:async key=>db.get(key)??null,set:async(k,v,o)=>{if(o?.onlyIfNew&&db.has(k))return {modified:false};db.set(k,v);return {modified:true};},
 setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&db.has(k))return {modified:false};db.set(k,v);return {modified:true};},
 list:async function*({prefix=''}){yield {blobs:[...db.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}}
}
const auth='__Host-poster_owner='+seal({csrf:'token',expiry:Date.now()+3600000},secret,'poster-owner');
const req=(path,method='GET',body,csrf='token')=>new Request(origin+path,{method,body,headers:{cookie:auth,origin,'X-Poster-CSRF':csrf,'Content-Type':'application/json'}});
test('private folder creation and first listing require authenticated owner, CSRF, and review worker',async()=>{
 const uploads=store(),work=[];
 const clock=()=>Date.now();
 const handler=createPosterUploadHandler({env,uploads,clock,dispatchJob:async(id,action)=>{work.push({id,action});return 'jobs/'+'a'.repeat(32);}});
 const context={waitUntil(){}};
 assert.equal((await handler(req('/poster/catalogue/website-folders','POST',JSON.stringify({title:'Christmas Woodland'}),'wrong'),context)).status,403);
 let r=await handler(req('/poster/catalogue/website-folders','POST',JSON.stringify({title:'Christmas Woodland'})),context);
 assert.equal(r.status,201);
 assert.equal((await r.json()).title,'Christmas Woodland');
 assert.equal((await handler(req('/poster/catalogue/website-folders','POST',JSON.stringify({title:'Christmas Woodland'})),context)).status,409);
 r=await handler(req('/poster/catalogue'),context);
 assert.equal(r.status,200);assert.match(await r.text(),/Christmas Woodland/);
 const id='s'.repeat(32);
 await uploads.setJSON('uploads/'+id+'/state',{phase:'stored',type:'physical',storeOnly:true,productId:id,masterKey:'uploads/'+id+'/master.png',filename:'Owl.png',createdAt:clock(),metadata:{name:'Owl',sectionTitle:'Nature',websiteFolder:'Christmas Woodland'}});
 await uploads.setJSON('products/'+id+'/record',{productId:id,phase:'stored',pendingRevision:id,storeOnly:true,createdAt:clock(),metadata:{name:'Owl',websiteFolder:'Christmas Woodland'},etsyListingId:null});
 assert.equal((await handler(req('/poster/stored/'+id+'/prepare','POST',null,'bad'),context)).status,403);
 r=await handler(req('/poster/stored/'+id+'/prepare','POST'),context);
 assert.equal(r.status,202);assert.equal((await r.json()).phase,'preparing');
 assert.deepEqual(work,[{id,action:'prepare'}]);
 assert.equal((await handler(req('/poster/stored/'+id+'/prepare','POST'),context)).status,409);
 const page=await handler(req('/poster/upload?id='+id),context);
 assert.equal(page.status,200);
 assert.doesNotMatch(await page.text(),/Stored privately:/);
 const stranger=await handler(new Request(origin+'/poster/catalogue/website-folders',{method:'POST',body:'{}'}),context);
 assert.equal(stranger.status,303);assert.equal(stranger.headers.get('Location'),'/poster/workflow');
});
