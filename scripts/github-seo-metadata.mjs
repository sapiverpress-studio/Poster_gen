// Single-purpose owner-approved metadata worker. Never read or poll the mixed
// publication queue. No PrintShrimp secret, supplier API, inventory PUT or orders.
import {createRemoteStore} from '../lib/github-remote-store.mjs';
import {createEtsySession} from '../lib/etsy-session.mjs';
import {etsySetup} from '../lib/etsy-oauth.mjs';
import {applySeoUpdate} from '../lib/catalogue-seo.mjs';
const origin='https://sapiver-poster-gen-auth.netlify.app';
const batch=process.env.SEO_BATCH,id=Number(process.env.SEO_LISTING_ID);
const valid=/^[a-f0-9]{32}$/.test(batch||'')&&Number.isSafeInteger(id)&&id>0;
if(!valid)throw Error('Invalid metadata request');
const audience=origin+'/poster/github-worker';
async function rpc(body){
 const u=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 if(u.origin!=='https://run-actions.githubusercontent.com'&&!u.hostname.endsWith('.actions.githubusercontent.com'))throw Error('Invalid GitHub identity');
 u.searchParams.set('audience',audience);
 const res=await fetch(u,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('GitHub identity unavailable');
 const token=(await res.json()).value;
 const response=await fetch(audience,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error('Protected site bridge unavailable');
 return response.json();
}
const bootstrap=await rpc({op:'bootstrap'});
if(bootstrap.origin!==origin||!bootstrap.secret||!process.env.ETSY_PRINTS_KEYSTRING||!process.env.ETSY_PRINTS_SHARED_SECRET)throw Error('Saved seller configuration incomplete');
const uploads=createRemoteStore('sapiver-poster-uploads',rpc),etsyStore=createRemoteStore('sapiver-etsy-private',rpc);
const requestKey='seo/request/'+batch+'/'+id;
const request=await uploads.get(requestKey,{type:'json',consistency:'strong'});
if(request?.phase!=='approved'||request.batch!==batch||request.id!==id||!Number.isFinite(request.approvedAt)||Date.now()-request.approvedAt>1800000||Date.now()<request.approvedAt-30000)throw Error('Fresh owner approval missing');
const env=n=>n==='CANVA_CLIENT_SECRET'?bootstrap.secret:n==='CANVA_SETUP_PASSWORD'?'isolated-seo-worker':n==='CANVA_SITE_ORIGIN'?origin:process.env[n];
try{
 const client=createEtsySession({store:etsyStore,config:etsySetup(env)});
 const result=await applySeoUpdate({client,uploads,batch,id});
 await uploads.setJSON(requestKey,{...request,phase:'verified',result:result.state,verifiedAt:Date.now()});
 console.log('Verified metadata-only Etsy title/tag update; listing ID='+id+'; result='+result.state+'. Supplier writes=0.');
}catch{
 await uploads.setJSON(requestKey,{...request,phase:'needs_investigation',checkedAt:Date.now(),reason:'No automatic retry; read live seller state'});
 throw Error('Metadata-only Etsy update blocked or uncertain. No automatic retry');
}
