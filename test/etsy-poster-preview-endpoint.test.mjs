import test from 'node:test';
import assert from 'node:assert/strict';
import {seal} from '../lib/oauth.mjs';
import {handleEtsyPosterPreview} from '../netlify/functions/poster-etsy-seo.mjs';
const origin='https://poster.example.test',secret='test-root-encryption-secret-123456789',now=Date.now();
const config={CANVA_CLIENT_SECRET:secret,CANVA_SITE_ORIGIN:origin,CANVA_SETUP_PASSWORD:'owner-password',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',OPENAI_API_KEY:'test-only'};
const env=n=>config[n];
const token=seal({csrf:'owner-csrf',expiry:now+100000},secret,'poster-owner');
const body={imageDataUrl:'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',name:'Hedgehog',kind:'artwork'};
function request({method='POST',csrf='owner-csrf',cookie=true,from=origin,data=body}={}){
 return new Request(origin+'/poster/etsy/preview',{method,headers:{origin:from,'content-type':'application/json','x-poster-csrf':csrf,...(cookie?{cookie:'__Host-poster_owner='+token}:{})},body:method==='POST'?JSON.stringify(data):undefined});
}
test('visual Etsy preview must have signed owner session and valid CSRF, no merchant writes',async()=>{
 assert.equal((await handleEtsyPosterPreview(request({cookie:false}),{env,clock:()=>now})).status,401);
 assert.equal((await handleEtsyPosterPreview(request({csrf:'wrong'}),{env,clock:()=>now})).status,403);
 assert.equal((await handleEtsyPosterPreview(request({from:'https://attacker.example'}),{env,clock:()=>now})).status,403);
 assert.equal((await handleEtsyPosterPreview(request({method:'GET'}),{env,clock:()=>now})).status,405);
});
test('missing poster-site AI key returns a safe explicit status without changing artwork',async()=>{
 const response=await handleEtsyPosterPreview(request(),{env:n=>n==='OPENAI_API_KEY'?'':env(n),clock:()=>now});
 assert.equal(response.status,503);
 assert.match((await response.json()).error,/not configured/);
});
test('unavailable AI service does not replace any listing values',async()=>{
 const response=await handleEtsyPosterPreview(request(),{env,clock:()=>now,request:async()=>({ok:false,status:502})});
 assert.equal(response.status,502);
 assert.match((await response.json()).error,/existing details were not changed/);
});
