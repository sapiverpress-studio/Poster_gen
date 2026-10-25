import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {triggerGithubSeoUpdate} from '../lib/github-web.mjs';
test('dedicated GitHub action only receives existing listing ID and audit batch',async()=>{
 let call;const batch='a'.repeat(32),id=4595944801;
 const result=await triggerGithubSeoUpdate({batch,id,env:key=>key==='POSTER_GITHUB_ACTIONS_TOKEN'?'fixture-token':undefined,clock:()=>123,
  request:async(url,options)=>{call={url,options};return {status:204};}});
 assert.equal(result.phase,'requested');
 assert.equal(call.url,'https://api.github.com/repos/sapiverpress-studio/Poster_gen/actions/workflows/seo-metadata.yml/dispatches');
 assert.deepEqual(JSON.parse(call.options.body),{ref:'main',inputs:{batch,listing_id:String(id)}});
 assert.equal(call.options.method,'POST');
 assert.doesNotMatch(JSON.stringify(call.options),/PrintShrimp|SHRIMP_APIKEY/);
});
test('incorrect SEO approval cannot trigger a worker',async()=>{
 await assert.rejects(triggerGithubSeoUpdate({batch:'wrong',id:1}),/Invalid SEO approval/);
 await assert.rejects(triggerGithubSeoUpdate({batch:'a'.repeat(32),id:-1}),/Invalid SEO approval/);
});
test('isolated workflow and runner cannot invoke supplier writes or mixed publication queue',()=>{
 const yaml=readFileSync(new URL('../.github/workflows/seo-metadata.yml',import.meta.url),'utf8');
 const runner=readFileSync(new URL('../scripts/github-seo-metadata.mjs',import.meta.url),'utf8');
 assert.ok(yaml.includes('scripts/github-seo-metadata.mjs'));
 assert.ok(yaml.includes('workflow_dispatch'));
 assert.ok(!yaml.includes('SHRIMP_APIKEY'));
 assert.ok(!runner.includes('SHRIMP_APIKEY'));
 assert.ok(!runner.includes('collectGithubJobs'));
 assert.ok(!runner.includes('runGithubJobs'));
 assert.ok(!runner.includes('api-create-product'));
});
