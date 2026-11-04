import test from 'node:test';
import assert from 'node:assert/strict';
import {previewInternationalMigration} from '../lib/international-shipping-migration.mjs';

test('migration preview skips other shipping profiles and never writes listings',async()=>{
 const legacy={title:'PrintShrimp — Posters',shipping_profile_id:11,origin_country_iso:'GB',
  shipping_profile_destinations:[{destination_country_iso:'GB'}]};
 const target={title:'PrintShrimp — International Test',shipping_profile_id:99,origin_country_iso:'GB',origin_postal_code:'RM6 6AX',
  shipping_profile_destinations:['GB','US','CA','AU','NZ'].map(country=>({
   destination_country_iso:country,primary_cost:{amount:country==='NZ'?1499:0,divisor:100,currency_code:'GBP'},
   secondary_cost:{amount:0,divisor:100,currency_code:'GBP'},shipping_carrier_id:10,mail_class:'standard'
  }))};
 const calls=[];
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:456}),api:async(path,options)=>{
  assert.equal(options,undefined);calls.push(path);
  if(path.endsWith('/shipping-profiles?limit=100'))return {results:[legacy,target]};
  if(path.endsWith('/shipping-profiles/11'))return legacy;
  if(path.endsWith('/shipping-profiles/99'))return target;
  if(path.includes('/listings?'))return {count:2,results:[
   {shop_id:456,listing_id:101,state:'active',listing_type:'physical',shipping_profile_id:11,skus:['SP-ONE']},
   {shop_id:456,listing_id:102,state:'active',listing_type:'physical',shipping_profile_id:77,skus:['SP-OTHER']}
  ]};
  throw Error('unexpected read: '+path);
 }};
 const result=await previewInternationalMigration({client});
 assert.equal(result.numberToUpdate,1);
 assert.equal(result.excluded,1);
 assert.deepEqual(result.candidates.map(x=>x.listingId),[101]);
 assert.ok(calls.every(x=>!x.includes('PATCH')));
});
