import {unseal,equal,acceptedRequestContext} from '../../lib/oauth.mjs';
import {etsySetup} from '../../lib/etsy-oauth.mjs';
import {websiteEnv} from '../../lib/github-web.mjs';
import {suggestPosterSeo} from '../../lib/etsy-visual-seo.mjs';

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleEtsyPosterPreview(req,{env,request=fetch,clock=()=>Date.now()}={}){
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
 const apiKey=env('OPENAI_API_KEY');
 if(!apiKey)return json({error:'Etsy artwork analysis is not configured on this website. Manual fields remain available.'},503);
 try{return json(await suggestPosterSeo(input,{apiKey,baseUrl:env('OPENAI_BASE_URL')||'https://api.openai.com/v1',request}));}
 catch(error){
  const message=String(error?.message||'Artwork analysis unavailable');
  if(/Invalid artwork request|reduced JPEG/.test(message))return json({error:message},400);
  return json({error:'Could not generate reliable Etsy wording. Your existing details were not changed; retry or edit them manually.'},502);
 }
}
export default req=>handleEtsyPosterPreview(req,{env:websiteEnv(n=>Netlify.env.get(n))});
export const config={path:'/poster/etsy/preview',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:300,windowLimit:12}};
