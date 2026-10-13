import {randomBytes} from 'node:crypto';
import {unseal,seal,equal} from './oauth.mjs';
import {createEtsyHandler,etsySetup,ETSY_SCOPES} from './etsy-oauth.mjs';
export const QUEUE_STORE='sapiver-github-queue';
// Only the app keystring is cached: Etsy necessarily sends it in the consent URL.
// Provider shared secret and PrintShrimp key never enter this site's runtime.
export function websiteEnv(env,clientId='github-worker'){return n=>n==='ETSY_PRINTS_KEYSTRING'?clientId:n==='ETSY_PRINTS_SHARED_SECRET'?'github-worker':env(n);}
export async function cachedClient(uploads){const catalog=await uploads.get('template/catalog',{type:'json',consistency:'strong'});return {session:async()=>{if(!catalog?.shopId)throw Error('Connect Etsy');return {shop_id:catalog.shopId};},api:async()=>{if(!catalog?.listings)throw Error('Connect Etsy');return {results:catalog.listings};}};}
export function githubDispatch(queue){return async(id,action,approvalHash)=>{const jobKey='jobs/'+randomBytes(24).toString('base64url');const result=await queue.setJSON(jobKey,{phase:'queued',action,id,approvalHash:approvalHash||null,createdAt:Date.now()},{onlyIfNew:true});if(result?.modified!==true)throw Error('Queue unavailable');return jobKey;};}
const page=(text,status=200)=>new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etsy connection</title><p>'+text+'</p>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
// Etsy authorization codes are exchanged immediately on the callback, not by a
// GitHub scheduled workflow. The shared Etsy API secret remains GitHub-only;
// the delayed worker verifies the shop identity after the token is encrypted.
export function createQueuedEtsyHandler({env,etsyStore,queue,request=fetch,clock=()=>Date.now()}){return async req=>{
 const config=await etsyStore.get('github-config',{type:'json',consistency:'strong'});
 if(!config?.clientId)return page('The GitHub worker has not connected yet. No keys need to be entered here.',503);
 const localEnv=websiteEnv(env,config.clientId),url=new URL(req.url);
 if(url.pathname==='/etsy/start')return createEtsyHandler({env:localEnv,store:()=>etsyStore})(req);
 if(url.pathname!=='/etsy/callback'||req.method!=='GET')return page('Not found',404);
 try{
  const cfg=etsySetup(localEnv),cookie=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-sapiver_etsy_flow='))?.slice('__Host-sapiver_etsy_flow='.length);
  const flow=unseal(cookie,cfg.secret,'etsy-browser-flow');
  if(!flow||typeof flow.state!=='string'||! /^[A-Za-z0-9_-]+$/.test(flow.state)||typeof flow.verifier!=='string'||url.searchParams.getAll('state').length!==1||!equal(flow.state,url.searchParams.get('state'))||url.searchParams.getAll('code').length!==1||!url.searchParams.get('code')||url.searchParams.get('code').length>8192||url.searchParams.has('error'))throw Error('Denied');
  const statusKey='oauth-status/'+flow.state,result=await etsyStore.get(statusKey,{type:'json',consistency:'strong'});
  if(result?.phase==='complete')return page('SapiverPrints is connected. <a href="/poster/workflow">Open poster upload</a>.');
  if(result?.phase==='needs_investigation')return page('Etsy connection needs checking. <a href="/etsy/start">Start a fresh connection</a>.',502);
  const prior=await etsyStore.get('oauth-queued/'+flow.state,{type:'json',consistency:'strong'});
  if(prior)return page('Etsy authorisation code secured. GitHub is checking the SapiverPrints seller account. Refresh this page to check. No product has been created.');
  // A flow can only be exchanged during the original ten-minute consent window.
  // Once exchanged, status polling can continue beyond that window safely.
  if(!Number.isFinite(flow.expiry)||flow.expiry<clock())throw Error('Expired');
  const reserved=await etsyStore.setJSON('oauth-queued/'+flow.state,{phase:'claim',at:clock()},{onlyIfNew:true});
  if(reserved?.modified!==true)return page('Etsy connection already being processed. Refresh this page to check.');
  try{
   const response=await request('https://api.etsy.com/v3/public/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:cfg.clientId,redirect_uri:cfg.redirect,code:url.searchParams.get('code'),code_verifier:flow.verifier}).toString()});
   if(!response.ok)throw Error('Token exchange failed');
   const token=await response.json(),userId=/^([1-9][0-9]*)\\./.exec(token.access_token||'')?.[1];
   const granted=new Set(String(token.scope||'').split(/\\s+/));
   if(!userId||typeof token.refresh_token!=='string'||!token.refresh_token.startsWith(userId+'.')||!Number.isFinite(token.expires_in)||token.expires_in<=0||token.token_type?.toLowerCase()!=='bearer'||ETSY_SCOPES.split(' ').some(p=>!granted.has(p)))throw Error('Incomplete token');
   const pendingKey='oauth-pending/'+flow.state;
   const pending={user_id:userId,access_token:token.access_token,refresh_token:token.refresh_token,scope:token.scope,expires_at:clock()+token.expires_in*1000,connected_at:clock()};
   const stored=await etsyStore.set(pendingKey,seal(pending,cfg.secret,'etsy-pending-grant'),{onlyIfNew:true});
   if(stored?.modified!==true)throw Error('Grant already stored');
   await etsyStore.setJSON(statusKey,{phase:'pending_verification',at:clock()});
   const id=randomBytes(24).toString('base64url');
   const queued=await queue.setJSON('jobs/'+id,{phase:'queued',action:'oauth',createdAt:clock(),statusKey,pendingKey},{onlyIfNew:true});
   if(queued?.modified!==true)throw Error('Queue unavailable');
   return page('Etsy authorisation secured. GitHub is checking the SapiverPrints seller account. Refresh this page to check. No product has been created.');
  }catch{
   await etsyStore.setJSON(statusKey,{phase:'needs_investigation',at:clock()});
   return page('Etsy authorisation could not be secured. No product was created. <a href="/etsy/start">Start a fresh connection</a>.',502);
  }
 }catch{return page('Expired or invalid Etsy connection. <a href="/etsy/start">Start again</a>.',400);}
};}
