import test from 'node:test';
import assert from 'node:assert/strict';
import {publishCollectionBundle} from '../lib/collection-bundle-publication.mjs';
import {computeUKBundleQuote,expectedTrioItems} from '../lib/three-print-bundle.mjs';
import {hashBytes,assetKey} from '../lib/uploaded-poster.mjs';

function memory(){
 const m=new Map();
 return {m,get:async k=>m.get(k)??null,
  setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&m.has(k))return{modified:false};m.set(k,v);return{modified:true};}};
}
const pricing={success:true,currency:'GBP',sizes:[{size:'A4',print:{price:6.59,shipping:0}}]};
const money=value=>({amount:Math.round(value*100),divisor:100,currency_code:'GBP'});
function fixture({drift=false,badSku=false,activate=false}={}){
 const uploads=memory(),etsyStore=memory(),id='z'.repeat(32),sku='SP-TRIO-01';
 const names=['FOX','ROBIN','HEDGEHOG'],listingIds=[9101,9102,9103],members=[];
 const baseBody={title:'Woodland Trio Set of Three A4 Prints',description:'Three original woodland artworks, unframed A4 posters with AI assistance disclosed.',tags:'woodland art,animal wall print,forest nursery',price:35.67,quantity:10,
  who_made:'someone_else',when_made:'made_to_order',taxonomy_id:1234,shipping_profile_id:42,
  readiness_state_id:12,production_partner_ids:'25',type:'physical'};
 for(let i=0;i<3;i++){
  const mid=String(i+1).repeat(32),msku='SP-'+names[i],sha=String(i+1).repeat(64);
  const m={id:mid,sku:msku,sizes:['A4'],member:{phase:'published',listingId:listingIds[i],
   supplierProductId:'ps-'+i,image:{sha256:sha},masterKey:'masters/'+mid,
   metadata:{printSizes:['A4']},plan:{identity:{sku:msku},body:baseBody}}};
  members.push(m);uploads.m.set(assetKey(mid),m.member);
 }
 const items=expectedTrioItems({members,size:'A4'});
 const refs=members.map(m=>({id:m.id,sku:m.sku,sha256:m.member.image.sha256,listingId:m.member.listingId}));
 const quote=computeUKBundleQuote({pricing,size:'A4',unitPrices:[13.99,13.99,13.99],discount:15});
 const trio={title:'Woodland Trio',listingTitle:baseBody.title,size:'A4',members:names,description:baseBody.description,tags:baseBody.tags.split(',')};
 const previewHashes=[];
 for(let i=0;i<4;i++){
  const bytes=Buffer.from('mock-image-'+i);uploads.m.set('uploads/'+id+'/mockups/'+i+'.jpg',bytes);
  previewHashes.push(hashBytes(bytes));
 }
 const plan={version:1,sku,trio,memberRefs:refs,sourceItems:items,quote,body:baseBody,
  previewHashes,shopId:777,existingBundleId:null};
 plan.hash=hashBytes(JSON.stringify(plan));
 const approvalHash=hashBytes(plan.hash+':'+id);
 uploads.m.set(assetKey(id),{type:'physical_bundle',phase:'publishing',productId:id,
  approvedAt:100,approvalHash,plan,trio,sku,listingTitle:baseBody.title,discount:15,memberIds:members.map(m=>m.id),
  memberRefs:refs,metadata:{name:'Woodland Trio'},publicationSlotAt:100,createdAt:100});
 let supplierBundle=null,etsyDrafts=0,activeWrites=0,supplierPosts=0,images=0;
 let draftInventory=null;
 const request=async(url,opts)=>{
  const u=String(url);
  if(u.includes('/api-get-pricing'))return Response.json(pricing);
  if(u.includes('/api-get-product')){
   const m=members.find(m=>m.sku===new URL(u).searchParams.get('sku'));
   assert.ok(m);
   return Response.json({success:true,product:{sku:m.sku,product_id:drift&&m===members[0]?'WRONG-ID':m.member.supplierProductId,
    variants:[{size:'A4',image_url:'https://api.printshrimp.com/storage/poster.png'}]}});
  }
  if(u.includes('/api-get-bundle'))return supplierBundle?Response.json({success:true,bundle:supplierBundle}):new Response('',{status:404});
  if(u.includes('/api-create-bundle')){
   supplierPosts++;
   const b=JSON.parse(opts.body);assert.equal(b.sku,sku);assert.equal(b.items.length,3);
   supplierBundle={bundle_id:'bundle-id',sku,total_prints:3,items:b.items.map((x,i)=>({...x,product_id:members[i].member.supplierProductId}))};
   return new Response(JSON.stringify({success:true,bundle:supplierBundle}),{status:201,headers:{'Content-Type':'application/json'}});
  }
  throw Error('Unexpected supplier request '+u);
 };
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:777}),api:async(path,opts={})=>{
  if(path.startsWith('/shops/777/listings?'))return {count:0,results:[]};
  for(let i=0;i<3;i++)if(path==='/listings/'+listingIds[i])
   return {shop_id:777,state:'active',listing_type:'physical'};
  for(let i=0;i<3;i++)if(path==='/listings/'+listingIds[i]+'/inventory')
   return {products:[{sku:members[i].sku,property_values:[
    {property_name:'Size',values:['A4']},{property_name:'Frame',values:['Print Only']}],
    offerings:[{is_enabled:true,is_deleted:false,price:money(13.99)}]}]};
  if(path==='/shops/777/listings'&&opts.method==='POST'){
   etsyDrafts++;assert.equal(new URLSearchParams(opts.body).get('title'),baseBody.title);
   return {shop_id:777,state:'draft',listing_id:10007};
  }
  if(path==='/listings/10007/inventory'&&opts.method==='PUT'){
   draftInventory=JSON.parse(opts.body);return {};
  }
  if(path==='/shops/777/listings/10007/images'&&opts.method==='POST'){images++;return {listing_image_id:images};}
  if(path==='/listings/10007?includes=Images')return {shop_id:777,state:'draft',listing_type:'physical',
   title:baseBody.title,description:baseBody.description,tags:baseBody.tags.split(','),images:[1,2,3,4]};
  if(path==='/listings/10007/inventory'&&!opts.method)return {
   products:[{sku:badSku?'WRONG-SKU':sku,is_deleted:false,offerings:[
    {is_enabled:true,quantity:10,price:money(quote.grossGbp)}]}]};
  if(path==='/shops/777/listings/10007'&&opts.method==='PATCH'){activeWrites++;return {};}
  if(path==='/listings/10007')return {shop_id:777,state:'active',title:baseBody.title,url:'https://etsy.com/listing/10007'};
  throw Error('Unexpected Etsy path '+path+' '+(opts.method||'GET'));
 }};
 const env=name=>({POSTER_PUBLICATION_ENABLED:'true',POSTER_BUNDLE_ACTIVATION_ENABLED:activate?'true':'false',
  SHRIMP_APIKEY:'test-key'}[name]);
 const run=()=>publishCollectionBundle({id,approvalHash,uploads,etsyStore,client,env,request,clock:()=>200});
 return {run,uploads,etsyStore,id,sku,getCounters:()=>({supplierPosts,etsyDrafts,activeWrites,images,draftInventory})};
}
test('approved trio saves exact provider bundle and verified Etsy draft without activating seller listing',async()=>{
 const a=fixture(),result=await a.run(),c=a.getCounters();
 assert.equal(result.phase,'draft_verified');
 assert.equal(result.ordersEnabled,false);
 assert.equal(a.uploads.m.get(assetKey(a.id)).listingId,10007);
 assert.equal(a.uploads.m.get(assetKey(a.id)).phase,'draft_verified');
 assert.equal(a.etsyStore.m.get('draft/'+a.sku).phase,'verified');
 assert.deepEqual([c.supplierPosts,c.etsyDrafts,c.activeWrites,c.images],[1,1,0,4]);
 assert.equal(c.draftInventory.products[0].sku,a.sku);
});
test('changed PrintShrimp product ID prevents any new bundle or Etsy listing',async()=>{
 const a=fixture({drift:true});
 await assert.rejects(a.run(),/Supplier product identity changed/);
 assert.deepEqual([a.getCounters().supplierPosts,a.getCounters().etsyDrafts],[0,0]);
});
test('mismatched SKU on Etsy draft blocks activation and preserves listing ID for inspection',async()=>{
 const a=fixture({badSku:true,activate:true});
 await assert.rejects(a.run(),/exact three-print SKU failed verification/);
 assert.equal(a.getCounters().activeWrites,0);
 assert.equal(a.uploads.m.get(assetKey(a.id)).listingId,10007);
});
test('explicit activation setting allows normal publication only after draft read-back',async()=>{
 const a=fixture({activate:true}),r=await a.run();
 assert.equal(r.phase,'published');
 assert.equal(a.getCounters().activeWrites,1);
});
