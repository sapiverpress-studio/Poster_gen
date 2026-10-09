import {randomBytes} from 'node:crypto';
import {unseal,equal} from './oauth.mjs';
import {createEtsyHandler,etsySetup} from './etsy-oauth.mjs';
export const QUEUE_STORE='sapiver-github-queue';
// Only the app keystring is cached: Etsy necessarily sends it in the consent URL.
// Provider shared secret and PrintShrimp key never enter this site's runtime.
export function websiteEnv(env,clientId='github-worker'){return n=>n==='ETSY_PRINTS_KEYSTRING'?clientId:n==='ETSY_PRINTS_SHARED_SECRET'?'github-worker':env(n);}
export async function cachedClient(uploads){const catalog=await uploads.get('template/catalog',{type:'json',consistency:'strong'});return {session:async()=>{if(!catalog?.shopId)throw Error('Connect Etsy');return {shop_id:catalog.shopId};},api:async()=>{if(!catalog?.listings)throw Error('Connect Etsy');return {results:catalog.listings};}};}
export function githubDispatch(queue){return async(id,action,approvalHash)=>{const result=await queue.setJSON('jobs/'+randomBytes(24).toString('base64url'),{phase:'queued',action,id,approvalHash:approvalHash||null,createdAt:Date.now()},{onlyIfNew:true});if(result?.modified!==true)throw Error('Queue unavailable');};}
const page=(text,status=200)=>new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etsy connection</title><p>'+text+'</p>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
export function createQueuedEtsyHandler({env,etsyStore,queue,clock=()=>Date.now()}){return async req=>{
 const config=await etsyStore.get('github-config',{type:'json',consistency:'strong'});if(!config?.clientId)return page('The GitHub worker has not connected yet. No keys need to be entered here.',503);
 const localEnv=websiteEnv(env,config.clientId),url=new URL(req.url);
 if(url.pathname==='/etsy/start')return createEtsyHandler({env:localEnv,store:()=>etsyStore})(req);
 if(url.pathname!=='/etsy/callback'||req.method!=='GET')return page('Not found',404);
 try{
  const cfg=etsySetup(localEnv),cookie=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-sapiver_etsy_flow='))?.slice('__Host-sapiver_etsy_flow='.length);
  const flow=unseal(cookie,cfg.secret,'etsy-browser-flow');
  if(!Number.isFinite(flow.expiry)||flow.expiry<clock()||url.searchParams.getAll('state').length!==1||!equal(flow.state,url.searchParams.get('state'))||url.searchParams.getAll('code').length!==1||!url.searchParams.get('code')||url.searchParams.get('code').length>8192||url.searchParams.has('error'))throw Error('Denied');
  const statusKey='oauth-status/'+flow.state,result=await etsyStore.get(statusKey,{type:'json',consistency:'strong'});
  if(result?.phase==='complete')return page('SapiverPrints is connected. <a href="/poster/workflow">Open poster upload</a>.');
  if(result?.phase==='needs_investigation')return page('Etsy connection needs checking. <a href="/etsy/start">Start a fresh connection</a>.',502);
  const reserved=await etsyStore.setJSON('oauth-queued/'+flow.state,{at:clock()},{onlyIfNew:true});
  if(reserved?.modified===true){const id=randomBytes(24).toString('base64url');await queue.setJSON('jobs/'+id,{phase:'queued',action:'oauth',createdAt:clock(),statusKey,url:req.url,cookie:'__Host-sapiver_etsy_flow='+cookie},{onlyIfNew:true});}
  return page('Your Etsy connection is queued for the GitHub worker. This can take several minutes. Refresh this page to check. No product has been created.');
 }catch{return page('Expired or invalid Etsy connection. <a href="/etsy/start">Start again</a>.',400);}
};}
