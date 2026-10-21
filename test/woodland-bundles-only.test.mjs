import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveWoodlandBundlesOnly,verifyWoodlandExisting,woodlandExistingCandidates,recoverWoodlandPrepared} from '../lib/woodland-bundles-only.mjs';
import {monthlyUploadStatus} from '../lib/monthly-upload-limit.mjs';
const animals=['fox','robin','hedgehog','badger','red-squirrel','roe-deer'],shopId=512345;
const tags=n=>['woodland wall art','nature picture set','british animal art','kids reading nook','forest wall decor','woodland nursery','animal print trio','art set of three','nature illustration','nature room prints','animal verse prints','bedroom wall prints',n===1?'woodland animals':'forest nature art'];
function mock(){
 const m=new Map(),calls={supplier:[],etsy:[],dispatch:[]};
 const uploads={m,get:async(key)=>m.get(key)??null,
  setJSON:async(key,value,opts={})=>{if(opts.onlyIfNew&&m.has(key))return{modified:false};m.set(key,value);return{modified:true};},
  list:async function*({prefix=''}){yield {blobs:[...m.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}}};
 const req={existingOnly:true,confirmed:true,items:[],etsyListingIds:[],trios:[],inputs:[
  {title:'Woodland Forest Friends A4 Print Set',discount:15},
  {title:'Woodland Hidden Paths A4 Print Set',discount:10}]};
 const titles={'fox':'Fox','robin':'Robin','hedgehog':'Hedgehog','badger':'Badger','red-squirrel':'Red Squirrel','roe-deer':'Roe Deer'};
 for(let i=0;i<animals.length;i++){
  const slug=animals[i],id=String(i+1).repeat(32),sha=(i+1).toString(16).repeat(64),
   listingId=5000000000+i,sku='SP-EXISTING-'+slug.toUpperCase();
  const meta={etsyTitle:titles[slug]+' Woodland Verse Print',sectionTitle:'Nature',printSizes:['A5','A4']};
  m.set('uploads/'+id+'/state',{phase:'ready_for_approval',type:'physical',masterKey:'uploads/'+id+'/master.png',
   productId:id,image:{sha256:sha},metadata:meta,plan:{identity:{sku:'SP-NEW-'+slug},body:{
    shipping_profile_id:7,readiness_state_id:8,production_partner_ids:'9'}}});
  req.items.push({id,sha256:sha,folder:slug,listingTitle:meta.etsyTitle,sectionTitle:meta.sectionTitle,printSizes:meta.printSizes});
  req.etsyListingIds.push(listingId);
 }
 for(let n=1;n<=2;n++){
  const members=n===1?animals.slice(0,3):animals.slice(3);
  req.trios.push({title:'Woodland Trio '+n,listingTitle:'British Woodland Trio '+n+' Set of 3 A4 Prints',
   sectionTitle:'Nature',size:'A4',members,tags:tags(n),description:
    'Three unframed A4 prints depicting '+members.join(', ')+'. Original British woodland illustrations and poems with AI-assisted artwork and editorial review, printed on three separate pieces of paper. No frames or mounts.'});
 }
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:shopId}),
  api:async(path)=>{
   calls.etsy.push(path);
   if(path.startsWith('/shops/')&&path.includes('/listings?')){
    return {count:6,results:animals.map((slug,i)=>({shop_id:shopId,state:'active',listing_type:'physical',listing_id:5000000000+i,title:titles[slug]+' Woodland Print'}))};
   }
   const id=Number((path.match(/\/listings\/(\d+)/)||[])[1]);
   if(!Number.isFinite(id)||id<5000000000||id>=5000000006)throw Error('unknown listing');
   const n=id-5000000000,slug=animals[n],sku='SP-EXISTING-'+slug.toUpperCase();
   if(path.includes('/inventory'))return {products:[{sku,property_values:[{property_name:'Size',values:['A4']},{property_name:'Frame',values:['Print only']}],offerings:[{is_enabled:true,is_deleted:false,price:{currency_code:'GBP',amount:1399,divisor:100}}]}]};
   return {listing_id:id,shop_id:shopId,state:'active',listing_type:'physical',title:titles[slug]+' Woodland Print'};
  }};
 let missing=new Set();
 const request=async(url,options)=>{
  const urlText=String(url),sku=new URL(urlText).searchParams.get('sku');
  if(options.method!=='GET')throw Error('No supplier writes allowed');
  calls.supplier.push(sku);
  if(missing.has(sku))return {ok:false,status:404};
  return {ok:true,status:200,json:async()=>({success:true,product:{sku,product_id:'supplier-'+sku,variants:[{size:'A4',image_url:'https://cdn.printshrimp.com/art.png'}]}})};
 };
 const dispatch=async(id,action)=>{calls.dispatch.push({id,action})};
 return {m,uploads,req,client,request,dispatch,calls,missing,env:key=>key==='SHRIMP_APIKEY'?'private-key':null,clock:()=>Date.parse('2026-10-21T11:00:00Z')};
}
test('Woodland exception discovers the six existing Etsy source listing IDs read-only',async()=>{
 const x=mock();const r=await woodlandExistingCandidates({client:x.client});
 assert.equal(r.candidates.length,6);
 assert.ok(r.candidates.every(x=>x.choices.length===1));
 assert.equal(x.calls.dispatch.length,0);
});
test('if Badger, Red Squirrel or Roe Deer supplier product is absent, no bundles or six individual listings are reserved',async()=>{
 const x=mock();x.missing.add('SP-EXISTING-BADGER');x.missing.add('SP-EXISTING-RED-SQUIRREL');x.missing.add('SP-EXISTING-ROE-DEER');
 await assert.rejects(reserveWoodlandBundlesOnly({incoming:x.req,uploads:x.uploads,client:x.client,env:x.env,request:x.request,clock:x.clock,dispatch:x.dispatch}),/PrintShrimp/);
 assert.equal((await monthlyUploadStatus({uploads:x.uploads,clock:x.clock})).used,0);
 assert.equal([...x.m.keys()].filter(k=>k.startsWith('collections/woodland-two/')).length,0);
 assert.equal([...x.m.keys()].filter(k=>k.includes('/state')&&x.m.get(k)?.type==='physical_bundle').length,0);
 assert.equal(x.calls.dispatch.length,0);
});
test('with six verified live singles, exactly two distinct bundle reviews are reserved and no new single-product writes occur',async()=>{
 const x=mock();const r=await reserveWoodlandBundlesOnly({incoming:x.req,uploads:x.uploads,client:x.client,env:x.env,request:x.request,clock:x.clock,dispatch:x.dispatch});
 assert.equal(r.totalListings,2);assert.equal(r.createdSingles,0);assert.equal(r.existingSingles,6);
 assert.equal(r.ids.length,2);assert.equal(new Set(r.skus).size,2);
 assert.deepEqual(x.calls.dispatch.map(y=>y.action),['prepare','prepare']);
 assert.equal((await monthlyUploadStatus({uploads:x.uploads,clock:x.clock})).used,2);
 assert.equal([...x.m.keys()].filter(k=>k.startsWith('products/')&&k.endsWith('/record')).length,2);
 const second=await reserveWoodlandBundlesOnly({incoming:x.req,uploads:x.uploads,client:x.client,env:x.env,request:x.request,clock:x.clock,dispatch:x.dispatch});
 assert.equal(second.reused,true);assert.deepEqual(second.ids,r.ids);
 assert.equal(x.calls.dispatch.length,2);
});
test('same listing ID reused for two animals or unapproved source prevents any supplier or Etsy writes',async()=>{
 const x=mock();x.req.etsyListingIds[5]=x.req.etsyListingIds[4];
 await assert.rejects(verifyWoodlandExisting({incoming:x.req,uploads:x.uploads,client:x.client,env:x.env,request:x.request}),/distinct/);
 assert.equal(x.calls.supplier.length,0);
 const y=mock();y.uploads.m.get('uploads/'+y.req.items[4].id+'/state').phase='preparing';
 await assert.rejects(verifyWoodlandExisting({incoming:y.req,uploads:y.uploads,client:y.client,env:y.env,request:y.request}),/prepared, unchanged/);
 assert.equal((await monthlyUploadStatus({uploads:y.uploads,clock:y.clock})).used,0);
});

test('mobile session recovery restores exactly six approved source PNG reviews and two bundles without creating any listings',async()=>{
 const x=mock(),pages=[];
 for(let n=0;n<animals.length;n++){
  const slug=animals[n],id=x.req.items[n].id,asset=x.m.get('uploads/'+id+'/state');
  asset.filename='original-'+slug+'.png';
  asset.metadata.tags=['nature poem print','british wildlife'];
  asset.metadata.name=slug;
  asset.metadata.description='British woodland nature verse poster artwork';
  x.m.set('products/'+id+'/record',{productId:id,pendingRevision:id,phase:'ready_for_approval',createdAt:x.clock(),metadata:asset.metadata});
  pages.push({slug,sha256:asset.image.sha256});
 }
 x.m.set('woodland-six-20261021/state',{phase:'ready',pages});
 const v=await recoverWoodlandPrepared({uploads:x.uploads});
 assert.equal(v.phase,'recovered',JSON.stringify(v));
 assert.equal(v.originalsVerified,true);
 assert.equal(v.state.items.length,6);
 assert.equal(v.state.bundles.length,2);
 assert.equal(v.state.bundlesOnly,true);
 assert.equal(v.state.items[0].folder,'fox');
 assert.equal(v.state.items[5].folder,'roe-deer');
 assert.equal(v.state.storeOnly,false);
 assert.deepEqual(v.state.bundles.map(b=>b.members),[animals.slice(0,3),animals.slice(3)]);
 assert.equal(x.calls.etsy.length,0);
 assert.equal(x.calls.supplier.length,0);
 assert.equal(x.calls.dispatch.length,0);
 assert.equal((await monthlyUploadStatus({uploads:x.uploads,clock:x.clock})).used,0);
 const again=await recoverWoodlandPrepared({uploads:x.uploads});
 assert.deepEqual(again.state,v.state);
});
test('recovery fails closed when any of the six original saved artwork reviews is absent or duplicated',async()=>{
 const x=mock();
 const pages=[];
 for(let n=0;n<animals.length;n++){
  const id=x.req.items[n].id,asset=x.m.get('uploads/'+id+'/state');
  asset.metadata.tags=['woodland nature'];
  x.m.set('products/'+id+'/record',{productId:id,pendingRevision:id,createdAt:x.clock()});
  pages.push({slug:animals[n],sha256:asset.image.sha256});
 }
 x.m.set('woodland-six-20261021/state',{phase:'ready',pages});
 x.m.get('uploads/'+x.req.items[3].id+'/state').phase='needs_investigation';
 const result=await recoverWoodlandPrepared({uploads:x.uploads});
 assert.equal(result.phase,'incomplete');
 assert.deepEqual(result.missing,['badger']);
 assert.equal(x.calls.dispatch.length,0);
});
