import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {imageHash,cleanPosterFront,cleanDigitalFront,cleanTrioFront,composeTrioCover} from '../lib/clean-listing-image.mjs';
import {LEAD_STATE,prepareArtworkFirstAudit,applyArtworkFirstAudit} from '../lib/etsy-artwork-first.mjs';
import {handleArtworkFirst} from '../lib/etsy-artwork-first-web.mjs';

const revision='a'.repeat(32),productId='b'.repeat(32),auditId='c'.repeat(32),applyId='d'.repeat(32);
function memory(){
 const m=new Map();
 return {m,
  get:async key=>m.get(key)??null,
  set:async(key,value)=>{m.set(key,value);return{modified:true}},
  setJSON:async(key,value,opts)=>{if(opts?.onlyIfNew&&m.has(key))return{modified:false};m.set(key,value);return{modified:true}},
  list:async function*({prefix}){yield {blobs:[...m.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}}};
}
async function fixture(){
 const uploads=memory();
 const original=await sharp({create:{width:1200,height:1600,channels:3,background:'#aaccff'}}).png().toBuffer();
 const asset={phase:'published',type:'physical',listingId:42,productId,masterKey:'uploads/master-42.png',image:{sha256:imageHash(original)}};
 uploads.m.set('uploads/'+revision+'/state',asset);
 uploads.m.set(asset.masterKey,original);
 uploads.m.set('products/'+productId+'/record',{productId,type:'physical',etsyListingId:42,currentRevision:revision,pendingRevision:null});
 let photos=[{listing_id:42,listing_image_id:101,rank:1,alt_text:'Oak-framed wall scene'}, {listing_id:42,listing_image_id:102,rank:2,alt_text:'Art without frame'}];
 let writes=0;
 const base={listing_id:42,shop_id:123,state:'active',listing_type:'physical',title:'Original woodland poster'};
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:123}),api:async(path,options={})=>{
  if(path==='/shops/123/listings/active?limit=100&offset=0')return{count:1,results:[base]};
  if(path==='/listings/42')return {...base};
  if(path==='/listings/42/images')return{results:photos.map(x=>({...x}))};
  if(path==='/shops/123/listings/42/images'&&options.method==='POST'){
   writes++;
   assert.equal(options.body.get('rank'),'1');
   assert.match(options.body.get('alt_text'),/Sapiver artwork-first/);
   assert.equal(options.body.get('overwrite'),'false');
   const newImage={listing_id:42,listing_image_id:999,rank:1,alt_text:options.body.get('alt_text')};
   photos=[newImage,...photos.map(p=>({...p,rank:p.rank+1}))];
   return {listing_id:42,listing_image_id:999};
  }
  throw Error('Unexpected Etsy endpoint: '+path);
 }};
 return {uploads,client,original,writes:()=>writes,photos:()=>photos};
}
test('generates a clean first image directly from the supplied original artwork',async()=>{
 const f=await fixture(),lead=await cleanPosterFront(f.original);
 const metadata=await sharp(lead).metadata();
 assert.equal(metadata.width,1600);assert.equal(metadata.height,1600);
 assert.equal((await sharp(lead).extract({left:800,top:800,width:1,height:1}).raw().toBuffer())[2]>0,true);
});
test('digital hero prefers actual buyer repeatable artwork to sales graphics',async()=>{
 const file=await sharp({create:{width:1000,height:1000,channels:3,background:'#119977'}}).png().toBuffer();
 const hero=await cleanDigitalFront([{name:'seamless-background.png',format:'png',width:1000,height:1000,data:file}]);
 assert.equal((await sharp(hero).metadata()).width,1600);
 assert.equal(await cleanDigitalFront([{name:'license.txt',format:'txt',data:Buffer.from('Terms')}]),null);
});
test('read-only audit matches original privately stored master and does not write Etsy',async()=>{
 const f=await fixture();
 const result=await prepareArtworkFirstAudit({client:f.client,uploads:f.uploads,id:auditId,clock:()=>5000});
 assert.equal(result.ready,1);assert.equal(result.skipped,0);assert.equal(f.writes(),0);
 const state=await f.uploads.get(LEAD_STATE);
 assert.equal(state.rows[0].oldImageIds.join(','),'101,102');
 assert.equal(state.rows[0].sourceKey,'catalogue/artwork-first/images/'+auditId+'/42.jpg');
 assert.ok(await f.uploads.get(state.rows[0].sourceKey));
});
test('approved apply adds one clean lead and retains both existing Etsy image IDs',async()=>{
 const f=await fixture();
 await prepareArtworkFirstAudit({client:f.client,uploads:f.uploads,id:auditId,clock:()=>5000});
 const state=await f.uploads.get(LEAD_STATE);
 await f.uploads.setJSON(LEAD_STATE,{...state,phase:'apply_queued',applyId,approvedAt:5001});
 const result=await applyArtworkFirstAudit({client:f.client,uploads:f.uploads,id:applyId,clock:()=>5002,pause:async()=>{}});
 assert.deepEqual({phase:result.phase,verified:result.verified},{phase:'complete',verified:1});
 assert.equal(f.writes(),1);
 assert.deepEqual(f.photos().map(p=>p.listing_image_id),[999,101,102]);
 const after=await f.uploads.get(LEAD_STATE);
 assert.equal(after.results[0].status,'verified');
});
test('stale audit is rejected without making an Etsy image mutation',async()=>{
 const f=await fixture();
 await prepareArtworkFirstAudit({client:f.client,uploads:f.uploads,id:auditId,clock:()=>1});
 const state=await f.uploads.get(LEAD_STATE);
 await f.uploads.setJSON(LEAD_STATE,{...state,phase:'apply_queued',applyId});
 await assert.rejects(applyArtworkFirstAudit({client:f.client,uploads:f.uploads,id:applyId,clock:()=>90000000}),/Fresh owner-approved/);
 assert.equal(f.writes(),0);
});
test('only the authenticated owner with matching CSRF can queue the image preview',async()=>{
 const f=await fixture(),owner={csrf:'safestoken'};
 const res=await handleArtworkFirst({req:new Request('https://example.test/poster/lead-images/preview',{method:'POST',headers:{'x-poster-csrf':'invalid'}}),path:'/poster/lead-images/preview',uploads:f.uploads,owner,dispatch:async()=>{throw Error('Must not dispatch')},page:()=>{throw Error('Must not render')}});
 assert.equal(res.status,403);
 assert.equal(f.writes(),0);
});

test('square three-print cover displays all three complete artworks inside the thumbnail',async()=>{
 const originals=await Promise.all(['#d8454b','#359766','#476cd5'].map(background=>
  sharp({create:{width:1200,height:1700,channels:3,background}}).png().toBuffer()));
 const output=await composeTrioCover(originals);
 const metadata=await sharp(output).metadata();
 assert.equal(metadata.width,1600);assert.equal(metadata.height,1600);
 const samples=[[515,415],[1085,415],[800,1175]];
 const pixels=await Promise.all(samples.map(([left,top])=>sharp(output).extract({left,top,width:1,height:1}).raw().toBuffer()));
 assert.ok(pixels[0][0]>pixels[0][1]&&pixels[0][0]>pixels[0][2],'first poster visible');
 assert.ok(pixels[1][1]>pixels[1][0]&&pixels[1][1]>pixels[1][2],'second poster visible');
 assert.ok(pixels[2][2]>pixels[2][0]&&pixels[2][2]>pixels[2][1],'third poster visible');
 const gap=await sharp(output).extract({left:790,top:400,width:1,height:1}).raw().toBuffer();
 assert.ok(gap.every(channel=>channel>220),'artwork pieces remain separate');
});

test('owner-reviewed trio refresh replaces only the old cover without duplicating the gallery',async()=>{
 const uploads=memory(),revision='j'.repeat(32),pid='k'.repeat(32);
 const members=['l','m','n'].map(v=>v.repeat(32));
 for(let i=0;i<3;i++){
  const bytes=await sharp({create:{width:1000,height:1400,channels:3,background:['#cc4477','#228855','#3355cc'][i]}}).png().toBuffer();
  const key='uploads/'+members[i]+'/master.png';
  uploads.m.set('uploads/'+members[i]+'/state',{phase:'published',masterKey:key,image:{sha256:imageHash(bytes)}});
  uploads.m.set(key,bytes);
 }
 const listingId=43,base={listing_id:listingId,shop_id:123,state:'active',listing_type:'physical',title:'Three original art prints'};
 uploads.m.set('uploads/'+revision+'/state',{phase:'published',type:'physical_bundle',listingId,productId:pid,memberIds:members});
 uploads.m.set('products/'+pid+'/record',{productId:pid,type:'physical_bundle',etsyListingId:listingId,currentRevision:revision,pendingRevision:null});
 let photos=[{listing_id:listingId,listing_image_id:301,rank:1,alt_text:'Sapiver artwork-first: old landscape trio'},
  {listing_id:listingId,listing_image_id:302,rank:2,alt_text:'Existing room mockup'}],uploadsCount=0;
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:123}),api:async(path,opts={})=>{
  if(path==='/shops/123/listings/active?limit=100&offset=0')return{count:1,results:[base]};
  if(path==='/listings/43')return{...base};
  if(path==='/listings/43/images')return{results:photos.map(x=>({...x}))};
  if(path==='/shops/123/listings/43/images'&&opts.method==='POST'){
   uploadsCount++;
   assert.equal(opts.body.get('rank'),'1');
   assert.equal(opts.body.get('overwrite'),'true');
   assert.match(opts.body.get('alt_text'),/trio-square-v2/);
   photos=[{listing_id:listingId,listing_image_id:999,rank:1,alt_text:opts.body.get('alt_text')},
    {...photos[1],rank:2}];
   return{listing_id:listingId,listing_image_id:999};
  }
  throw Error('Unexpected Etsy endpoint: '+path);
 }};
 const audit=await prepareArtworkFirstAudit({client,uploads,id:auditId,clock:()=>5000});
 assert.equal(audit.ready,1);
 const state=await uploads.get(LEAD_STATE);
 assert.equal(state.rows[0].replaceLeadId,301);
 const newCover=await uploads.get(state.rows[0].sourceKey);
 assert.deepEqual([(await sharp(newCover).metadata()).width,(await sharp(newCover).metadata()).height],[1600,1600]);
 await uploads.setJSON(LEAD_STATE,{...state,phase:'apply_queued',applyId,approvedAt:5001});
 const outcome=await applyArtworkFirstAudit({client,uploads,id:applyId,clock:()=>5002,pause:async()=>{}});
 assert.equal(outcome.verified,1);
 assert.equal(uploadsCount,1);
 assert.deepEqual(photos.map(x=>x.listing_image_id),[999,302]);
 const repeat=await prepareArtworkFirstAudit({client,uploads,id:'q'.repeat(32),clock:()=>6000});
 assert.equal(repeat.ready,0);assert.equal(repeat.already,1);
});
