import test from 'node:test';
import assert from 'node:assert/strict';
import {repairLegacyAlphabetDelivery,LEGACY_ALPHABET} from '../lib/legacy-shipping-repair.mjs';
import {shipping,processing,returns,carriers} from './fixtures/poster-template.mjs';

function setup({stale=false,wrongProfile=false,alterListing=false}={}){
 const now=1234567890000,store=new Map();
 const expected=316400055692,old=316847314881,id=LEGACY_ALPHABET.id,sku=LEGACY_ALPHABET.sku,shopId=456;
 const listing={shop_id:shopId,listing_id:id,listing_type:'physical',state:'active',shipping_profile_id:wrongProfile?999:old,title:'Animal Alphabet World Map Poster',description:'Original artwork',tags:['alphabet','nursery'],skus:[sku],shop_section_id:9,taxonomy_id:11,return_policy_id:33,readiness_state_id:22,price:{amount:1499,divisor:100,currency_code:'GBP'},quantity:10,production_partner_ids:[55]};
 const audit={shopId,checkedAt:now-(stale?100000000:3000),intendedProfile:{id:expected},listings:[{id,state:'active',shippingProfileId:old,sku:[sku]}]};
 store.set('catalogue/repair-status',{phase:'pending',jobId:'a'.repeat(32),listingId:id,expectedOld:old,confirmed:true,createdAt:now-1000});
 store.set('catalogue/audit',audit);
 let patched=0;
 const client={session:async()=>({shop_id:shopId,shop_name:'SapiverPrints'}),api:async(path,opts)=>{
  if(path.includes('/shipping-carriers?'))return carriers;
  if(path.endsWith('/shipping-profiles/'+expected))return {...shipping,shipping_profile_id:expected};
  if(path.includes('/shipping-profiles?'))return {results:[{...shipping,shipping_profile_id:expected}]};
  if(path.includes('/readiness-state-definitions?'))return {results:[{...processing,readiness_state_id:22}]};
  if(path.includes('/policies/return?'))return {results:[{...returns,return_policy_id:33}]};
  if(path.endsWith('/production-partners'))return {results:[{production_partner_id:55,partner_name:'PrintShrimp',location:'Romford, England'}]};
  if(path==='/listings/'+id)return {...listing};
  if(path==='/listings/'+id+'/inventory')return {products:[{sku,offerings:[{price:1499}]}]};
  if(path==='/shops/'+shopId+'/listings/'+id&&opts?.method==='PATCH'){
   patched++;
   const params=new URLSearchParams(opts.body);
   assert.deepEqual([...params.keys()],['shipping_profile_id']);
   assert.equal(params.get('shipping_profile_id'),String(expected));
   listing.shipping_profile_id=expected;
   if(alterListing)listing.title='Unexpected change';
   return {...listing};
  }
  throw Error('Unexpected API request '+path);
 }};
 const uploads={get:async(key)=>store.get(key)||null,setJSON:async(key,value)=>{store.set(key,value);return {modified:true}}};
 return {client,uploads,clock:()=>now,jobId:'a'.repeat(32),patched:()=>patched,store};
}
test('exact single Etsy legacy listing receives shipping-only PATCH and is read back',async()=>{
 const t=setup(),result=await repairLegacyAlphabetDelivery(t);
 assert.equal(result.phase,'complete');
 assert.equal(result.shippingProfileId,316400055692);
 assert.equal(t.patched(),1);
 assert.equal(t.store.get('catalogue/repair-status').phase,'complete');
 await assert.rejects(repairLegacyAlphabetDelivery(t),/approval missing/);
 assert.equal(t.patched(),1);
});
test('stale audits and altered live Etsy listings block merchant changes',async()=>{
 const stale=setup({stale:true});
 await assert.rejects(repairLegacyAlphabetDelivery(stale),/stale/);
 assert.equal(stale.patched(),0);
 const wrong=setup({wrongProfile:true});
 await assert.rejects(repairLegacyAlphabetDelivery(wrong),/differs/);
 assert.equal(wrong.patched(),0);
});
test('unexpected listing metadata changes after PATCH are flagged and never counted complete',async()=>{
 const t=setup({alterListing:true});
 await assert.rejects(repairLegacyAlphabetDelivery(t),/read-back differs/);
 assert.equal(t.patched(),1);
 assert.equal(t.store.get('catalogue/repair-status').phase,'sending');
});
