import {seal,unseal} from './oauth.mjs';
import {ETSY_SCOPES} from './etsy-oauth.mjs';
const PURPOSE='etsy-stored-tokens';
// Refresh is single-writer. An ambiguous exchange stays locked until investigation;
// never retry an old refresh token automatically after a timeout.
export function createEtsySession({store,config,request=fetch,clock=()=>Date.now()}) {
 async function session() {
  const snapshot=await store.getWithMetadata('primary',{type:'text',consistency:'strong'});
  const encrypted=snapshot?.data;
  if(!encrypted)throw Error('Etsy seller connection required');
  if(typeof snapshot.etag!=='string'||!snapshot.etag)throw Error('Etsy token storage version missing');
  const current=unseal(encrypted,config.secret,PURPOSE);
  if(current.shop_name!=='SapiverPrints'||!Number.isSafeInteger(current.shop_id)||current.shop_id<=0||!/^\d+\./.test(current.access_token||'')||ETSY_SCOPES.split(' ').some(s=>!String(current.scope).split(/\s+/).includes(s)))throw Error('Invalid Etsy seller connection');
  if(current.expires_at>clock()+120000)return current;
  const key='refresh/'+current.connected_at+'/'+current.expires_at;
  const reserved=await store.setJSON(key,{phase:'exchanging',at:clock()},{onlyIfNew:true});
  if(reserved?.modified!==true)throw Error('Etsy refresh already claimed; retry status or reconnect after investigation');
  try {
   const response=await request('https://api.etsy.com/v3/public/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:config.clientId,refresh_token:current.refresh_token}).toString()});
   if(!response.ok)throw Error('refresh');
   const token=await response.json();
   if(!String(token.access_token||'').startsWith(current.user_id+'.')||!String(token.refresh_token||'').startsWith(current.user_id+'.')||token.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(token.expires_in)||token.expires_in<=0||ETSY_SCOPES.split(' ').some(s=>!String(token.scope||'').split(/\s+/).includes(s)))throw Error('invalid');
   const updated={...current,access_token:token.access_token,refresh_token:token.refresh_token,scope:token.scope,expires_at:clock()+token.expires_in*1000,refreshed_at:clock()};
   // Preserve a new owner connection that might have arrived during refresh.
   const saved=await store.set('primary',seal(updated,config.secret,PURPOSE),{onlyIfMatch:snapshot.etag});
   if(saved?.modified!==true)throw Error('connection changed');
   await store.setJSON(key,{phase:'complete',at:clock()});return updated;
  }catch {await store.setJSON(key,{phase:'uncertain',at:clock()});throw Error('Etsy refresh needs investigation or reconnection');}
 }
 async function api(path,options={}) {
  if(!path.startsWith('/')||path.includes('..')||path.includes('://'))throw Error('Invalid Etsy API path');
  const seller=await session();
  const response=await request('https://openapi.etsy.com/v3/application'+path,{...options,redirect:'error',signal:AbortSignal.timeout(20000),headers:{...options.headers,'x-api-key':config.clientId+':'+config.sharedSecret,Authorization:'Bearer '+seller.access_token,Accept:'application/json'}});
  if(!response.ok)throw Error('Etsy request failed');return response.json();
 }
 return {session,api};
}
