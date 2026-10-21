import test from 'node:test';import assert from 'node:assert/strict';
import {createGithubBridge} from '../lib/github-bridge.mjs';
function mock(){const values=new Map(),calls=[];const store=()=>({
 getWithMetadata:async key=>{calls.push({op:'get',key});return values.has(key)?{data:values.get(key),etag:'etag'}:null},
 setJSON:async(key,value)=>{calls.push({op:'set',key});values.set(key,value);return {modified:true}},
 set:async(key,value)=>{calls.push({op:'set',key});values.set(key,value);return {modified:true}},
 get:async key=>values.get(key)||null,delete:async key=>values.delete(key)});
 const handler=createGithubBridge({env:n=>n==='CANVA_SITE_ORIGIN'?'https://test.example':null,store,authenticate:async()=>{}});
 return {values,calls,request:async body=>handler(new Request('https://test.example/poster/github-worker',{method:'POST',headers:{Authorization:'Bearer placeholder'},body:JSON.stringify({store:'sapiver-poster-uploads',...body})}))};}
test('authenticated worker may read original six-Canva export state',async()=>{const m=mock();const r=await m.request({op:'get',key:'woodland-six-20261021/state',type:'json'});assert.equal(r.status,200);});
test('authenticated worker can reserve UK monthly slots 01 to 52 only',async()=>{
 const m=mock();for(const slot of ['01','11','52']){const key='limits/monthly-uploads/2026-10/slot/'+slot;const r=await m.request({op:'set',key,type:'json',data:{productId:'a'.repeat(32)}});assert.equal(r.status,200,key);}
 for(const bad of ['00','53','99']){const r=await m.request({op:'get',key:'limits/monthly-uploads/2026-10/slot/'+bad,type:'json'});assert.equal(r.status,403,bad);}
});
test('supplier-only state and transfers are permitted but arbitrary key remains rejected',async()=>{
 const m=mock();const sku='SP-WOOD-RED-SQUIRREL-ABCDEF1234';
 for(const key of ['supplier-only/'+sku,'supplier-bundles/'+sku,'woodland-request/'+'a'.repeat(32),'transfers/'+'t'.repeat(43),'collections/woodland-two-v2/'+'d'.repeat(64),'uploads/'+'a'.repeat(32)+'/supplier-master.jpg']){
  const r=await m.request({op:'get',key,type:'json'});assert.equal(r.status,200,key);}
 const fail=await m.request({op:'set',key:'anything/else',type:'json',data:{}});assert.equal(fail.status,403);
});
