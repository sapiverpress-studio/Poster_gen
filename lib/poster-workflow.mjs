import {randomBytes} from 'node:crypto';
import {newFormChallenge,seal,unseal,equal,verifiedFormProof,acceptedRequestContext} from './oauth.mjs';
import {etsySetup} from './etsy-oauth.mjs';
import {createDraft,verifyDraft} from './etsy-draft.mjs';
import {transferOneMaster} from './printshrimp-api.mjs';
import {STATE_KEY} from './approved-export.mjs';
const SAFE_FAILURES=new Set(['Reference must be an active GBP physical poster in this shop','Product title and description required','Reference shop settings incomplete','Reference needs one unambiguous offering per A size','Reference size offering incomplete','Reference price, stock or processing profile incomplete','Size property mismatch','One verified PrintShrimp production partner required','SKU audit incomplete','Shared SKU already used; inspect existing listing','Draft already reserved; inspect existing result before retry','Draft outcome needs investigation; no automatic retry','Etsy seller connection required','Invalid Etsy seller connection','Etsy refresh needs investigation or reconnection','Visual master approval required','Etsy draft mapping mismatch','Master checksum, dimensions or supplier size limit failed','Missing supplier key','SKU already exists; inspect before changing it','Transfer already reserved; investigate before retrying','Supplier outcome needs investigation; no automatic retry']);
const COOKIE='__Host-poster_owner';
const readCookie=req=>(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
const cookie=(value,ttl=3600)=>`${COOKIE}=${value}; Path=/; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Lax`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(title,body,status=200,cookies=[]) {const h=new Headers({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});cookies.forEach(c=>h.append('Set-Cookie',c));return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><body style="font:16px system-ui;max-width:44rem;margin:3vh auto;padding:1rem;line-height:1.5"><h1>${esc(title)}</h1>${body}</body></html>`,{status,headers:h});}
async function form(req,max=30000){if(!(req.headers.get('content-type')||'').startsWith('application/x-www-form-urlencoded')||Number(req.headers.get('content-length')||0)>max)throw Error('body');const text=await req.text();if(Buffer.byteLength(text)>max)throw Error('body');return new URLSearchParams(text);}
const hidden=csrf=>'<input type="hidden" name="csrf" value="'+esc(csrf)+'">';
export function createPosterOwnerHandler({env,jobs,etsyStore,client,request=fetch,clock=()=>Date.now(),githubMode=false}) {
 return async(req,context)=>{
  let cfg;try{cfg=etsySetup(env);}catch{return page('Poster setup incomplete','<p>Configure the existing Etsy keys in Netlify Functions.</p>',503);}
  const path=new URL(req.url).pathname;
  if(path!=='/poster/workflow')return page('Not found','',404);
  let owner;try{owner=unseal(readCookie(req),cfg.secret,'poster-owner');if(owner.expiry<clock()||!Number.isFinite(owner.expiry)||!owner.csrf)owner=null;}catch{}
  if(!owner){
   if(req.method==='POST'){
    try{const f=await form(req,4096);if(!acceptedRequestContext(req.headers.get('origin'),cfg.origin,req.headers.get('sec-fetch-site'))||!verifiedFormProof(f.get('proof'),readCookie(req),cfg.secret,clock(),'poster-login')||!equal(f.get('password')||'',cfg.password))throw Error('auth');
     const value=seal({expiry:clock()+3600000,csrf:randomBytes(32).toString('base64url')},cfg.secret,'poster-owner');return new Response(null,{status:303,headers:{Location:'/poster/upload','Cache-Control':'no-store','Set-Cookie':cookie(value)}});
    }catch{return page('Request denied','<p><a href="/poster/workflow">Reload the workflow</a>.</p>',403);}
   }
   if(req.method!=='GET')return page('Method not allowed','',405);
   const p=newFormChallenge(clock());return page('Poster workflow','<form method="post">'+`<input type="hidden" name="proof" value="${p.token}">`+'<label>Existing setup password <input id="setup-password" type="password" name="password" required autocomplete="off"></label><p><button type="button" id="paste-clipboard">Paste from clipboard</button> <button type="button" id="use-saved-clipboard">Use saved keyboard clipboard</button></p><div id="saved-clipboard-panel" hidden><input id="clipboard-entry" type="text" autocomplete="off"></div><p id="clipboard-status" role="status"></p><button>Open workflow</button></form><script type="module" src="/canva-clipboard.mjs"></script>',200,[cookie(seal(p,cfg.secret,'poster-login'),600)]);
  }
  if(req.method==='POST'){
   if(githubMode)return page('Use poster upload','<p><a href="/poster/upload">Open poster upload</a>.</p>',409);
   let f;try{f=await form(req);if(!acceptedRequestContext(req.headers.get('origin'),cfg.origin,req.headers.get('sec-fetch-site'))||!equal(f.get('csrf')||'',owner.csrf))throw Error('auth');}catch{return page('Request denied','',403);}
   const action=f.get('action');
   if(!['draft','transfer'].includes(action))return page('Invalid action','',400);
   const id=Number(f.get(action==='draft'?'referenceListingId':'draftListingId'));
   if(!Number.isSafeInteger(id)||id<=0)return page('Valid listing required','',400);
   if(action==='transfer'&&(f.get('visualApproved')!=='yes'||!env('SHRIMP_APIKEY')))return page('Transfer not ready','<p>Artwork review and the configured supplier key are required.</p>',400);
   const jobId=randomBytes(24).toString('base64url');
   const command={action,...(action==='draft'?{referenceListingId:id,title:f.get('title'),description:f.get('description')}:{draftListingId:id,visualApproved:true})};
   await jobs.setJSON('jobs/'+jobId,{phase:'queued',command,createdAt:clock()},{onlyIfNew:true});
   const token=seal({jobId,expiry:clock()+600000},cfg.secret,'poster-runner');
   const dispatch=request(cfg.origin+'/poster/run',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'text/plain'},body:token}).then(async r=>{if(r.status!==202)await jobs.setJSON('dispatch/'+jobId,{phase:'failed',at:clock()});}).catch(async()=>{await jobs.setJSON('dispatch/'+jobId,{phase:'uncertain',at:clock()});});
   context.waitUntil(dispatch);
   return new Response(null,{status:303,headers:{Location:'/poster/workflow?job='+jobId,'Cache-Control':'no-store'}});
  }
  if(req.method!=='GET')return page('Method not allowed','',405);
  if(githubMode)return new Response(null,{status:303,headers:{Location:'/poster/upload','Cache-Control':'no-store'}});
  const jobId=new URL(req.url).searchParams.get('job');
  if(jobId){if(!/^[A-Za-z0-9_-]{32}$/.test(jobId))return page('Invalid job','',400);const job=await jobs.get('jobs/'+jobId,{type:'json',consistency:'strong'});if(!job)return page('Job not found','',404);return page('Poster workflow status',`<p>Status: <strong>${esc(job.phase)}</strong></p>${job.reason?'<p>'+esc(job.reason)+'</p>':''}${job.result?.listingId?'<p>Etsy draft ID: '+esc(job.result.listingId)+'</p>':''}<p><a href="/poster/workflow?job=${esc(jobId)}">Refresh status</a> · <a href="/poster/workflow">Back to workflow</a></p><p>If the result is uncertain, inspect the existing draft or supplier product before another attempt.</p>`);}
  let seller,refs;try{seller=await client.session();refs=await client.api('/shops/'+seller.shop_id+'/listings?state=active&limit=100');}catch{return page('Connect Etsy first','<p><a href="/etsy/start">Connect SapiverPrints</a>, then return here.</p>',409);}
  const options=(refs.results||[]).filter(l=>l.listing_type==='physical'&&l.shop_id===seller.shop_id).map(l=>'<option value="'+esc(l.listing_id)+'">'+esc(l.title)+'</option>').join('');
  const draft=await etsyStore.get('draft/SP-DINOSAURS-ACROSS-TIME',{type:'json',consistency:'strong'});
  return page('Dinosaurs Across Time',`<p><a href="/poster/upload">Upload a checked Canva poster using your fixed listing template</a>.</p><p>SapiverPrints · A5, A4 and A3 · one shared SKU.</p><p>Choose an existing physical poster with the correct prices and delivery settings. Review the description for this product.</p><form method="post">${hidden(owner.csrf)}<input type="hidden" name="action" value="draft"><label>Reference poster <select name="referenceListingId" required>${options}</select></label><p><label>Title <input name="title" maxlength="140" size="40" value="Dinosaurs Across Time Educational Poster"></label></p><p><label>Description<br><textarea name="description" rows="8" cols="40" required>Dinosaurs Across Time: a dinosaur timeline poster. Available in A5, A4 and A3. Review artwork, paper finish and delivery details before publication.</textarea></label></p><button>Create unpublished draft</button></form><hr>${draft?.listingId?'<p>Existing draft ID: '+esc(draft.listingId)+' · '+esc(draft.phase)+'</p>':''}<form method="post">${hidden(owner.csrf)}<input type="hidden" name="action" value="transfer"><label>Etsy draft ID <input name="draftListingId" type="number" min="1" required value="${esc(draft?.listingId||'')}"></label><p><label><input type="checkbox" name="visualApproved" value="yes" required> I have reviewed the actual existing master for text, sharpness and trim.</label></p><button>Transfer existing master once to PrintShrimp</button></form>`);
 };
}
export function createPosterRunner({env,jobs,etsyStore,approvedStore,client,request=fetch,clock=()=>Date.now(),githubMode=false}) {
 return async req=>{
  try{
   if(req.method!=='POST'||Number(req.headers.get('content-length')||0)>8192)return;
   const body=await req.text();if(Buffer.byteLength(body)>8192)return;
   const cfg=etsySetup(env),signed=unseal(body,cfg.secret,'poster-runner');
   if(!/^[A-Za-z0-9_-]{32}$/.test(signed.jobId)||!Number.isFinite(signed.expiry)||signed.expiry<clock()||signed.expiry>clock()+600000)return;
   const key='jobs/'+signed.jobId,job=await jobs.get(key,{type:'json',consistency:'strong'});if(job?.phase!=='queued')return;
   const claim=await jobs.setJSON('claims/'+signed.jobId,{at:clock()},{onlyIfNew:true});if(claim?.modified!==true)return;
   await jobs.setJSON(key,{...job,phase:'running'});
   try{
    const c=job.command;let result;
    if(c.action==='draft')result=await createDraft({client,store:etsyStore,...c,clock});
    else if(c.action==='transfer')result=await transferOneMaster({store:approvedStore,report:await approvedStore.get(STATE_KEY,{type:'json',consistency:'strong'}),readMaster:key=>approvedStore.get(key,{type:'arrayBuffer',consistency:'strong'}),verifyEtsyDraft:listingId=>verifyDraft({client,listingId}),...c,apiKey:env('SHRIMP_APIKEY'),origin:cfg.origin,request,clock});
    else throw Error('command');
    await jobs.setJSON(key,{...job,phase:'complete',result,completedAt:clock()});
   }catch(error){await jobs.setJSON(key,{...job,phase:'needs_investigation',reason:SAFE_FAILURES.has(error?.message)?error.message:'Check seller connection and provider status before retrying.',at:clock()});}
  }catch{/* Invalid/expired dispatch cannot execute work. No raw exception logging. */}
 };
}
