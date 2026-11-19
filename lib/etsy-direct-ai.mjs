// Etsy-only AI billing isolation. Never use Netlify-injected OPENAI_* variables.
// Every paid attempt reserves a shared monthly slot BEFORE reaching OpenAI;
// validated successes are cached by source-image content plus relevant metadata.
import {createHash} from 'node:crypto';

export const DIRECT_ETS_Y_AI_URL='https://api.openai.com/v1';
export const DIRECT_ETS_Y_AI_MODEL='gpt-4o-mini';
export const SEO_CACHE_VERSION='etsy-seo-2026-11-19-alt-v1';
const USAGE_PREFIX='seo-ai/usage/';
const CACHE_PREFIX='seo-ai/cache/';
const hash=data=>createHash('sha256').update(typeof data==='string'?data:JSON.stringify(data)).digest('hex');
export const seoCacheKey=(kind,source)=>CACHE_PREFIX+hash([SEO_CACHE_VERSION,DIRECT_ETS_Y_AI_MODEL,kind,source]);
export function directEtsyAiConfig(env){
 const apiKey=String(env?.('SAPIVER_OPENAI_API_KEY')||'').trim();
 if(!apiKey)throw Error('Set SAPIVER_OPENAI_API_KEY on the Netlify poster site before using Etsy AI analysis. No Netlify AI Gateway fallback is permitted.');
 const raw=String(env?.('SAPIVER_SEO_AI_MONTHLY_CALL_LIMIT')||'');
 if(!/^[1-9][0-9]{0,2}$/.test(raw)||Number(raw)>200)
  throw Error('Set SAPIVER_SEO_AI_MONTHLY_CALL_LIMIT to 1–200 to enable limited Etsy AI requests. No calls were made.');
 return {apiKey,monthlyLimit:Number(raw)};
}
export async function reserveSeoAiCall({store,monthlyLimit,clock=()=>Date.now()}){
 if(!store?.setJSON||!Number.isInteger(monthlyLimit)||monthlyLimit<1||monthlyLimit>200)
  throw Error('Etsy AI budget is not configured; no request sent');
 const month=new Date(clock()).toISOString().slice(0,7);
 // Netlify Blobs conditional creation prevents two concurrent calls claiming the same slot.
 // An attempted call consumes its slot even if OpenAI fails, ensuring a strict request cap.
 for(let slot=1;slot<=monthlyLimit;slot++){
  const record={reservedAt:clock(),month,slot};
  const result=await store.setJSON(USAGE_PREFIX+month+'/'+String(slot).padStart(3,'0'),record,{onlyIfNew:true});
  if(result?.modified===true)return {month,slot,monthlyLimit};
 }
 throw Error('Monthly Etsy AI request limit reached. No OpenAI call was made.');
}
export async function readCachedSeo({store,key,validate}){
 if(!store?.get||!store?.setJSON)throw Error('Etsy AI cache unavailable; no OpenAI call was made.');
 const saved=await store.get(key,{type:'json',consistency:'strong'});
 if(!saved)return null;
 if(saved.version!==SEO_CACHE_VERSION||saved.model!==DIRECT_ETS_Y_AI_MODEL||!saved.result)
  throw Error('Cached Etsy AI result needs review; no new API call was made.');
 try{return validate(saved.result);}
 catch{throw Error('Cached Etsy AI result is invalid; no new API call was made.');}
}
export async function writeCachedSeo({store,key,value,clock=()=>Date.now()}){
 if(!store?.setJSON)throw Error('Etsy AI cache unavailable; a repeated analysis has been blocked.');
 const result=await store.setJSON(key,{version:SEO_CACHE_VERSION,model:DIRECT_ETS_Y_AI_MODEL,createdAt:clock(),result:value},{onlyIfNew:true});
 // If another request inserted the same immutable cache entry concurrently, no overwrite.
 if(result?.modified===false){
  const saved=await store.get(key,{type:'json',consistency:'strong'});
  if(JSON.stringify(saved?.result)!==JSON.stringify(value))
   throw Error('A different cached SEO proposal already exists; review the stored result.');
 }
 return value;
}
export function guardedDirectAiRequest({store,monthlyLimit,request=fetch,clock=()=>Date.now()}){
 return async(url,options)=>{
  // Fail closed on ANY provider URL that could be redirected to Netlify or elsewhere.
  if(url!==DIRECT_ETS_Y_AI_URL+'/chat/completions')
   throw Error('Unsafe Etsy AI destination blocked');
  await reserveSeoAiCall({store,monthlyLimit,clock});
  return request(url,options);
 };
}
