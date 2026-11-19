import test from 'node:test';
import assert from 'node:assert/strict';
import {seal} from '../lib/oauth.mjs';
import {handleEtsyPosterPreview} from '../netlify/functions/poster-etsy-seo.mjs';
const origin='https://poster.example.test',secret='test-root-encryption-secret-123456789',now=Date.now();
const config={CANVA_CLIENT_SECRET:secret,CANVA_SITE_ORIGIN:origin,CANVA_SETUP_PASSWORD:'owner-password',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',SAPIVER_OPENAI_API_KEY:'test-only',SAPIVER_SEO_AI_MONTHLY_CALL_LIMIT:'10'};
const env=n=>config[n];
const token=seal({csrf:'owner-csrf',expiry:now+100000},secret,'poster-owner');
function store(){
 const map=new Map();
 return {map,get:async key=>map.get(key)??null,setJSON:async(key,value,{onlyIfNew=false}={})=>{
  if(onlyIfNew&&map.has(key))return {modified:false};
  map.set(key,structuredClone(value));return {modified:true};
 }};
}
const uploads=store();
const body={imageDataUrl:'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',name:'Hedgehog',kind:'artwork'};
function request({method='POST',csrf='owner-csrf',cookie=true,from=origin,data=body}={}){
 return new Request(origin+'/poster/etsy/preview',{method,headers:{origin:from,'content-type':'application/json','x-poster-csrf':csrf,...(cookie?{cookie:'__Host-poster_owner='+token}:{})},body:method==='POST'?JSON.stringify(data):undefined});
}
test('visual Etsy preview must have signed owner session and valid CSRF, no merchant writes',async()=>{
 assert.equal((await handleEtsyPosterPreview(request({cookie:false}),{env,uploads,clock:()=>now})).status,401);
 assert.equal((await handleEtsyPosterPreview(request({csrf:'wrong'}),{env,uploads,clock:()=>now})).status,403);
 assert.equal((await handleEtsyPosterPreview(request({from:'https://attacker.example'}),{env,uploads,clock:()=>now})).status,403);
 assert.equal((await handleEtsyPosterPreview(request({method:'GET'}),{env,uploads,clock:()=>now})).status,405);
});
test('missing poster-site AI key returns a safe explicit status without changing artwork',async()=>{
 const response=await handleEtsyPosterPreview(request(),{env:n=>n==='SAPIVER_OPENAI_API_KEY'?'':env(n),uploads,clock:()=>now});
 assert.equal(response.status,503);
 assert.match((await response.json()).error,/paused until a separate OpenAI API key/);
});
test('unavailable AI service does not replace any listing values',async()=>{
 const response=await handleEtsyPosterPreview(request(),{env,clock:()=>now,uploads:store(),request:async()=>({ok:false,status:502})});
 assert.equal(response.status,502);
 const failure=await response.json();
 assert.match(failure.error,/existing listing details were not changed/);
 assert.equal(failure.issue,'provider');
});

test('invalid AI tags report a fixed safe rule without exposing draft text, session, or credentials',async()=>{
 const tags=Array.from({length:13},(_,i)=>i===12?'same duplicate tag':'same duplicate tag');
 const raw={title:'Hedgehog Art Print',tags,description:'A physical art print is shipped to your home.'};
 let count=0;
 const response=await handleEtsyPosterPreview(request(),{env,uploads:store(),clock:()=>now,request:async()=>{
  count++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(raw)},finish_reason:'stop'}]})};
 }});
 assert.equal(response.status,502);
 const result=await response.json();
 assert.equal(result.issue,'tags');assert.match(result.error,/13 Etsy tags/);
 assert.ok(!JSON.stringify(result).includes('same duplicate tag'));
 assert.equal(count,2);
});

test('without a site-owned key, injected Netlify OPENAI_API_KEY cannot trigger any model calls',async()=>{
 let called=0;const without=n=>n==='SAPIVER_OPENAI_API_KEY'?'':n==='OPENAI_API_KEY'?'netlify-injected-token':env(n);
 const result=await handleEtsyPosterPreview(request(),{env:without,uploads:store(),clock:()=>now,
  request:async()=>{called++;throw Error('must never call')}});
 assert.equal(result.status,503);assert.equal(called,0);
 assert.match((await result.json()).error,/Netlify AI Gateway will not be used/);
});
test('valid repeated poster analysis uses the persisted hash cache with zero extra paid attempts',async()=>{
 const tags=['hedgehog wall art','woodland hedgehog','animal nursery art','forest animal print','hedgehog gift','nature wall print','black ink drawing','woodland bedroom','hedgehog poster','quirky animal art','hedgehog decor','british wildlife','nature lover gift'];
 const answer={title:'Hedgehog Woodland Wall Art Print',tags,description:'A physical print of a hedgehog.',altText:'A black ink illustration of a hedgehog.'};
 const cache=store();let paid=0;
 const call=async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');paid++;
  assert.equal(opts.headers.Authorization,'Bearer test-only');
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(answer)},finish_reason:'stop'}]})};};
 const first=await handleEtsyPosterPreview(request(),{env,uploads:cache,clock:()=>now,request:call});
 assert.equal(first.status,200);assert.equal((await first.json()).cacheHit,false);
 const second=await handleEtsyPosterPreview(request(),{env,uploads:cache,clock:()=>now,request:call});
 assert.equal(second.status,200);assert.equal((await second.json()).cacheHit,true);
 assert.equal(paid,1);
 assert.equal([...cache.map.keys()].filter(x=>x.startsWith('seo-ai/usage/')).length,1);
});
test('monthly call cap stops a new image before OpenAI is called again',async()=>{
 const tags=['hedgehog wall art','woodland hedgehog','animal nursery art','forest animal print','hedgehog gift','nature wall print','black ink drawing','woodland bedroom','hedgehog poster','quirky animal art','hedgehog decor','british wildlife','nature lover gift'];
 const answer={title:'Hedgehog Woodland Wall Art Print',tags,description:'A physical print of a hedgehog.',altText:'A black ink illustration of a hedgehog.'};
 const cache=store();let paid=0;
 const limit=n=>n==='SAPIVER_SEO_AI_MONTHLY_CALL_LIMIT'?'1':env(n);
 const call=async()=>{paid++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(answer)},finish_reason:'stop'}]})};};
 const first=await handleEtsyPosterPreview(request(),{env:limit,uploads:cache,clock:()=>now,request:call});
 assert.equal(first.status,200);
 const different=request({data:{...body,name:'Hedgehog in a field'}});
 const blocked=await handleEtsyPosterPreview(different,{env:limit,uploads:cache,clock:()=>now,request:call});
 assert.equal(blocked.status,429);assert.equal(paid,1);
});
