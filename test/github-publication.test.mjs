import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyGithubIdentity,WORKFLOW_REF,REPOSITORY,REPOSITORY_ID} from '../lib/github-identity.mjs';
import {createGithubBridge} from '../lib/github-bridge.mjs';
import {createRemoteStore} from '../lib/github-remote-store.mjs';
import {runGithubJobs} from '../lib/github-publication.mjs';
import {websiteEnv,createQueuedEtsyHandler} from '../lib/github-web.mjs';
import {seal,unseal} from '../lib/oauth.mjs';
const now=1800000000000,origin='https://poster.example.test',secret='a-long-test-encryption-secret-12345';
const values={CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'test-password',CANVA_SITE_ORIGIN:origin,ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',SHRIMP_APIKEY:'test',POSTER_PUBLICATION_ENABLED:'true'};
const env=n=>values[n];
function memory(){const map=new Map();let seq=0;return {map,async get(k){return map.get(k)?.data??null;},async getWithMetadata(k){return map.get(k)||null;},async set(k,data,o={}){const old=map.get(k);if(o.onlyIfNew&&old||o.onlyIfMatch&&old?.etag!==o.onlyIfMatch)return {modified:false};map.set(k,{data,etag:String(++seq)});return {modified:true};},async setJSON(k,d,o){return this.set(k,d,o);},async delete(k){map.delete(k);},async *list({prefix}){yield {blobs:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}};}
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'test',use:'sig',alg:'RS256'};
function jwt(patch={},key=privateKey){const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url'),payload=Buffer.from(JSON.stringify({iss:'https://token.actions.githubusercontent.com',aud:origin+'/poster/github-worker',repository:REPOSITORY,repository_id:REPOSITORY_ID,workflow_ref:WORKFLOW_REF,ref:'refs/heads/main',event_name:'schedule',run_id:'123',iat:now/1000,nbf:now/1000,exp:now/1000+300,...patch})).toString('base64url');return header+'.'+payload+'.'+sign('RSA-SHA256',Buffer.from(header+'.'+payload),key).toString('base64url');}
const options={audience:origin+'/poster/github-worker',clock:()=>now,request:async()=>Response.json({keys:[jwk]})};
test('GitHub OIDC verifies signature and pins issuer audience immutable repo workflow branch event and expiry',async()=>{
 assert.equal((await verifyGithubIdentity(jwt(),options)).run_id,'123');
 for(const patch of [{repository:'evil/repo'},{repository_id:'99'},{workflow_ref:WORKFLOW_REF.replace('main','other')},{ref:'refs/heads/other'},{event_name:'pull_request'},{aud:'wrong'},{iss:'https://evil.test'},{exp:now/1000-1},{nbf:now/1000+60},{iat:now/1000-900}])await assert.rejects(verifyGithubIdentity(jwt(patch),options));
 const {privateKey:evil}=generateKeyPairSync('rsa',{modulusLength:2048});await assert.rejects(verifyGithubIdentity(jwt({},evil),options));
});
test('bridge refuses unverified identity and unrelated stores/keys',async()=>{
 const stores=new Map(),store=n=>{if(!stores.has(n))stores.set(n,memory());return stores.get(n);};
 const denied=createGithubBridge({env,store,authenticate:async()=>{throw Error();}});
 assert.equal((await denied(new Request(origin,{method:'POST',body:'{}'}))).status,403);
 const handler=createGithubBridge({env,store,authenticate:async()=>({})});
 for(const body of [{op:'get',store:'sapiver-print-approved',key:'master',type:'text'},{op:'get',store:'sapiver-poster-uploads',key:'../primary',type:'text'},{op:'list',store:'sapiver-etsy-private',prefix:''},{op:'delete',store:'sapiver-etsy-private',key:'primary'}])assert.equal((await handler(new Request(origin,{method:'POST',body:JSON.stringify(body)}))).status,403);
});
test('remote artwork transport assembles exact bytes across bounded bridge requests and detects changing version',async()=>{
 const s=memory(),bridge=createGithubBridge({env,store:()=>s,authenticate:async()=>({})});
 const rpc=async b=>{const r=await bridge(new Request(origin,{method:'POST',body:JSON.stringify(b)}));assert.equal(r.status,200);return r.json();};
 const remote=createRemoteStore('sapiver-poster-uploads',rpc),key='uploads/'+'a'.repeat(32)+'/master.png',bytes=Buffer.alloc(37_400_000);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 await remote.set(key,bytes);assert.deepEqual(Buffer.from(await remote.get(key,{type:'arrayBuffer'})),bytes);
 let calls=0;const changing=createRemoteStore('sapiver-poster-uploads',async b=>{const r=await rpc(b);if(b.op==='get'&&++calls===2)r.etag='changed';return r;});await assert.rejects(changing.get(key,{type:'arrayBuffer'}));
});

test('ZIP bridge supports originals over the physical artwork limit and keeps product/delivery keys scoped',async()=>{
 const s=memory(),bridge=createGithubBridge({env,store:()=>s,authenticate:async()=>({})});const rpc=async b=>{const r=await bridge(new Request(origin,{method:'POST',body:JSON.stringify(b)}));assert.equal(r.status,200);return r.json();};const remote=createRemoteStore('sapiver-poster-uploads',rpc),id='x'.repeat(32),bytes=Buffer.alloc(51_000_001,42);
 await remote.set('uploads/'+id+'/original.zip',bytes);assert.deepEqual(Buffer.from(await remote.get('uploads/'+id+'/original.zip',{type:'arrayBuffer'})),bytes);
 await remote.setJSON('products/'+id+'/record',{type:'digital',etsyListingId:123});assert.equal((await remote.get('products/'+id+'/record',{type:'json'})).etsyListingId,123);
 await remote.set('uploads/'+id+'/delivery/4',Buffer.from('part'));await assert.rejects(remote.set('uploads/'+id+'/delivery/5',Buffer.from('part')));
});

test('digital worker dispatches only the digital route and keeps physical reference defaults',async()=>{
 const q=memory(),u=memory(),e=memory(),id='v'.repeat(32),key='jobs/'+'w'.repeat(32),data={phase:'queued',action:'prepare',id};await q.setJSON(key,data);await u.setJSON('uploads/'+id+'/state',{phase:'preparing',type:'digital',productId:id});await u.setJSON('products/'+id+'/record',{productId:id,pendingRevision:id});await u.setJSON('template/settings',{referenceListingId:789});let digital=0;
 await runGithubJobs({jobs:[{key,...data}],queue:q,uploads:u,etsyStore:e,env,clock:()=>now,prepare:async()=>{throw Error('Physical route must not run');},prepareDigital:async()=>{digital++;await u.setJSON('uploads/'+id+'/state',{phase:'ready_for_approval',type:'digital'});}});assert.equal(digital,1);assert.equal((await u.get('template/settings')).referenceListingId,789);assert.equal((await q.get(key)).phase,'complete');
});
test('site exchanges Etsy PKCE code immediately and queues only an encrypted seller verification task',async()=>{
 assert.equal(websiteEnv(n=>n.startsWith('ETSY')?undefined:env(n))('ETSY_PRINTS_SHARED_SECRET'),'github-worker');
 const s=memory(),q=memory();await s.setJSON('github-config',{clientId:'app'});
 const flow={state:'state_test',verifier:'verifier',expiry:now+600000};
 let current=now,calls=0;
 const handler=createQueuedEtsyHandler({env,etsyStore:s,queue:q,clock:()=>current,request:async(url,opts)=>{
  calls++;assert.equal(url,'https://api.etsy.com/v3/public/oauth/token');
  assert.equal(new URLSearchParams(opts.body).get('code_verifier'),'verifier');
  assert.equal(new URLSearchParams(opts.body).get('client_id'),'app');
  assert.equal(opts.headers['x-api-key'],undefined);
  return Response.json({access_token:'123.access-secret',refresh_token:'123.refresh-secret',scope:'shops_r shops_w listings_r listings_w',token_type:'Bearer',expires_in:3600});
 }});
 const req=()=>new Request(origin+'/etsy/callback?state=state_test&code=private-code',{headers:{cookie:'__Host-sapiver_etsy_flow='+seal(flow,secret,'etsy-browser-flow')}});
 assert.equal((await handler(req())).status,200);
 const pending=await s.get('oauth-pending/state_test');
 assert.doesNotMatch(pending,/access-secret|refresh-secret|private-code/);
 assert.equal(unseal(pending,secret,'etsy-pending-grant').user_id,'123');
 const tasks=[...q.map.entries()].filter(([key])=>key.startsWith('jobs/')).map(([,x])=>x.data);assert.equal(tasks.length,1);assert.equal([...q.map.entries()].filter(([key])=>key.startsWith('dispatch/'))[0][1].data.phase,'not_configured');
 assert.equal(tasks[0].action,'oauth');assert.equal(tasks[0].pendingKey,'oauth-pending/state_test');
 assert.doesNotMatch(JSON.stringify(tasks),/access-secret|refresh-secret|private-code|cookie|\/etsy\/callback/);
 current+=700000;
 assert.equal((await handler(req())).status,200);assert.equal(calls,1);
 assert.equal((await handler(new Request(origin+'/etsy/callback?state=wrong&code=x',{headers:{cookie:'__Host-sapiver_etsy_flow='+seal(flow,secret,'etsy-browser-flow')}}))).status,400);
});
test('scheduled worker verifies the previously exchanged Etsy token and records SapiverPrints without replaying auth code',async()=>{
 const q=memory(),u=memory(),e=memory(),id='t'.repeat(32),state='safestate',
  key='jobs/'+id,statusKey='oauth-status/'+state,pendingKey='oauth-pending/'+state;
 const job={phase:'queued',action:'oauth',createdAt:now,pendingKey,statusKey};
 await q.setJSON(key,job);
 const token={access_token:'123.access-secret',refresh_token:'123.refresh-secret',user_id:'123',scope:'shops_r shops_w listings_r listings_w',expires_at:now+3600000,connected_at:now};
 await e.set(pendingKey,seal(token,secret,'etsy-pending-grant'));
 const calls=[];
 await runGithubJobs({jobs:[{key,...job}],queue:q,uploads:u,etsyStore:e,env,clock:()=>now,request:async(url,opts)=>{
  calls.push(url);assert.equal(opts.headers['x-api-key'],'app:shared');assert.equal(opts.headers.Authorization,'Bearer 123.access-secret');
  if(url.includes('/users/123/shops'))return Response.json({count:1,results:[{shop_name:'SapiverPrints',shop_id:456,user_id:123}]});
  return Response.json({results:[]});
 }});
 assert.equal((await e.get(statusKey)).phase,'complete');
 const confirmed=unseal(await e.get('primary'),secret,'etsy-stored-tokens');
 assert.equal(confirmed.shop_name,'SapiverPrints');assert.equal(confirmed.shop_id,456);
 assert.equal((await q.get(key)).phase,'complete');
 assert.equal(calls.some(v=>v.includes('/oauth/token')),false);
});
test('delayed GitHub shop verification can refresh the already exchanged token without browser session',async()=>{
 const q=memory(),u=memory(),e=memory(),key='jobs/'+'z'.repeat(32),state='late',
 pendingKey='oauth-pending/'+state,statusKey='oauth-status/'+state;
 const job={phase:'queued',action:'oauth',createdAt:now,pendingKey,statusKey};
 await q.setJSON(key,job);
 await e.set(pendingKey,seal({access_token:'123.old-token',refresh_token:'123.old-refresh',user_id:'123',scope:'shops_r shops_w listings_r listings_w',expires_at:now+3600000,connected_at:now},secret,'etsy-pending-grant'));
 let refreshes=0,verified=0;
 await runGithubJobs({jobs:[{key,...job}],queue:q,uploads:u,etsyStore:e,env,clock:()=>now+7200000,request:async(url,options)=>{
  if(url.endsWith('/oauth/token')){refreshes++;assert.equal(new URLSearchParams(options.body).get('grant_type'),'refresh_token');return Response.json({access_token:'123.new-token',refresh_token:'123.new-refresh',scope:'shops_r shops_w listings_r listings_w',expires_in:3600,token_type:'Bearer'});}
  if(url.includes('/users/123/shops')){verified++;assert.equal(options.headers.Authorization,'Bearer 123.new-token');return Response.json({count:1,results:[{shop_name:'SapiverPrints',shop_id:456,user_id:123}]});}
  return Response.json({results:[]});
 }});
 assert.equal(refreshes,1);assert.equal(verified,1);assert.equal((await e.get(statusKey)).phase,'complete');
});
test('worker demands persisted exact owner approval; concurrent/repeated pickup cannot publish twice',async()=>{
 const q=memory(),u=memory(),e=memory(),id='b'.repeat(32),key='jobs/'+'c'.repeat(32),data={phase:'queued',action:'publish',id,approvalHash:'hash'};await q.setJSON(key,data);
 await u.setJSON('uploads/'+id+'/state',{phase:'publishing',approvedAt:now,approvalHash:'hash'});
 let writes=0;const args={jobs:[{key,...data}],queue:q,uploads:u,etsyStore:e,env,publish:async()=>{writes++;},clock:()=>now};
 await runGithubJobs(args);assert.equal(writes,0);assert.equal((await q.get(key)).phase,'needs_investigation');
 const q2=memory();await q2.setJSON(key,data);await u.setJSON('uploads/'+id+'/state',{phase:'publishing',approvedAt:now,approvalHash:'hash'});await u.setJSON('claims/'+id+'/publish',{approvalHash:'hash'});args.queue=q2;
 await Promise.all([runGithubJobs(args),runGithubJobs(args)]);assert.equal(writes,1);await runGithubJobs(args);assert.equal(writes,1);
});
test('ambiguous worker failure retains claim and known listing ID, discards OAuth/task secrets from queue',async()=>{
 const q=memory(),u=memory(),e=memory(),id='d'.repeat(32),key='jobs/'+'e'.repeat(32),data={phase:'queued',action:'prepare',id};await q.setJSON(key,data);await u.setJSON('uploads/'+id+'/state',{phase:'preparing',listingId:123});let attempts=0;
 const args={jobs:[{key,...data}],queue:q,uploads:u,etsyStore:e,env,prepare:async()=>{attempts++;throw Error('secret-provider-message');},clock:()=>now};await runGithubJobs(args);await runGithubJobs(args);assert.equal(attempts,1);assert.equal((await u.get('uploads/'+id+'/state')).listingId,123);assert.equal((await u.get('uploads/'+id+'/state')).phase,'needs_investigation');assert.doesNotMatch(JSON.stringify([...q.map.values()]),/secret-provider-message/);
});

test('digital seller-kit validation gives the owner a useful safe error without exposing provider failures',async()=>{
 const q=memory(),u=memory(),e=memory(),id='g'.repeat(32),key='jobs/'+'f'.repeat(32),data={phase:'queued',action:'prepare',id};
 await q.setJSON(key,data);await u.setJSON('uploads/'+id+'/state',{phase:'preparing',type:'digital'});
 const reason='Seller kit contains an SVG with invalid width or height. Export it again before listing.';
 await runGithubJobs({jobs:[{key,...data}],queue:q,uploads:u,etsyStore:e,env,prepareDigital:async()=>{throw Error(reason);},clock:()=>now});
 const a=await u.get('uploads/'+id+'/state');assert.equal(a.failureCode,reason);assert.equal(a.failureAction,'prepare');assert.equal(a.phase,'needs_investigation');
});

test('worker bridge preserves every seller-kit gallery photo and denies indexes outside 0-9',async()=>{const s=memory(),bridge=createGithubBridge({env,store:()=>s,authenticate:async()=>({})});const rpc=async b=>{const r=await bridge(new Request(origin,{method:'POST',body:JSON.stringify(b)}));if(r.status!==200)throw Error('Bridge unavailable');return r.json();};const remote=createRemoteStore('sapiver-poster-uploads',rpc),id='p'.repeat(32);for(let i=0;i<10;i++){const bytes=Buffer.from('listing-photo-'+i),key='uploads/'+id+'/mockups/'+i+'.jpg';await remote.set(key,bytes);assert.deepEqual(Buffer.from(await remote.get(key,{type:'arrayBuffer'})),bytes);}await assert.rejects(remote.set('uploads/'+id+'/mockups/10.jpg',Buffer.from('denied')));await assert.rejects(remote.set('uploads/'+id+'/preview-input/3.jpg',Buffer.from('denied')));});

test('worker reports missing Etsy consent safely and never leaks arbitrary provider errors',async()=>{for(const [error,expected] of [['Etsy seller connection required','Connect Etsy before preparing your product.'],['Bridge unavailable','The worker could not access the private product files. Your upload is retained.']]){const q=memory(),u=memory(),e=memory(),id='z'.repeat(32),key='jobs/'+'y'.repeat(32),data={phase:'queued',action:'prepare',id};await q.setJSON(key,data);await u.setJSON('uploads/'+id+'/state',{phase:'preparing',type:'digital',stage:'checking_etsy_category'});await runGithubJobs({jobs:[{key,...data}],queue:q,uploads:u,etsyStore:e,env,clock:()=>now,prepareDigital:async()=>{throw Error(error);}});const a=await u.get('uploads/'+id+'/state');assert.equal(a.failureCode,expected);assert.equal(a.stage,'checking_etsy_category');}});

test('worker diagnoses missing Etsy seller consent without exposing credentials',async()=>{
 const q=memory(),u=memory(),e=memory(),key='jobs/'+'q'.repeat(32),job={phase:'queued',action:'catalog',createdAt:now};
 await q.setJSON(key,job);
 const result=await runGithubJobs({jobs:[{key,...job}],queue:q,uploads:u,etsyStore:e,env,clock:()=>now});
 assert.equal(result.completed,1);
 assert.equal((await u.get('template/catalog-status')).phase,'seller_consent_required');
 assert.equal((await q.get(key)).phase,'complete');
 assert.equal((await u.get('template/catalog-status')).count,undefined);
});
test('worker fetches Etsy catalogue through read-only seller API and records bounded status',async()=>{
 const q=memory(),u=memory(),e=memory(),key='jobs/'+'q'.repeat(32),job={phase:'queued',action:'catalog'};
 const session={shop_name:'SapiverPrints',shop_id:456,user_id:'1',access_token:'1.token',refresh_token:'1.refresh',scope:'shops_r shops_w listings_r listings_w',expires_at:now+3600000,connected_at:now};
 await e.set('primary',seal(session,secret,'etsy-stored-tokens'));await q.setJSON(key,job);
 const calls=[];const request=async url=>{calls.push(url);if(url.includes('/seller-taxonomy/nodes'))return Response.json({results:[]});if(url.includes('/shops/456/listings?'))return Response.json({results:[]});if(url.includes('/shops/456/listings/active'))return Response.json({results:[{listing_id:123,shop_id:456,listing_type:'physical',state:'active',title:'Poster reference'},{listing_id:124,shop_id:456,listing_type:'digital',title:'Not a physical product'}]});return new Response('',{status:500});};
 await runGithubJobs({jobs:[{key,...job}],queue:q,uploads:u,etsyStore:e,env,clock:()=>now,request});
 assert.equal((await u.get('template/catalog-status')).phase,'available');
 assert.equal((await u.get('template/catalog-status')).count,1);
 assert.deepEqual((await u.get('template/catalog')).listings.map(x=>x.listing_id),[123]);
 assert.ok(calls.every(url=>url.startsWith('https://openapi.etsy.com/v3/application/')));
 assert.ok(calls.some(url=>url.includes('/shops/456/listings/active?limit=100&offset=0')),'Catalogues must use the Etsy active-listings endpoint proven by the legacy uploader');
});


test('catalogue fetch handles more than 100 active listings and rejects a partial seller cache',async()=>{
 const q=memory(),u=memory(),e=memory(),key='jobs/'+'k'.repeat(32),job={phase:'queued',action:'catalog'};
 await q.setJSON(key,job);
 const saved={shop_name:'SapiverPrints',shop_id:456,user_id:'1',access_token:'1.token',refresh_token:'1.refresh',scope:'shops_r shops_w listings_r listings_w',expires_at:now+3600000,connected_at:now};
 await e.set('primary',seal(saved,secret,'etsy-stored-tokens'));
 const seen=[];
 const request=async url=>{
  if(url.includes('/seller-taxonomy/nodes'))return Response.json({results:[]});
  const target=new URL(url);if(target.pathname.endsWith('/shops/456/listings'))return Response.json({results:[]});if(!target.pathname.endsWith('/shops/456/listings/active'))return new Response('',{status:404});
  seen.push(target.searchParams.get('offset'));
  const offset=Number(target.searchParams.get('offset'));
  return Response.json({results:Array.from({length:offset===0?100:1},(_,i)=>({shop_id:456,listing_id:10000+offset+i,listing_type:'physical',state:'active',title:'Print reference '+i}))});
 };
 await runGithubJobs({jobs:[{key,...job}],queue:q,uploads:u,etsyStore:e,env,request,clock:()=>now});
 assert.deepEqual(seen,['0','100']);
 assert.equal((await u.get('template/catalog-status')).count,101);
 assert.equal((await u.get('template/catalog')).listings.length,101);
 assert.equal((await q.get(key)).phase,'complete');
});
test('a catalogue job is not acknowledged complete before the read-only API result is saved',async()=>{
 const queue=memory(),uploads=memory(),etsyStore=memory(),key='jobs/'+'r'.repeat(32),job={phase:'queued',action:'catalog',id:'r'.repeat(32),approvalHash:null,createdAt:now};
 await queue.setJSON(key,job);
 const original=uploads.setJSON.bind(uploads);
 uploads.setJSON=async(k,value,options)=>{if(k==='template/catalog-status')throw Error('Simulated private status write failure');return original(k,value,options);};
 await assert.rejects(runGithubJobs({jobs:[{key,...job}],queue,uploads,etsyStore,env,clock:()=>now}),/Simulated private status write failure/);
 assert.equal((await queue.get(key)).phase,'needs_investigation');
});
test('catalogue refresh returns a safely classified result after the job is complete',async()=>{
 const queue=memory(),uploads=memory(),etsyStore=memory(),key='jobs/'+'s'.repeat(32),job={phase:'queued',action:'catalog',id:'s'.repeat(32),approvalHash:null,createdAt:now};
 await queue.setJSON(key,job);
 const result=await runGithubJobs({jobs:[{key,...job}],queue,uploads,etsyStore,env,clock:()=>now});
 assert.equal(result.cataloguePhase,'seller_consent_required');
 assert.equal((await uploads.get('template/catalog-status')).phase,'seller_consent_required');
 assert.equal((await queue.get(key)).phase,'complete');
});

test('authenticated catalogue includes saved physical drafts without publishing or accepting another shop',async()=>{
 const q=memory(),u=memory(),e=memory();
 await e.set('primary',seal({shop_name:'SapiverPrints',shop_id:456,user_id:'1',access_token:'1.token',refresh_token:'1.refresh',scope:'shops_r shops_w listings_r listings_w',expires_at:now+3600000,connected_at:now},secret,'etsy-stored-tokens'));
 const request=async(url,options)=>{
  assert.equal(options.method,undefined);const target=new URL(url);
  if(target.pathname.endsWith('/seller-taxonomy/nodes')||target.pathname.endsWith('/listings/active'))return Response.json({results:[]});
  const state=target.searchParams.get('state');assert.ok(['draft','inactive'].includes(state));
  return Response.json({results:[{listing_id:state==='draft'?123:124,shop_id:456,state,listing_type:'physical',title:'Saved reference'},{listing_id:125,shop_id:999,state,listing_type:'physical',title:'Foreign shop'},{listing_id:126,shop_id:456,state,listing_type:'download',title:'Digital'}]});
 };
 const result=await runGithubJobs({jobs:[],queue:q,uploads:u,etsyStore:e,env,clock:()=>now,request});
 assert.equal(result.cataloguePhase,'available');
 assert.deepEqual((await u.get('template/catalog')).listings.map(l=>[l.listing_id,l.state,l.title]),[[123,'draft','[Draft] Saved reference'],[124,'inactive','[Inactive] Saved reference']]);
});


test('failed task returns safe operation/status, retains draft and cannot replay',async()=>{
 const q=memory(),u=memory(),e=memory(),id='f'.repeat(32),key='jobs/'+id,data={phase:'queued',action:'prepare',id};
 await q.setJSON(key,data);await u.setJSON('uploads/'+id+'/state',{phase:'preparing',listingId:123});
 let calls=0;const error=Object.assign(Error('Etsy request failed'),{etsyOperation:'inventory',etsyStatus:400,body:'private-token'});
 const args={jobs:[{key,...data}],queue:q,uploads:u,etsyStore:e,env,clock:()=>now,prepare:async()=>{calls++;throw error;}};
 const result=await runGithubJobs(args);
 assert.equal(result.completed,0);assert.deepEqual(result.failures,[{action:'prepare',reason:'etsy_request_failed',message:'Etsy request failed',operation:'inventory',httpStatus:400,stage:'starting'}]);
 assert.equal((await u.get('uploads/'+id+'/state')).listingId,123);
 const retry=await runGithubJobs(args);assert.equal(retry.skipped,1);assert.equal(calls,1);
 assert.doesNotMatch(JSON.stringify(result),/private-token/);
});

test('preparation exposes fixed reference validation reason in saved UI error and run report',async()=>{
 const q=memory(),u=memory(),e=memory(),id='g'.repeat(32),key='jobs/'+id,data={phase:'queued',action:'prepare',id};
 const reason='Reference must have all twelve framed and unframed combinations';
 await q.setJSON(key,data);await u.setJSON('uploads/'+id+'/state',{phase:'preparing',stage:'checking_etsy_settings'});
 const result=await runGithubJobs({jobs:[{key,...data}],queue:q,uploads:u,etsyStore:e,env,clock:()=>now,prepare:async()=>{throw Error(reason);}});
 assert.equal(result.failures[0].message,reason);assert.equal(result.failures[0].stage,'checking_etsy_settings');
 assert.equal((await u.get('uploads/'+id+'/state')).failureCode,reason);
});

test('seller SEO audit bridge permits only the required records, not merchant writes',async()=>{
 const storeMap=new Map(),store=name=>{if(!storeMap.has(name))storeMap.set(name,memory());return storeMap.get(name);};
 const bridge=createGithubBridge({env,store,authenticate:async()=>({})});
 async function call(body){return bridge(new Request(origin+'/poster/github-worker',{method:'POST',body:JSON.stringify(body)}));}
 for(const key of ['seo/audit-status','seo/latest','seo/audit/'+'a'.repeat(32)]){
  const r=await call({op:'set',store:'sapiver-poster-uploads',key,type:'json',data:{phase:'available'}});
  assert.equal(r.status,200,'expected permitted: '+key);
  assert.equal((await (await call({op:'get',store:'sapiver-poster-uploads',key,type:'json'})).json()).data.phase,'available');
 }
 for(const key of ['seo/apply','seo/backup/'+'a'.repeat(32)+'/123','seo/audit/../../primary']){
  assert.equal((await call({op:'set',store:'sapiver-poster-uploads',key,type:'json',data:{}})).status,403);
 }
});
