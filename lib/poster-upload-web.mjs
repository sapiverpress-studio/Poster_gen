import {renderOwnerPage} from './owner-page.mjs';
import {productMetadata} from './product-metadata.mjs';
import {recordRevision,recordKey,listProducts,newId,validId} from './product-records.mjs';
import {reviewBody,uploadBody,dashboardBody,metadataFields} from './product-web.mjs';
import {randomBytes} from 'node:crypto';
import {unseal,seal,equal,acceptedRequestContext} from './oauth.mjs';
import {etsySetup} from './etsy-oauth.mjs';
import {identityFromFilename,PRICES,SIZES,FRAMES,TAGS} from './poster-template.mjs';
import {CHUNK_BYTES,assetKey,hashBytes} from './uploaded-poster.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
function page(body,csrf){return new Response(renderOwnerPage({title:body.startsWith('<h2>Products</h2>')?'Your products':'Prepare your next product',body,csrf,active:body.startsWith('<h2>Products</h2>')?'products':'upload'}),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; connect-src 'self'; img-src 'self' blob:; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'}});}
export function createPosterUploadHandler({env,uploads,client,request=fetch,clock=()=>Date.now(),dispatchJob}) {
 return async(req,context)=>{
  let cfg,owner;
  try{cfg=etsySetup(env);const cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-poster_owner='))?.slice('__Host-poster_owner='.length);owner=unseal(cookie,cfg.secret,'poster-owner');if(!owner.csrf||!Number.isFinite(owner.expiry)||owner.expiry<clock())throw Error('expired');}
  catch{return new Response(null,{status:303,headers:{Location:'/poster/workflow','Cache-Control':'no-store'}});}
  const u=new URL(req.url),path=u.pathname;
  if(path==='/poster/products'&&req.method==='GET')return page(dashboardBody(await listProducts(uploads),Object.fromEntries(u.searchParams)),owner.csrf);
  async function dispatch(id,action,approvalHash){if(dispatchJob){await dispatchJob(id,action,approvalHash);return;}const token=seal({id,action,approvalHash,expiry:clock()+600000},cfg.secret,'poster-upload-run');context.waitUntil(request(cfg.origin+'/poster/upload-run',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'text/plain'},body:token}).then(async r=>{if(r.status!==202)await uploads.setJSON('dispatch/'+id+'/'+action,{phase:'failed'});}).catch(async()=>{await uploads.setJSON('dispatch/'+id+'/'+action,{phase:'uncertain'});}));}
  if(path==='/poster/upload'&&req.method==='GET'){
   const id=u.searchParams.get('id');
   if(id){if(!/^[A-Za-z0-9_-]{32}$/.test(id))return json({error:'Invalid upload'},400);const a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});if(!a)return json({error:'Upload not found'},404);
    if(a.phase==='needs_investigation'&&a.failureAction==='prepare'&&!a.listingId){const taxonomy=await uploads.get('template/taxonomy',{type:'json',consistency:'strong'});return page('<p role="alert">'+esc(a.failureCode)+'</p><p>Correct the details below. If the archive itself is invalid, upload a corrected file.</p><form id="product-configure-form" data-upload="'+id+'">'+metadataFields(a.metadata||{},taxonomy?.nodes||[])+'<button>Prepare corrected review</button></form><p id="upload-status"></p><script type="module" src="/poster-upload.mjs"></script>',owner.csrf);}
    if(a.phase!=='ready_for_approval')return page('<p>Status: <strong>'+esc(a.phase)+'</strong></p><p>Stage: '+esc(a.stage||'artwork preparation')+'</p>'+(a.listingId?'<p>Etsy listing ID: '+esc(a.listingId)+'</p>':'')+(a.etsyUrl?'<p><a href="'+esc(a.etsyUrl)+'">View Etsy listing</a></p>':'')+(a.failureCode?'<p role="alert">'+esc(a.failureCode)+'</p>':'')+'<p><a href="/poster/upload?id='+id+'">Refresh status</a> · <a href="/poster/upload">Upload another poster</a></p><p id="upload-status" data-upload="'+id+'" data-phase="'+esc(a.phase)+'"></p><script type="module" src="/poster-upload.mjs"></script>',owner.csrf);
    const taxonomy=await uploads.get('template/taxonomy',{type:'json',consistency:'strong'});return page(reviewBody(a,id,owner.csrf,env('POSTER_PUBLICATION_ENABLED')==='true',taxonomy?.nodes||[]),owner.csrf);
   }
   const defaults=await uploads.get('template/settings',{type:'json',consistency:'strong'}),catalog=await uploads.get('template/catalog',{type:'json',consistency:'strong'}),taxonomy=await uploads.get('template/taxonomy',{type:'json',consistency:'strong'});let update;if(u.searchParams.has('update')){const id=u.searchParams.get('update');if(!validId(id))return json({error:'Invalid product'},400);update=await uploads.get(recordKey(id),{type:'json',consistency:'strong'});if(!update)return json({error:'Product not found'},404);}
   return page(uploadBody({defaults,catalog,taxonomy:taxonomy?.nodes||[],update}),owner.csrf);
  }
  const match=/^\/poster\/uploads\/([A-Za-z0-9_-]{32})(?:\/(chunks|mockups|preview-input)\/(\d+)|\/(finish|approve|configure))?$/.exec(path);
  // Every mutation uses the same HttpOnly owner session and a separate CSRF value.
  if(req.method!=='GET'&&!acceptedRequestContext(req.headers.get('origin'),cfg.origin,req.headers.get('sec-fetch-site')))return json({error:'Request denied'},403);
  if(path==='/poster/uploads'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{if(Number(req.headers.get('content-length')||0)>20000)throw Error();const text=await req.text();if(Buffer.byteLength(text)>20000)throw Error();const body=JSON.parse(text),type=body.type||'physical';let previous,product;
    if(body.updateProductId){if(!validId(body.updateProductId))throw Error();product=await uploads.get(recordKey(body.updateProductId),{type:'json',consistency:'strong'});if(!product||product.type!==type||product.pendingPhase&&['uploading','preparing','publishing'].includes(product.pendingPhase))throw Error();previous=await uploads.get(assetKey(product.currentRevision),{type:'json',consistency:'strong'});if(!previous)throw Error();}
    const filename=body.reuseOriginal?previous?.filename:body.filename,bytes=body.reuseOriginal?previous?.bytes:body.bytes,metadata=productMetadata(body.metadata||{},filename,type);
    if(!Number.isSafeInteger(bytes)||bytes<33||bytes>(type==='digital'?100_000_000:50_000_000))throw Error();
    const defaults=await uploads.get('template/settings',{type:'json',consistency:'strong'}),referenceListingId=Number(previous?.referenceListingId||defaults?.referenceListingId||body.referenceListingId);if(type==='physical'&&(!Number.isSafeInteger(referenceListingId)||referenceListingId<=0))throw Error();
    const previewCount=Number(body.previewCount||0);if(!Number.isInteger(previewCount)||previewCount<0||previewCount>3)throw Error();const id=newId(),a={phase:body.reuseOriginal?'preparing':'uploading',type,productId:product?.productId||id,updateProductId:product?.productId||null,filename,bytes,chunks:body.reuseOriginal?0:Math.ceil(bytes/CHUNK_BYTES),referenceListingId:referenceListingId||null,metadata,previewCount:body.reuseOriginal?previous.previewCount||0:previewCount,sourcePreviewCount:body.reuseOriginal?previous.sourcePreviewCount??previous.previewCount??0:previewCount,reusePreviewKeys:body.reuseOriginal?previous.reusePreviewKeys||Array.from({length:previous.sourcePreviewCount??previous.previewCount??0},(_,i)=>'uploads/'+product.currentRevision+'/preview-input/'+i+'.jpg'):null,createdAt:clock(),...(body.reuseOriginal?type==='digital'?{reuseArchiveKey:previous.archiveKey}:{reuseMasterKey:previous.masterKey}:{})};
    await uploads.setJSON(assetKey(id),a,{onlyIfNew:true});await recordRevision(uploads,id);if(body.reuseOriginal)await dispatch(id,'prepare');return json({id,chunkBytes:CHUNK_BYTES,phase:a.phase},201);
   }catch(error){return json({error:error.message||'Invalid product upload'},400);}
  }
  if(!match)return json({error:'Not found'},404);
  const [,id,kind,index,action]=match,a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});if(!a)return json({error:'Upload not found'},404);
  if(req.method==='GET'&&kind==='mockups'){if(!['0','1','2'].includes(index))return json({error:'Not found'},404);const image=await uploads.get('uploads/'+id+'/mockups/'+index+'.jpg',{type:'arrayBuffer',consistency:'strong'});return image?new Response(image,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}):json({error:'Not ready'},404);}
  if(req.method==='GET'&&!kind&&!action)return json({phase:a.phase,stage:a.stage||null,listingId:a.listingId||null});
  let csrf=req.headers.get('x-poster-csrf'),fields;
  if(action==='approve'&&req.method==='POST'){try{const text=await req.text();if(Buffer.byteLength(text)>4096)throw Error();fields=new URLSearchParams(text);csrf=fields.get('csrf');}catch{return json({error:'Invalid form'},400);}}
  if(!equal(csrf||'',owner.csrf))return json({error:'Request denied'},403);
  if(action==='configure'&&req.method==='POST'){
   if(a.phase!=='ready_for_approval'&&!(a.phase==='needs_investigation'&&a.failureAction==='prepare'&&!a.listingId))return json({error:'Only prepared details or a failed validation can be corrected; merchant failures need investigation'},409);
   try{const text=await req.text();if(Buffer.byteLength(text)>20000)throw Error('Details too large');const body=JSON.parse(text),metadata=productMetadata(body.metadata,a.filename,a.type||'physical'),revision=newId();
    await uploads.setJSON(assetKey(revision),{...a,phase:'preparing',plan:null,approvalHash:null,productId:a.productId||id,metadata,chunks:a.archiveKey||a.masterKey?0:a.chunks,reuseChunkId:a.reuseChunkId||id,reusePreviewKeys:a.reusePreviewKeys||Array.from({length:a.sourcePreviewCount??a.previewCount??0},(_,i)=>'uploads/'+id+'/preview-input/'+i+'.jpg'),createdAt:clock(),...(a.type==='digital'?{reuseArchiveKey:a.archiveKey}:{reuseMasterKey:a.masterKey})},{onlyIfNew:true});await uploads.setJSON(assetKey(id),{...a,phase:'superseded',supersededBy:revision});await recordRevision(uploads,revision);await dispatch(revision,'prepare');return json({id:revision,phase:'preparing'},202);
   }catch(error){return json({error:error.message||'Invalid product details'},400);}
  }
  if(kind==='preview-input'&&req.method==='PUT'){
   if(a.type!=='digital'||a.phase!=='uploading'||Number(index)>=a.previewCount||Number(req.headers.get('content-length')||0)>CHUNK_BYTES)return json({error:'Invalid preview'},400);
   const bytes=await req.arrayBuffer();if(bytes.byteLength>CHUNK_BYTES||bytes.byteLength<3)return json({error:'Invalid preview'},400);const key='uploads/'+id+'/preview-input/'+index+'.jpg',saved=await uploads.set(key,bytes,{onlyIfNew:true});if(!saved?.modified){const prior=await uploads.get(key,{type:'arrayBuffer',consistency:'strong'});if(!prior||hashBytes(prior)!==hashBytes(bytes))return json({error:'Preview already exists with different content'},409);}return json({stored:true});
  }
  if(kind==='chunks'&&req.method==='PUT'){
   const i=Number(index),expected=Math.min(CHUNK_BYTES,a.bytes-i*CHUNK_BYTES);if(a.phase!=='uploading'||!Number.isSafeInteger(i)||i>=a.chunks||expected<=0||Number(req.headers.get('content-length')||0)>CHUNK_BYTES)return json({error:'Invalid chunk'},400);
   const bytes=await req.arrayBuffer();if(bytes.byteLength!==expected)return json({error:'Chunk size mismatch'},400);
   const key='uploads/'+id+'/chunks/'+i,result=await uploads.set(key,bytes,{onlyIfNew:true});if(result?.modified!==true){const prior=await uploads.get(key,{type:'arrayBuffer',consistency:'strong'});if(!prior||hashBytes(prior)!==hashBytes(bytes))return json({error:'Chunk already exists with different content'},409);}return json({stored:true});
  }
  if(action==='finish'&&req.method==='POST'){
   if(a.phase!=='uploading')return json({error:'Upload already submitted'},409);
   const claim=await uploads.setJSON('claims/'+id+'/prepare',{at:clock()},{onlyIfNew:true});if(claim?.modified!==true)return json({error:'Upload already submitted'},409);
   await uploads.setJSON(assetKey(id),{...a,phase:'preparing'});await recordRevision(uploads,id);await dispatch(id,'prepare');return json({phase:'preparing'},202);
  }
  if(action==='approve'&&req.method==='POST'){
   const current=await uploads.get(recordKey(a.productId||id),{type:'json',consistency:'strong'});if(current?.pendingRevision&&current.pendingRevision!==id)return json({error:'This review was superseded. Open the current product revision.'},409);
   if(env('POSTER_PUBLICATION_ENABLED')!=='true')return json({error:'Live publication is not enabled yet'},409);
   if(a.phase!=='ready_for_approval'||!equal(fields.get('approvalHash')||'',a.approvalHash))return json({error:'Approval expired or already used'},409);
   const claim=await uploads.setJSON('claims/'+id+'/publish',{approvalHash:a.approvalHash,at:clock()},{onlyIfNew:true});if(claim?.modified!==true)return json({error:'Approval already used'},409);
   await uploads.setJSON(assetKey(id),{...a,phase:'publishing',approvedAt:clock()});await recordRevision(uploads,id);await dispatch(id,'publish',a.approvalHash);return new Response(null,{status:303,headers:{Location:'/poster/upload?id='+id,'Cache-Control':'no-store'}});
  }
  return json({error:'Method not allowed'},405);
 };
}
