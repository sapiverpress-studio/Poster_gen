import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {monthlyUploadStatus} from '../lib/monthly-upload-limit.mjs';
import {seal} from '../lib/oauth.mjs';
const origin='https://poster.example.test',now=Date.parse('2026-10-21T05:30:00Z');
const secret='a-test-encryption-key-of-sufficient-length';
const env=n=>({CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'owner-password',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',POSTER_PUBLICATION_ENABLED:'true'}[n]);
function store(){const m=new Map();return {m,get:async k=>m.get(k)??null,setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&m.has(k))return{modified:false};m.set(k,v);return{modified:true};},
 list:async function*({prefix=''}){yield{blobs:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}};}
const cookie='__Host-poster_owner='+seal({csrf:'owner-trio-csrf',expiry:now+3600000},secret,'poster-owner');
const request=(url,body,token='owner-trio-csrf')=>new Request(origin+url,{method:'POST',body:JSON.stringify(body),headers:{cookie,origin,'Content-Type':'application/json','X-Poster-CSRF':token}});
const names=['fox','robin','hedgehog','badger','squirrel','deer'];
const tags=n=>['woodland wall art','nature picture set','british animal art','kids reading nook','forest wall decor','woodland nursery','animal print trio','art set of three','nature illustration','nature room prints','animal verse prints','bedroom wall prints',n===1?'woodland animals':'forest nature art'];
function trio(n,group){
 return {title:'British Woodland Trio '+n,listingTitle:'British Woodland Trio '+n+' Set of 3 A4 Prints',
 sectionTitle:'Nature',size:'A4',members:group,tags:tags(n),description:'Three unframed A4 prints designed as a distinct British Woodland Verse group '+n+'. Includes '+group.join(', ')+
 '. These prints are physical artwork without frames, chosen and reviewed by Sapiver Prints with AI-assisted illustration and text creation. The exact three separate prints are included.'};
}
function setup(){
 const uploads=store(),dispatched=[],items=[];
 for(let n=0;n<6;n++){
  const id=String(n+1).repeat(32),sha256=(n+1).toString(16).repeat(64),folder='Collection/'+names[n],
   sku='SP-WOOD-'+names[n].toUpperCase(),listingId=4598000000+n;
  const meta={etsyTitle:'Woodland '+names[n]+' Print',sectionTitle:'Nature',printSizes:['A5','A4']};
  uploads.m.set('uploads/'+id+'/state',{phase:'published',type:'physical',createdAt:now,productId:id,
   listingId,supplierProductId:'ps-'+n,image:{sha256},metadata:meta,plan:{identity:{sku}}});
  uploads.m.set('products/'+id+'/record',{productId:id,type:'physical',phase:'published',createdAt:now,publicationSlotAt:now});
  items.push({id,sha256,folder,listingTitle:meta.etsyTitle,sectionTitle:'Nature',printSizes:meta.printSizes});
 }
 const body={items,trios:[trio(1,names.slice(0,3)),trio(2,names.slice(3))],
 inputs:[{sku:'SP-WOODLAND-TRIO-ONE',title:'Woodland A4 Print Set First',discount:15},{sku:'SP-WOODLAND-TRIO-TWO',title:'Woodland A4 Print Set Second',discount:10}]};
 const handler=createPosterUploadHandler({env,uploads,clock:()=>now,dispatchJob:async(id,action)=>{dispatched.push({id,action});}});
 return {handler,uploads,body,dispatched};
}
test('fully published six originals create exactly two individually prepared bundle records and eight monthly slots',async()=>{
 const {handler,uploads,body,dispatched}=setup();
 let response=await handler(request('/poster/bulk/trios',body),{waitUntil(){}});
 assert.equal(response.status,201,await response.clone().text());
 const outcome=await response.json();
 assert.equal(outcome.totalListings,8);
 assert.equal(outcome.bundleListings,2);
 assert.equal(outcome.ids.length,2);
 assert.equal(new Set(outcome.ids).size,2);
 assert.equal(dispatched.length,2);
 assert.deepEqual(dispatched.map(x=>x.action),['prepare','prepare']);
 const first=uploads.m.get('uploads/'+outcome.ids[0]+'/state');
 const second=uploads.m.get('uploads/'+outcome.ids[1]+'/state');
 assert.deepEqual(first.trio.members,names.slice(0,3));
 assert.deepEqual(second.trio.members,names.slice(3));
 assert.notEqual(first.trio.description,second.trio.description);
 assert.notDeepEqual(first.trio.tags,second.trio.tags);
 assert.notEqual(first.sku,second.sku);
 assert.equal((await monthlyUploadStatus({uploads,clock:()=>now})).used,8);
 response=await handler(request('/poster/bulk/trios',body),{waitUntil(){}});
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).ids,outcome.ids);
 assert.equal(dispatched.length,2);
});
test('wrong CSRF and overlapping trio member are rejected without reservations',async()=>{
 const a=setup();
 const denied=await a.handler(request('/poster/bulk/trios',a.body,'wrong'),{waitUntil(){}});
 assert.equal(denied.status,403);
 const b=setup();b.body.trios[1].members[0]='fox';
 const overlap=await b.handler(request('/poster/bulk/trios',b.body),{waitUntil(){}});
 assert.equal(overlap.status,409);
 assert.match((await overlap.json()).error,/both trio/);
 assert.equal((await monthlyUploadStatus({uploads:b.uploads,clock:()=>now})).used,6);
 assert.equal(b.dispatched.length,0);
});
test('unpublished member, changed artwork or duplicate live supplier SKUs prevent queueing',async()=>{
 for(const mutate of [
  a=>{a.uploads.m.get('uploads/'+a.body.items[1].id+'/state').phase='ready_for_approval';},
  a=>{a.uploads.m.get('uploads/'+a.body.items[1].id+'/state').image.sha256='b'.repeat(64);},
  a=>{a.uploads.m.get('uploads/'+a.body.items[4].id+'/state').plan.identity.sku=a.uploads.m.get('uploads/'+a.body.items[3].id+'/state').plan.identity.sku;}
 ]){
  const setupState=setup();mutate(setupState);
  const res=await setupState.handler(request('/poster/bulk/trios',setupState.body),{waitUntil(){}});
  assert.equal(res.status,409);
  assert.equal(setupState.dispatched.length,0);
  assert.equal((await monthlyUploadStatus({uploads:setupState.uploads,clock:()=>now})).used,6);
 }
});

test('manually typed client SKUs are ignored: server assigns distinct PrintShrimp bundle SKUs from verified products',async()=>{
 const a=setup();
 a.body.inputs[0].sku='DUPLICATE-USER-SKU';
 a.body.inputs[1].sku='DUPLICATE-USER-SKU';
 const res=await a.handler(request('/poster/bulk/trios',a.body),{waitUntil(){}});
 assert.equal(res.status,201,await res.clone().text());
 const out=await res.json();
 assert.equal(out.skus?.length,2);
 assert.match(out.skus[0],/^SP-TRIO-[A-F0-9]{24}$/);
 assert.match(out.skus[1],/^SP-TRIO-[A-F0-9]{24}$/);
 assert.notEqual(out.skus[0],out.skus[1]);
 assert.ok(out.skus.every(s=>s!=='DUPLICATE-USER-SKU'));
 assert.equal(a.uploads.m.get('uploads/'+out.ids[0]+'/state').sku,out.skus[0]);
 assert.equal(a.uploads.m.get('uploads/'+out.ids[1]+'/state').sku,out.skus[1]);
 const second=await a.handler(request('/poster/bulk/trios',a.body),{waitUntil(){}});
 assert.equal(second.status,200);
 assert.deepEqual((await second.json()).skus,out.skus);
});
