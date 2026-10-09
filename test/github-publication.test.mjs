import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyGithubIdentity,WORKFLOW_REF,REPOSITORY,REPOSITORY_ID} from '../lib/github-identity.mjs';
import {createGithubBridge} from '../lib/github-bridge.mjs';
import {createRemoteStore} from '../lib/github-remote-store.mjs';
import {runGithubJobs} from '../lib/github-publication.mjs';
import {websiteEnv,createQueuedEtsyHandler} from '../lib/github-web.mjs';
import {seal} from '../lib/oauth.mjs';
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
test('website owner setup does not require provider secrets; valid callback queues once without calling Etsy',async()=>{
 assert.equal(websiteEnv(n=>n.startsWith('ETSY')?undefined:env(n))('ETSY_PRINTS_SHARED_SECRET'),'github-worker');
 const s=memory(),q=memory();await s.setJSON('github-config',{clientId:'app'});
 const flow={state:'state_test',verifier:'verifier',expiry:now+600000};
 const handler=createQueuedEtsyHandler({env,etsyStore:s,queue:q,clock:()=>now}),req=()=>new Request(origin+'/etsy/callback?state=state_test&code=private-code',{headers:{cookie:'__Host-sapiver_etsy_flow='+seal(flow,secret,'etsy-browser-flow')}});
 assert.equal((await handler(req())).status,200);assert.equal((await handler(req())).status,200);assert.equal(q.map.size,1);
 assert.equal((await handler(new Request(origin+'/etsy/callback?state=wrong&code=x',{headers:{cookie:'__Host-sapiver_etsy_flow='+seal(flow,secret,'etsy-browser-flow')}}))).status,400);
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
