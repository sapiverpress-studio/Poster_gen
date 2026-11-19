import test from 'node:test';
import assert from 'node:assert/strict';
import {LEAD_STATE} from '../lib/etsy-artwork-first.mjs';
import {reconcileArtworkFirstAudit} from '../lib/etsy-artwork-reconcile.mjs';
import {handleArtworkFirst} from '../lib/etsy-artwork-first-web.mjs';
import {config as posterUploadRoutes} from '../netlify/functions/poster-upload.mjs';

const auditId='a'.repeat(32),applyId='b'.repeat(32),reconcileId='c'.repeat(32);
function fixtures({uncertain=false}={}){
 const mem=new Map();
 const state={
  version:1,id:auditId,applyId,shopId:123,phase:'reconcile_queued',reconcileId,
  createdAt:1000,approvedAt:1200,updatedAt:2000,
  rows:[
   {id:10,title:'Print number one',type:'physical',status:'ready',oldImageIds:[101,102]},
   {id:11,title:'Print number two',type:'physical',status:'ready',oldImageIds:[201,202]},
   {id:12,title:'No verified source',type:'physical',status:'skipped'}
  ],results:[{id:10,status:'verified',newImageId:999}],activeIds:[10,11,12]
 };
 mem.set(LEAD_STATE,state);
 const uploads={get:async k=>mem.get(k)||null,setJSON:async(k,v)=>{mem.set(k,structuredClone(v));return{modified:true}}};
 let writes=0;
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:123}),api:async(path,opts={})=>{
  if(opts.method){writes++;throw Error('Reconciliation must never write to Etsy');}
  if(path==='/listings/10')return {listing_id:10,shop_id:123,state:'active',listing_type:'physical',title:'Print number one'};
  if(path==='/listings/11')return {listing_id:11,shop_id:123,state:'active',listing_type:'physical',title:'Print number two'};
  if(path==='/listings/10/images')return{results:[
   {listing_id:10,listing_image_id:999,rank:1,alt_text:'Sapiver artwork-first: Print number one. Full front view'},
   {listing_id:10,listing_image_id:101,rank:2},{listing_id:10,listing_image_id:102,rank:3}]};
  if(path==='/listings/11/images')return{results:uncertain?[
   {listing_id:11,listing_image_id:888,rank:1,alt_text:'Unknown manual image'},
   {listing_id:11,listing_image_id:201,rank:2},{listing_id:11,listing_image_id:202,rank:3}
  ]:[{listing_id:11,listing_image_id:201,rank:1},{listing_id:11,listing_image_id:202,rank:2}]};
  throw Error('Unexpected mock Etsy request '+path);
 }};
 return{uploads,client,get:()=>mem.get(LEAD_STATE),writes:()=>writes};
}

test('read-only recovery confirms exact first-image receipt and unlocks new audit for unchanged gallery',async()=>{
 const f=fixtures();
 const result=await reconcileArtworkFirstAudit({client:f.client,uploads:f.uploads,id:reconcileId,clock:()=>100000});
 assert.deepEqual(result,{phase:'reconciled',confirmed:1,unchanged:1,uncertain:0});
 assert.equal(f.writes(),0);
 const final=f.get();
 assert.equal(final.phase,'reconciled');
 assert.equal(final.reconciliation.checked,2);
 assert.equal(final.results[0].newImageId,999,'original proof preserved');
 const owner={csrf:'csrf-token'};
 const page=await handleArtworkFirst({req:new Request('https://site.example/poster/lead-images'),path:'/poster/lead-images',
  uploads:f.uploads,owner,dispatch:async()=>{throw Error('Must not dispatch')},page:body=>Response.json({body}),esc:x=>String(x)});
 const text=(await page.json()).body;
 assert.match(text,/Check all Etsy listing images/);
 assert.doesNotMatch(text,/id="lead-preview" type="button" disabled/);
 assert.match(text,/1 confirmed updated/);
});

test('uncertain Etsy image order remains blocked without uploading or dropping old receipts',async()=>{
 const f=fixtures({uncertain:true});
 const result=await reconcileArtworkFirstAudit({client:f.client,uploads:f.uploads,id:reconcileId,clock:()=>100000});
 assert.deepEqual(result,{phase:'needs_investigation',confirmed:1,unchanged:0,uncertain:1});
 assert.equal(f.writes(),0);
 assert.equal(f.get().results[0].newImageId,999);
 assert.match(f.get().reconciliation.results[1].reason,/gallery differs/);
});

test('read-only reconciliation requires the existing exact matching task and aged saved batch',async()=>{
 const f=fixtures();
 await assert.rejects(reconcileArtworkFirstAudit({client:f.client,uploads:f.uploads,id:'z'.repeat(32),clock:()=>100000}),/Previous Etsy operation/);
 await assert.rejects(reconcileArtworkFirstAudit({client:f.client,uploads:f.uploads,id:reconcileId,clock:()=>2500}),/Previous Etsy operation/);
 assert.equal(f.writes(),0);
});

test('owner session and CSRF required to queue a read-only reconciliation',async()=>{
 const f=fixtures();
 await f.uploads.setJSON(LEAD_STATE,{...f.get(),phase:'needs_investigation'});
 const owner={csrf:'csrf-token'};
 const res=await handleArtworkFirst({req:new Request('https://site.example/poster/lead-images/reconcile',{method:'POST',headers:{'x-poster-csrf':'wrong'}}),
  path:'/poster/lead-images/reconcile',uploads:f.uploads,owner,dispatch:async()=>{throw Error('Must not dispatch')},page:()=>{throw Error('Must not render')},esc:x=>String(x),clock:()=>100000});
 assert.equal(res.status,403);
});

test('Netlify explicitly routes owner-only read-only reconciliation to the poster function',()=>{
 assert.ok(posterUploadRoutes.path.includes('/poster/lead-images/reconcile'));
 assert.ok(posterUploadRoutes.path.includes('/poster/lead-images/status'));
});
