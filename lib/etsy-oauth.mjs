import {newFlow,newFormChallenge,seal,unseal,equal,validSetupPassword,verifiedFormProof,acceptedRequestContext} from './oauth.mjs';
export const ETSY_SCOPES='shops_r shops_w listings_r listings_w';
export const ETSY_STORE='sapiver-etsy-private';
const FLOW='__Host-sapiver_etsy_flow',FORM='__Host-sapiver_etsy_form';
const PURPOSE='etsy-browser-flow';
const cookie=(name,value,seconds=600)=>`${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;
const readCookie=(req,name)=>(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self' https://www.etsy.com; frame-ancestors 'none'; base-uri 'none'"};
function page(title,body,status=200,cookies=[]) {
 const h=new Headers(headers);cookies.forEach(c=>h.append('Set-Cookie',c));
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px system-ui;max-width:40rem;margin:5vh auto;padding:1rem;line-height:1.5"><h1>${title}</h1>${body}</body></html>`,{status,headers:h});
}
export function etsyAuthUrl(clientId,redirect,flow) {
 const u=new URL('https://www.etsy.com/oauth/connect');
 u.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirect,scope:ETSY_SCOPES,state:flow.state,code_challenge:flow.challenge,code_challenge_method:'S256'}).toString();return u.href;
}
export function etsySetup(env) {
 const clientId=env('ETSY_PRINTS_KEYSTRING'),sharedSecret=env('ETSY_PRINTS_SHARED_SECRET'),secret=env('CANVA_CLIENT_SECRET'),password=env('CANVA_SETUP_PASSWORD'),origin=env('CANVA_SITE_ORIGIN');
 if(!clientId||!sharedSecret||!secret||secret.length<20||!validSetupPassword(password))throw Error('incomplete');
 const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin)throw Error('origin');
 return {clientId,sharedSecret,secret,password,origin,redirect:origin+'/etsy/callback'};
}
// Dependencies injected; secrets never leave the server, except the app keystring
// which Etsy requires in its authorization URL. No listing or order endpoint exists here.
export function createEtsyHandler({env,store,request=fetch,clock=()=>Date.now()}) {
 return async req=>{
  let cfg;
  try {cfg=etsySetup(env);}catch {return page('Etsy setup incomplete','<p>The existing Etsy key pair must also be configured in Netlify Functions. GitHub Actions secrets are not automatically available here.</p>',503);}
  const path=new URL(req.url).pathname;
  if(path==='/etsy/start') {
   if(req.method==='GET') {
    const proof=newFormChallenge(clock());
    return page('Connect Etsy','<p>Connect the SapiverPrints seller account once in your normal browser. This step does not create or publish a listing and cannot order prints.</p><form method="post" action="/etsy/start"><input type="hidden" name="proof" value="'+proof.token+'"><label for="setup-password">Existing setup password</label><p><input id="setup-password" type="password" name="password" required autocomplete="off"></p><button type="button" id="paste-clipboard">Paste from clipboard</button> <button type="button" id="use-saved-clipboard">Use saved keyboard clipboard</button><div id="saved-clipboard-panel" hidden><label for="clipboard-entry">Keyboard clipboard</label><input id="clipboard-entry" type="text" autocomplete="off"></div><p id="clipboard-status" role="status"></p><button type="submit">Continue to Etsy</button></form><script type="module" src="/canva-clipboard.mjs"></script>',200,[cookie(FORM,seal(proof,cfg.secret,'etsy-form'))]);
   }
   if(req.method!=='POST')return page('Method not allowed','',405);
   if(!acceptedRequestContext(req.headers.get('origin'),cfg.origin,req.headers.get('sec-fetch-site')))return page('Request denied','',403);
   if(!(req.headers.get('content-type')||'').startsWith('application/x-www-form-urlencoded'))return page('Invalid form','',415);
   if(Number(req.headers.get('content-length')||0)>4096)return page('Form too large','',413);
   const body=await req.text();if(Buffer.byteLength(body)>4096)return page('Form too large','',413);
   const fields=new URLSearchParams(body);
   if(!verifiedFormProof(fields.get('proof'),readCookie(req,FORM),cfg.secret,clock(),'etsy-form')||!equal(fields.get('password')||'',cfg.password))return page('Request denied','<p>Reload Connect Etsy and check the setup password.</p>',403);
   const flow=newFlow();flow.expiry=clock()+600000;
   const h=new Headers(headers);h.set('Location',etsyAuthUrl(cfg.clientId,cfg.redirect,flow));h.append('Set-Cookie',cookie(FLOW,seal(flow,cfg.secret,PURPOSE)));h.append('Set-Cookie',cookie(FORM,'',0));
   return new Response(null,{status:303,headers:h});
  }
  if(path!=='/etsy/callback')return page('Not found','',404);
  if(req.method!=='GET')return page('Method not allowed','',405);
  const clear=[cookie(FLOW,'',0)],args=new URL(req.url).searchParams;
  const fail=(title,status=400)=>page(title,'<p>No listing or order was created. <a href="/etsy/start">Connect Etsy again</a>.</p>',status,clear);
  if(args.has('error'))return fail('Etsy authorisation declined');
  let flow;
  try {flow=unseal(readCookie(req,FLOW),cfg.secret,PURPOSE);}catch {return fail('Invalid Etsy session');}
  if(flow.expiry<clock()||!Number.isFinite(flow.expiry)||typeof flow.verifier!=='string'||args.getAll('state').length!==1||!equal(flow.state,args.get('state'))||args.getAll('code').length!==1||!args.get('code')||args.get('code').length>8192)return fail('Expired or mismatched Etsy session');
  try {
   const privateStore=store();
   // Consume each OAuth state atomically BEFORE exchange to stop callback replay.
   const reserved=await privateStore.setJSON('flows/'+flow.state,{consumed_at:clock()},{onlyIfNew:true});
   if(reserved?.modified!==true)return fail('Etsy session already used');
   const response=await request('https://api.etsy.com/v3/public/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:cfg.clientId,redirect_uri:cfg.redirect,code:args.get('code'),code_verifier:flow.verifier}).toString()});
   if(!response.ok)return fail('Etsy token exchange failed',502);
   const token=await response.json(),userId=/^([1-9][0-9]*)\./.exec(token.access_token||'')?.[1];
   const granted=new Set(String(token.scope||'').split(/\s+/));
   if(!userId||typeof token.refresh_token!=='string'||token.refresh_token.length<10||!Number.isFinite(token.expires_in)||token.expires_in<=0||token.token_type?.toLowerCase()!=='bearer'||ETSY_SCOPES.split(' ').some(s=>!granted.has(s)))return fail('Etsy permissions incomplete',502);
   const shopResponse=await request('https://openapi.etsy.com/v3/application/users/'+userId+'/shops',{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'x-api-key':cfg.clientId+':'+cfg.sharedSecret,Accept:'application/json'}});
   if(!shopResponse.ok)return fail('Etsy shop verification failed',502);
   const shop=await shopResponse.json();
   if(shop.shop_name!=='SapiverPrints'||!Number.isSafeInteger(shop.shop_id)||shop.shop_id<=0||String(shop.user_id)!==userId)return fail('Wrong Etsy seller account',403);
   const record={access_token:token.access_token,refresh_token:token.refresh_token,scope:token.scope,expires_at:clock()+token.expires_in*1000,connected_at:clock(),shop_id:shop.shop_id,shop_name:shop.shop_name,user_id:userId};
   await privateStore.set('primary',seal(record,cfg.secret,'etsy-stored-tokens'));
   return page('Etsy connected','<p>SapiverPrints seller access verified. Credentials are encrypted in private storage. Draft preparation can now follow. No listing was created or published; no PrintShrimp order was made.</p>',200,clear);
  }catch {return fail('Etsy connection unavailable',502);}
 };
}
