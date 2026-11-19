import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {LEGACY_TRIOS,knownLegacyTrio} from '../lib/etsy-legacy-trio.mjs';
import {LEAD_STATE,prepareArtworkFirstAudit} from '../lib/etsy-artwork-first.mjs';
import {handleArtworkFirst} from '../lib/etsy-artwork-first-web.mjs';

const expected=[4617196639,4613186929,4613060911,4610368914,4609483175,4609504500,4600182933,4600180569];
test('all eight independently verified existing trio listings have unique three-member source mappings',()=>{
 assert.deepEqual(Object.keys(LEGACY_TRIOS).map(Number).sort(),expected.slice().sort());
 const seen=new Set();
 for(const [key,trio] of Object.entries(LEGACY_TRIOS)){
  assert.equal(knownLegacyTrio(Number(key)),true);
  assert.equal(trio.members.length,3);
  assert.ok(trio.title.length>5);
  const sources=new Set(trio.members.map(x=>x.id));
  assert.equal(sources.size,3);
  for(const source of trio.members){
   assert.ok(Number.isSafeInteger(source.id)&&source.id>0);
   assert.ok(source.title.length>8);
   assert.ok(!seen.has(source.id),'No single print may be assigned to two different existing trios');
   seen.add(source.id);
  }
 }
 assert.equal(seen.size,24);
});
function blobs(){
 const m=new Map();
 return {m,
  get:async key=>m.get(key)??null,
  set:async(key,value)=>{m.set(key,value);return{modified:true}},
  setJSON:async(key,value,options={})=>{if(options.onlyIfNew&&m.has(key))return{modified:false};m.set(key,value);return{modified:true}},
  list:async function*({prefix}){yield{blobs:[...m.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}}};
}
const id='z'.repeat(32),shopId=50893070,trioId=4617196639,singleId=4617203678;
const trio={listing_id:trioId,title:'Eclectic Wall Art Set of 3 A4 Prints - Moka Coffee, Amethyst and Mountain Cycling',
 shop_id:shopId,state:'active',listing_type:'physical'};
const single={listing_id:singleId,title:'Moka Pot Coffee Wall Art Print - Italian Espresso Kitchen Poster',
 shop_id:shopId,state:'active',listing_type:'physical'};
async function fixture(){
 const uploads=blobs(),photos=new Map(),members=LEGACY_TRIOS[trioId].members,writes=[];
 const picture=await sharp({create:{width:900,height:1350,channels:3,background:'#dd8844'}}).jpeg().toBuffer();
 for(const member of members){
  const listing={listing_id:member.id,title:member.title+' - original individual print',shop_id:shopId,state:'active',listing_type:'physical'};
  const image={listing_id:member.id,listing_image_id:member.id+10,rank:1,alt_text:'Sapiver artwork-first: '+listing.title,
   url_fullxfull:'https://i.etsystatic.com/'+member.id+'/il_artwork.jpg'};
  photos.set(member.id,{listing,image});
 }
 const client={session:async()=>({shop_id:shopId,shop_name:'SapiverPrints'}),api:async(path,options={})=>{
  if(options.method){writes.push(path);throw Error('Unexpected Etsy write');}
  if(path==='/shops/'+shopId+'/listings/active?limit=100&offset=0')return{results:[trio,single]};
  if(path==='/listings/'+trioId)return trio;
  if(path==='/listings/'+trioId+'/images')return{results:[{listing_id:trioId,listing_image_id:901,rank:1,alt_text:'Landscape cropped trio'}]};
  const m=path.match(/^\/listings\/(\d+)(\/images)?$/);
  if(!m)throw Error('Unexpected Etsy read '+path);
  const match=photos.get(Number(m[1]));
  if(!match)throw Error('Missing source');
  return m[2]?{results:[match.image]}:match.listing;
 }};
 const request=async()=>new Response(picture,{status:200,headers:{'content-type':'image/jpeg'}});
 return {uploads,client,request,writes};
}
test('trio-scoped Etsy audit prepares only the trio and leaves its single poster untouched',async()=>{
 const f=await fixture();
 await f.uploads.setJSON(LEAD_STATE,{phase:'preview_queued',id,scope:'trios'});
 const result=await prepareArtworkFirstAudit({client:f.client,uploads:f.uploads,id,clock:()=>5000,request:f.request});
 const saved=await f.uploads.get(LEAD_STATE);
 assert.equal(result.ready,1);
 assert.equal(result.total,1);
 assert.equal(saved.scope,'trios');
 assert.deepEqual(saved.activeIds,[trioId,singleId].sort((a,b)=>a-b));
 assert.deepEqual(saved.rows.map(x=>x.id),[trioId]);
 assert.equal(saved.rows[0].isTrio,true);
 assert.equal(saved.rows[0].replaceLeadId,901);
 assert.equal(saved.rows[0].sourceKind,'three_verified_singles');
 assert.equal(f.writes.length,0);
});
test('owner may queue the dedicated trio audit without authorising photo updates',async()=>{
 const f=await fixture(),events=[];
 await f.uploads.setJSON(LEAD_STATE,{phase:'complete',rows:[]});
 const req=new Request('https://example.test/poster/lead-images/preview',{method:'POST',
  headers:{'x-poster-csrf':'safe','content-type':'application/json'},body:JSON.stringify({scope:'trios'})});
 const out=await handleArtworkFirst({req,path:'/poster/lead-images/preview',uploads:f.uploads,
  owner:{csrf:'safe'},dispatch:async(id,action)=>events.push({id,action}),clock:()=>5000});
 assert.equal(out.status,202);
 const saved=await f.uploads.get(LEAD_STATE);
 assert.equal(saved.scope,'trios');
 assert.equal(saved.phase,'preview_queued');
 assert.equal(events.length,1);
 assert.equal(events[0].action,'lead_images_preview');
 assert.equal(f.writes.length,0);
});
test('owner page places trio review ahead of other listings',async()=>{
 const uploads=blobs();
 await uploads.setJSON(LEAD_STATE,{phase:'ready',id,scope:'all',rows:[
  {id:111,title:'Single poster',status:'already',isTrio:false},
  {id:trioId,title:'Eclectic trio',status:'skipped',isTrio:true,reason:'Missing source'}
 ],activeIds:[111,trioId]});
 const resp=await handleArtworkFirst({req:new Request('https://example.test/poster/lead-images'),
  path:'/poster/lead-images',uploads,owner:{csrf:'safe'},dispatch:async()=>{},
  page:body=>new Response(body),esc:x=>String(x)});
 const html=await resp.text();
 assert.match(html,/Check all trio covers/);
 assert.match(html,/Trio gallery covers \(1\)/);
 assert.match(html,/Other listings \(1\)/);
 assert.ok(html.indexOf('Eclectic trio')<html.indexOf('Single poster'));
});
