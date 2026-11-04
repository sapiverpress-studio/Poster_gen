import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyInternationalDeliveryProfile, verifyPhysicalDeliveryProfile, INTERNATIONAL_PROFILE_TITLE, requiredPhysicalDeliveryMode, verifyRequiredPhysicalProfile} from '../lib/international-delivery.mjs';
import {discoverPhysicalSetup} from '../lib/physical-shop-setup.mjs';
import {shipping,processing,returns,carriers} from './fixtures/poster-template.mjs';

const row=(country,pounds=0)=>({
 destination_country_iso:country,primary_cost:{amount:Math.round(pounds*100),divisor:100,currency_code:'GBP'},
 secondary_cost:{amount:0,divisor:100,currency_code:'GBP'},
 shipping_carrier_id:15,mail_class:'international',min_delivery_days:null,max_delivery_days:null
});
const international=()=>({...shipping,shipping_profile_id:99,title:INTERNATIONAL_PROFILE_TITLE,
 shipping_profile_destinations:[row('GB'),row('US'),row('CA'),row('AU'),row('NZ',14.99)]});

test('international verification accepts only five explicitly priced destinations',()=>{
 const p=international();
 assert.deepEqual(verifyInternationalDeliveryProfile(p),{profileId:99,countries:['GB','US','CA','AU','NZ']});
 verifyPhysicalDeliveryProfile({shipping:p,processing,returns,shopId:456,mode:'international'});
 for(const variant of [
  {...p,shipping_profile_destinations:p.shipping_profile_destinations.slice(0,4)},
  {...p,shipping_profile_destinations:[...p.shipping_profile_destinations.slice(0,4),row('FR')]},
  {...p,origin_postal_code:'AB1 2CD'},
  {...p,shipping_profile_destinations:p.shipping_profile_destinations.map(x=>x.destination_country_iso==='US'?row('US',1):x)},
  {...p,shipping_profile_destinations:p.shipping_profile_destinations.map(x=>x.destination_country_iso==='NZ'?row('NZ',5):x)},
  {...p,shipping_profile_destinations:p.shipping_profile_destinations.map(x=>x.destination_country_iso==='NZ'?{...row('NZ',14.99),mail_class:'',shipping_carrier_id:0}:x)}
 ])assert.throws(()=>verifyInternationalDeliveryProfile(variant));
 assert.throws(()=>verifyPhysicalDeliveryProfile({shipping:p,processing:{...processing,max_processing_days:3},returns,shopId:456,mode:'international'}));
});

test('domestic verification stays strict and international profile is not mistaken for UK-only',()=>{
 verifyPhysicalDeliveryProfile({shipping,processing,returns,shopId:456,carriers});
 assert.throws(()=>verifyPhysicalDeliveryProfile({shipping:international(),processing,returns,shopId:456,carriers}));
});

test('physical-shop discovery selects the requested existing profile with no writes',async()=>{
 const domestic={...shipping,shipping_profile_id:11};
 const overseas=international(),calls=[];
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:456}),api:async path=>{
  calls.push(path);
  if(path.includes('shipping-carriers'))return carriers;
  if(path.endsWith('/shipping-profiles/11'))return domestic;
  if(path.endsWith('/shipping-profiles/99'))return overseas;
  if(path.includes('/shipping-profiles?'))return {results:[domestic,overseas]};
  if(path.includes('/readiness-state-definitions?'))return {results:[{...processing,readiness_state_id:22}]};
  if(path.includes('/policies/return?'))return {results:[{...returns,return_policy_id:33}]};
  if(path.endsWith('/production-partners'))return {results:[{production_partner_id:55,partner_name:'PrintShrimp',location:'Romford'}]};
  throw Error('Unexpected seller read '+path);
 }};
 assert.equal((await discoverPhysicalSetup({client})).selection.shippingProfileId,11);
 const other=await discoverPhysicalSetup({client,shippingMode:'international'});
 assert.equal(other.phase,'ready');
 assert.equal(other.selection.shippingProfileId,99);
 assert.ok(calls.every(x=>!x.includes('/listings')));
});

test('pinned 5-country profile cannot silently revert to old UK-only shipping',()=>{
 const good=n=>({POSTER_INTERNATIONAL_SHIPPING_ENABLED:'true',
  POSTER_REQUIRED_SHIPPING_PROFILE_ID:'319546214912'})[n];
 assert.equal(requiredPhysicalDeliveryMode(good),'international');
 assert.doesNotThrow(()=>verifyRequiredPhysicalProfile({env:good,
  deliveryMode:'international',shippingProfileId:319546214912}));
 for(const shippingProfileId of [11,319538204746,319538213678,99]){
  assert.throws(()=>verifyRequiredPhysicalProfile({env:good,
    deliveryMode:'international',shippingProfileId}),/expected approved international/);
 }
 assert.throws(()=>verifyRequiredPhysicalProfile({env:good,
  deliveryMode:'domestic',shippingProfileId:319546214912}),/expected approved international/);
 const disabled=n=>n==='POSTER_REQUIRED_SHIPPING_PROFILE_ID'?'319546214912':
   n==='POSTER_INTERNATIONAL_SHIPPING_ENABLED'?'false':undefined;
 assert.throws(()=>requiredPhysicalDeliveryMode(disabled),/international delivery is disabled/);
 const malformed=n=>n==='POSTER_REQUIRED_SHIPPING_PROFILE_ID'?'none':
   n==='POSTER_INTERNATIONAL_SHIPPING_ENABLED'?'true':undefined;
 assert.throws(()=>requiredPhysicalDeliveryMode(malformed),/Invalid required/);
});
