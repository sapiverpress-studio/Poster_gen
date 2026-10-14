import test from 'node:test';
import assert from 'node:assert/strict';
import {collectGithubJobs} from '../lib/github-job-poll.mjs';
test('website-started worker waits for fresh queue visibility then returns exact tasks once',async()=>{
 let calls=0,waits=0;const jobs=[{key:'jobs/'+'a'.repeat(32),phase:'queued',action:'catalog'}];
 const result=await collectGithubJobs({event:'workflow_dispatch',rpc:async body=>{assert.deepEqual(body,{op:'list',store:'sapiver-github-queue',prefix:'jobs/'});return {jobs:++calls<3?[]:jobs};},wait:async ms=>{assert.equal(ms,15000);waits++;}});
 assert.equal(result,jobs);assert.equal(calls,3);assert.equal(waits,2);
});
test('empty manual worker stops after at most 75 seconds and scheduled workers never wait',async()=>{
 let calls=0,waits=0;assert.deepEqual(await collectGithubJobs({event:'workflow_dispatch',rpc:async()=>{calls++;return {jobs:[]};},wait:async()=>{waits++;}}),[]);assert.equal(calls,6);assert.equal(waits,5);
 calls=0;assert.deepEqual(await collectGithubJobs({event:'schedule',rpc:async()=>{calls++;return {jobs:[]};},wait:async()=>{throw Error('Unexpected wait');}}),[]);assert.equal(calls,1);
});
test('invalid or failed queue reads stop without inventing tasks or repeating writes',async()=>{
 await assert.rejects(collectGithubJobs({event:'workflow_dispatch',rpc:async()=>({jobs:null})}),/Invalid queue/);
 await assert.rejects(collectGithubJobs({event:'workflow_dispatch',rpc:async()=>{throw Error('unavailable');}}),/unavailable/);
});
