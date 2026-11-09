import test from 'node:test';
import assert from 'node:assert/strict';
import {serialiseTrioQuotaReads} from '../lib/streak-nov9-missing-trio.mjs';
import {monthlyUploadStatus,reserveMonthlyUpload} from '../lib/monthly-upload-limit.mjs';
const clock=()=>Date.parse('2026-11-09T12:00:00Z');
test('Streak recovery scans the 52 monthly slots sequentially and keeps atomic reservation',async()=>{
 let running=0,max=0,quotaReads=0;
 const entries=new Map();
 const uploads={
  get:async key=>{
   if(key.startsWith('limits/monthly-uploads/')){
    quotaReads++;running++;max=Math.max(max,running);
    await new Promise(resolve=>setImmediate(resolve));
    running--;return entries.get(key)||null;
   }
   return entries.get(key)||null;
  },
  setJSON:async(key,body,opt={})=>{
   if(opt.onlyIfNew&&entries.has(key))return {modified:false};
   entries.set(key,body);return {modified:true};
  },
  list:async function*(){yield {blobs:[]};}
 };
 const bounded=serialiseTrioQuotaReads(uploads);
 const initial=await monthlyUploadStatus({uploads:bounded,clock,products:[]});
 assert.equal(initial.remaining,52);
 assert.equal(quotaReads,52);
 assert.equal(max,1);
 const id='z'.repeat(32);
 const reserved=await reserveMonthlyUpload({uploads:bounded,productId:id,clock});
 assert.equal(reserved.accepted,true);
 assert.equal(max,1);
 const final=await monthlyUploadStatus({uploads:bounded,clock,products:[]});
 assert.equal(final.remaining,51);
 assert.equal([...entries.keys()].filter(k=>k.startsWith('limits/monthly-uploads/')).length,1);
});
