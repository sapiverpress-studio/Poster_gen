import {randomBytes} from 'node:crypto';
import {unseal,seal,equal,acceptedRequestContext} from './oauth.mjs';
import {etsySetup} from './etsy-oauth.mjs';
import {identityFromFilename,PRICES,SIZES,FRAMES,TAGS} from './poster-template.mjs';
import {CHUNK_BYTES,assetKey,hashBytes} from './uploaded-poster.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
function page(body,csrf){return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="poster-csrf" content="'+esc(csrf)+'"><title>Sapiver poster upload</title><body style="font:16px system-ui;max-width:55rem;margin:3vh auto;padding:1rem;line-height:1.5"><h1>Sapiver Prints</h1>'+body+'</body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; img-src 'self' blob:; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'}});}
export function createPosterUploadHandler({env,uploads,client,request=fetch,clock=()=>Date.now(),dispatchJob}) {
 return async(req,context)=>{
  let cfg,owner;
  try{cfg=etsySetup(env);const cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-poster_owner='))?.slice('__Host-poster_owner='.length);owner=unseal(cookie,cfg.secret,'poster-owner');if(!owner.csrf||!Number.isFinite(owner.expiry)||owner.expiry<clock())throw Error('expired');}
  catch{return new Response(null,{status:303,headers:{Location:'/poster/workflow','Cache-Control':'no-store'}});}
  const u=new URL(req.url),path=u.pathname;
  async function dispatch(id,action,approvalHash){if(dispatchJob){await dispatchJob(id,action,approvalHash);return;}const token=seal({id,action,approvalHash,expiry:clock()+600000},cfg.secret,'poster-upload-run');context.waitUntil(request(cfg.origin+'/poster/upload-run',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'text/plain'},body:token}).then(async r=>{if(r.status!==202)await uploads.setJSON('dispatch/'+id+'/'+action,{phase:'failed'});}).catch(async()=>{await uploads.setJSON('dispatch/'+id+'/'+action,{phase:'uncertain'});}));}
  if(path==='/poster/upload'&&req.method==='GET'){
   const id=u.searchParams.get('id');
   if(id){if(!/^[A-Za-z0-9_-]{32}$/.test(id))return json({error:'Invalid upload'},400);const a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});if(!a)return json({error:'Upload not found'},404);
    if(a.phase!=='ready_for_approval')return page('<p>Status: <strong>'+esc(a.phase)+'</strong></p><p>Stage: '+esc(a.stage||'artwork preparation')+'</p>'+(a.listingId?'<p>Etsy listing ID: '+esc(a.listingId)+'</p>':'')+'<p><a href="/poster/upload?id='+id+'">Refresh status</a> · <a href="/poster/upload">Upload another poster</a></p><p id="upload-status" data-upload="'+id+'" data-phase="'+esc(a.phase)+'"></p><script type="module" src="/poster-upload.mjs"></script>',owner.csrf);
    const rows=SIZES.map(s=>'<tr><td>'+s+'</td>'+PRICES[s].map(p=>'<td>£'+p.toFixed(2)+'</td>').join('')+'</tr>').join('');
    return page('<h2>'+esc(a.plan.identity.name)+'</h2><p>SKU: '+esc(a.plan.identity.sku)+' · '+a.image.width+' × '+a.image.height+' pixels</p><p>'+esc(a.plan.body.title)+'</p><p style="white-space:pre-wrap">'+esc(a.plan.body.description)+'</p><p>Tags: '+esc(TAGS.join(', '))+'</p><table><tr><th>Size</th>'+FRAMES.map(f=>'<th>'+f+'</th>').join('')+'</tr>'+rows+'</table><p>Free UK delivery · made to order in 1–2 days · returns and exchanges accepted.</p>'+[0,1,2].map(i=>'<img alt="Listing mockup '+(i+1)+'" width="250" src="/poster/uploads/'+id+'/mockups/'+i+'">').join('')+'<form method="post" action="/poster/uploads/'+id+'/approve"><input type="hidden" name="csrf" value="'+esc(owner.csrf)+'"><input type="hidden" name="approvalHash" value="'+a.approvalHash+'"><p>Pressing this button confirms your artwork check and approves the displayed listing, prices, mockups and template for Etsy publication.</p><button'+(env('POSTER_PUBLICATION_ENABLED')==='true'?'':' disabled')+'>Approve &amp; Publish</button>'+ (env('POSTER_PUBLICATION_ENABLED')==='true'?'':'<p>Live publication has not been enabled yet.</p>') +'</form>',owner.csrf);
   }
   const defaults=await uploads.get('template/settings',{type:'json',consistency:'strong'});let options='';
   if(!defaults?.referenceListingId){try{const seller=await client.session(),refs=await client.api('/shops/'+seller.shop_id+'/listings?state=active&limit=100');options='<label>Existing template listing <select name="referenceListingId" required>'+refs.results.filter(l=>l.shop_id===seller.shop_id&&l.listing_type==='physical').map(l=>'<option value="'+l.listing_id+'">'+esc(l.title)+'</option>').join('')+'</select></label>';}catch{return page('<p><a href="/etsy/start">Connect Etsy</a>, then return to <a href="/poster/upload">poster upload</a>.</p>',owner.csrf);}}
   return page('<h2>Upload your checked Canva PNG</h2><p>The poster name comes from the filename. Example: SP-EL-006-DINOSAURS-ACROSS-TIME.png. One file, A5/A4/A3 and print-only/black/white/oak options.</p><form id="poster-upload-form">'+options+'<p><input type="file" name="poster" accept="image/png" required></p><button>Upload &amp; prepare preview</button></form><p id="upload-status" role="status"></p><script type="module" src="/poster-upload.mjs"></script>',owner.csrf);
  }
  const match=/^\/poster\/uploads\/([A-Za-z0-9_-]{32})(?:\/(chunks|mockups)\/(\d+)|\/(finish|approve))?$/.exec(path);
  // Every mutation uses the same HttpOnly owner session and a separate CSRF value.
  if(req.method!=='GET'&&!acceptedRequestContext(req.headers.get('origin'),cfg.origin,req.headers.get('sec-fetch-site')))return json({error:'Request denied'},403);
  if(path==='/poster/uploads'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{if(Number(req.headers.get('content-length')||0)>4096)throw Error();const text=await req.text();if(Buffer.byteLength(text)>4096)throw Error();const body=JSON.parse(text);identityFromFilename(body.filename);if(!Number.isSafeInteger(body.bytes)||body.bytes<33||body.bytes>50_000_000)throw Error();const defaults=await uploads.get('template/settings',{type:'json',consistency:'strong'}),referenceListingId=Number(defaults?.referenceListingId||body.referenceListingId);if(!Number.isSafeInteger(referenceListingId)||referenceListingId<=0)throw Error();const id=randomBytes(24).toString('base64url');await uploads.setJSON(assetKey(id),{phase:'uploading',filename:body.filename,bytes:body.bytes,chunks:Math.ceil(body.bytes/CHUNK_BYTES),referenceListingId,createdAt:clock()},{onlyIfNew:true});return json({id,chunkBytes:CHUNK_BYTES},201);}catch{return json({error:'Use a valid PNG filename, maximum 50 MB, and a template listing'},400);}
  }
  if(!match)return json({error:'Not found'},404);
  const [,id,kind,index,action]=match,a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});if(!a)return json({error:'Upload not found'},404);
  if(req.method==='GET'&&kind==='mockups'){if(!['0','1','2'].includes(index))return json({error:'Not found'},404);const image=await uploads.get('uploads/'+id+'/mockups/'+index+'.jpg',{type:'arrayBuffer',consistency:'strong'});return image?new Response(image,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}):json({error:'Not ready'},404);}
  if(req.method==='GET'&&!kind&&!action)return json({phase:a.phase,stage:a.stage||null,listingId:a.listingId||null});
  let csrf=req.headers.get('x-poster-csrf'),fields;
  if(action==='approve'&&req.method==='POST'){try{const text=await req.text();if(Buffer.byteLength(text)>4096)throw Error();fields=new URLSearchParams(text);csrf=fields.get('csrf');}catch{return json({error:'Invalid form'},400);}}
  if(!equal(csrf||'',owner.csrf))return json({error:'Request denied'},403);
  if(kind==='chunks'&&req.method==='PUT'){
   const i=Number(index),expected=Math.min(CHUNK_BYTES,a.bytes-i*CHUNK_BYTES);if(a.phase!=='uploading'||!Number.isSafeInteger(i)||i>=a.chunks||expected<=0||Number(req.headers.get('content-length')||0)>CHUNK_BYTES)return json({error:'Invalid chunk'},400);
   const bytes=await req.arrayBuffer();if(bytes.byteLength!==expected)return json({error:'Chunk size mismatch'},400);
   const key='uploads/'+id+'/chunks/'+i,result=await uploads.set(key,bytes,{onlyIfNew:true});if(result?.modified!==true){const prior=await uploads.get(key,{type:'arrayBuffer',consistency:'strong'});if(!prior||hashBytes(prior)!==hashBytes(bytes))return json({error:'Chunk already exists with different content'},409);}return json({stored:true});
  }
  if(action==='finish'&&req.method==='POST'){
   if(a.phase!=='uploading')return json({error:'Upload already submitted'},409);
   const claim=await uploads.setJSON('claims/'+id+'/prepare',{at:clock()},{onlyIfNew:true});if(claim?.modified!==true)return json({error:'Upload already submitted'},409);
   await uploads.setJSON(assetKey(id),{...a,phase:'preparing'});await dispatch(id,'prepare');return json({phase:'preparing'},202);
  }
  if(action==='approve'&&req.method==='POST'){
   if(env('POSTER_PUBLICATION_ENABLED')!=='true')return json({error:'Live publication is not enabled yet'},409);
   if(a.phase!=='ready_for_approval'||!equal(fields.get('approvalHash')||'',a.approvalHash))return json({error:'Approval expired or already used'},409);
   const claim=await uploads.setJSON('claims/'+id+'/publish',{approvalHash:a.approvalHash,at:clock()},{onlyIfNew:true});if(claim?.modified!==true)return json({error:'Approval already used'},409);
   await uploads.setJSON(assetKey(id),{...a,phase:'publishing',approvedAt:clock()});await dispatch(id,'publish',a.approvalHash);return new Response(null,{status:303,headers:{Location:'/poster/upload?id='+id,'Cache-Control':'no-store'}});
  }
  return json({error:'Method not allowed'},405);
 };
}
