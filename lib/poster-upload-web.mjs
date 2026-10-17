import {progressSummary} from './product-progress.mjs';
import {renderOwnerPage} from './owner-page.mjs';
import {productMetadata} from './product-metadata.mjs';
import {latestSeoAudit} from './catalogue-seo.mjs';
import {cataloguePage,SEASONS} from './catalogue-page.mjs';
import {linkExistingBulkProducts,BULK_ETS_IDS} from './existing-supplier-links.mjs';
import {recordRevision,recordKey,listProducts,newId,validId} from './product-records.mjs';
import {monthlyUploadStatus,reserveMonthlyUpload} from './monthly-upload-limit.mjs';
import {reviewBody,uploadBody,bulkCollectionBody,dashboardBody,metadataFields,supplierStatusBody} from './product-web.mjs';
import {randomBytes} from 'node:crypto';
import {unseal,seal,equal,acceptedRequestContext} from './oauth.mjs';
import {etsySetup} from './etsy-oauth.mjs';
import {identityFromFilename,PRICES,SIZES,FRAMES,TAGS} from './poster-template.mjs';
import {CHUNK_BYTES,assetKey,hashBytes} from './uploaded-poster.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
function page(body,csrf,type='physical'){return new Response(renderOwnerPage({title:body.startsWith('<h2>Products</h2>')?'Your products':'Prepare your next product',body,csrf,productType:type,active:body.startsWith('<h2>Products</h2>')?'products':'upload'}),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; connect-src 'self'; img-src 'self' blob:; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'}});}
export function createPosterUploadHandler({env,uploads,client,request=fetch,clock=()=>Date.now(),dispatchJob,queue}) {
 return async(req,context)=>{
  const u=new URL(req.url),path=u.pathname;
  let cfg,owner;
  try{cfg=etsySetup(env);const cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-poster_owner='))?.slice('__Host-poster_owner='.length);owner=unseal(cookie,cfg.secret,'poster-owner');if(!owner.csrf||!Number.isFinite(owner.expiry)||owner.expiry<clock())throw Error('expired');}
  catch{
   if(path.startsWith('/poster/catalog/')||(path.startsWith('/poster/uploads')&&!path.endsWith('/approve')))return json({code:'studio_session_required',error:'Your product-studio session has expired. Reopen the studio, then retry. Saved uploads are retained.'},401);
   return new Response(null,{status:303,headers:{Location:'/poster/workflow','Cache-Control':'no-store'}});
  }
  async function progress(a){const job=queue&&/^jobs\/[A-Za-z0-9_-]{32}$/.test(a.workerJobKey||'')?await queue.get(a.workerJobKey,{type:'json',consistency:'strong'}):null;const trigger=queue&&job?await queue.get('dispatch/'+a.workerJobKey.slice(5),{type:'json',consistency:'strong'}):null;return progressSummary(a,job,trigger,clock());}
  if(path==='/poster/seo'&&req.method==='GET')return page('<h2>Audit every Etsy listing</h2><p>Read ALL active SapiverPrints listings using your existing seller connection and compare titles and tags with the proposal JSON. No SKUs, prices, options, images or supplier orders change.</p><p>The proposed changes for all 20 listings are already loaded in the app. Review the comparison and every artwork warning before confirming. If the catalogue has changed, the audit will stop rather than overlook new listings.</p><button id="seo-audit" type="button">Compare every Etsy listing</button><p id="seo-status" role="status"></p><div id="seo-results"></div><p><strong>Review only:</strong> this screen cannot apply title or tag edits until the seller-authenticated update workflow is separately verified. Use the catalogue page for PrintShrimp delivery checks.</p><p><a href="/poster/catalogue">Open catalogue and PrintShrimp delivery audit</a></p><script type="module" src="/poster-seo.mjs"></script>',owner.csrf,'physical');
  if(path==='/poster/products'&&req.method==='GET')return page(dashboardBody(await listProducts(uploads),Object.fromEntries(u.searchParams)),owner.csrf);
  async function deliveryAuditStatus(){
   const current=await uploads.get('catalogue/audit-status',{type:'json',consistency:'strong'});
   if(current?.phase!=='pending')return current||{phase:'not_checked'};
   const receipt=queue&&/^jobs\/[A-Za-z0-9_-]{32}$/.test(current.jobKey||'')?await queue.get(current.jobKey,{type:'json',consistency:'strong'}):null;
   let phase='pending';
   if(receipt?.phase==='needs_investigation')phase='needs_investigation';
   else if(receipt?.phase==='complete')phase='worker_finished_no_result';
   else if(!Number.isFinite(current.checkedAt)||clock()-current.checkedAt>240000)phase='worker_delayed';
   return {...current,phase};
  }
  if(path==='/poster/catalogue'&&req.method==='GET'){
   const status=await deliveryAuditStatus();
   const audit=status?.phase==='available'?await uploads.get('catalogue/audit',{type:'json',consistency:'strong'}):null;
   const labels={};
   if(audit?.listings)await Promise.all(audit.listings.map(async row=>{const record=await uploads.get('catalogue/labels/'+row.id,{type:'json',consistency:'strong'});labels[row.id]=record?.seasons||[];}));
   const repair=await uploads.get('catalogue/repair-status',{type:'json',consistency:'strong'});
   return page(cataloguePage({audit,status,labels,repair}),owner.csrf);
  }
  if(path==='/poster/catalogue/status'&&req.method==='GET'){
   const status=await deliveryAuditStatus();
   return json({phase:status.phase,checkedAt:status.checkedAt||null,summary:status.phase==='available'?status.summary:null});
  }
  if(path==='/poster/catalogue/repair/status'&&req.method==='GET'){
   const repair=await uploads.get('catalogue/repair-status',{type:'json',consistency:'strong'});
   if(!repair)return json({phase:'not_started'});
   const phase=repair.phase==='pending'&&clock()-repair.createdAt>600000?'worker_delayed':repair.phase;
   return json({phase,listingId:repair.listingId||null,targetProfileId:repair.phase==='complete'?repair.targetProfileId:null});
  }
  if(path==='/poster/bulk/status'&&req.method==='GET'){
   try{const status=await monthlyUploadStatus({uploads,clock});return json({limit:status.limit,used:status.used,remaining:status.remaining,month:status.month});}
   catch{return json({error:'Monthly capacity could not be checked'},503);}
  }
  if(path==='/poster/bulk'&&req.method==='GET'){
   let monthly;try{monthly=await monthlyUploadStatus({uploads,clock});}catch{monthly=null;}
   return page(bulkCollectionBody({monthly}),owner.csrf,'physical');
  }
  async function dispatch(id,action,approvalHash){if(dispatchJob)return dispatchJob(id,action,approvalHash);const token=seal({id,action,approvalHash,expiry:clock()+600000},cfg.secret,'poster-upload-run');context.waitUntil(request(cfg.origin+'/poster/upload-run',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'text/plain'},body:token}).then(async r=>{if(r.status!==202)await uploads.setJSON('dispatch/'+id+'/'+action,{phase:'failed'});}).catch(async()=>{await uploads.setJSON('dispatch/'+id+'/'+action,{phase:'uncertain'});}));}
  if(path==='/poster/upload'&&req.method==='GET'){
   const id=u.searchParams.get('id');
   if(id){if(!/^[A-Za-z0-9_-]{32}$/.test(id))return json({error:'Invalid upload'},400);const a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});if(!a)return json({error:'Upload not found'},404);
    if(a.phase==='needs_investigation'&&a.failureAction==='prepare'&&!a.listingId){const taxonomy=await uploads.get('template/taxonomy',{type:'json',consistency:'strong'});return page('<p role="alert">'+esc(a.failureCode)+'</p><p>Correct the details below. If the archive itself is invalid, upload a corrected file.</p><form id="product-configure-form" data-upload="'+id+'">'+metadataFields(a.metadata||{},taxonomy?.nodes||[])+'<button>Prepare corrected review</button></form><p id="upload-status"></p><script type="module" src="/poster-upload.mjs"></script>',owner.csrf,a.type);}
    if(a.phase!=='ready_for_approval'){const current=await progress(a);return page('<p>Status: <strong>'+esc(a.phase)+'</strong></p><p id="product-stage" role="status">'+esc(current.label)+'</p><p id="product-progress-note">'+esc(current.note)+'</p><p id="product-progress-time">Elapsed: '+current.elapsedSeconds+' seconds</p><p><a id="worker-run-link" href="'+esc(current.runUrl||'https://github.com/sapiverpress-studio/Poster_gen/actions/workflows/poster-publication.yml')+'" target="_blank" rel="noopener noreferrer">View worker runs</a></p>'+(a.listingId?'<p>Etsy listing ID: '+esc(a.listingId)+'</p>':'')+(a.etsyUrl?'<p><a href="'+esc(a.etsyUrl)+'">View Etsy listing</a></p>':'')+(a.failureCode?'<p role="alert">'+esc(a.failureCode)+'</p>':'')+supplierStatusBody(a)+'<p><a href="/poster/upload?id='+id+'">Refresh status</a> · <a href="/poster/upload">Upload another poster</a></p><p id="upload-status" data-upload="'+id+'" data-phase="'+esc(a.phase)+'"></p><script type="module" src="/poster-upload.mjs"></script>',owner.csrf,a.type);}
    const taxonomy=await uploads.get('template/taxonomy',{type:'json',consistency:'strong'});return page(reviewBody(a,id,owner.csrf,env('POSTER_PUBLICATION_ENABLED')==='true',taxonomy?.nodes||[]),owner.csrf,a.type);
   }
   const defaults=await uploads.get('template/settings',{type:'json',consistency:'strong'}),catalog=await uploads.get('template/catalog',{type:'json',consistency:'strong'}),catalogStatus=await uploads.get('template/catalog-status',{type:'json',consistency:'strong'}),taxonomy=await uploads.get('template/taxonomy',{type:'json',consistency:'strong'});let update;if(u.searchParams.has('update')){const id=u.searchParams.get('update');if(!validId(id))return json({error:'Invalid product'},400);update=await uploads.get(recordKey(id),{type:'json',consistency:'strong'});if(!update)return json({error:'Product not found'},404);}
   let monthly;
   try{monthly=await monthlyUploadStatus({uploads,clock});}catch{monthly=null;}
   return page(uploadBody({defaults,catalog,catalogStatus,taxonomy:taxonomy?.nodes||[],update,monthly}),owner.csrf);
  }
  const match=/^\/poster\/uploads\/([A-Za-z0-9_-]{32})(?:\/(chunks|mockups|preview-input)\/(\d+)|\/(finish|approve|configure))?$/.exec(path);
  // Every mutation uses the same HttpOnly owner session and a separate CSRF value.
  if(req.method!=='GET'&&!acceptedRequestContext(req.headers.get('origin'),cfg.origin,req.headers.get('sec-fetch-site')))return json({error:'Request denied'},403);
  if(path==='/poster/catalogue/repair'&&req.method==='POST')return json({error:'Shipping correction suspended: this bulk-uploaded PrintShrimp listing already shows a PrintShrimp delivery profile. Verify the two profile IDs with the supplier before changing it.'},409);
  if(path==='/poster/catalogue/link-existing'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{
    const raw=await req.text();
    if(Buffer.byteLength(raw)>350)throw Error('Supplier reference request too large');
    const body=JSON.parse(raw);
    if(body?.confirm!==true||!Array.isArray(body?.ids)||!body.ids.length||body.ids.length>5||body.ids.some(id=>!BULK_ETS_IDS.includes(id)))throw Error('Explicit verified bulk product selection required');
    const status=await deliveryAuditStatus();
    const audit=status.phase==='available'?await uploads.get('catalogue/audit',{type:'json',consistency:'strong'}):null;
    const sellerCatalog=await uploads.get('template/catalog',{type:'json',consistency:'strong'});
    if(!audit||audit.shopId!==sellerCatalog?.shopId)throw Error('Seller catalogue must match the fresh audit');
    const result=await linkExistingBulkProducts({uploads,audit,ids:body.ids,clock});
    return json({phase:'linked',...result});
   }catch(error){return json({error:String(error.message||'Supplier references could not be linked').slice(0,190)},409);}
  }
  if(path==='/poster/catalogue/labels'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{
    const raw=await req.text();if(Buffer.byteLength(raw)>1000)throw Error('Season request too large');
    const input=JSON.parse(raw),id=Number(input.id),seasons=input.seasons;
    if(!Number.isSafeInteger(id)||id<=0||!Array.isArray(seasons)||seasons.length>SEASONS.length||seasons.some(x=>typeof x!=='string'||!SEASONS.includes(x))||new Set(seasons).size!==seasons.length||seasons.includes('All year')&&seasons.length>1)throw Error('Invalid seasonal labels');
    const status=await uploads.get('catalogue/audit-status',{type:'json',consistency:'strong'}),audit=await uploads.get('catalogue/audit',{type:'json',consistency:'strong'});
    if(status?.phase!=='available'||!audit?.listings?.some(x=>x.id===id)||clock()-audit.checkedAt>86400000)throw Error('Refresh your verified shop catalogue before editing labels');
    await uploads.setJSON('catalogue/labels/'+id,{seasons,updatedAt:clock(),shopId:audit.shopId});
    const saved=await uploads.get('catalogue/labels/'+id,{type:'json',consistency:'strong'});
    if(JSON.stringify(saved?.seasons)!==JSON.stringify(seasons))throw Error('Seasonal label verification failed');
    return json({id,seasons,phase:'saved'});
   }catch(error){return json({error:String(error.message||'Seasonal label update unavailable').slice(0,200)},409);}
  }
  if(path==='/poster/seo/status'&&req.method==='GET'){
   const state=await uploads.get('seo/audit-status',{type:'json',consistency:'strong'});
   const review=state?.phase==='available'?await latestSeoAudit({uploads,clock}):null;
   return json({phase:state?.phase||'not_checked',checkedAt:state?.checkedAt||null,...(review||{batch:null,rows:[]})});
  }
  if(path==='/poster/seo/prepare'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{
    const current=await uploads.get('seo/audit-status',{type:'json',consistency:'strong'});
    if(current?.phase==='pending'&&clock()-current.checkedAt<600000)return json({phase:'pending'},202);
    await uploads.setJSON('seo/audit-status',{phase:'pending',checkedAt:clock()});
    await dispatch(newId(),'seo_audit');
    return json({phase:'pending'},202);
   }catch{
    await uploads.setJSON('seo/audit-status',{phase:'needs_investigation',checkedAt:clock(),reason:'worker_dispatch_failed'});
    return json({error:'Seller audit could not be queued; no listings changed'},503);
   }
  }
  // Seller-authorised metadata writes must run in a separately approved GitHub worker job.
  // The Netlify cached catalogue is intentionally unable to send seller API mutations.
  if(path==='/poster/seo/apply'&&req.method==='POST')return json({error:'SEO updates are disabled until the verified seller-worker approval path is available. No listings changed.'},503);
  if(path==='/poster/catalog/status'&&req.method==='GET'){
   const state=await uploads.get('template/catalog-status',{type:'json',consistency:'strong'});
   const catalog=state?.phase==='available'?await uploads.get('template/catalog',{type:'json',consistency:'strong'}):null;
   const listings=(catalog?.listings||[]).filter(l=>Number.isSafeInteger(l.listing_id)&&l.listing_id>0&&l.listing_type==='physical'&&l.shop_id===catalog.shopId).slice(0,100).map(l=>({id:l.listing_id,title:String(l.title||'Etsy poster reference').slice(0,140)}));
   let phase=state?.phase||'not_checked';
   if(phase==='pending'){
    const receipt=queue&&/^jobs\/[A-Za-z0-9_-]{32}$/.test(state?.jobKey||'')?await queue.get(state.jobKey,{type:'json',consistency:'strong'}):null;
    if(receipt?.phase==='needs_investigation')phase='worker_failed';
    else if(receipt?.phase==='complete')phase='worker_finished_no_result';
    else if(Number.isFinite(state?.checkedAt)&&clock()-state.checkedAt>600000)phase='worker_delayed';
   }
   return json({phase,count:state?.count??null,checkedAt:state?.checkedAt||null,listings});
  }
  if(path==='/poster/catalog/refresh'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{
    const prior=await deliveryAuditStatus();
    if(prior.phase==='pending')return json({phase:'pending',message:'The existing Etsy audit is still running. Do not queue another.'},202);
    const startedAt=clock();
    await uploads.setJSON('catalogue/audit-status',{phase:'pending',checkedAt:startedAt});
    const jobKey=await dispatch(newId(),'catalog');
    const current=await uploads.get('catalogue/audit-status',{type:'json',consistency:'strong'});
    if(current?.phase==='pending'&&current.checkedAt===startedAt)await uploads.setJSON('catalogue/audit-status',{phase:'pending',checkedAt:startedAt,jobKey});
    await uploads.setJSON('template/catalog-status',{phase:'pending',checkedAt:startedAt,...(typeof jobKey==='string'&&/^jobs\/[A-Za-z0-9_-]{32}$/.test(jobKey)?{jobKey}:{})});
    return json({phase:'pending',message:'Seller audit queued. The page will report worker failures and timeouts.'},202);
   }catch{
    await uploads.setJSON('catalogue/audit-status',{phase:'needs_investigation',checkedAt:clock()});
    return json({error:'Etsy audit could not be queued. No listings changed.'},503);
   }
  }
  if(path==='/poster/uploads'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{if(Number(req.headers.get('content-length')||0)>20000)throw Error();const text=await req.text();if(Buffer.byteLength(text)>20000)throw Error();const body=JSON.parse(text),type=body.type||'physical';let previous,product;
    if(body.updateProductId){if(!validId(body.updateProductId))throw Error();product=await uploads.get(recordKey(body.updateProductId),{type:'json',consistency:'strong'});if(!product||product.type!==type||product.pendingPhase&&['uploading','preparing','publishing'].includes(product.pendingPhase))throw Error();previous=await uploads.get(assetKey(product.currentRevision),{type:'json',consistency:'strong'});if(!previous)throw Error();}
    const sourceFilename=body.reuseOriginal?(previous?.sourceFilename||previous?.filename):body.filename;
    let filename=body.reuseOriginal?previous?.filename:sourceFilename;
    if(type==='physical'&&!body.reuseOriginal&&/^\d+\.png$/i.test(sourceFilename||'')){
     const name=String(body.metadata?.name||'').trim();
     if(!name)throw Error('Enter a poster Name for numbered PNG downloads');
     filename=name+'.png';
    }
    const bytes=body.reuseOriginal?previous?.bytes:body.bytes,metadata=productMetadata(body.metadata||{},filename,type);
    if(!Number.isSafeInteger(bytes)||bytes<33||bytes>(type==='digital'?100_000_000:50_000_000))throw Error();
    const referenceListingId=Number(previous?.referenceListingId||body.referenceListingId);if(type==='physical'&&body.referenceListingId&&(!Number.isSafeInteger(Number(body.referenceListingId))||Number(body.referenceListingId)<=0))throw Error('Invalid optional Etsy reference');
    const previewCount=Number(body.previewCount||0);if(!Number.isInteger(previewCount)||previewCount<0||previewCount>3)throw Error();
    const id=newId();
    if(!product){
     let capacity;
     try{capacity=await reserveMonthlyUpload({uploads,productId:id,clock});}
     catch{return json({error:'Cannot verify the monthly upload allowance. No new upload was started; try again later.'},503);}
     if(!capacity.accepted)return json({code:'monthly_upload_limit',error:'Monthly limit reached: '+capacity.status.limit+' new products in '+capacity.status.label+'. You can still edit existing products. New uploads open next month.',...{used:capacity.status.used,limit:capacity.status.limit}},409);
    }
    const a={phase:body.reuseOriginal?'preparing':'uploading',type,productId:product?.productId||id,updateProductId:product?.productId||null,filename,sourceFilename,bytes,chunks:body.reuseOriginal?0:Math.ceil(bytes/CHUNK_BYTES),referenceListingId:Number.isSafeInteger(referenceListingId)&&referenceListingId>0?referenceListingId:null,metadata,previewCount:body.reuseOriginal?previous.previewCount||0:previewCount,sourcePreviewCount:body.reuseOriginal?previous.sourcePreviewCount??previous.previewCount??0:previewCount,reusePreviewKeys:body.reuseOriginal?previous.reusePreviewKeys||Array.from({length:previous.sourcePreviewCount??previous.previewCount??0},(_,i)=>'uploads/'+product.currentRevision+'/preview-input/'+i+'.jpg'):null,createdAt:clock(),...(body.reuseOriginal?type==='digital'?{reuseArchiveKey:previous.archiveKey}:{reuseMasterKey:previous.masterKey}:{})};
    await uploads.setJSON(assetKey(id),a,{onlyIfNew:true});await recordRevision(uploads,id);if(body.reuseOriginal)await dispatch(id,'prepare');return json({id,chunkBytes:CHUNK_BYTES,phase:a.phase},201);
   }catch(error){return json({error:error.message||'Invalid product upload'},400);}
  }
  if(!match)return json({error:'Not found'},404);
  const [,id,kind,index,action]=match,a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});if(!a)return json({error:'Upload not found'},404);
  if(req.method==='GET'&&kind==='mockups'){if(!['0','1','2','3'].includes(index))return json({error:'Not found'},404);const image=await uploads.get('uploads/'+id+'/mockups/'+index+'.jpg',{type:'arrayBuffer',consistency:'strong'});return image?new Response(image,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}):json({error:'Not ready'},404);}
  if(req.method==='GET'&&!kind&&!action)return json({phase:a.phase,stage:a.stage||null,supersededBy:validId(a.supersededBy)?a.supersededBy:null,listingId:a.listingId||null,progress:await progress(a),
    ...(a.phase==='ready_for_approval'&&a.plan&&a.approvalHash?{review:{
     title:a.plan.body.title,description:a.plan.body.description,tags:a.plan.body.tags,
     approvalHash:a.approvalHash,sku:a.plan.identity.sku,
     imageUrls:[0,1,2,3].map(i=>'/poster/uploads/'+id+'/mockups/'+i)
    }}:{})});
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
   await uploads.setJSON(assetKey(id),{...a,phase:'publishing',approvedAt:clock()});await recordRevision(uploads,id);await dispatch(id,'publish',a.approvalHash);
   if(req.headers.get('accept')?.includes('application/json'))return json({id,phase:'publishing'},202);
   return new Response(null,{status:303,headers:{Location:'/poster/upload?id='+id,'Cache-Control':'no-store'}});
  }
  return json({error:'Method not allowed'},405);
 };
}
