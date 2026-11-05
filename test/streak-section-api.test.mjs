import test from 'node:test';
import assert from 'node:assert/strict';
import {createStreakSectionThroughEtsyApi,createTrioCollectionSectionThroughEtsyApi,verifiedTrioSectionId} from '../lib/streak-section-api.mjs';
import {recoverOriginalTrioSection} from '../lib/streak-section-recovery.mjs';
import {createGithubBridge} from '../lib/github-bridge.mjs';

function fixture({titles=['Wall Art','Nature'],shopId=50893070,shopName='SapiverPrints',scope='shops_r shops_w listings_r listings_w'}={}){
 let sections=titles.map((title,i)=>({shop_section_id:90000000+i,title}));
 const writes=[],saved=new Map(),locks=new Map();
 const client={
  session:async()=>({shop_id:shopId,shop_name:shopName,scope}),
  api:async(path,options={})=>{
   assert.equal(path,'/shops/'+shopId+'/sections');
   if(options.method==='POST'){
    writes.push({method:options.method,path,headers:options.headers,body:options.body});
    const title=new URLSearchParams(options.body).get('title');
    sections=[...sections,{shop_section_id:90000000+sections.length,title}];
    return sections.at(-1);
   }
   if(options.method)throw Error('Unexpected Etsy section mutation');
   return {count:sections.length,results:structuredClone(sections)};
  }
 };
 const etsyStore={setJSON:async(key,data,{onlyIfNew}={})=>{
  if(onlyIfNew&&locks.has(key))return {modified:false};
  locks.set(key,structuredClone(data));return {modified:true};
 }};
 const uploads={setJSON:async(key,value)=>{saved.set(key,structuredClone(value));}};
 return {client,etsyStore,uploads,writes,saved,locks,sections:()=>sections};
}
test('creates precisely Streak through Etsy POST, reads it back, updates uploader section snapshot',async()=>{
 const f=fixture(),result=await createStreakSectionThroughEtsyApi(f);
 assert.equal(result.phase,'verified');
 assert.equal(result.title,'Streak');
 assert.equal(result.created,true);
 assert.equal(f.writes.length,1);
 assert.equal(f.writes[0].path,'/shops/50893070/sections');
 assert.equal(f.writes[0].body,'title=Streak');
 assert.equal(f.writes[0].headers['Content-Type'],'application/x-www-form-urlencoded');
 const snapshot=f.saved.get('template/sections');
 assert.equal(snapshot.sections.filter(s=>s.title==='Streak').length,1);
 assert.equal(snapshot.sections.find(s=>s.title==='Streak').id,result.sectionId);
});
test('existing Streak is reused without any write',async()=>{
 const f=fixture({titles:['Streak','Nature']});
 const result=await createStreakSectionThroughEtsyApi(f);
 assert.equal(result.created,false);
 assert.equal(f.writes.length,0);
 assert.equal(result.sectionId,90000000);
});
test('rejects wrong shop, missing seller write scope, and duplicate section safely',async()=>{
 for(const overrides of [{shopId:12345},{shopName:'NotSapiverPrints'},{scope:'shops_r'},{titles:['Streak','streak']}]){
  const f=fixture(overrides);
  await assert.rejects(createStreakSectionThroughEtsyApi(f));
  assert.equal(f.writes.length,0);
 }
});
test('never creates a 21st Etsy section',async()=>{
 const f=fixture({titles:Array.from({length:20},(_,i)=>'Section '+i)});
 await assert.rejects(createStreakSectionThroughEtsyApi(f),/twenty sections/);
 assert.equal(f.writes.length,0);
});
test('does not retry an uncertain POST and cannot silently duplicate Streak',async()=>{
 const f=fixture();
 const api=f.client.api;
 f.client.api=async(p,o={})=>{
  if(o.method==='POST'){f.writes.push({method:'POST'});throw Error('Uncertain Etsy API response');}
  return api(p,o);
 };
 await assert.rejects(createStreakSectionThroughEtsyApi(f),/Uncertain/);
 await assert.rejects(createStreakSectionThroughEtsyApi(f),/already reserved/);
 assert.equal(f.writes.length,1);
});

test('Trio Collection is created once via owner-authorised Etsy seller API and returns its exact section ID',async()=>{
 const f=fixture();
 const created=await createTrioCollectionSectionThroughEtsyApi(f);
 assert.equal(created.title,'Trio Collection');
 assert.equal(created.phase,'verified');
 assert.equal(created.created,true);
 assert.equal(f.writes.length,1);
 assert.equal(f.writes[0].body,'title=Trio+Collection');
 assert.equal(verifiedTrioSectionId({results:f.sections()}),created.sectionId);
 const repeat=await createTrioCollectionSectionThroughEtsyApi(f);
 assert.equal(repeat.created,false);
 assert.equal(repeat.sectionId,created.sectionId);
 assert.equal(f.writes.length,1);
});
test('Trio Collection lookup blocks missing or ambiguous Etsy sections',()=>{
 assert.throws(()=>verifiedTrioSectionId({results:[]}),/Trio Collection/);
 assert.throws(()=>verifiedTrioSectionId({results:[
  {title:'Trio Collection',shop_section_id:45},{title:'trio collection',shop_section_id:46}
 ]}),/Trio Collection/);
 assert.throws(()=>verifiedTrioSectionId({results:[{title:'Trio Collection',shop_section_id:0}]}),/Trio Collection/);
});

test('signed worker bridge permits only the exact Trio Collection status key',async()=>{
 const uploads=new Map([['trio-section/status',{phase:'queued',title:'Trio Collection'}]]);
 const handle=createGithubBridge({
  env:name=>name==='CANVA_SITE_ORIGIN'?'https://poster.example.test':null,
  authenticate:async()=>{},
  store:()=>({
   getWithMetadata:async key=>uploads.has(key)?{data:uploads.get(key)}:null,
   setJSON:async(key,data)=>{uploads.set(key,data);return {modified:true};}
  })
 });
 const request=(key,op='get')=>new Request('https://poster.example.test/poster/github-worker',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({op,store:'sapiver-poster-uploads',key,type:'json',data:{phase:'verified'}})
 });
 const read=await handle(request('trio-section/status'));
 assert.equal(read.status,200);
 assert.equal((await read.json()).data.phase,'queued');
 const write=await handle(request('trio-section/status','set'));
 assert.equal(write.status,200);
 assert.equal(uploads.get('trio-section/status').phase,'verified');
 const forbidden=await handle(request('trio-section/anything-else'));
 assert.equal(forbidden.status,403);
});

test('original failed Trio Collection run can be recovered exactly once by verified seller API readback',async()=>{
 const f=fixture();
 const originalId='a'.repeat(32);
 f.saved.set('trio-section/status',{phase:'queued',title:'Trio Collection',id:originalId,checkedAt:Date.parse('2026-11-05T08:53:49Z')});
 f.uploads.get=async key=>f.saved.get(key)||null;
 await assert.rejects(recoverOriginalTrioSection({runId:'41998001142',attempt:'3',uploads:f.uploads,etsyStore:f.etsyStore,client:f.client}),/attempt two/);
 assert.equal(f.writes.length,0);
 const result=await recoverOriginalTrioSection({runId:'41998001142',attempt:'2',uploads:f.uploads,etsyStore:f.etsyStore,client:f.client});
 assert.equal(result.phase,'verified');
 assert.equal(result.title,'Trio Collection');
 assert.equal(result.id,originalId);
 assert.equal(f.saved.get('trio-section/status').sectionId,result.sectionId);
 assert.equal(f.writes.length,1);
 const again=await recoverOriginalTrioSection({runId:'41998001142',attempt:'2',uploads:f.uploads,etsyStore:f.etsyStore,client:f.client});
 assert.equal(again.reusedVerified,true);
 assert.equal(f.writes.length,1);
});

test('Trio Collection recovery refuses a different or stale request before making Etsy writes',async()=>{
 const f=fixture();
 f.saved.set('trio-section/status',{phase:'queued',title:'Trio Collection',id:'a'.repeat(32),checkedAt:Date.parse('2026-11-04T08:53:49Z')});
 f.uploads.get=async key=>f.saved.get(key)||null;
 await assert.rejects(recoverOriginalTrioSection({runId:'41998001142',attempt:'2',uploads:f.uploads,etsyStore:f.etsyStore,client:f.client}),/not safely recoverable/);
 assert.equal(f.writes.length,0);
});
