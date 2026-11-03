import test from 'node:test';
import assert from 'node:assert/strict';
import {createStreakSectionThroughEtsyApi} from '../lib/streak-section-api.mjs';

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
