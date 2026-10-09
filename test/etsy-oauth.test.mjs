import test from 'node:test';
import assert from 'node:assert/strict';
import {createEtsyHandler,etsyAuthUrl,ETSY_SCOPES} from '../lib/etsy-oauth.mjs';
import {newFlow,seal,unseal} from '../lib/oauth.mjs';
const secret='test-encryption-key-with-enough-length';
const cfg={ETSY_PRINTS_KEYSTRING:'test-app',ETSY_PRINTS_SHARED_SECRET:'private-shared-secret',CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'owner-password',CANVA_SITE_ORIGIN:'https://poster.example.test'};
function setup(request,overrides={}) {
 const records=new Map();const env={...cfg,...overrides};
 const store={setJSON:async(k,v)=>{if(records.has(k))return {modified:false};records.set(k,v);return {modified:true};},set:async(k,v)=>records.set(k,v)};
 return {records,handler:createEtsyHandler({env:n=>env[n],store:()=>store,request})};
}
function callback(flow,state=flow.state){return new Request('https://poster.example.test/etsy/callback?code=test-code&state='+state,{headers:{cookie:'__Host-sapiver_etsy_flow='+seal(flow,secret,'etsy-browser-flow')}});}
const token={access_token:'123.private-access',refresh_token:'123.private-refresh',scope:ETSY_SCOPES,expires_in:3600,token_type:'Bearer'};
test('Etsy PKCE URL requests only shop/listing scopes and pinned callback',()=>{
 const flow=newFlow(),url=new URL(etsyAuthUrl('app','https://poster.example.test/etsy/callback',flow));
 assert.equal(url.origin,'https://www.etsy.com');assert.equal(url.pathname,'/oauth/connect');assert.equal(url.searchParams.get('scope'),ETSY_SCOPES);assert.equal(url.searchParams.get('code_challenge'),flow.challenge);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),'https://poster.example.test/etsy/callback');
});
test('password/CSRF protected start keeps encrypted flow cookie and mobile clipboard support',async()=>{
 const {handler}=setup(()=>{throw Error('must not call');});
 const form=await handler(new Request('https://poster.example.test/etsy/start'));const text=await form.text(),proof=text.match(/name="proof" value="([^"]+)"/)[1],cookie=form.headers.get('set-cookie').split(';')[0];
 assert.match(text,/canva-clipboard.mjs/);
 const post=(password,origin='https://poster.example.test')=>new Request('https://poster.example.test/etsy/start',{method:'POST',headers:{cookie,origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({proof,password})});
 assert.equal((await handler(post('wrong'))).status,403);assert.equal((await handler(post(cfg.CANVA_SETUP_PASSWORD,'https://evil.example.test'))).status,403);
 const response=await handler(post(cfg.CANVA_SETUP_PASSWORD));assert.equal(response.status,303);assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);assert.doesNotMatch(response.headers.get('location'),/private-shared-secret|owner-password/);
});
test('callback verifies actual seller, encrypts tokens and blocks concurrent/replayed callback exchange',async()=>{
 let requests=0;
 const {handler,records}=setup(async(url,options)=>{
  requests++;assert.equal(options.redirect,'error');
  if(url.endsWith('/oauth/token')){assert.equal(options.method,'POST');assert.equal(new URLSearchParams(options.body).get('grant_type'),'authorization_code');return Response.json(token);}
  assert.equal(options.method,'GET');assert.equal(url,'https://openapi.etsy.com/v3/application/users/123/shops');return Response.json({shop_name:'SapiverPrints',shop_id:456,user_id:123});
 });
 const flow=newFlow(),results=await Promise.all([handler(callback(flow)),handler(callback(flow))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(requests,2);
 const stored=records.get('primary');assert.doesNotMatch(stored,/private-access|private-refresh/);assert.equal(unseal(stored,secret,'etsy-stored-tokens').shop_id,456);
 for(const response of results)assert.doesNotMatch(await response.text(),/private-access|private-refresh|test-code/);
});
test('wrong seller, insufficient scopes, expiry and tampered states fail closed',async()=>{
 const flow=newFlow();let calls=0;
 const {handler,records}=setup(async(url)=>{calls++;return url.endsWith('/oauth/token')?Response.json(token):Response.json({shop_name:'OtherShop',shop_id:456,user_id:123});});
 assert.equal((await handler(callback(flow,'wrong-state'))).status,400);assert.equal(calls,0);
 assert.equal((await handler(callback({...flow,expiry:Date.now()-1}))).status,400);assert.equal(calls,0);
 assert.equal((await handler(callback(flow))).status,403);assert.equal(records.has('primary'),false);
 const missing=setup(async()=>Response.json({...token,scope:'shops_r'}));assert.equal((await missing.handler(callback(newFlow()))).status,502);assert.equal(missing.records.has('primary'),false);
});
test('missing runtime keys and provider failures expose only fixed diagnostics',async()=>{
 const missing=setup(()=>{throw Error('must not call');},{ETSY_PRINTS_KEYSTRING:''});assert.equal((await missing.handler(new Request('https://poster.example.test/etsy/start'))).status,503);
 const broken=setup(async()=>{throw Error('private-shared-secret');});const response=await broken.handler(callback(newFlow()));assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/private-shared-secret/);
});
