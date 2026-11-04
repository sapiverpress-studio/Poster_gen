import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareExistingTrioFrames,applyExistingTrioFrames,existingTrioFrameKey} from '../lib/collection-bundle-publication.mjs';
import {assetKey} from '../lib/uploaded-poster.mjs';

const gbp=n=>({currency_code:'GBP',amount:Math.round(n*100),divisor:100});
const sourceSkus=['SP-FOX','SP-ROBIN','SP-DEER'];
const sourceIds=['a'.repeat(32),'b'.repeat(32),'c'.repeat(32)];
const bundleId='z'.repeat(32),sku='SP-TRIO-EXISTING';
const body={title:'Woodland Set Of Three A4 Prints',description:'Three unframed A4 woodland prints. Each one is original artwork, developed with AI-assisted design and reviewed by Sapiver Prints. Frames are not supplied. The prints make a complete set of three for a nursery wall.',tags:'woodland art,animal print,wall art set',readiness_state_id:12,
 shipping_profile_id:21,production_partner_ids:'43',type:'physical'};
const frameNames=['Print Only','Black Frame','White Frame','Oak Frame'];
const memberInventory=(one)=>({products:frameNames.map((frame,i)=>({
 sku:one,
 property_values:[{property_id:513,property_name:'Size',values:['A4'],value_ids:[]},
  {property_id:514,property_name:'Frame',values:[frame],value_ids:[]}],
 offerings:[{price:gbp(i?54.99:15.99),quantity:10,is_enabled:true,is_deleted:false}]
}))});
const quote={currency:'GBP',size:'A4',grossGbp:40.77,baseGbp:47.97,
 supplierCostGbp:15.82,estimatedFeesGbp:6.62,contributionGbp:18.33};
function fixture({phase='published',wrongSupplier=false,changedPrice=false,changedDescription=false}={}){
 const map=new Map(),writes=[];
 for(let i=0;i<3;i++){
  const id=sourceIds[i];
  map.set(assetKey(id),{type:'physical',phase:'published',listingId:7000+i,
   supplierProductId:'PS-'+i,image:{sha256:String(i+1).repeat(64)},
   masterKey:'uploads/'+id+'/master.png',metadata:{printSizes:['A5','A4'],sectionTitle:'Nature'},
   plan:{identity:{sku:sourceSkus[i]},body,inventory:memberInventory(sourceSkus[i])}});
 }
 const refs=sourceIds.map((id,i)=>({id,sku:sourceSkus[i],sha256:String(i+1).repeat(64),listingId:7000+i}));
 const trio={title:'Forest Friends',listingTitle:body.title,size:'A4',sectionTitle:'Nature',
  members:['fox','robin','deer'],tags:body.tags.split(','),
  description:body.description,framed:false};
 map.set(assetKey(bundleId),{productId:bundleId,type:'physical_bundle',phase,listingId:9000,
  supplierProductId:'BND-1',sku,trio,discount:15,memberIds:sourceIds,
  memberRefs:refs,listingTitle:body.title,metadata:{name:'Forest Friends'},
  plan:{version:1,body,quote,trio,sku}});
 const uploads={
  get:async key=>map.get(key)||null,
  setJSON:async (key,val)=>{map.set(key,val);writes.push({key,val});return {modified:true};}
 };
 let listingDescription=changedDescription?body.description+' changed':body.description;
 let inventory={products:[{sku,property_values:[],
  offerings:[{is_enabled:true,price:gbp(changedPrice?35:quote.grossGbp),quantity:10}]}]};
 const etsyWrites=[],supplierWrites=[];
 const client={
  session:async()=>({shop_name:'SapiverPrints',shop_id:333}),
  api:async (path,options={})=>{
   if(path==='/listings/9000')return {listing_id:9000,shop_id:333,
    state:phase==='published'?'active':'draft',listing_type:'physical',title:body.title,description:listingDescription};
   if(path==='/listings/9000/inventory'){
    if(options.method==='PUT'){inventory=JSON.parse(options.body);etsyWrites.push({path,method:'PUT'});return {};}
    return inventory;
   }
   for(let i=0;i<3;i++){
    if(path==='/listings/'+(7000+i))return {shop_id:333,state:'active',listing_type:'physical'};
    if(path==='/listings/'+(7000+i)+'/inventory')return memberInventory(sourceSkus[i]);
   }
   if(path==='/shops/333/listings/9000'&&options.method==='PATCH'){
    listingDescription=new URLSearchParams(options.body).get('description');
    etsyWrites.push({path,method:'PATCH'});return {};
   }
   throw Error('Unexpected seller API '+path);
  }
 };
 const supplierItems=sourceSkus.map((s,i)=>({sku:s,size:'A4',quantity:1,product_id:'PS-'+i}));
 const request=async(url,options={})=>{
  const u=String(url);
  if(options.method&&options.method!=='GET')supplierWrites.push(options.method+' '+u);
  if(u.includes('/api-get-pricing'))return Response.json({success:true,currency:'GBP',
   sizes:[{size:'A4',print:{price:6.59,shipping:0},frame:{price:25.99,shipping:0}}]});
  if(u.includes('/api-get-bundle'))return Response.json({success:true,
   bundle:{sku,bundle_id:wrongSupplier?'BAD':'BND-1',total_prints:3,items:supplierItems}});
  if(u.includes('/api-get-product')){
   const i=sourceSkus.indexOf(new URL(u).searchParams.get('sku'));
   if(i<0)throw Error('Unexpected supplier product');
   return Response.json({success:true,product:{sku:sourceSkus[i],product_id:'PS-'+i,
    variants:[{size:'A4',image_url:'https://printshrimp.com/assets/'+i+'.png'}]}});
  }
  throw Error('Unexpected PrintShrimp route');
 };
 const env=name=>name==='SHRIMP_APIKEY'?'TEST-KEY':null;
 return {map,writes,etsyWrites,supplierWrites,uploads,client,request,env};
}
test('read-only upgrade preparation preserves supplier bundle and original listing',async()=>{
 const x=fixture();
 const result=await prepareExistingTrioFrames({id:bundleId,...x});
 assert.equal(result.phase,'ready');
 assert.equal(result.listingId,9000);
 assert.equal(result.quote.variants['Print Only'].grossGbp,40.77);
 assert.equal(result.quote.variants['Black Frame'].grossGbp,157.77);
 assert.equal(x.etsyWrites.length,0);
 assert.equal(x.supplierWrites.length,0);
 const staged=x.map.get(existingTrioFrameKey(bundleId));
 assert.equal(staged.plan.inventory.products.length,4);
 assert.ok(staged.plan.inventory.products.every(p=>p.sku===sku));
 assert.doesNotMatch(staged.plan.description,/frames? are not supplied/i);
});
for(const phase of ['published','draft_verified']){
 test('owner-approved in-place '+phase+' trio upgrade uses existing Etsy listing and does not create supplier products',async()=>{
  const x=fixture({phase});
  const prepared=await prepareExistingTrioFrames({id:bundleId,...x});
  const key=existingTrioFrameKey(bundleId);
  x.map.set(key,{...x.map.get(key),phase:'applying'});
  const result=await applyExistingTrioFrames({id:bundleId,...x});
  assert.deepEqual(result,{phase:'complete',listingId:9000,frameOptions:4});
  assert.equal(x.map.get(key).phase,'complete');
  assert.deepEqual(x.etsyWrites.map(w=>w.method),['PUT','PATCH']);
  assert.equal(x.supplierWrites.length,0);
 });
}
test('supplier drift or an edited existing Etsy listing prevents any write',async()=>{
 for(const options of [{wrongSupplier:true},{changedPrice:true},{changedDescription:true}]){
  const x=fixture(options);
  await assert.rejects(prepareExistingTrioFrames({id:bundleId,...x}));
  assert.equal(x.etsyWrites.length,0);
 }
});
test('update requires the distinct explicit owner approval state',async()=>{
 const x=fixture();
 await prepareExistingTrioFrames({id:bundleId,...x});
 await assert.rejects(applyExistingTrioFrames({id:bundleId,...x}),/not claimed/);
 assert.equal(x.etsyWrites.length,0);
});
test('existing frame feature is isolated from old poster upload records and protected by owner CSRF',()=>{
 const worker=readFileSync(new URL('../lib/github-publication.mjs',import.meta.url),'utf8');
 const server=readFileSync(new URL('../lib/poster-upload-web.mjs',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../lib/github-bridge.mjs',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public/existing-trio-frames.mjs',import.meta.url),'utf8');
 assert.match(server,/frameRoute&&req.method==='POST'/);
 assert.match(server,/owner\.csrf/);
 assert.match(server,/trio-frame-approval\//);
 assert.match(worker,/trio_frame_audit/);
 assert.match(worker,/trio_frame_apply/);
 assert.match(bridge,/trio-frame-approval/);
 assert.doesNotMatch(client,/\/api-create-bundle|\/api-create-product|\/shops\/.*\/listings.*method.*POST/);
});
