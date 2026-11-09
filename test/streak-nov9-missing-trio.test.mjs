import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMissingStreakNov9Trio} from '../lib/streak-nov9-missing-trio.mjs';
const sha=[
 'edd8901dc2467323e18e60ef2632b9146c7be52fb385922b290bf9e6c897708d',
 '9ae4053892781cecec8794e1f1ec28d19cb8fce98127145db9f12568d71e6904',
 'edf8e746437d7cb86e5976aa35900d8dc37738ce7f8502136e66e064b020e619'
];
const titles=[
 'Funny Hedgehog Wall Art Print - Six Minutes to Say Okay - Sarcastic Quote',
 "Funny Sloth Wall Art Print - I'm Not Napping I'm on Strike - Office Humour",
 'Sarcastic Hedgehog Wall Art Print - So Many Opinions Funny Newspaper Quote'
];
const folders=['01_Huggles_Six_Minutes','02_Insomnia_On_Strike','03_Edge_So_Many_Opinions'];
function harness({missing,existing,foreignShop=false,duplicate=false}={}){
 const records=[],data=new Map(),calls=[];
 for(let i=0;i<3;i++){
  const id=String(i+1).repeat(32),sku='SP-STREAK-'+(i+1),listingId=100+i;
  const asset={productId:id,type:'physical',phase:missing===i?'needs_investigation':'published',
   listingId,supplierProductId:'supplier-'+i,masterKey:'uploads/'+id+'/master.png',
   image:{sha256:sha[i]},metadata:{sectionTitle:'Streak',etsyTitle:titles[i],printSizes:['A5','A4']},
   plan:{identity:{sku},body:{title:titles[i]}}};
  const record={productId:id,currentRevision:id,type:'physical',phase:asset.phase,
   etsyListingId:listingId,supplierProductId:asset.supplierProductId,
   metadata:asset.metadata,updatedAt:Date.now()};
  records.push(record);data.set('uploads/'+id+'/state',asset);
  data.set('products/'+id+'/record',record);
 }
 if(duplicate){
  const same=records[0],id='d'.repeat(32);
  const a={...data.get('uploads/'+same.currentRevision+'/state'),productId:id,listingId:207};
  data.set('uploads/'+id+'/state',a);
  records.push({...same,productId:id,currentRevision:id,etsyListingId:207});
  data.set('products/'+id+'/record',records.at(-1));
 }
 if(existing){
  const id='e'.repeat(32);
  const record={productId:id,currentRevision:id,type:'physical_bundle',phase:'preparing',updatedAt:Date.now()};
  records.push(record);data.set('products/'+id+'/record',record);
  data.set('uploads/'+id+'/state',{type:'physical_bundle',sku:'SP-EXISTING',
    trio:{listingTitle:'Funny Sarcastic Animal Wall Art Set of 3 A4 Prints - Hedgehog and Sloth'},
    phase:'preparing',listingId:null,metadata:{name:'Streak - Dry Humour Trio'}});
 }
 const uploads={
  get:async key=>data.get(key)??null,
  setJSON:async(key,value,opt={})=>{
   calls.push({op:'write',key,value});
   if(opt.onlyIfNew&&data.has(key))return {modified:false};
   data.set(key,value);return {modified:true};
  },
  async *list({prefix,paginate}){assert.equal(prefix,'products/');assert.equal(paginate,true);
   yield {blobs:[...data.keys()].filter(k=>/^products\/[A-Za-z0-9_-]{32}\/record$/.test(k)).map(key=>({key}))};
  }
 };
 const client={
  session:async()=>({shop_id:foreignShop?999:50893070,shop_name:'SapiverPrints'}),
  api:async path=>{
   calls.push({op:'etsy',path});
   const listing=/^\/listings\/(\d+)$/.exec(path);
   if(listing){const id=Number(listing[1]),idx=id-100;return {listing_id:id,shop_id:50893070,
    state:'active',listing_type:'physical',title:titles[idx]};}
   if(path==='/shops/50893070/sections')return {results:[{title:'Trio Collection',shop_section_id:459},{title:'Streak',shop_section_id:458}]};
   if(path.startsWith('/shops/50893070/listings?'))return {count:0,results:[]};
   throw Error('Unknown Etsy read '+path);
  }
 };
 const request=async url=>{calls.push({op:'supplier',url:String(url)});
  if(String(url).includes('api-get-bundle'))return {status:404,ok:false};
  throw Error('Unexpected supplier operation');
 };
 const prepareBundle=async({id,uploads})=>{
  calls.push({op:'prepare',id});
  const a=await uploads.get('uploads/'+id+'/state');
  assert.equal(a?.type,'physical_bundle');
  assert.deepEqual(a.memberRefs.map(x=>x.id),['1'.repeat(32),'2'.repeat(32),'3'.repeat(32)]);
  assert.deepEqual(a.memberRefs.map(x=>x.sha256),sha);
  assert.equal(a.targetShopSectionTitle,'Trio Collection');
  assert.equal(a.trio.size,'A4');
  return {phase:'ready_for_approval'};
 };
 return {uploads,client,request,prepareBundle,env:k=>k==='SHRIMP_APIKEY'?'test-key':null,
  calls,data,records};
}
test('exact Streak 9 Nov trio reserves one bundle, never creates singles or a merchant listing',async()=>{
 const f=harness(),r=await prepareMissingStreakNov9Trio(f);
 assert.equal(r.phase,'ready_for_approval');
 assert.equal(r.sourceCount,3);
 assert.equal(r.newIndividualListings,0);
 assert.equal(r.createdEtsyListing,false);
 assert.equal(r.createdSupplierBundle,false);
 assert.equal(r.sectionId,459);
 assert.equal(f.calls.filter(c=>c.op==='prepare').length,1);
 assert.equal(f.calls.filter(c=>c.op==='write'&&c.key.startsWith('uploads/')&&c.key.endsWith('/state')).length,1);
 assert.equal(f.calls.filter(c=>c.op==='etsy'&&!c.path.startsWith('/')).length,0);
 assert.equal(f.calls.filter(c=>c.op==='supplier'&&!c.url.includes('api-get-bundle')).length,0);
 const again=await prepareMissingStreakNov9Trio(f);
 assert.equal(again.phase,'existing');
 assert.equal(again.id,r.id);
 assert.equal(f.calls.filter(c=>c.op==='prepare').length,1);
});
test('do not reserve trio while any original individual is not published',async()=>{
 const f=harness({missing:1});
 await assert.rejects(prepareMissingStreakNov9Trio(f),/Exactly one previously published/);
 assert.equal(f.calls.filter(c=>c.op==='write').length,0);
});
test('duplicate or existing trio does not create a second bundle',async()=>{
 const duplicated=harness({duplicate:true});
 await assert.rejects(prepareMissingStreakNov9Trio(duplicated),/Exactly one previously published/);
 assert.equal(duplicated.calls.filter(c=>c.op==='write').length,0);
 const previous=harness({existing:true});
 const result=await prepareMissingStreakNov9Trio(previous);
 assert.equal(result.phase,'existing');
 assert.equal(previous.calls.filter(c=>c.op==='write').length,0);
});
test('foreign Etsy shop fails without any storage or merchant writes',async()=>{
 const f=harness({foreignShop:true});
 await assert.rejects(prepareMissingStreakNov9Trio(f),/Wrong authenticated Etsy seller/);
 assert.equal(f.calls.filter(c=>c.op==='write').length,0);
});
