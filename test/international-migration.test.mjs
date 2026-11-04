import test from 'node:test';
import assert from 'node:assert/strict';
import {previewInternationalMigration,applyInternationalMigration} from '../lib/international-shipping-migration.mjs';
const money=p=>({amount:Math.round(p*100),divisor:100,currency_code:'GBP'});
const destination=(iso,price=0)=>({destination_country_iso:iso,primary_cost:money(price),secondary_cost:money(0),shipping_carrier_id:9,mail_class:'standard'});
function merchant(){
 const row={listing_id:101,shop_id:456,listing_type:'physical',state:'active',title:'Test Poster',
  description:'Printed wall art',skus:['SP-TEST'],shipping_profile_id:11,tags:['poster']};
 const origin={title:'PrintShrimp — Posters',shipping_profile_id:11,origin_country_iso:'GB',
  shipping_profile_destinations:[destination('GB')],origin_postal_code:'RM6 6AX'};
 const international={title:'PrintShrimp — International Test',shipping_profile_id:99,origin_country_iso:'GB',
  origin_postal_code:'RM6 6AX',shipping_profile_destinations:[destination('GB'),destination('US'),destination('CA'),destination('AU'),destination('NZ',14.99)]};
 const events=[];let profileId=11,unsafe=false;
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:456}),api:async (path,opts)=>{
  events.push({path,method:opts?.method||'GET',body:opts?.body});
  if(path==='/shops/456/shipping-profiles?limit=100')return {results:[origin,international]};
  if(path==='/shops/456/shipping-profiles/11')return origin;
  if(path==='/shops/456/shipping-profiles/99')return international;
  if(path.startsWith('/shops/456/listings?'))return {count:1,results:[{...row,shipping_profile_id:profileId}]};
  if(path==='/listings/101?includes=Images')return {...row,shipping_profile_id:profileId,...(unsafe?{title:'Unexpected title'}:{})};
  if(path==='/listings/101/inventory')return {products:[{sku:'SP-TEST',offerings:[{price:money(15.99)}]}]};
  if(path==='/shops/456/listings/101'&&opts?.method==='PATCH'){
   assert.equal(opts.body,'shipping_profile_id=99');profileId=99;return {...row,shipping_profile_id:99};
  }
  throw Error('Unexpected Etsy API call '+path);
 }};
 const records=new Map();
 const store={setJSON:async(key,value,opts)=>{
  if(opts?.onlyIfNew&&records.has(key))return {modified:false};
  records.set(key,value);return {modified:true};
 }};
 return {client,store,events,records,markUnsafe:()=>{unsafe=true}};
}

test('read-only preview and exact one-listing PATCH preserve all SKU, inventory and metadata',async()=>{
 const m=merchant();
 const preview=await previewInternationalMigration({client:m.client});
 assert.equal(preview.numberToUpdate,1);
 assert.equal(preview.candidates[0].skus[0],'SP-TEST');
 assert.ok(m.events.every(x=>x.method==='GET'));
 await assert.rejects(applyInternationalMigration({client:m.client,store:m.store,plan:preview,approvalHash:preview.approvalHash}),/approval/);
 const result=await applyInternationalMigration({client:m.client,store:m.store,plan:preview,approvalHash:preview.approvalHash,approved:true,enabled:true});
 assert.deepEqual(result,{verified:1,remaining:0,shopId:456});
 assert.equal(m.events.filter(x=>x.method==='PATCH').length,1);
 assert.equal(m.records.get('international-delivery-migration/101').phase,'verified');
 await assert.rejects(applyInternationalMigration({client:m.client,store:m.store,plan:preview,approvalHash:preview.approvalHash,approved:true,enabled:true}),/changed since approval/);
 assert.equal(m.events.filter(x=>x.method==='PATCH').length,1);
});

test('modified plan and changed listing cannot migrate',async()=>{
 const m=merchant(),preview=await previewInternationalMigration({client:m.client});
 await assert.rejects(applyInternationalMigration({client:m.client,store:m.store,plan:{...preview,candidates:[{listingId:999,skus:['SP-TEST']}]},approvalHash:preview.approvalHash,approved:true,enabled:true}),/altered/);
 m.markUnsafe();
 await assert.rejects(applyInternationalMigration({client:m.client,store:m.store,plan:preview,approvalHash:preview.approvalHash,approved:true,enabled:false}),/release/);
 assert.equal(m.events.filter(x=>x.method==='PATCH').length,0);
});
