import test from 'node:test';
import assert from 'node:assert/strict';
import {repairStreakTrioShipping} from '../lib/international-shipping-migration.mjs';
const ids=[4609483175,4609504500],sources=[319538204746,319538213678],target=319546214912;
const money=v=>({amount:v,divisor:100,currency_code:'GBP'});
const dest=(country,cost=0)=>({destination_country_iso:country,primary_cost:money(cost),secondary_cost:money(0),shipping_carrier_id:8,mail_class:'standard'});
function setup({changed=false,error=false}={}){
 const profiles=new Map(ids.map((id,i)=>[id,sources[i]])),receipts=new Map(),writes=[];
 if(changed)profiles.set(ids[1],123);
 const old={shipping_profile_id:11,title:'PrintShrimp — Posters',origin_country_iso:'GB',shipping_profile_destinations:[dest('GB')]};
 const overseas={shipping_profile_id:target,title:'PrintShrimp — International Test',origin_country_iso:'GB',origin_postal_code:'RM6 6AX',
 shipping_profile_destinations:[dest('GB'),dest('US'),dest('CA'),dest('AU'),dest('NZ',1499)]};
 const listing=id=>({listing_id:id,shop_id:456,listing_type:'physical',state:'active',
 title:'Streak Set '+(ids.indexOf(id)+1)+' | Three Black White Sarcastic Hedgehog A4 Prints',
 skus:['SP-TRIO-'+id],shipping_profile_id:profiles.get(id),description:'Three prints',tags:['streak']});
 const client={session:async()=>({shop_id:456,shop_name:'SapiverPrints'}),api:async(path,opt)=>{
  if(path==='/shops/456/shipping-profiles?limit=100')return {results:[old,overseas]};
  if(path==='/shops/456/shipping-profiles/11')return old;
  if(path==='/shops/456/shipping-profiles/'+target)return overseas;
  const view=/^\/listings\/(\d+)\?includes=Images$/.exec(path);
  if(view)return listing(Number(view[1]));
  if(/^\/listings\/\d+\/inventory$/.test(path))return {products:[{sku:'SP-TRIO',offerings:[{price:money(4200)}]}]};
  const patch=/^\/shops\/456\/listings\/(\d+)$/.exec(path);
  if(patch&&opt?.method==='PATCH'){
   const id=Number(patch[1]);writes.push(id);
   assert.equal(opt.body,'shipping_profile_id='+target);
   if(error)throw Error('Network failed');
   profiles.set(id,target);return listing(id);
  }
  throw Error('Unexpected request '+path);
 }};
 const store={setJSON:async(key,value,opt)=>{
  if(opt?.onlyIfNew&&receipts.has(key))return {modified:false};
  receipts.set(key,value);return {modified:true};
 }};
 return {client,store,writes,profiles,receipts};
}
test('only two Streak trios change delivery and preserve all inventory',async()=>{
 const x=setup();
 await assert.rejects(repairStreakTrioShipping({client:x.client,store:x.store}),/approval/);
 const result=await repairStreakTrioShipping({client:x.client,store:x.store,approved:true,enabled:true});
 assert.deepEqual(result.listingIds,ids);assert.equal(result.verified,2);
 assert.deepEqual(x.writes,ids);
 for(const id of ids){
  assert.equal(x.profiles.get(id),target);
  assert.equal(x.receipts.get('international-delivery-migration/'+id).phase,'verified');
 }
});
test('mismatched source profile prevents any Etsy updates',async()=>{
 const x=setup({changed:true});
 await assert.rejects(repairStreakTrioShipping({client:x.client,store:x.store,approved:true,enabled:true}),/changed/);
 assert.equal(x.writes.length,0);
});
test('failed first Etsy update never changes second bundle',async()=>{
 const x=setup({error:true});
 await assert.rejects(repairStreakTrioShipping({client:x.client,store:x.store,approved:true,enabled:true}),/uncertain/);
 assert.deepEqual(x.writes,[ids[0]]);
 assert.equal(x.profiles.get(ids[1]),sources[1]);
});
