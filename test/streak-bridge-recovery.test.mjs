import test from 'node:test';
import assert from 'node:assert/strict';
import {createGithubBridge} from '../lib/github-bridge.mjs';
import {recoverOriginalStreakSection} from '../lib/streak-section-recovery.mjs';

test('signed worker bridge allows only the isolated Streak section status key',async()=>{
 const data=new Map(),origin='https://studio.example';
 const blob={
  getWithMetadata:async k=>data.has(k)?{data:structuredClone(data.get(k)),etag:'v1'}:null,
  setJSON:async(k,v)=>{data.set(k,structuredClone(v));return {modified:true};}
 };
 const handler=createGithubBridge({
  env:n=>n==='CANVA_SITE_ORIGIN'?origin:'irrelevant',
  store:n=>{assert.equal(n,'sapiver-poster-uploads');return blob;},
  authenticate:async()=>true
 });
 async function send(key,op='get',value){
  const body={op,store:'sapiver-poster-uploads',key,...(op==='set'?{type:'json',data:value}:{type:'json'})};
  const response=await handler(new Request(origin+'/poster/github-worker',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify(body)}));
  return {status:response.status,body:await response.json()};
 }
 const status={phase:'queued',title:'Streak',id:'s'.repeat(32)};
 assert.equal((await send('streak-section/status','set',status)).status,200);
 const saved=await send('streak-section/status');
 assert.equal(saved.status,200);
 assert.deepEqual(saved.body.data,status);
 assert.equal((await send('streak-section/not-allowed')).status,403);
});

function fixture({phase='queued',postFailure=false,shopName='SapiverPrints'}={}){
 const id='s'.repeat(32),status={phase,id,title:'Streak',checkedAt:Date.parse('2026-11-03T17:13:14Z')};
 const map=new Map([['streak-section/status',status]]),locks=new Set(),sections=[{title:'Wall Art',shop_section_id:100}],writes=[];
 const uploads={
  get:async key=>structuredClone(map.get(key)||null),
  setJSON:async(key,record)=>{map.set(key,structuredClone(record));return {modified:true}}
 };
 const etsyStore={setJSON:async(key,record,{onlyIfNew}={})=>{
  if(onlyIfNew&&locks.has(key))return {modified:false};
  locks.add(key);
  return {modified:true};
 }};
 const client={
  session:async()=>({shop_id:50893070,shop_name:shopName,scope:'shops_r shops_w listings_r listings_w'}),
  api:async(path,options={})=>{
   assert.equal(path,'/shops/50893070/sections');
   if(options.method==='POST'){
    writes.push({path,method:options.method,body:options.body});
    if(postFailure)throw Error('Simulated uncertain Etsy POST');
    const s={title:new URLSearchParams(options.body).get('title'),shop_section_id:101};
    sections.push(s);
    return s;
   }
   return {count:sections.length,results:structuredClone(sections)};
  }
 };
 return {uploads,etsyStore,client,locks,writes,map,sections,id};
}
const correct={runId:'41682084491',attempt:'2'};
test('reconciles the exact approved failed run once, creates Streak only, and never creates twice',async()=>{
 const f=fixture();
 const result=await recoverOriginalStreakSection({...correct,...f});
 assert.equal(result.phase,'verified');
 assert.equal(result.title,'Streak');
 assert.equal(result.sectionId,101);
 assert.equal(f.writes.length,1);
 assert.equal(f.writes[0].body,'title=Streak');
 assert.equal(f.map.get('streak-section/status').sectionId,101);
 assert.ok(f.map.get('template/sections').sections.some(s=>s.id===101&&s.title==='Streak'));
 const again=await recoverOriginalStreakSection({...correct,...f});
 assert.equal(again.reusedVerified,true);
 assert.equal(f.writes.length,1);
});
test('different run or wrong attempt cannot recover or write Etsy',async()=>{
 for(const params of [{runId:'41682084492',attempt:'2'},{runId:'41682084491',attempt:'3'}]){
  const f=fixture();
  await assert.rejects(recoverOriginalStreakSection({...params,...f}),/restricted/);
  assert.equal(f.writes.length,0);
 }
});
test('missing approved request or wrong seller cannot post',async()=>{
 const bad=fixture({phase:'not_started'});
 await assert.rejects(recoverOriginalStreakSection({...correct,...bad}),/not found/);
 assert.equal(bad.writes.length,0);
 const wrong=fixture({shopName:'AnotherShop'});
 await assert.rejects(recoverOriginalStreakSection({...correct,...wrong}),/Wrong Etsy seller/);
 assert.equal(wrong.writes.length,0);
 assert.equal(wrong.map.get('streak-section/status').phase,'needs_investigation');
});
test('uncertain Etsy response is retained as investigation and never replayed',async()=>{
 const f=fixture({postFailure:true});
 await assert.rejects(recoverOriginalStreakSection({...correct,...f}),/uncertain/);
 assert.equal(f.writes.length,1);
 assert.equal(f.map.get('streak-section/status').phase,'needs_investigation');
 await assert.rejects(recoverOriginalStreakSection({...correct,...f}),/not found/);
 assert.equal(f.writes.length,1);
});
