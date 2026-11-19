// Owner-authenticated current Etsy catalogue SEO review; no automatic Etsy writes.
import {randomBytes} from 'node:crypto';
import {equal} from './oauth.mjs';
import {CURRENT_SEO,approvalKey,proposalHash,validateCurrentSeoProposal} from './etsy-current-seo.mjs';
import {suggestCurrentSeo} from './etsy-current-seo-ai.mjs';
import {directEtsyAiConfig} from './etsy-direct-ai.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const positive=n=>Number.isSafeInteger(n)&&n>0;
const id=()=>randomBytes(24).toString('base64url');
const active=s=>s?.phase==='ready'&&Number.isFinite(s.checkedAt)&&Date.now()-s.checkedAt<86400000;
async function readInput(req,max=2000){
 const s=await req.text();if(Buffer.byteLength(s)>max)throw Error('Request too large');
 try{return JSON.parse(s)}catch{throw Error('Invalid review request')}
}
export async function handleCurrentSeo({req,path,uploads,owner,dispatch,env,request=fetch,clock=()=>Date.now(),page,esc}){
 const state=await uploads.get(CURRENT_SEO,{type:'json',consistency:'strong'});
 if(path==='/poster/seo/current'&&req.method==='GET'){
  const body='<h2>Current Etsy listing SEO review</h2>'+
   '<p>Review physical posters, trios and digital downloads already active on SapiverPrints. Analysis reads the actual Etsy artwork and current listing facts. It suggests a title, 13 tags and an optional introductory paragraph. No listing changes without your individual approval.</p>'+
   '<p>AI analysis uses a separate OpenAI API account, not Netlify AI Gateway credits. Validated results are cached by artwork and listing details; requests stop at the configured monthly limit. Keep this browser page open while analysing; completed suggestions are saved if interrupted. The verified Etsy files, variants, prices, images, shipping and supplier details must remain unchanged.</p>'+
   '<section id="etsy-current-seo" data-csrf="'+esc(owner.csrf)+'">'+
   '<button type="button" id="current-seo-refresh">Read current Etsy listings</button> '+
   '<button type="button" id="current-seo-check">Refresh saved status</button> '+
   '<button type="button" id="current-seo-all">Analyse remaining listings</button> '+
   '<button type="button" id="current-seo-stop">Stop analysis</button>'+
   '<p id="current-seo-state" role="status">Checking saved catalogue…</p>'+
   '<div id="current-seo-results"></div></section>'+
   '<script type="module" src="/etsy-current-seo.mjs"></script>';
  return page(body,owner.csrf,'physical','catalogue');
 }
 if(path==='/poster/seo/current/status'&&req.method==='GET')
  return json({phase:state?.phase||'not_started',checkedAt:state?.checkedAt||null,
   rows:state?.rows?.map(x=>({id:x.id,title:x.title,type:x.type,tags:x.tags||[],
    description:x.description||'',imageUrl:x.imageUrl||null,status:x.status,
    reason:x.reason||null,proposal:x.proposal||null,proposalHash:x.proposalHash||null,
    trio:x.trio||false}))||[]});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Owner approval required'},403);
 let body;try{body=await readInput(req);}catch{return json({error:'Invalid review input'},400);}
 if(path==='/poster/seo/current/prepare'){
  if(state?.rows?.some(x=>['apply_queued','sending','needs_investigation'].includes(x.status)))
   return json({error:'An earlier Etsy update still requires verification. Do not replace its audit.'},409);
  if(state?.phase==='queued'&&clock()-state.createdAt<1200000)return json({phase:'queued'},202);
  const auditId=id();await uploads.setJSON(CURRENT_SEO,{phase:'queued',id:auditId,createdAt:clock(),rows:[]});
  try{await dispatch(auditId,'seo_current_audit');return json({phase:'queued'},202)}
  catch{
   await uploads.setJSON(CURRENT_SEO,{phase:'needs_investigation',id:auditId,checkedAt:clock(),rows:[],notice:'Authenticated seller audit was not queued'});
   return json({error:'Seller catalogue audit could not be queued; no Etsy changes'},503);
  }
 }
 if(!active({...state,checkedAt:state?.checkedAt??null})||clock()-state.checkedAt>86400000)
  return json({error:'Read the current Etsy catalogue again; this audit is expired or unavailable'},409);
 const listingId=Number(body?.id),index=state.rows.findIndex(x=>x.id===listingId);
 if(!positive(listingId)||index<0)return json({error:'Choose an active listing from the seller audit'},400);
 const row=state.rows[index];
 if(path==='/poster/seo/current/analyse'){
  if(state.rows.some(x=>['apply_queued','sending'].includes(x.status)))
   return json({error:'Finish and verify the pending Etsy metadata update before analysing more listings'},409);
  if(row.status==='proposed'||row.status==='updated')return json({phase:row.status,proposal:row.proposal||null,proposalHash:row.proposalHash||null});
  if(!['pending','analysis_failed'].includes(row.status)||!row.imageUrl)
   return json({error:'The original Etsy image or listing cannot be verified'},409);
  let config;
  try{config=directEtsyAiConfig(env);}
  catch{return json({error:'Etsy AI is paused until the separate OpenAI API key and monthly call limit are configured. Netlify Gateway will not be used.'},503);}
  try{
   const proposal=await suggestCurrentSeo({row,apiKey:config.apiKey,cacheStore:uploads,monthlyLimit:config.monthlyLimit,request,clock});
   const fresh=await uploads.get(CURRENT_SEO,{type:'json',consistency:'strong'});
   if(fresh?.id!==state.id||fresh.rows[index]?.fingerprint!==row.fingerprint||fresh.rows[index]?.status!==row.status)
    return json({error:'Listing audit changed during analysis. Refresh before continuing'},409);
   const digest=proposalHash(row,proposal);
   fresh.rows[index]={...fresh.rows[index],proposal,proposalHash:digest,status:'proposed',reason:null};
   await uploads.setJSON(CURRENT_SEO,fresh);
   return json({phase:'proposed',proposal,proposalHash:digest});
  }catch(error){
   const fresh=await uploads.get(CURRENT_SEO,{type:'json',consistency:'strong'});
   if(fresh?.id===state.id&&fresh.rows[index]?.status===row.status){
    fresh.rows[index]={...fresh.rows[index],status:'analysis_failed',reason:'AI wording could not be validated; the listing is unchanged'};
    await uploads.setJSON(CURRENT_SEO,fresh);
   }
   const msg=String(error?.message||'');
   if(msg.startsWith('Monthly Etsy AI request limit reached'))return json({error:'Etsy AI monthly OpenAI call cap reached. No further paid model request was made.'},429);
   if(/Etsy AI cache unavailable|Cached Etsy AI result|Etsy AI budget is not configured/.test(msg))
    return json({error:'Etsy AI safety cache or budget is unavailable. No Netlify AI Gateway fallback will be used.'},503);
   return json({error:'AI could not produce acceptable wording for this listing. Current Etsy wording is unchanged.'},502);
  }
 }
 if(path==='/poster/seo/current/edit'){
  if(!['proposed'].includes(row.status)||!row.proposal)return json({error:'Analyse this listing before editing its suggested wording'},409);
  let proposal;try{proposal=validateCurrentSeoProposal({
   title:body.title,tags:body.tags,intro:body.intro},row.type,{trio:row.trio});}
  catch{return json({error:'Title, 13 tags or description opening do not match Etsy product rules'},400);}
  const digest=proposalHash(row,proposal);
  state.rows[index]={...row,proposal,proposalHash:digest};
  await uploads.setJSON(CURRENT_SEO,state);
  return json({phase:'proposed',proposalHash:digest,proposal});
 }
 if(path==='/poster/seo/current/apply'){
  if(state.rows.some(x=>['apply_queued','sending'].includes(x.status)))
   return json({error:'Another approved Etsy update is still pending verification'},409);
  if(body.confirm!==true||!row.proposal||row.status!=='proposed'||body.proposalHash!==row.proposalHash||
     proposalHash(row,row.proposal)!==row.proposalHash) return json({error:'Review the exact proposed title and 13 tags first'},409);
  if(body.includeIntro!==true&&body.includeIntro!==false)return json({error:'Explicit description choice required'},400);
  const jobId=id();
  const record={auditId:state.id,listingId,proposalHash:row.proposalHash,includeIntro:body.includeIntro,createdAt:clock()};
  const reserved=await uploads.setJSON(approvalKey(jobId),record,{onlyIfNew:true});
  if(reserved?.modified!==true)return json({error:'Unable to reserve this approval'},409);
  state.rows[index]={...row,status:'apply_queued',applyId:jobId};
  await uploads.setJSON(CURRENT_SEO,state);
  try{await dispatch(jobId,'seo_current_apply');return json({phase:'apply_queued',id:listingId},202)}
  catch{return json({error:'The Etsy update could not be dispatched safely. Inspect its current status before retrying'},503)}
 }
 return json({error:'Unknown current Etsy SEO action'},404);
}
