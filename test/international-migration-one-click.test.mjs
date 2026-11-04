import test from 'node:test';
import assert from 'node:assert/strict';
import {previewInternationalMigration,applyAllInternationalMigration} from '../lib/international-shipping-migration.mjs';

function merchant({mutateAfterFirst=false,failFirst=false}={}){
 const ids=[201,202,203],profiles=new Map(ids.map(id=>[id,11])),log=[],records=new Map();
 let firstChanged=false;
 const money=price=>({amount:Math.round(price*100),divisor:100,currency_code:'GBP'});
 const destination=(iso,price=0)=>({
  destination_country_iso:iso,primary_cost:money(price),secondary_cost:money(0),
  shipping_carrier_id:8,mail_class:'standard'
 });
 const old={shipping_profile_id:11,title:'PrintShrimp — Posters',origin_country_iso:'GB',
  shipping_profile_destinations:[destination('GB')]};
 const target={shipping_profile_id:99,title:'PrintShrimp — International Test',origin_country_iso:'GB',
  origin_postal_code:'RM6 6AX',
  shipping_profile_destinations:[destination('GB'),destination('US'),destination('CA'),destination('AU'),destination('NZ',14.99)]};
 const row=id=>({listing_id:id,shop_id:456,listing_type:'physical',state:'active',
  title:mutateAfterFirst&&firstChanged&&id===203?'Changed after approval':'Original '+id,
  skus:['SP-'+id],shipping_profile_id:profiles.get(id),description:'Art',tags:['art']});
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:456}),
  api:async (path,options)=>{
   log.push({path,method:options?.method||'GET'});
   if(path==='/shops/456/shipping-profiles?limit=100')return {results:[old,target]};
   if(path==='/shops/456/shipping-profiles/11')return old;
   if(path==='/shops/456/shipping-profiles/99')return target;
   if(path.startsWith('/shops/456/listings?'))return {count:ids.length,results:ids.map(row)};
   const listing=/^\/listings\/(\d+)\?includes=Images$/.exec(path);
   if(listing)return row(Number(listing[1]));
   const inventory=/^\/listings\/(\d+)\/inventory$/.exec(path);
   if(inventory)return {products:[{sku:'SP-'+inventory[1],offerings:[{price:money(15.99)}]}]};
   const patch=/^\/shops\/456\/listings\/(\d+)$/.exec(path);
   if(patch&&options?.method==='PATCH'){
    const id=Number(patch[1]);
    if(failFirst)throw Error('Simulated supplier-safe Etsy PATCH failure');
    assert.equal(options.body,'shipping_profile_id=99');
    profiles.set(id,99);firstChanged=true;
    return row(id);
   }
   throw Error('Unexpected Etsy API request '+path);
  }};
 const store={setJSON:async(key,value,opts)=>{
  if(opts?.onlyIfNew&&records.has(key))return {modified:false};
  records.set(key,value);return {modified:true};
 }};
 return {client,store,log,records,profiles};
}

test('one owner approval verifies selected listing then exactly the remaining two',async()=>{
 const m=merchant(),plan=await previewInternationalMigration({client:m.client});
 assert.equal(plan.numberToUpdate,3);
 const signals=[];
 const args={client:m.client,store:m.store,plan,approvalHash:plan.approvalHash,
  selectedListingId:202,approved:true,enabled:true,onFirstVerified:async value=>signals.push(value)};
 assert.deepEqual((await applyAllInternationalMigration(args)),{verified:3,remaining:0,shopId:456});
 const mutations=m.log.filter(event=>event.method==='PATCH').map(event=>Number(event.path.split('/').at(-1)));
 assert.deepEqual(mutations,[202,201,203]);
 assert.equal(signals.length,1);assert.equal(signals[0].listingId,202);
 assert.ok([...m.records.values()].filter(x=>x.phase==='verified').length===3);
 await assert.rejects(applyAllInternationalMigration(args),/changed since approval|already attempted|First Etsy listing/);
 assert.equal(m.log.filter(event=>event.method==='PATCH').length,3);
});

test('a changed candidate after the first successful readback blocks the remainder',async()=>{
 const m=merchant({mutateAfterFirst:true}),plan=await previewInternationalMigration({client:m.client});
 await assert.rejects(applyAllInternationalMigration({client:m.client,store:m.store,plan,
  approvalHash:plan.approvalHash,selectedListingId:202,approved:true,enabled:true}),
  /Other Etsy listings changed/);
 assert.deepEqual(m.log.filter(x=>x.method==='PATCH').map(x=>Number(x.path.split('/').at(-1))),[202]);
});

test('no approval, disabled switch, or failed first PATCH never touches remaining listings',async()=>{
 for(const opts of [{approved:false,enabled:true},{approved:true,enabled:false},{approved:true,enabled:true,failFirst:true}]){
  const m=merchant({failFirst:!!opts.failFirst}),plan=await previewInternationalMigration({client:m.client});
  await assert.rejects(applyAllInternationalMigration({client:m.client,store:m.store,plan,
    approvalHash:plan.approvalHash,selectedListingId:201,approved:opts.approved,enabled:opts.enabled}));
  assert.ok(m.log.filter(x=>x.method==='PATCH').length<=Number(!!opts.failFirst));
  assert.equal(m.profiles.get(202),11);
  assert.equal(m.profiles.get(203),11);
 }
});
