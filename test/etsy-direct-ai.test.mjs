import test from 'node:test';
import assert from 'node:assert/strict';
import {directEtsyAiConfig,seoCacheKey,readCachedSeo,writeCachedSeo,reserveSeoAiCall,guardedDirectAiRequest,DIRECT_ETS_Y_AI_URL} from '../lib/etsy-direct-ai.mjs';
const store=()=>{
 const items=new Map();
 return {items,get:async key=>items.get(key)||null,setJSON:async(key,value,{onlyIfNew=false}={})=>{
  if(onlyIfNew&&items.has(key))return {modified:false};
  items.set(key,structuredClone(value));return {modified:true};
 }};
};
test('requires explicit Sapiver API key and exact monthly request limit, never Netlify injected credentials',()=>{
 const env=n=>n==='OPENAI_API_KEY'?'injected-netlify-token':n==='OPENAI_BASE_URL'?'https://example.netlify/ai':undefined;
 assert.throws(()=>directEtsyAiConfig(env),/SAPIVER_OPENAI_API_KEY/);
 const e=n=>n==='SAPIVER_OPENAI_API_KEY'?'sk-test':n==='SAPIVER_SEO_AI_MONTHLY_CALL_LIMIT'?'3':undefined;
 assert.deepEqual(directEtsyAiConfig(e),{apiKey:'sk-test',monthlyLimit:3});
 const invalid=n=>n==='SAPIVER_OPENAI_API_KEY'?'sk-test':n==='SAPIVER_SEO_AI_MONTHLY_CALL_LIMIT'?'0':undefined;
 assert.throws(()=>directEtsyAiConfig(invalid),/MONTHLY_CALL_LIMIT/);
});
test('the monthly ceiling is a strict atomic request-attempt cap even with simultaneous requests',async()=>{
 const uploads=store(),clock=()=>Date.parse('2026-11-19T12:00:00Z');
 const outcomes=await Promise.allSettled(Array.from({length:4},()=>reserveSeoAiCall({store:uploads,monthlyLimit:2,clock})));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,2);
 assert.equal(outcomes.filter(x=>x.status==='rejected').length,2);
 assert.equal([...uploads.items.keys()].filter(k=>k.startsWith('seo-ai/usage/2026-11/')).length,2);
 const december=await reserveSeoAiCall({store:uploads,monthlyLimit:2,clock:()=>Date.parse('2026-12-01T12:00:00Z')});
 assert.equal(december.slot,1);
});
test('cache keeps only accepted SEO metadata, never image bytes or API credentials',async()=>{
 const uploads=store(),key=seoCacheKey('physical',{image:'opaque-jpeg-content',name:'Fox'});
 const value={title:'Fox Wall Art Print',tags:['woodland fox print'],description:'Physical fox print'};
 assert.equal(await readCachedSeo({store:uploads,key,validate:x=>x}),null);
 await writeCachedSeo({store:uploads,key,value});
 assert.deepEqual(await readCachedSeo({store:uploads,key,validate:x=>x}),value);
 const text=JSON.stringify([...uploads.items.values()]);
 assert.ok(!text.includes('opaque-jpeg-content'));
 assert.ok(!text.includes('sk-test'));
 assert.notEqual(key,seoCacheKey('physical',{image:'changed-jpeg-content',name:'Fox'}));
 assert.notEqual(key,seoCacheKey('physical',{image:'opaque-jpeg-content',name:'Hedgehog'}));
});
test('paid AI wrapper refuses all Netlify Gateway URLs without spending a monthly slot',async()=>{
 const uploads=store();let sent=0;
 const guarded=guardedDirectAiRequest({store:uploads,monthlyLimit:3,request:async()=>{sent++;return{ok:true}}});
 await assert.rejects(guarded('https://example.netlify.app/.netlify/ai/chat/completions',{}),/Unsafe Etsy AI destination/);
 assert.equal(sent,0);assert.equal(uploads.items.size,0);
 await guarded(DIRECT_ETS_Y_AI_URL+'/chat/completions',{});
 assert.equal(sent,1);
});
