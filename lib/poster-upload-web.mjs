import {progressSummary} from './product-progress.mjs';
import {renderOwnerPage} from './owner-page.mjs';
import {productMetadata,PRINT_SECTIONS} from './product-metadata.mjs';
import {validatedShopSections} from './etsy-section-snapshot.mjs';
import {latestSeoAudit} from './catalogue-seo.mjs';
import {cataloguePage,SEASONS} from './catalogue-page.mjs';
import {folderCatalogue,studioHome} from './catalogue-folders.mjs';
import {approveVisibilityPlan,visibilityKey} from './catalogue-visibility.mjs';
import {approveA3Removal,sizeChangeKey} from './catalogue-sizes.mjs';
import {linkExistingBulkProducts,BULK_ETS_IDS} from './existing-supplier-links.mjs';
import {recordRevision,recordKey,listProducts,newId,validId} from './product-records.mjs';
import {monthlyUploadStatus,reserveMonthlyUpload} from './monthly-upload-limit.mjs';
import {finishStoredPoster,prepareStoredPoster} from './stored-posters.mjs';
import {reviewBody,uploadBody,bulkCollectionBody,dashboardBody,metadataFields,supplierStatusBody} from './product-web.mjs';
import {randomBytes} from 'node:crypto';
import {unseal,seal,equal,acceptedRequestContext} from './oauth.mjs';
import {etsySetup} from './etsy-oauth.mjs';
import {identityFromFilename,PRICES,SIZES,FRAMES,TAGS} from './poster-template.mjs';
import {CHUNK_BYTES,assetKey,hashBytes} from './uploaded-poster.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
function page(body,csrf,type='physical',section=null){const active=section||(body.startsWith('<h2>Products</h2>')?'products':'upload');const title=active==='home'?'Dashboard':active==='catalogue'?'Shop catalogue':active==='bulk'?'Bulk collection upload':active==='products'?'Upload history':'Prepare your next product';return new Response(renderOwnerPage({title,body,csrf,productType:type,active}),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; connect-src 'self'; img-src 'self' blob: https://i.etsystatic.com; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'}});}
export function createPosterUploadHandler({env,uploads,client,request=fetch,clock=()=>Date.now(),dispatchJob,queue}) {
 return async(req,context)=>{
  const u=new URL(req.url),path=u.pathname;
  let cfg,owner;
  try{cfg=etsySetup(env);const cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-poster_owner='))?.slice('__Host-poster_owner='.length);owner=unseal(cookie,cfg.secret,'poster-owner');if(!owner.csrf||!Number.isFinite(owner.expiry)||owner.expiry<clock())throw Error('expired');}
  catch{
   if(path.startsWith('/poster/catalog/')||(path.startsWith('/poster/uploads')&&!path.endsWith('/approve')))return json({code:'studio_session_required',error:'Your product-studio session has expired. Reopen the studio, then retry. Saved uploads are retained.'},401);
   return new Response(null,{status:303,headers:{Location:'/poster/workflow','Cache-Control':'no-store'}});
  }
  if(path==='/poster/woodland'&&req.method==='GET'){
   const {woodlandStatus}=await import('./woodland-verse-bulk.mjs');
   const state=await woodlandStatus({uploads});
   return page('<h2>Recover original Woodland Verses</h2>'+
    '<p>Export the original Badger, Red Squirrel and Roe Deer poems and images directly from your copied Canva design, no regeneration. All three listings are A4/A5, with 13 tags including a bedroom wall-art room term. Nothing is published to Etsy until you approve it in the bulk uploader.</p>'+
    '<p>Each full-resolution Canva PNG is verified at 3394 × 4800 pixels. Pixel dimensions do not guarantee the underlying artwork is truly sharp; inspect the export at actual print size before listing.</p>'+
    '<div id="woodland-tools" data-csrf="'+esc(owner.csrf)+'" data-phase="'+esc(state.phase)+'"><button id="woodland-start" type="button">Export originals and package</button> <a id="woodland-download" href="/poster/woodland/download" hidden>Download three-poster ZIP</a><p id="woodland-status" role="status">'+esc(state.phase)+'</p></div>'+
    '<p><a href="https://www.canva.com/d/x2rpetQ2IR2qKx6" target="_blank" rel="noopener noreferrer">View original three-page Canva project</a> · <a href="/poster/bulk">Open existing bulk uploader</a></p>'+
    '<script type="module" src="/woodland-verse.mjs"></script>',owner.csrf,'physical');
  }
  if(path==='/poster/woodland/status'&&req.method==='GET'){
   const {woodlandStatus}=await import('./woodland-verse-bulk.mjs');
   return json(await woodlandStatus({uploads}));
  }
  if(path==='/poster/woodland/download'&&req.method==='GET'){
   const {woodlandDownload}=await import('./woodland-verse-bulk.mjs');
   try{return await woodlandDownload({uploads});}catch{return json({error:'Three original PNGs are not verified yet'},409);}
  }
  if((path==='/poster/woodland/start'||path==='/poster/woodland/finish')&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{
    const {accessToken}=await import('../netlify/functions/canva-print-check.mjs');
    const {woodlandStart,woodlandFinish}=await import('./woodland-verse-bulk.mjs');
    const token=await accessToken({clientId:env('CANVA_CLIENT_ID'),clientSecret:cfg.secret});
    const args={uploads,token,request,clock};
    return json(path.endsWith('/start')?await woodlandStart(args):await woodlandFinish(args),202);
   }catch(error){return json({error:String(error.message||'Canva export unavailable').slice(0,190)},409);}
  }
  async function progress(a){const job=queue&&/^jobs\/[A-Za-z0-9_-]{32}$/.test(a.workerJobKey||'')?await queue.get(a.workerJobKey,{type:'json',consistency:'strong'}):null;const trigger=queue&&job?await queue.get('dispatch/'+a.workerJobKey.slice(5),{type:'json',consistency:'strong'}):null;return progressSummary(a,job,trigger,clock());}
  if(path==='/poster/seo'&&req.method==='GET')return page('<h2>Audit every Etsy listing</h2><p>Read ALL active SapiverPrints listings using your existing seller connection and compare titles and tags with the proposal JSON. No SKUs, prices, options, images or supplier orders change.</p><p>The proposed changes for all 20 listings are already loaded in the app. Review the comparison and every artwork warning before confirming. If the catalogue has changed, the audit will stop rather than overlook new listings.</p><button id="seo-audit" type="button">Compare every Etsy listing</button><p id="seo-status" role="status"></p><div id="seo-results"></div><p><strong>Review only:</strong> this screen cannot apply title or tag edits until the seller-authenticated update workflow is separately verified. Use the catalogue page for PrintShrimp delivery checks.</p><p><a href="/poster/catalogue">Open catalogue and PrintShrimp delivery audit</a></p><script type="module" src="/poster-seo.mjs"></script>',owner.csrf,'physical');
  if(path==='/poster/home'&&req.method==='GET'){
   const audit=await uploads.get('catalogue/audit',{type:'json',consistency:'strong'});
   let monthly;try{monthly=await monthlyUploadStatus({uploads,clock});}catch{monthly=null;}
   const storedCount=(await listProducts(uploads)).filter(p=>p.phase==='stored'&&p.storeOnly===true&&!p.etsyListingId).length;
   return page(studioHome({catalogue:audit,monthly,storedCount}),owner.csrf,'physical','home');
  }
  if(path==='/poster/products'&&req.method==='GET')return page(dashboardBody(await listProducts(uploads),Object.fromEntries(u.searchParams)),owner.csrf,'physical','products');
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
  async function websiteFolders(){
   const folders=[];
   for await(const p of uploads.list({prefix:'catalogue/website-folders/',paginate:true})){
    for(const b of p.blobs){
     const v=await uploads.get(b.key,{type:'json',consistency:'strong'});
     if(v&&typeof v.title==='string'&&/^[a-z0-9-]{1,48}$/.test(b.key.split('/').at(-1)))folders.push(v.title);
    }
   }
   return folders.sort((a,b)=>a.localeCompare(b,'en'));
  }
  if(path==='/poster/catalogue'&&req.method==='GET'){
   const status=await deliveryAuditStatus();
   const audit=status?.phase==='available'?await uploads.get('catalogue/audit',{type:'json',consistency:'strong'}):null;
   const labels={};
   if(audit?.listings)await Promise.all(audit.listings.map(async row=>{const record=await uploads.get('catalogue/labels/'+row.id,{type:'json',consistency:'strong'});labels[row.id]=record?.seasons||[];}));
   const repair=await uploads.get('catalogue/repair-status',{type:'json',consistency:'strong'});
   const section=u.searchParams.get('section')||'',season=u.searchParams.get('season')||'',folder=u.searchParams.get('folder')||'';
   const stored=(await listProducts(uploads)).filter(p=>p.phase==='stored'&&p.storeOnly===true&&!p.etsyListingId);
   const folders=await websiteFolders();
   return page(folderCatalogue({audit,status,labels,section,season,folder,stored,folders,clock}),owner.csrf,'physical','catalogue');
  }
  if(path==='/poster/catalogue/audit'&&req.method==='GET'){
   const status=await deliveryAuditStatus(),audit=status?.phase==='available'?await uploads.get('catalogue/audit',{type:'json',consistency:'strong'}):null;
   const labels={};
   if(audit?.listings)await Promise.all(audit.listings.map(async row=>{const record=await uploads.get('catalogue/labels/'+row.id,{type:'json',consistency:'strong'});labels[row.id]=record?.seasons||[];}));
   const repair=await uploads.get('catalogue/repair-status',{type:'json',consistency:'strong'});
   return page(cataloguePage({audit,status,labels,repair}),owner.csrf,'physical','catalogue');
  }
  if(path==='/poster/catalogue/visibility/status'&&req.method==='GET'){
   const id=u.searchParams.get('id');
   if(!/^[A-Za-z0-9_-]{32}$/.test(id||''))return json({error:'Invalid listing change'},400);
   const result=await uploads.get(visibilityKey(id),{type:'json',consistency:'strong'});
   if(!result)return json({error:'Listing change not found'},404);
   return json({phase:result.phase,verified:result.results?.length||0,total:result.plan?.items?.length||0,attemptingId:result.phase==='needs_investigation'?result.attemptingId:null});
  }
  if(path==='/poster/catalogue/sizes/status'&&req.method==='GET'){
   const id=u.searchParams.get('id');
   if(!/^[A-Za-z0-9_-]{32}$/.test(id||''))return json({error:'Invalid size update'},400);
   const result=await uploads.get(sizeChangeKey(id),{type:'json',consistency:'strong'});
   if(!result)return json({error:'Size update not found'},404);
   return json({phase:result.phase,verified:result.results?.length||0,total:result.plan?.items?.length||0,attemptingId:result.phase==='needs_investigation'?result.attemptingId:null});
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
  async function activeShopSections(){
   const catalog=await uploads.get('template/catalog',{type:'json',consistency:'strong'});
   if(!Number.isSafeInteger(catalog?.shopId)||catalog.shopId<=0)throw Error('Etsy shop catalogue has not been synchronised');
   const stored=await uploads.get('template/sections',{type:'json',consistency:'strong'});
   try{return {sections:validatedShopSections(stored,{shopId:catalog.shopId,clock}),checkedAt:stored.checkedAt};}
   catch{
    // Existing signed-worker audits contain all real Etsy sections, including empty ones.
    const audit=await uploads.get('catalogue/audit',{type:'json',consistency:'strong'});
    return {sections:validatedShopSections(audit,{shopId:catalog.shopId,clock}),checkedAt:audit.checkedAt};
   }
  }
  if(path==='/poster/bulk/sections'&&req.method==='GET'){
   try{return json({phase:'available',...(await activeShopSections())});}
   catch{return json({phase:'needs_refresh',error:'Etsy shop sections need refreshing. Run the catalogue audit, then return here.'},409);}
  }
  if(path==='/poster/bulk/status'&&req.method==='GET'){
   try{const status=await monthlyUploadStatus({uploads,clock});return json({limit:status.limit,used:status.used,remaining:status.remaining,month:status.month});}
   catch{return json({error:'Monthly capacity could not be checked'},503);}
  }
  if(path==='/poster/bulk'&&req.method==='GET'){
   let monthly;try{monthly=await monthlyUploadStatus({uploads,clock});}catch{monthly=null;}
   let sectionInfo;
   try{sectionInfo=await activeShopSections();}catch{sectionInfo=null;}
   return page(bulkCollectionBody({monthly,sectionInfo,websiteFolders:await websiteFolders()}),owner.csrf,'physical','bulk');
  }
  async function dispatch(id,action,approvalHash){if(dispatchJob)return dispatchJob(id,action,approvalHash);const token=seal({id,action,approvalHash,expiry:clock()+600000},cfg.secret,'poster-upload-run');context.waitUntil(request(cfg.origin+'/poster/upload-run',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'text/plain'},body:token}).then(async r=>{if(r.status!==202)await uploads.setJSON('dispatch/'+id+'/'+action,{phase:'failed'});}).catch(async()=>{await uploads.setJSON('dispatch/'+id+'/'+action,{phase:'uncertain'});}));}
  if(path==='/poster/upload'&&req.method==='GET'){
   const id=u.searchParams.get('id');
   if(id){if(!/^[A-Za-z0-9_-]{32}$/.test(id))return json({error:'Invalid upload'},400);const a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});if(!a)return json({error:'Upload not found'},404);
    if(a.phase==='stored')return page('<h2>Stored privately: '+esc(a.metadata?.name||a.filename)+'</h2><p>This poster is not listed on Etsy. Its original artwork and details are saved on your website. No monthly listing slot has been consumed.</p><p>Website folder: '+esc(a.metadata?.websiteFolder||a.metadata?.sectionTitle||'Uncategorised')+' · Future Etsy section: '+esc(a.metadata?.sectionTitle||'Not set')+'</p><p><a href="/poster/catalogue">Browse catalogue folders</a></p><button type="button" id="prepare-stored" data-id="'+id+'">Switch ON for first time — prepare Etsy review</button><p id="stored-status" role="status"></p><script type="module" src="/stored-poster.mjs"></script>',owner.csrf,'physical');
    if(a.phase==='needs_investigation'&&a.failureAction==='prepare'&&!a.listingId){const taxonomy=await uploads.get('template/taxonomy',{type:'json',consistency:'strong'});return page('<p role="alert">'+esc(a.failureCode)+'</p><p>Correct the details below. If the archive itself is invalid, upload a corrected file.</p><form id="product-configure-form" data-upload="'+id+'">'+metadataFields(a.metadata||{},taxonomy?.nodes||[])+'<button>Prepare corrected review</button></form><p id="upload-status"></p><script type="module" src="/poster-upload.mjs"></script>',owner.csrf,a.type);}
    if(a.phase!=='ready_for_approval'){const current=await progress(a);return page('<p>Status: <strong>'+esc(a.phase)+'</strong></p><p id="product-stage" role="status">'+esc(current.label)+'</p><p id="product-progress-note">'+esc(current.note)+'</p><p id="product-progress-time">Elapsed: '+current.elapsedSeconds+' seconds</p><p><a id="worker-run-link" href="'+esc(current.runUrl||'https://github.com/sapiverpress-studio/Poster_gen/actions/workflows/poster-publication.yml')+'" target="_blank" rel="noopener noreferrer">View worker runs</a></p>'+(a.listingId?'<p>Etsy listing ID: '+esc(a.listingId)+'</p>':'')+(a.etsyUrl?'<p><a href="'+esc(a.etsyUrl)+'">View Etsy listing</a></p>':'')+(a.failureCode?'<p role="alert">'+esc(a.failureCode)+'</p>':'')+supplierStatusBody(a)+'<p><a href="/poster/upload?id='+id+'">Refresh status</a> · <a href="/poster/upload">Upload another poster</a></p><p id="upload-status" data-upload="'+id+'" data-phase="'+esc(a.phase)+'"></p><script type="module" src="/poster-upload.mjs"></script>',owner.csrf,a.type);}
    const taxonomy=await uploads.get('template/taxonomy',{type:'json',consistency:'strong'});return page(reviewBody(a,id,owner.csrf,env('POSTER_PUBLICATION_ENABLED')==='true',taxonomy?.nodes||[],env('POSTER_BUNDLE_ACTIVATION_ENABLED')==='true'),owner.csrf,a.type);
   }
   const defaults=await uploads.get('template/settings',{type:'json',consistency:'strong'}),catalog=await uploads.get('template/catalog',{type:'json',consistency:'strong'}),catalogStatus=await uploads.get('template/catalog-status',{type:'json',consistency:'strong'}),taxonomy=await uploads.get('template/taxonomy',{type:'json',consistency:'strong'});let update;if(u.searchParams.has('update')){const id=u.searchParams.get('update');if(!validId(id))return json({error:'Invalid product'},400);update=await uploads.get(recordKey(id),{type:'json',consistency:'strong'});if(!update)return json({error:'Product not found'},404);}
   let monthly;
   try{monthly=await monthlyUploadStatus({uploads,clock});}catch{monthly=null;}
   let sections;try{sections=(await activeShopSections()).sections.map(x=>x.title);}catch{}
   return page(uploadBody({defaults,catalog,catalogStatus,taxonomy:taxonomy?.nodes||[],update,monthly,storedDefault:u.searchParams.get('store')==='1',websiteFolders:await websiteFolders(),verifiedShopSections:sections}),owner.csrf);
  }
  const match=/^\/poster\/uploads\/([A-Za-z0-9_-]{32})(?:\/(chunks|mockups|preview-input)\/(\d+)|\/(finish|approve|configure))?$/.exec(path);
  // Every mutation uses the same HttpOnly owner session and a separate CSRF value.
  if(req.method!=='GET'&&!acceptedRequestContext(req.headers.get('origin'),cfg.origin,req.headers.get('sec-fetch-site')))return json({error:'Request denied'},403);
  if(path==='/poster/catalogue/website-folders'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{
    const body=await req.text();if(Buffer.byteLength(body)>500)throw Error('Folder request too large');
    const title=String(JSON.parse(body).title||'').trim();
    if(title.length<2||title.length>45||/[<>\x00-\x1f\x7f]/.test(title))throw Error('Folder name must be 2–45 characters');
    const slug=title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48);
    if(!slug)throw Error('Choose a folder name using letters or numbers');
    if((await websiteFolders()).length>=80)throw Error('Website folder limit reached');
    const result=await uploads.setJSON('catalogue/website-folders/'+slug,{title,createdAt:clock()},{onlyIfNew:true});
    if(result?.modified!==true)throw Error('Folder already exists');
    return json({title,phase:'created'},201);
   }catch(error){return json({error:String(error.message||'Folder not created').slice(0,170)},409);}
  }
  const storedMatch=/^\/poster\/stored\/([A-Za-z0-9_-]{32})\/prepare$/.exec(path);
  if(storedMatch&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{const result=await prepareStoredPoster({uploads,id:storedMatch[1],dispatch,clock});return json(result,result.phase==='stored'?409:202);}
   catch(error){return json({error:String(error.message||'Poster preparation unavailable').slice(0,220)},409);}
  }
  if(path==='/poster/catalogue/repair'&&req.method==='POST')return json({error:'Shipping correction suspended: this bulk-uploaded PrintShrimp listing already shows a PrintShrimp delivery profile. Verify the two profile IDs with the supplier before changing it.'},409);
  if(path==='/poster/catalogue/visibility'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{
    const raw=await req.text();
    if(Buffer.byteLength(raw)>900)throw Error('Listing selection is too large');
    const body=JSON.parse(raw);
    if(body?.confirm!==true)throw Error('Confirm the listing change first');
    const auditStatus=await deliveryAuditStatus(),audit=auditStatus?.phase==='available'?await uploads.get('catalogue/audit',{type:'json',consistency:'strong'}):null;
    const shop=await uploads.get('template/catalog',{type:'json',consistency:'strong'});
    const plan=approveVisibilityPlan({audit,target:body.target,ids:body.ids,shopId:shop?.shopId,clock});
    const recent=await uploads.get('catalogue/visibility-current',{type:'json',consistency:'strong'});
    if(recent&&clock()-recent.createdAt<600000){
     const last=await uploads.get(visibilityKey(recent.id),{type:'json',consistency:'strong'});
     if(last&&['queued','running','needs_investigation'].includes(last.phase))throw Error('A previous listing change is pending or needs investigation. Check it before starting another.');
    }
    const id=newId();
    const saved=await uploads.setJSON(visibilityKey(id),{phase:'queued',plan,results:[],createdAt:clock()},{onlyIfNew:true});
    if(saved?.modified!==true)throw Error('Could not reserve visibility approval');
    await uploads.setJSON('catalogue/visibility-current',{id,createdAt:clock()});
    try{await dispatch(id,'visibility');}catch{
     await uploads.setJSON(visibilityKey(id),{phase:'needs_investigation',plan,results:[],reason:'Unable to queue worker; no verified Etsy write',failedAt:clock()});
     throw Error('Worker dispatch failed; no changes confirmed');
    }
    return json({phase:'queued',id},202);
   }catch(error){return json({error:String(error.message||'Listing change unavailable').slice(0,200)},409);}
  }
  if(path==='/poster/catalogue/sizes'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Request denied'},403);
   try{
    const raw=await req.text();if(Buffer.byteLength(raw)>900)throw Error('Size selection too large');
    const body=JSON.parse(raw);if(body?.confirm!==true||body?.operation!=='remove_a3_only')throw Error('Confirm A3 removal first');
    const auditStatus=await deliveryAuditStatus(),audit=auditStatus?.phase==='available'?await uploads.get('catalogue/audit',{type:'json',consistency:'strong'}):null;
    const shop=await uploads.get('template/catalog',{type:'json',consistency:'strong'});
    const plan=approveA3Removal({audit,ids:body.ids,shopId:shop?.shopId,clock});
    const recent=await uploads.get('catalogue/remove-a3-current',{type:'json',consistency:'strong'});
    if(recent&&clock()-recent.createdAt<600000){
     const last=await uploads.get(sizeChangeKey(recent.id),{type:'json',consistency:'strong'});
     if(last&&['queued','running','needs_investigation'].includes(last.phase))throw Error('Previous size change still needs verification. Inspect it before another batch.');
    }
    const id=newId(),stored=await uploads.setJSON(sizeChangeKey(id),{phase:'queued',plan,results:[],createdAt:clock()},{onlyIfNew:true});
    if(stored?.modified!==true)throw Error('Unable to reserve size update');
    await uploads.setJSON('catalogue/remove-a3-current',{id,createdAt:clock()});
    try{await dispatch(id,'sizes');}catch{
     await uploads.setJSON(sizeChangeKey(id),{phase:'needs_investigation',plan,results:[],reason:'Worker not dispatched; no verified Etsy write',failedAt:clock()});
     throw Error('A3 removal not queued; no changes confirmed');
    }
    return json({phase:'queued',id},202);
   }catch(error){return json({error:String(error.message||'Size change unavailable').slice(0,210)},409);}
  }
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
  if(path==='/poster/bulk/trios'&&req.method==='POST'){
   if(!equal(req.headers.get('x-poster-csrf')||'',owner.csrf))return json({error:'Owner approval required'},403);
   try{
    if(Number(req.headers.get('content-length')||0)>30000)throw Error('Bundle request too large');
    const raw=await req.text();if(Buffer.byteLength(raw)>30000)throw Error('Bundle request too large');
    const incoming=JSON.parse(raw);
    if(!Array.isArray(incoming.items)||incoming.items.length!==6||!Array.isArray(incoming.trios)||incoming.trios.length!==2||
     !Array.isArray(incoming.inputs)||incoming.inputs.length!==2)throw Error('Six poster receipts and two trio definitions required');
    const {parseTrioDetails,makeEightListingPlan}=await import('../public/collection-trios.mjs');
    const parse=(b,n)=>parseTrioDetails([
     'Title: '+b.title,'Listing title: '+b.listingTitle,'Section: '+b.sectionTitle,
     'Size: '+b.size,'Members: '+b.members?.join(', '),'Tags: '+b.tags?.join(', '),
     '','Description:',b.description
    ].join('\n'),{filename:'bundle-'+n+'.md'});
    const cleanTrios=incoming.trios.map((b,i)=>parse(b,i+1));
    const validItems=[],assets=new Map();
    for(const i of incoming.items){
     if(!validId(i.id)||!(/^[a-f0-9]{64}$/.test(i.sha256||''))||typeof i.folder!=='string'||i.folder.length>100)
      throw Error('Invalid individual poster receipt');
     const a=await uploads.get(assetKey(i.id),{type:'json',consistency:'strong'});
     if(a?.phase!=='published'||a.type!=='physical'||a.image?.sha256!==i.sha256||
      !a.listingId||!a.supplierProductId||!a.plan?.identity?.sku||a.metadata?.etsyTitle!==i.listingTitle||
      a.metadata?.sectionTitle!==i.sectionTitle||
      JSON.stringify(a.metadata?.printSizes)!==JSON.stringify(i.printSizes))
      throw Error('Six uploaded individual posters must be fully published and unchanged before bundling');
     if(assets.has(i.id))throw Error('Same individual listing repeated');
     assets.set(i.id,a);
     validItems.push({folder:i.folder,listingTitle:i.listingTitle,sectionTitle:i.sectionTitle,printSizes:i.printSizes});
    }
    const plan=makeEightListingPlan({items:validItems,trios:cleanTrios,inputs:incoming.inputs});
    const posterSku=new Set([...assets.values()].map(a=>a.plan.identity.sku.toLowerCase()));
    if(plan.bundleListings.some(b=>posterSku.has(b.sku.toLowerCase())))throw Error('Bundle SKU must be different from individual poster SKU');
    const source=validItems.map((v,i)=>({id:incoming.items[i].id,hash:incoming.items[i].sha256,folder:v.folder}));
    const signature=hashBytes(JSON.stringify({source,bundles:plan.bundleListings}));
    const key='collections/eight/'+signature;
    const old=await uploads.get(key,{type:'json',consistency:'strong'});
    if(old){return json({phase:old.phase,ids:old.ids||[],notice:'Existing collection reservation retained; never start duplicate Etsy bundles.'},old.phase==='ready'?200:409);}
    const remaining=await monthlyUploadStatus({uploads,clock});
    if(remaining.remaining<2)return json({error:'Two monthly slots are required for the two additional Etsy bundle listings. Six individual listings remain saved.'},409);
    const claim=await uploads.setJSON(key,{phase:'reserving',ids:[],signature,at:clock()},{onlyIfNew:true});
    if(claim?.modified!==true)return json({error:'A matching collection is already being prepared. Check its saved records.'},409);
    const ids=[];
    try{
     for(const b of plan.bundleListings){
      const memberRefs=b.memberFolders.map(folder=>{
       const index=validItems.findIndex(p=>p.folder.split('/').at(-1).toLowerCase()===folder.toLowerCase());
       if(index<0)throw Error('Unresolved trio member');
       const id=incoming.items[index].id,a=assets.get(id);
       return {id,sha256:a.image.sha256,sku:a.plan.identity.sku,listingId:a.listingId};
      });
      const id=newId();
      const capacity=await reserveMonthlyUpload({uploads,productId:id,clock});
      if(!capacity.accepted)throw Error('Monthly capacity changed while reserving bundle slots');
      const asset={type:'physical_bundle',phase:'preparing',stage:'waiting_for_review',productId:id,createdAt:clock(),
       publicationSlotAt:clock(),filename:'bundle-'+b.number+'.md',bytes:0,chunks:0,
       metadata:{name:cleanTrios[b.number-1].title,etsyTitle:b.listingTitle,sectionTitle:b.sectionTitle,kind:'artwork'},
       trio:cleanTrios[b.number-1],discount:b.discount,sku:b.sku,listingTitle:b.listingTitle,
       memberIds:memberRefs.map(x=>x.id),memberRefs};
      await uploads.setJSON(assetKey(id),asset,{onlyIfNew:true});await recordRevision(uploads,id);
      ids.push(id);await uploads.setJSON(key,{phase:'reserving',ids,signature,at:clock()});
     }
     await uploads.setJSON(key,{phase:'ready',ids,signature,at:clock()});
     for(const id of ids)await dispatch(id,'prepare');
     return json({phase:'preparing',ids,totalListings:8,individualListings:6,bundleListings:2},201);
    }catch(error){
     await uploads.setJSON(key,{phase:'needs_investigation',ids,signature,at:clock()});
     throw Error('Trio reservation interrupted. Inspect '+ids.length+' retained bundle records; do not upload a new ZIP. '+String(error.message).slice(0,100));
    }
   }catch(error){return json({error:String(error.message||'Bundle preparation blocked').slice(0,270)},409);}
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
    let verifiedSectionTitles=PRINT_SECTIONS;
    if(type==='physical'){
     try{verifiedSectionTitles=(await activeShopSections()).sections.map(x=>x.title);}
     catch{ /* Legacy five remain available when no seller snapshot is cached. */ }
    }
    const bytes=body.reuseOriginal?previous?.bytes:body.bytes,metadata=productMetadata(body.metadata||{},filename,type,verifiedSectionTitles);
    if(type==='physical'&&metadata.websiteFolder){
     const folders=await websiteFolders();
     const match=folders.find(x=>x.toLowerCase()===metadata.websiteFolder.toLowerCase());
     if(!match)throw Error('Create the private folder in Catalogue before selecting it');
     metadata.websiteFolder=match;
    }
    if(!Number.isSafeInteger(bytes)||bytes<33||bytes>(type==='digital'?100_000_000:50_000_000))throw Error();
    const referenceListingId=Number(previous?.referenceListingId||body.referenceListingId);if(type==='physical'&&body.referenceListingId&&(!Number.isSafeInteger(Number(body.referenceListingId))||Number(body.referenceListingId)<=0))throw Error('Invalid optional Etsy reference');
    const previewCount=Number(body.previewCount||0);if(!Number.isInteger(previewCount)||previewCount<0||previewCount>3)throw Error();
    const id=newId();
    let storeOnly=type==='physical'&&!product&&body.storeOnly===true,publicationSlotAt=null;
    if(!product&&!storeOnly){
     let capacity;
     try{capacity=await reserveMonthlyUpload({uploads,productId:id,clock});}
     catch{if(type==='physical')storeOnly=true;else return json({error:'Cannot verify the monthly upload allowance. No new upload was started; try again later.'},503);}
     if(capacity&&!capacity.accepted){if(type==='physical')storeOnly=true;else return json({code:'monthly_upload_limit',error:'Monthly limit reached. New digital uploads open next month.',used:capacity.status.used,limit:capacity.status.limit},409);}
     if(capacity?.accepted)publicationSlotAt=clock();
    }
    if(storeOnly&&body.reuseOriginal)throw Error('Private storage requires an uploaded physical PNG');
    const a={phase:body.reuseOriginal?'preparing':'uploading',type,storeOnly,publicationSlotAt,productId:product?.productId||id,updateProductId:product?.productId||null,filename,sourceFilename,bytes,chunks:body.reuseOriginal?0:Math.ceil(bytes/CHUNK_BYTES),referenceListingId:Number.isSafeInteger(referenceListingId)&&referenceListingId>0?referenceListingId:null,metadata,previewCount:body.reuseOriginal?previous.previewCount||0:previewCount,sourcePreviewCount:body.reuseOriginal?previous.sourcePreviewCount??previous.previewCount??0:previewCount,reusePreviewKeys:body.reuseOriginal?previous.reusePreviewKeys||Array.from({length:previous.sourcePreviewCount??previous.previewCount??0},(_,i)=>'uploads/'+product.currentRevision+'/preview-input/'+i+'.jpg'):null,createdAt:clock(),...(body.reuseOriginal?type==='digital'?{reuseArchiveKey:previous.archiveKey}:{reuseMasterKey:previous.masterKey}:{})};
    await uploads.setJSON(assetKey(id),a,{onlyIfNew:true});await recordRevision(uploads,id);if(body.reuseOriginal)await dispatch(id,'prepare');return json({id,chunkBytes:CHUNK_BYTES,phase:a.phase},201);
   }catch(error){return json({error:error.message||'Invalid product upload'},400);}
  }
  if(!match)return json({error:'Not found'},404);
  const [,id,kind,index,action]=match,a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});if(!a)return json({error:'Upload not found'},404);
  if(req.method==='GET'&&kind==='mockups'){if(!['0','1','2','3'].includes(index))return json({error:'Not found'},404);const image=await uploads.get('uploads/'+id+'/mockups/'+index+'.jpg',{type:'arrayBuffer',consistency:'strong'});return image?new Response(image,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}):json({error:'Not ready'},404);}
  if(req.method==='GET'&&!kind&&!action)return json({phase:a.phase,stage:a.stage||null,supersededBy:validId(a.supersededBy)?a.supersededBy:null,listingId:a.listingId||null,progress:await progress(a),
    ...(a.phase==='ready_for_approval'&&a.plan&&a.approvalHash?{review:{
     title:a.plan.body.title,description:a.plan.body.description,tags:a.plan.body.tags,
     approvalHash:a.approvalHash,sku:a.plan.identity?.sku||a.plan.sku,quote:a.type==='physical_bundle'?a.plan.quote:null,
     imageUrls:[0,1,2,3].map(i=>'/poster/uploads/'+id+'/mockups/'+i)
    }}:{})});
  let csrf=req.headers.get('x-poster-csrf'),fields;
  if(action==='approve'&&req.method==='POST'){try{const text=await req.text();if(Buffer.byteLength(text)>4096)throw Error();fields=new URLSearchParams(text);csrf=fields.get('csrf');}catch{return json({error:'Invalid form'},400);}}
  if(!equal(csrf||'',owner.csrf))return json({error:'Request denied'},403);
  if(action==='configure'&&req.method==='POST'){
   if(a.phase!=='ready_for_approval'&&!(a.phase==='needs_investigation'&&a.failureAction==='prepare'&&!a.listingId))return json({error:'Only prepared details or a failed validation can be corrected; merchant failures need investigation'},409);
   try{const text=await req.text();if(Buffer.byteLength(text)>20000)throw Error('Details too large');const body=JSON.parse(text),type=a.type||'physical';
    let verifiedSectionTitles=PRINT_SECTIONS;
    if(type==='physical')try{verifiedSectionTitles=(await activeShopSections()).sections.map(x=>x.title);}catch{}
    const metadata=productMetadata(body.metadata,a.filename,type,verifiedSectionTitles),revision=newId();
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
   if(a.storeOnly===true){
    try{return json(await finishStoredPoster({uploads,id,clock}),201);}
    catch(error){return json({error:String(error.message||'Private storage could not be verified').slice(0,190)},409);}
   }
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
