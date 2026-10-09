import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProviderAccess} from '../scripts/check-provider-access.mjs';
const credentials={ETSY_PRINTS_KEYSTRING:'private-key',ETSY_PRINTS_SHARED_SECRET:'private-secret',SHRIMP_APIKEY:'private-shrimp'};
test('read-only preflight sends existing Etsy pair only to official endpoint and never leaks secrets',async()=>{
 let calls=0;
 const report=await checkProviderAccess(credentials,async(url,options)=>{
  calls++;if(url.includes('printshrimp.com')) {assert.equal(options.method,'GET');assert.equal(options.headers['x-api-key'],'private-shrimp');assert.equal(options.redirect,'error');return new Response('private-shrimp',{status:200});}assert.equal(url,'https://api.etsy.com/v3/application/openapi-ping');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers['x-api-key'],'private-key:private-secret');
  return new Response('private-key',{status:200});
 });
 assert.equal(calls,2);assert.equal(report.etsy.appAccess,'VERIFIED');assert.equal(report.etsy.sellerAccess,'NOT_CONFIGURED');assert.equal(report.printshrimp.access,'VERIFIED');
 assert.equal(report.publicationEnabled,false);assert.equal(report.ordersEnabled,false);assert.doesNotMatch(JSON.stringify(report),/private-/);
});
test('missing keys make no requests and provider failures reveal no diagnostics',async()=>{
 await checkProviderAccess({},()=>{throw Error('must not call');});
 const failed=await checkProviderAccess(credentials,async()=>{throw Error('private-secret');});assert.equal(failed.etsy.appAccess,'NETWORK_ERROR');assert.doesNotMatch(JSON.stringify(failed),/private-secret/);
 const rejected=await checkProviderAccess(credentials,async()=>new Response('private-secret',{status:403}));assert.equal(rejected.etsy.httpStatus,403);assert.equal(rejected.etsy.appAccess,'REJECTED');assert.doesNotMatch(JSON.stringify(rejected),/private-secret/);
});
