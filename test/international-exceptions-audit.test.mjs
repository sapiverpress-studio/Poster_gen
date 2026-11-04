import test from 'node:test';
import assert from 'node:assert/strict';
import {auditInternationalDeliveryExceptions} from '../lib/international-shipping-exceptions.mjs';

test('read-only audit isolates exactly two exceptions after 47 verified Etsy shipping changes',async()=>{
 const rows=Array.from({length:49},(_,index)=>{
  const listing_id=201+index;
  return {listing_id,shop_id:456,listing_type:'physical',state:'active',
   title:'Poster '+listing_id,shipping_profile_id:index===47?777:99};
 });
 const profiles=[
  {shipping_profile_id:11,title:'PrintShrimp — Posters'},
  {shipping_profile_id:99,title:'PrintShrimp — International Test'},
  {shipping_profile_id:777,title:'A different delivery profile'}
 ];
 const calls=[],reads=[];
 const client={
  session:async()=>({shop_name:'SapiverPrints',shop_id:456}),
  api:async(path,options)=>{
   assert.equal(options,undefined);calls.push(path);
   if(path==='/shops/456/shipping-profiles?limit=100')return {results:profiles};
   if(path.startsWith('/shops/456/listings?'))return {count:49,results:rows};
   if(path==='/shops/456/shipping-profiles/777')return {shipping_profile_id:777,
    title:'A different delivery profile',is_deleted:false,origin_country_iso:'GB',
    shipping_profile_destinations:[{destination_country_iso:'GB',
     primary_cost:{amount:0,divisor:100,currency_code:'GBP'},
     secondary_cost:{amount:0,divisor:100,currency_code:'GBP'}}]};
   if(path==='/shops/456/shipping-profiles/99')return {shipping_profile_id:99,
    title:'PrintShrimp — International Test',is_deleted:false,origin_country_iso:'GB',
    shipping_profile_destinations:[]};
   throw Error('unexpected Etsy read '+path);
  }
 };
 const store={get:async(key,args)=>{
  reads.push(key);
  assert.deepEqual(args,{type:'json',consistency:'strong'});
  const id=Number(key.split('/').at(-1));
  if(id>=201&&id<=247)return {phase:'verified',listingId:id,targetId:99};
  return null;
 }};
 const report=await auditInternationalDeliveryExceptions({client,store,clock:()=>123456});
 assert.equal(report.activePhysical,49);
 assert.equal(report.verifiedMigrated,47);
 assert.equal(report.exceptionCount,2);
 assert.deepEqual(report.exceptions.map(row=>({
  listingId:row.listingId,profileId:row.profileId,profileName:row.profileName
 })),[
  {listingId:248,profileId:777,profileName:'A different delivery profile'},
  {listingId:249,profileId:99,profileName:'PrintShrimp — International Test'}
 ]);
 assert.equal(reads.length,49);
 assert.ok(reads.every(x=>/^international-delivery-migration\/[1-9][0-9]*$/.test(x)));
 assert.equal(calls.length,4);
 assert.equal(report.exceptions[0].lookupStatus,'available');
});

test('unverified or changed migration receipt is shown, never counted as migrated',async()=>{
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:456}),api:async path=>{
  if(path.endsWith('/shipping-profiles?limit=100'))
   return {results:[{shipping_profile_id:99,title:'PrintShrimp — International Test'}]};
  if(path.includes('/listings?'))
   return {count:1,results:[{listing_id:301,shop_id:456,listing_type:'physical',
    state:'active',title:'Changed profile',shipping_profile_id:99}]};
  if(path.endsWith('/shipping-profiles/99'))return {shipping_profile_id:99,
   title:'PrintShrimp — International Test',is_deleted:false,origin_country_iso:'GB',
   shipping_profile_destinations:[]};
  throw Error('Unexpected read '+path);
 }};
 const store={get:async()=>({phase:'needs_investigation',listingId:301,targetId:99})};
 const report=await auditInternationalDeliveryExceptions({client,store});
 assert.equal(report.exceptionCount,1);
 assert.equal(report.exceptions[0].migrationReceipt,'needs_investigation');
 assert.equal(report.verifiedMigrated,0);
});
