import {LEAD_STATE} from './etsy-artwork-first.mjs';
import {newId} from './product-records.mjs';
import {equal} from './oauth.mjs';

const positive=n=>Number.isSafeInteger(n)&&n>0;
const read=(uploads)=>uploads.get(LEAD_STATE,{type:'json',consistency:'strong'});
const counts=s=>({total:s?.rows?.length||0,ready:s?.rows?.filter(x=>x.status==='ready').length||0,
  skipped:s?.rows?.filter(x=>x.status==='skipped').length||0,
  already:s?.rows?.filter(x=>x.status==='already').length||0,
  verified:s?.results?.filter(x=>x.status==='verified').length||0});
const response=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const BLOCKED=new Set(['preview_queued','apply_queued','running','reconcile_queued','reconciling','needs_investigation']);
export async function handleArtworkFirst({req,path,uploads,owner,dispatch,clock=()=>Date.now(),page,esc}){
 const state=await read(uploads);
 const total=counts(state);
 if(path==='/poster/lead-images/image/' + path.split('/').at(-1)&&req.method==='GET'){
  const listingId=Number(path.split('/').at(-1));
  const row=state?.rows?.find(x=>x.id===listingId&&x.status==='ready');
  if(!positive(listingId)||!row||!row.sourceKey||row.sourceKey!=='catalogue/artwork-first/images/'+state.id+'/'+listingId+'.jpg')
   return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  const bytes=await uploads.get(row.sourceKey,{type:'arrayBuffer',consistency:'strong'});
  if(!bytes)return new Response(null,{status:404});
  return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(path==='/poster/lead-images/status'&&req.method==='GET')
  return response({phase:state?.phase||'not_started',...total,notice:state?.notice||null,rows:state?.rows?.map(x=>({id:x.id,status:x.status,reason:x.reason||null}))||[],results:state?.results||[],reconciliation:state?.reconciliation||null});
 if(path==='/poster/lead-images'&&req.method==='GET'){
  const rows=state?.rows||[];
  const refreshCount=rows.filter(x=>x.status==='ready'&&positive(x.replaceLeadId)).length;
  const summary='<p><strong>'+total.total+'</strong> active listings checked · <strong>'+total.ready+'</strong> ready'+
   (refreshCount?' ('+refreshCount+' cropped trio covers to replace)':'')+' · '+total.already+' already updated · '+
   total.skipped+' need original artwork review.</p>';
  const table=rows.map(row=>'<article class="poster-card" style="display:block"><strong class="poster-title">'+esc(row.title)+'</strong>'+
   '<p class="poster-sub">Etsy '+row.id+' · '+esc(row.status)+(row.replaceLeadId?' · replace cropped trio first image':'')+
    (row.reason?' · '+esc(row.reason):'')+'</p>'+
   '<div style="display:flex;gap:12px;flex-wrap:wrap">'+
   (row.beforeUrl?'<figure style="margin:0;flex:1;min-width:125px;max-width:210px"><img src="'+esc(row.beforeUrl)+'" alt="Current Etsy lead image" width="190" height="190" style="object-fit:contain"><figcaption>Current first image</figcaption></figure>':'')+
   (row.status==='ready'?'<figure style="margin:0;flex:1;min-width:125px;max-width:210px"><img src="/poster/lead-images/image/'+row.id+'" alt="Proposed new clean artwork image" width="190" height="190" style="object-fit:contain"><figcaption>Proposed first image</figcaption></figure>':'')+
   '</div></article>').join('');
  const caption=refreshCount===total.ready?'Replace cropped first images on '+refreshCount+' trios':
   'Apply clean first images to '+total.ready+' eligible listings';
  const action=state?.phase==='ready'&&total.ready>0?'<button id="lead-apply" type="button" data-mode="'+
   (refreshCount===total.ready?'replace-trio':'mixed')+'" data-hash="'+esc(state.approvalHash)+'">'+caption+'</button>':'';
  const recovery=state?.phase==='needs_investigation'&&state.applyId?
   '<button id="lead-reconcile" type="button">Check previous batch against Etsy — read only</button>':
   '';
  const report=state?.reconciliation;
  const reportLine=report?'<p role="status">Previous batch: '+report.confirmed+' confirmed updated · '+
   report.unchanged+' unchanged · '+report.uncertain+' uncertain · '+report.checked+'/'+report.eligible+' checked.</p>':'';
  const pending=state?.results?.length&&state.phase==='needs_investigation'?
   '<p>Saved first-image updates: '+total.verified+' confirmed by the original worker · '+
   state.results.filter(x=>x.status!=='verified').length+' requiring investigation. No further Etsy edits will run until reconciliation.</p>':'';
  const reportDetails=report?.results?.length?
   '<details><summary>Per-listing recovery results ('+report.results.length+')</summary>'+
   report.results.map(x=>'<p>Etsy '+x.id+' · '+esc(x.status)+(x.reason?' · '+esc(x.reason):'')+'</p>').join('')+'</details>':'';
  const body='<h2>Artwork-first Etsy listing photos</h2>'+
  '<p>A clean front view of the actual artwork will become image 1. Existing photographs and mock-ups remain, in their current relative order. This does not change listing IDs, descriptions, prices, buyer downloads, variations or PrintShrimp settings.</p>'+
  '<p>First inspect all Etsy listings and their private source files. Listings without a reliable original are excluded rather than guessed.</p>'+
  '<section data-lead-images data-csrf="'+esc(owner.csrf)+'"><button id="lead-preview" type="button"'+(BLOCKED.has(state?.phase)?' disabled':'')+'>Check all Etsy listing images</button><p id="lead-state" role="status">Status: '+esc(state?.phase||'not started')+'</p>'+ (state?.notice?'<p role="alert">'+esc(state.notice)+'</p>':'')+pending+reportLine+recovery+reportDetails+
  (rows.length?summary:'')+action+'<div class="poster-grid">'+table+'</div></section>'+
  '<p><a href="/poster/catalogue">Return to shop catalogue</a></p><script type="module" src="/etsy-lead-images.mjs"></script>';
  return page(body,owner.csrf,'physical','catalogue');
 }
 if(req.method!=='POST')return response({error:'Not found'},404);
 if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return response({error:'Owner session verification failed'},403);
 if(path==='/poster/lead-images/reconcile'){
  if(state?.phase!=='needs_investigation'||!state.applyId||!Array.isArray(state.results)||
    !Number.isFinite(state.updatedAt)||clock()-state.updatedAt<60000)
   return response({error:'An earlier image job is still active or has no saved update receipts'},409);
  const reconcileId=newId(),next={...state,phase:'reconcile_queued',reconcileId,reconcileQueuedAt:clock()};
  await uploads.setJSON(LEAD_STATE,next);
  try{await dispatch(reconcileId,'lead_images_reconcile');return response({phase:'reconcile_queued'},202);}
  catch{await uploads.setJSON(LEAD_STATE,{...next,phase:'needs_investigation',notice:'Read-only reconciliation dispatch uncertain. No Etsy images were changed.'});
   return response({error:'Could not confirm read-only Etsy verification worker'},503);}
 }
 if(path==='/poster/lead-images/preview'){
  if(BLOCKED.has(state?.phase))return response({error:'Prior Etsy image operation requires a review before a new attempt'},409);
  const id=newId(),next={phase:'preview_queued',id,createdAt:clock(),rows:[]};
  const reserved=await uploads.setJSON('catalogue/artwork-first/requests/'+id,{action:'preview',createdAt:clock()},{onlyIfNew:true});
  if(reserved?.modified!==true)return response({error:'Image review request already exists'},409);
  await uploads.setJSON(LEAD_STATE,next);
  try{await dispatch(id,'lead_images_preview');return response({phase:'preview_queued'},202);}
  catch{await uploads.setJSON(LEAD_STATE,{...next,phase:'needs_investigation',notice:'Could not confirm preview worker dispatch. No listing changes were authorised.'});return response({error:'Preview dispatch uncertain; inspect status'},503);}
 }
 if(path==='/poster/lead-images/apply'){
  let body;try{if(Number(req.headers.get('content-length')||0)>2048)throw Error('Large request');body=await req.json();}catch{return response({error:'Invalid request'},400);}
  if(body?.confirm!==true||state?.phase!=='ready'||!state.approvalHash||!equal(body.approvalHash||'',state.approvalHash)||
   !positive(state.shopId)||!positive(state.createdAt)||clock()-state.createdAt>24*3600000||!total.ready)
   return response({error:'Fresh reviewed image audit and explicit approval required'},409);
  const applyId=newId(),claim=await uploads.setJSON('catalogue/artwork-first/claims/'+state.id,{applyId,approvalHash:state.approvalHash,createdAt:clock()},{onlyIfNew:true});
  if(claim?.modified!==true)return response({error:'An image update has already been claimed; inspect its status'},409);
  const next={...state,applyId,phase:'apply_queued',results:[],approvedAt:clock()};
  await uploads.setJSON(LEAD_STATE,next);
  try{await dispatch(applyId,'lead_images_apply');return response({phase:'apply_queued',ready:total.ready},202);}
  catch{await uploads.setJSON(LEAD_STATE,{...next,phase:'needs_investigation',notice:'Merchant job dispatch uncertain. Do not retry blindly.'});return response({error:'Apply dispatch uncertain; inspect image ranks'},503);}
 }
 return response({error:'Not found'},404);
}
