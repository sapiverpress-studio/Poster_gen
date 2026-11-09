import test from 'node:test';
import assert from 'node:assert/strict';
import {STREAK_NOV9_SOURCE,streakNov9Manifest,inspectStreakNov9Sources,recoverStreakNov9Trio} from '../lib/streak-nov9-missing-trio-recovery.mjs';
import {assetKey} from '../lib/uploaded-poster.mjs';
import {recordRevision} from '../lib/product-records.mjs';
const now=Date.parse('2026-11-09T11:30:00Z');
function fixture(){
 const m=new Map(),operations=[];
 const uploadIds=['a'.repeat(32),'b'.repeat(32),'c'.repeat(32)];
 const uploads={
  get:async key=>m.get(key)??null,
  setJSON:async(key,value,{onlyIfNew}={})=>{
   operations.push({op:'set',key});
   if(onlyIfNew&&m.has(key))return {modified:false};
   m.set(key,value);return {modified:true};
  },
  list:async function*({prefix}={}){
   yield {blobs:[...m.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};
  }
 };
 for(let i=0;i<3;i++){
  const x=STREAK_NOV9_SOURCE[i],id=uploadIds[i],listingId=4613000000+i;
  const asset={type:'physical',phase:'published',productId:id,listingId,supplierProductId:'ps-'+(i+1),
   image:{sha256:x.sha256},metadata:{name:x.name,etsyTitle:x.title,sectionTitle:'Streak',printSizes:['A5','A4']},
   plan:{identity:{sku:'SP-STREAK-'+(i+1)}},masterKey:'uploads/'+id+'/master.png'};
  m.set(assetKey(id),asset);
  m.set('products/'+id+'/record',{productId:id,type:'physical',phase:'published',currentRevision:id,
   pendingRevision:null,etsyListingId:listingId,supplierProductId:asset.supplierProductId,createdAt:now,publicationSlotAt:now});
 }
 const client={session:async()=>({shop_id:50893070,shop_name:'SapiverPrints'}),
  api:async path=>{
   operations.push({op:'etsy',path});
   if(path==='/shops/50893070/sections')
    return {results:[{title:'Trio Collection',shop_section_id:70}]};
   const match=/^\/listings\/(461300000[0-2])$/.exec(path);
   if(match)return {listing_id:Number(match[1]),shop_id:50893070,state:'active',listing_type:'physical'};
   throw Error('Unexpected Etsy read '+path);
  }
 };
 const env=k=>k==='POSTER_PUBLICATION_ENABLED'?'true':null;
 const prepare=async({id,uploads})=>{
  const a=await uploads.get(assetKey(id));
  assert.equal(a.type,'physical_bundle');
  assert.equal(a.targetShopSectionTitle,'Trio Collection');
  assert.equal(a.memberIds.length,3);
  await uploads.setJSON(assetKey(id),{...a,phase:'ready_for_approval',plan:{quote:{grossGbp:36}}});
  await recordRevision(uploads,id);
  return {phase:'ready_for_approval'};
 };
 return {m,uploads,operations,client,env,prepare,clock:()=>now};
}
test('Streak 9 Nov source manifest is the original four-listing set',()=>{
 const b=streakNov9Manifest();
 assert.equal(b.members.length,3);
 assert.equal(b.framed,true);
 assert.equal(b.tags.length,13);
 assert.equal(b.size,'A4');
 assert.match(b.listingTitle,/Set of 3 A4 Prints/);
});
test('recovers exactly ONE trio review from published originals, never new singles or Etsy listings',async()=>{
 const f=fixture();
 const result=await recoverStreakNov9Trio(f);
 assert.equal(result.phase,'ready_for_approval');
 assert.equal(result.existingIndividuals,3);
 assert.equal(result.newIndividuals,0);
 assert.equal(result.etsyListingsCreated,0);
 assert.equal(result.ordersCreated,0);
 assert.equal(result.bundleListings,1);
 assert.match(result.reviewUrl,/^\/poster\/upload\?id=[A-Za-z0-9_-]{32}$/);
 assert.equal(f.operations.filter(x=>x.op==='etsy'&&!x.path.startsWith('/listings/')&&!x.path.includes('sections')).length,0);
 assert.equal([...f.m.keys()].filter(k=>/^collections\/four\/[a-f0-9]{64}$/.test(k)).length,1);
 assert.equal([...f.m.values()].filter(x=>x?.type==='physical_bundle').length,1);
 const used=[...f.m.keys()].filter(k=>/limits\/monthly-uploads.*slot/.test(k));
 assert.equal(used.length,1);
 await assert.rejects(recoverStreakNov9Trio(f),/already has a saved bundle product/);
 assert.equal([...f.m.values()].filter(x=>x?.type==='physical_bundle').length,1);
});
test('refuses a missing published Insomnia without reserving a bundle slot',async()=>{
 const f=fixture();
 f.m.get(assetKey('b'.repeat(32))).phase='needs_investigation';
 await assert.rejects(recoverStreakNov9Trio(f),/exactly one published saved product/);
 assert.equal(f.operations.filter(x=>x.op==='set').length,0);
});
test('refuses mismatched original artwork fingerprint even if title matches',async()=>{
 const f=fixture();
 f.m.get(assetKey('c'.repeat(32))).image.sha256='0'.repeat(64);
 await assert.rejects(recoverStreakNov9Trio(f),/exactly one published saved product/);
 assert.equal(f.operations.filter(x=>x.op==='set').length,0);
});
test('refuses an existing incomplete trio even when original source listings are active',async()=>{
 const f=fixture(),bundleId='d'.repeat(32);
 f.m.set('products/'+bundleId+'/record',{productId:bundleId,type:'physical_bundle',pendingRevision:bundleId,phase:'needs_investigation'});
 f.m.set(assetKey(bundleId),{type:'physical_bundle',phase:'needs_investigation',
  memberIds:['a'.repeat(32),'b'.repeat(32),'c'.repeat(32)],sku:'SP-TRIO-ALREADY'});
 await assert.rejects(recoverStreakNov9Trio(f),/already has a saved bundle product/);
 assert.equal(f.operations.filter(x=>x.op==='set').length,0);
});
test('refuses if seller does not match the expected shop before any write',async()=>{
 const f=fixture();
 f.client.session=async()=>({shop_id:777,shop_name:'Other'});
 await assert.rejects(inspectStreakNov9Sources(f),/Incorrect Etsy seller/);
 assert.equal(f.operations.filter(x=>x.op==='set').length,0);
});
