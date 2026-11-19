import {unseal,equal,acceptedRequestContext} from '../../lib/oauth.mjs';
import {etsySetup} from '../../lib/etsy-oauth.mjs';
import {websiteEnv} from '../../lib/github-web.mjs';
import {getStore} from '@netlify/blobs';
import {suggestPosterSeo,publicPosterSeoIssue,validPosterRequest,validatePosterSeo} from '../../lib/etsy-visual-seo.mjs';
import {directEtsyAiConfig,DIRECT_ETS_Y_AI_URL,seoCacheKey,readCachedSeo,writeCachedSeo,guardedDirectAiRequest} from '../../lib/etsy-direct-ai.mjs';

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleEtsyPosterPreview(req,{env,uploads,request=fetch,clock=()=>Date.now()}={}){
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 let cfg,owner;
 try{
  cfg=etsySetup(env);
  const cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-poster_owner='))?.slice('__Host-poster_owner='.length);
  owner=unseal(cookie,cfg.secret,'poster-owner');
  if(!owner.csrf||!Number.isFinite(owner.expiry)||owner.expiry<clock())throw Error('expired');
 }catch{return json({error:'Open your private product studio and sign in again'},401);}
 if(!acceptedRequestContext(req.headers.get('origin'),cfg.origin,req.headers.get('sec-fetch-site'))||
  !equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Owner permission required'},403);
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'Expected image-preview JSON'},415);
 if(Number(req.headers.get('content-length')||0)>850000)return json({error:'Image preview is too large'},413);
 const raw=await req.text();
 if(Buffer.byteLength(raw)>850000)return json({error:'Image preview is too large'},413);
 let input;try{input=JSON.parse(raw);}catch{return json({error:'Invalid image-preview JSON'},400);}
 let config;
 try{config=directEtsyAiConfig(env);}
 catch{return json({error:'Etsy AI is paused until a separate OpenAI API key and monthly call cap are configured. Existing ZIP and manual wording remain available. Netlify AI Gateway will not be used.'},503);}
 try{
  const validated=validPosterRequest(input);
  const key=seoCacheKey('physical-preview',validated);
  const check=result=>validatePosterSeo(result,{kind:validated.kind,size:validated.size});
  const prior=await readCachedSeo({store:uploads,key,validate:check});
  if(prior)return json({...prior,cacheHit:true});
  const guarded=guardedDirectAiRequest({store:uploads,monthlyLimit:config.monthlyLimit,request,clock});
  const result=await suggestPosterSeo(input,{apiKey:config.apiKey,baseUrl:DIRECT_ETS_Y_AI_URL,request:guarded});
  await writeCachedSeo({store:uploads,key,value:result,clock});
  return json({...result,cacheHit:false});
 }
 catch(error){
  const message=String(error?.message||'Artwork analysis unavailable');
  if(/Invalid artwork request|reduced JPEG/.test(message))return json({error:message},400);
  if(message.startsWith('Monthly Etsy AI request limit reached'))return json({error:'Etsy AI monthly call cap reached. No additional OpenAI request was made. Your listings and ZIP are unchanged.'},429);
  if(/Etsy AI cache unavailable|Cached Etsy AI result|A different cached SEO|Etsy AI budget is not configured/.test(message))
   return json({error:'Etsy AI safety cache or budget unavailable. Analysis stopped without falling back to Netlify AI Gateway.'},503);
  const issue=publicPosterSeoIssue(error);
  return json({error:'Etsy analysis could not finish: '+issue.message+'. Your existing listing details were not changed. You can retry or use the original ZIP.',issue:issue.code},502);
 }
}
export default req=>handleEtsyPosterPreview(req,{env:websiteEnv(n=>Netlify.env.get(n)),uploads:getStore('sapiver-poster-uploads')});
export const config={path:'/poster/etsy/preview',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:300,windowLimit:12}};
