import test from 'node:test';
import assert from 'node:assert/strict';
import {checkOwnerUpload} from '../lib/owner-upload-smoke.mjs';
import {unseal} from '../lib/oauth.mjs';
const origin='https://poster.example.test',secret='test-only-smoke-key-with-sufficient-length',now=100000;
test('trusted read-only smoke checks actual owner route using a bounded transient session',async()=>{
 let calls=0;const result=await checkOwnerUpload({origin,secret,clock:()=>now,request:async(url,o)=>{calls++;assert.equal(url,origin+'/poster/upload');assert.equal(o.method,'GET');assert.equal(o.redirect,'error');const owner=unseal(o.headers.Cookie.split('=')[1],secret,'poster-owner');assert.equal(owner.expiry,now+60000);assert.ok(owner.csrf);return new Response('<form id="poster-upload-form"></form><p>No previous listing needed.</p>');}});
 assert.deepEqual(result,{phase:'ready',httpStatus:200,formPresent:true,directUpload:true});assert.equal(calls,1);
});
test('login or old deployed form never passes and private page contents are never reported',async()=>{
 for(const [status,html]of [[303,''],[200,'private data <form id="poster-upload-form"></form>']]){
  const result=await checkOwnerUpload({origin,secret,request:async()=>new Response(html,{status})});assert.equal(result.phase,'not_ready');assert.doesNotMatch(JSON.stringify(result),/private data/);
 }
});
test('transport failures and invalid origins expose no credentials and never follow login redirects',async()=>{
 const failed=await checkOwnerUpload({origin,secret,request:async()=>{throw Error(secret);}});assert.deepEqual(failed,{phase:'unavailable'});
 let calls=0;assert.deepEqual(await checkOwnerUpload({origin:'http://poster.example.test',secret,request:async()=>{calls++;}}),{phase:'unavailable'});assert.equal(calls,0);
});
