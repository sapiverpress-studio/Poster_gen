import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {recoverLegacyTrioCover,knownLegacyTrio} from '../lib/etsy-legacy-trio.mjs';
import {prepareArtworkFirstAudit,LEAD_STATE} from '../lib/etsy-artwork-first.mjs';

function store(){
 const m=new Map();
 return {m,get:async(k)=>m.get(k)??null,set:async(k,v)=>{m.set(k,v);return{modified:true}},
  setJSON:async(k,v)=>{m.set(k,v);return{modified:true}},
  list:async function*({prefix}){yield{blobs:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}};
}
const trio={listing_id:4617196639,shop_id:50893070,state:'active',listing_type:'physical',
 title:'Eclectic Wall Art Set of 3 A4 Prints - Moka Coffee, Amethyst and Mountain Cycling'};
const members=[
 {id:4617203678,title:'Moka Pot Coffee Wall Art Print - Italian Espresso Kitchen Poster'},
 {id:4617194565,title:'Amethyst Geode Wall Art Print - Purple Crystal Mineral Poster'},
 {id:4617194011,title:'Mountain Cycling Wall Art Print - Winding Road Landscape Poster'}
];
async function setup(){
 const uploads=store(),pictures=new Map(),count={writes:0};
 for(let i=0;i<3;i++)pictures.set(members[i].id,await sharp({create:{width:900,height:1350,channels:3,background:['#c73e62','#28ac6d','#3b59db'][i]}}).jpeg().toBuffer());
 const originalPhotos=[{listing_id:trio.listing_id,listing_image_id:100,rank:1,alt_text:'Old trio horizontal cover'}];
 const client={session:async()=>({shop_id:50893070,shop_name:'SapiverPrints'}),
 api:async(path,opts)=>{
  if(path==='/shops/50893070/listings/active?limit=100&offset=0')return{results:[trio]};
  if(path==='/listings/'+trio.listing_id)return trio;
  if(path==='/listings/'+trio.listing_id+'/images')return{results:originalPhotos};
  const m=path.match(/^\/listings\/(\d+)(\/images)?$/);
  if(m){
   const id=Number(m[1]),item=members.find(x=>x.id===id);
   if(!item)throw Error('Unknown listing');
   if(!m[2])return {listing_id:id,shop_id:50893070,state:'active',listing_type:'physical',title:item.title};
   return{results:[{listing_id:id,listing_image_id:id+10,rank:1,alt_text:'Sapiver artwork-first: '+item.title,
    url_fullxfull:'https://i.etsystatic.com/'+id+'/il/clean.jpg'}]};
  }
  count.writes++;throw Error('Unexpected Etsy write');
 }};
 const request=async url=>{
  const id=Number(new URL(url).pathname.split('/')[1]);
  return new Response(pictures.get(id),{headers:{'content-type':'image/jpeg'}});
 };
 return {uploads,client,request,count};
}
test('mapped older trio is recoverable from three exact live originals without a bundle product record',async()=>{
 const f=await setup();assert.equal(knownLegacyTrio(4617196639),true);
 const x=await recoverLegacyTrioCover({client:f.client,uploads:f.uploads,listing:trio,
  shopId:50893070,products:[],request:f.request});
 assert.deepEqual(x.memberListingIds,members.map(x=>x.id));
 assert.deepEqual([(await sharp(x.front).metadata()).width,(await sharp(x.front).metadata()).height],[1600,1600]);
 assert.equal(f.count.writes,0);
});
test('a changed legacy member listing fails closed before any Etsy write',async()=>{
 const f=await setup(),old=f.client.api;
 f.client.api=async(path,options)=>{
  if(path==='/listings/4617194565')return {...members[1],listing_id:4617194565,shop_id:50893070,state:'inactive',listing_type:'physical'};
  return old(path,options);
 };
 await assert.rejects(recoverLegacyTrioCover({client:f.client,uploads:f.uploads,listing:trio,
  shopId:50893070,products:[],request:f.request}),/changed identity/);
 assert.equal(f.count.writes,0);
});
test('audit prepares the previously skipped legacy trio without changing Etsy',async()=>{
 const f=await setup();
 const result=await prepareArtworkFirstAudit({client:f.client,uploads:f.uploads,
  id:'z'.repeat(32),clock:()=>5000,request:f.request});
 assert.equal(result.ready,1);assert.equal(result.skipped,0);assert.equal(f.count.writes,0);
 const state=await f.uploads.get(LEAD_STATE);
 assert.equal(state.rows[0].replaceLeadId,100);
 assert.deepEqual(state.rows[0].legacyMemberListingIds,members.map(x=>x.id));
 assert.ok(f.uploads.m.get(state.rows[0].sourceKey));
});
