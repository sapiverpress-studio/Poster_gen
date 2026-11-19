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
const BLOCKED=new Set(['preview_queued','apply_queued','running','needs_investigation']);
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
  return response({phase:state?.phase||'not_started',...total,notice:state?.notice||null,rows:state?.rows?.map(x=>({id:x.id,status:x.status,reason:x.reason||null}))||[],results:state?.results||[]});
 if(path==='/poster/lead-images'&&req.method==='GET'){
  const rows=state?.rows||[];
  const summary='<p><strong>'+total.total+'</strong> active listings checked · <strong>'+total.ready+'</strong> ready · '+total.already+' already updated · '+total.skipped+' need original artwork review.</p>';
  const table=rows.map(row=>'<article class="poster-card"><div class="poster-thumb">'+
   (row.status==='ready'?'<img src="/poster/lead-images/image/'+row.id+'" width="85" height="85" alt="Clean artwork front">':'<span aria-hidden="true">▧</span>')+
   '</div><div class="poster-copy"><strong class="poster-title">'+esc(row.title)+'</strong><span class="poster-sub">Etsy '+row.id+' · '+esc(row.status)+(row.reason?' · '+esc(row.reason):'')+'</span></div></article>').join('');
  const action=state?.phase==='ready'&&total.ready>0?'<button id="lead-apply" type="button" data-hash="'+esc(state.approvalHash)+'">Apply clean first images to '+total.ready+' eligible listings</button>':'';
  const body='<h2>Artwork-first Etsy listing photos</h2>'+
  '<p>A clean front view of the actual artwork will become image 1. Existing photographs and mock-ups remain, in their current relative order. This does not change listing IDs, descriptions, prices, buyer downloads, variations or PrintShrimp settings.</p>'+
  '<p>First inspect all Etsy listings and their private source files. Listings without a reliable original are excluded rather than guessed.</p>'+
  '<section data-lead-images data-csrf="'+esc(owner.csrf)+'"><button id="lead-preview" type="button"'+(BLOCKED.has(state?.phase)?' disabled':'')+'>Check all Etsy listing images</button><p id="lead-state" role="status">Status: '+esc(state?.phase||'not started')+'</p>'+
  (rows.length?summary:'')+action+'<div class="poster-grid">'+table+'</div></section>'+
  '<p><a href="/poster/catalogue">Return to shop catalogue</a></p><script type="module" src="/etsy-lead-images.mjs"></script>';
  return page(body,owner.csrf,'physical','catalogue');
 }
 if(req.method!=='POST')return response({error:'Not found'},404);
 if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return response({error:'Owner session verification failed'},403);
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
