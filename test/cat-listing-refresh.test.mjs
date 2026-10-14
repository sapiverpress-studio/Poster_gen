import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {refreshCatListing} from '../lib/cat-listing-refresh.mjs';
const old='a'.repeat(32),sku='SP-THIS-SEATS-TAKEN',listingId=4595028274;
function memory(){const data=new Map();return {data,get:async k=>data.get(k),set:async(k,v)=>data.set(k,v),setJSON:async(k,v,o={})=>{if(o.onlyIfNew&&data.has(k))return {modified:false};data.set(k,structuredClone(v));return {modified:true};}};}
function fixture({wrongSku=false,fail=false,pending=false}={}){
 const uploads=memory(),etsyStore=memory(),master=Buffer.from('original private master');
 const checksum=createHash('sha256').update(master).digest('hex');
 const plan={version:'sapiver-12-variants-v3',identity:{sku,name:'This seats taken',previewHashes:[]},body:{description:'old'},inventory:{products:[]},referenceListingId:null};
 uploads.data.set('uploads/'+old+'/state',{phase:'published',productId:old,type:'physical',listingId,supplierProductId:'supplier-original',masterKey:'uploads/'+old+'/master.png',image:{sha256:checksum},plan,metadata:{name:'This seats taken',kind:'artwork'}});
 uploads.data.set('uploads/'+old+'/master.png',master);
 uploads.data.set('products/'+old+'/record',{productId:old,type:'physical',currentRevision:old,pendingRevision:pending?'b'.repeat(32):null,etsyListingId:listingId,supplierProductId:'supplier-original'});
 etsyStore.data.set('draft/'+sku,{phase:'published',listingId,uploadId:old});
 let listing={listing_id:listingId,shop_id:456,state:'active',listing_type:'physical',title:'This seats taken Wall Art Print',description:'One physical, unframed paper poster in your selected size.\nA frame, mount and hanging accessories are not included.\nAI disclosure.',price:{amount:1399,divisor:100,currency_code:'GBP'},quantity:120,should_auto_renew:true};
 const originalListing=structuredClone(listing),inventory={products:Array.from({length:12},()=>({sku:wrongSku?'other':sku,offerings:[{price:13.99,quantity:10}]}))};
 let photos=Array.from({length:4},(_,i)=>({listing_id:listingId,listing_image_id:i+10,rank:i+1}));const writes=[];
 const client={session:async()=>({shop_id:456,shop_name:'SapiverPrints'}),api:async(path,o={})=>{
  if(o.method){writes.push([path,o]);if(fail)throw Error('ambiguous response');
   if(o.method==='POST'){assert.ok(o.body instanceof FormData);assert.equal(o.body.get('overwrite'),'true');assert.ok(o.body.get('image') instanceof Blob);const rank=Number(o.body.get('rank'));const photo={listing_id:listingId,listing_image_id:100+rank,rank};photos[rank-1]=photo;return photo;}
   if(o.method==='PATCH'){const fields=Object.fromEntries(new URLSearchParams(o.body));assert.deepEqual(Object.keys(fields),['description']);listing={...listing,...fields};return listing;}
   throw Error('unexpected write');
  }
  if(path.endsWith('/inventory'))return structuredClone(inventory);
  if(path.endsWith('/images'))return {results:structuredClone(photos)};
  if(path==='/listings/'+listingId)return structuredClone(listing);
  throw Error('unexpected endpoint');
 }};
 return {client,uploads,etsyStore,writes,originalListing,listing:()=>listing,mockups:async b=>{assert.ok(b.equals(master));return ['one','two','three','four'].map(v=>Buffer.from(v));}};
}
test('existing cat receives four verified overwrite photos and description only; mapping/master/history retained',async()=>{
 const f=fixture(),result=await refreshCatListing(f);assert.equal(result.phase,'verified');assert.equal(result.listingId,listingId);assert.deepEqual(result.imageIds,[101,102,103,104]);assert.equal(f.writes.length,5);
 const after=f.listing();assert.match(after.description,/Frame images are illustrative mockups/);assert.match(after.description,/AI disclosure/);
 const {description:_,...a}=after,{description:__,...b}=f.originalListing;assert.deepEqual(a,b);
 const record=await f.uploads.get('products/'+old+'/record');assert.notEqual(record.currentRevision,old);assert.equal(record.supplierProductId,'supplier-original');assert.equal((await f.uploads.get('uploads/'+old+'/state')).plan.body.description,'old');assert.equal((await f.etsyStore.get('draft/'+sku)).listingId,listingId);
 const again=await refreshCatListing(f);assert.equal(again.changed,false);assert.equal(f.writes.length,5);
});
test('wrong SKU, pending revision and master changes stop before any Etsy mutation',async()=>{
 for(const option of [{wrongSku:true},{pending:true},{corrupt:true}]){const f=fixture(option);if(option.corrupt)f.uploads.data.set('uploads/'+old+'/master.png',Buffer.from('changed'));await assert.rejects(refreshCatListing(f));assert.equal(f.writes.length,0);}
});
test('ambiguous image upload is recorded and never automatically replayed',async()=>{
 const f=fixture({fail:true});await assert.rejects(refreshCatListing(f));assert.equal(f.writes.length,1);await assert.rejects(refreshCatListing(f),/already claimed/);assert.equal(f.writes.length,1);assert.ok([...f.uploads.data.values()].some(v=>v?.presentationRefresh?.phase==='needs_investigation'));
});
