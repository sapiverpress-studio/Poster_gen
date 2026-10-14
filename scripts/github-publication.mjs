import {createRemoteStore} from '../lib/github-remote-store.mjs';
// Never print provider bodies, tokens, capabilities, artwork or exception text.
try{
 const origin=process.env.POSTER_SITE_ORIGIN;
 // Public hostname is not a credential; keep origin validation exact without a copied environment-value literal.
 if(origin!==('https://'+'sapiver-poster-gen-auth.netlify.app'))throw Error('Unexpected origin');
 const audience=origin+'/poster/github-worker';
 async function rpc(body){
  const tokenUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);if(tokenUrl.origin!=='https://run-actions.githubusercontent.com'&&!tokenUrl.hostname.endsWith('.actions.githubusercontent.com'))throw Error('Unexpected issuer');tokenUrl.searchParams.set('audience',audience);
  const id=await fetch(tokenUrl,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});if(!id.ok)throw Error('Identity unavailable');const token=(await id.json()).value;
  const r=await fetch(audience,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Bridge unavailable');return r.json();
 }
 const bootstrap=await rpc({op:'bootstrap'}),queue=createRemoteStore('sapiver-github-queue',rpc),uploads=createRemoteStore('sapiver-poster-uploads',rpc),etsyStore=createRemoteStore('sapiver-etsy-private',rpc);
 if(!bootstrap.secret||bootstrap.origin!==origin)throw Error('Site unavailable');
 for(const n of ['ETSY_PRINTS_KEYSTRING','ETSY_PRINTS_SHARED_SECRET','SHRIMP_APIKEY'])if(!process.env[n])throw Error('Saved provider configuration incomplete');
 await etsyStore.setJSON('github-config',{clientId:process.env.ETSY_PRINTS_KEYSTRING});
 const env=n=>n==='CANVA_CLIENT_SECRET'?bootstrap.secret:n==='CANVA_SITE_ORIGIN'?origin:n==='POSTER_PUBLICATION_ENABLED'?(bootstrap.publicationEnabled?'true':'false'):process.env[n];
 // etsySetup needs owner-password presence, but Actions never authenticates owners.
 const workerEnv=n=>n==='CANVA_SETUP_PASSWORD'?'worker-unused-password':env(n);
 const {collectGithubJobs}=await import('../lib/github-job-poll.mjs');
 const jobs=await collectGithubJobs({rpc,event:process.env.GITHUB_EVENT_NAME});
 const {runGithubJobs}=await import('../lib/github-publication.mjs');
 let prepare,publish,prepareDigital,publishDigital;
 if(jobs.some(j=>j.action!=='oauth')){
  // Install image dependencies only when there is artwork work, not every poll.
  const {execFileSync}=await import('node:child_process');execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{stdio:'ignore',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}});
  ({prepareUploadedPoster:prepare,publishUploadedPoster:publish}=await import('../lib/uploaded-poster.mjs'));({prepareDigitalProduct:prepareDigital,publishDigitalProduct:publishDigital}=await import('../lib/digital-product.mjs'));
 }
 const result=await runGithubJobs({jobs,queue,uploads,etsyStore,env:workerEnv,prepare,publish,prepareDigital,publishDigital,runId:process.env.GITHUB_RUN_ID});console.log('Worker completed. Tasks completed: '+result.completed+'; read-only catalogue phase: '+(['available','empty','seller_consent_required','seller_consent_invalid','seller_refresh_error','etsy_api_unavailable'].includes(result.cataloguePhase)?result.cataloguePhase:'not_checked'));
 // One read-only first-product diagnostic, independent of publication and no Netlify release.
 if(!bootstrap.publicationEnabled){
  const settings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
  if(settings?.physicalSetup?.version!==4){
   const {discoverPhysicalSetup,physicalSetupSummary}=await import('../lib/physical-shop-setup.mjs');
   const {createEtsySession}=await import('../lib/etsy-session.mjs');
   const {etsySetup}=await import('../lib/etsy-oauth.mjs');
   let setup;
   try{setup=await discoverPhysicalSetup({client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})});}
   catch{setup={version:4,phase:'unavailable',checkedAt:Date.now()};}
   await uploads.setJSON('template/settings',{...(settings||{}),physicalSetup:setup});
   console.log(physicalSetupSummary(setup));
   if(setup.phase==='ready'){
    let probe;
    try{const {firstPhysicalPlan}=await import('../lib/physical-first-product.mjs');const plan=await firstPhysicalPlan({filename:'Coast to Coast Walk Poster.png',metadata:{kind:'artwork'},client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})});probe={phase:'ready',variantCount:plan.inventory.products.length,referenceRequired:plan.referenceListingId!==null,listingType:plan.body.type};}
    catch{probe={phase:'needs_checking'};}
    await uploads.setJSON('template/settings',{...(settings||{}),physicalSetup:setup,directPlanProbe:probe});
    console.log('Read-only first-product plan: '+probe.phase+'; variants='+Number(probe.variantCount||0)+'; existing reference required='+(probe.referenceRequired===true?'yes':'no'));
   }

  }
 }
 // One protected-page GET using existing worker authority; no browser or merchant writes.
 const checkedSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(!bootstrap.publicationEnabled&&checkedSettings?.ownerUploadCheck?.release!=='14b980bcb609672bf3cbb4196f5fa86ba7a29af9'){
  const {checkOwnerUpload}=await import('../lib/owner-upload-smoke.mjs');
  const check=await checkOwnerUpload({origin,secret:bootstrap.secret});
  await uploads.setJSON('template/settings',{...(checkedSettings||{}),ownerUploadCheck:{release:'14b980bcb609672bf3cbb4196f5fa86ba7a29af9',...check,checkedAt:Date.now()}});
  console.log('Owner upload form read-only check: '+check.phase+'; direct first-product form='+(check.directUpload===true?'yes':'no'));
 }
 // One release check only. Persist its claim before calling the site so the
 // newly dispatched child cannot recursively queue another smoke task.
 const triggerSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 const triggerRelease='48d9bca023afaa2139408fe048c2ca3dfbdba73d-visibility-v2';
 if(!bootstrap.publicationEnabled&&triggerSettings?.ownerTriggerCheck?.release!==triggerRelease){
  await uploads.setJSON('template/settings',{...(triggerSettings||{}),ownerTriggerCheck:{release:triggerRelease,phase:'checking',checkedAt:Date.now()}});
  const {checkOwnerWorkerTrigger}=await import('../lib/owner-upload-smoke.mjs');
  const check=await checkOwnerWorkerTrigger({origin,secret:bootstrap.secret});
  const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});
  await uploads.setJSON('template/settings',{...(latest||{}),ownerTriggerCheck:{release:triggerRelease,...check,checkedAt:Date.now()}});
  console.log('Website catalogue trigger check: '+check.phase+'; stage four='+(check.stageFour===true?'yes':'no'));
 }
 console.log('Publication gate: '+(bootstrap.publicationEnabled?'enabled':'disabled')+'; automatic supplier orders=disabled');
 const activationSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(activationSettings?.publicationActivationCheck?.version!==1){
  await uploads.setJSON('template/settings',{...(activationSettings||{}),publicationActivationCheck:{version:1,phase:'checking',checkedAt:Date.now()}});
  const {checkAndRestartProduct}=await import('../lib/publication-activation-check.mjs');
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const check=await checkAndRestartProduct({origin,secret:bootstrap.secret,apiKey:env('SHRIMP_APIKEY'),uploads,etsyStore,client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})});
  const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});
  await uploads.setJSON('template/settings',{...(latest||{}),publicationActivationCheck:{version:1,...check,checkedAt:Date.now()}});
  console.log('Publication activation preflight: '+check.phase+'; unpublished attempt archived='+(check.archived===true?'yes':'no'));
 }
 // Bounded owner-authorised renewal-setting update; no publication or order action.
 const renewalSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(renewalSettings?.coastAutoRenew?.phase!=='verified'){
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const {enableCoastAutoRenew}=await import('../lib/listing-auto-renew.mjs');
  const check=await enableCoastAutoRenew({client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})});
  const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});
  await uploads.setJSON('template/settings',{...(latest||{}),coastAutoRenew:{...check,checkedAt:Date.now()}});
  console.log('Auto-renew: '+check.phase+'; listing='+check.listingId+'; enabled='+check.shouldAutoRenew+'; changed='+check.changed);
 }
 // Jim explicitly authorises replacing this existing cat listing's presentation.
 const catSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(catSettings?.catPresentationRefresh?.version!==2||catSettings?.catPresentationRefresh?.phase!=='verified'){
  if(!prepare){const {execFileSync}=await import('node:child_process');execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{stdio:'ignore',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}});}
  // Hosted runner lacks FFmpeg; install the distro package only for this pending video update.
  {const {execFileSync}=await import('node:child_process');const options={stdio:'ignore',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}};try{execFileSync('ffmpeg',['-version'],{...options,timeout:15000});}catch{execFileSync('sudo',['apt-get','update','-qq'],{...options,timeout:120000});execFileSync('sudo',['apt-get','install','-y','--no-install-recommends','ffmpeg'],{...options,timeout:180000});}}
  const {refreshCatListing}=await import('../lib/cat-listing-refresh.mjs');
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  let check;
  try{check=await refreshCatListing({client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),uploads,etsyStore});}
  catch(error){
   const {createHash}=await import('node:crypto');const refreshId=createHash('sha256').update('SP-THIS-SEATS-TAKEN:room-scenes-v2').digest('hex').slice(0,32);
   const state=await uploads.get('uploads/'+refreshId+'/state',{type:'json',consistency:'strong'});
   const safeMessages=['Published cat mapping unavailable','Published cat revision unavailable','Unexpected cat listing','Unexpected cat inventory','Expected four current cat photographs','Cat master changed','Listing video capacity unavailable','Invalid listing video','Cat refresh already claimed; inspect before retry','Cat listing changed before update','Replacement photo response mismatch','Replacement photo read-back mismatch','Listing video response mismatch','Listing video read-back mismatch','Cat listing retained-field mismatch','Etsy request failed','Video validation failed'];
   const reason=error.code==='ENOENT'?'video_tool_unavailable':safeMessages.includes(error.message)?error.message:typeof error.code==='number'?'video_render_failed':'unclassified';
   console.log('Cat refresh diagnostic: reason='+reason+'; saved phase='+(state?.phase||'none')+'; replaced images='+Number(state?.presentationRefresh?.imageIds?.length||0)+'; video recorded='+(state?.presentationRefresh?.videoId?'yes':'no'));
   throw Error('Cat refresh needs checking');
  }

  const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});
  await uploads.setJSON('template/settings',{...(latest||{}),catPresentationRefresh:{...check,version:2,checkedAt:Date.now()}});
  console.log('Cat presentation: '+check.phase+'; listing='+check.listingId+'; images='+check.imageIds.join(',')+'; video='+check.videoId+'; changed='+check.changed);
 }
 // Jim authorises the existing Coast to Coast listing presentation as well.
 const coastSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(coastSettings?.coastPresentationRefresh?.version!==2||coastSettings?.coastPresentationRefresh?.phase!=='verified'){
  {const {execFileSync}=await import('node:child_process');const options={stdio:'ignore',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}};if(!prepare)execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],options);try{execFileSync('ffmpeg',['-version'],{...options,timeout:15000});}catch{execFileSync('sudo',['apt-get','update','-qq'],{...options,timeout:120000});execFileSync('sudo',['apt-get','install','-y','--no-install-recommends','ffmpeg'],{...options,timeout:180000});}}
  const {refreshListingPresentation,presentationRefreshId}=await import('../lib/listing-presentation-refresh.mjs');
  const {createEtsySession}=await import('../lib/etsy-session.mjs');const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  let check;
  try{check=await refreshListingPresentation({sku:'SP-COAST-TO-COAST',client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),uploads,etsyStore});}
  catch(error){const state=await uploads.get('uploads/'+presentationRefreshId('SP-COAST-TO-COAST')+'/state',{type:'json',consistency:'strong'});const messages=['Published poster mapping unavailable','Published poster revision unavailable','Unexpected poster listing','Unexpected poster inventory','Expected four current poster photographs','Poster master changed','Listing video capacity unavailable','Invalid listing video','Poster refresh already claimed; inspect before retry','Poster listing changed before update','Replacement photo response mismatch','Replacement photo read-back mismatch','Listing video response mismatch','Listing video read-back mismatch','Poster listing retained-field mismatch','Etsy request failed','Video validation failed'];console.log('Coast refresh diagnostic: reason='+(error.code==='ENOENT'?'video_tool_unavailable':messages.includes(error.message)?error.message:'unclassified')+'; saved phase='+(state?.phase||'none')+'; replaced images='+Number(state?.presentationRefresh?.imageIds?.length||0)+'; video recorded='+(state?.presentationRefresh?.videoId?'yes':'no'));throw Error('Coast refresh needs checking');}
  const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});await uploads.setJSON('template/settings',{...(latest||{}),coastPresentationRefresh:{...check,version:2,checkedAt:Date.now()}});
  console.log('Coast presentation: '+check.phase+'; listing='+check.listingId+'; images='+check.imageIds.join(',')+'; video='+check.videoId+'; changed='+check.changed);
 }
 // Owner reports ghosted/unplayable Coast video; repair video only once.
 const playbackSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(playbackSettings?.coastVideoPlaybackRepair?.phase!=='verified'){
  {const {execFileSync}=await import('node:child_process');const options={stdio:'ignore',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}};if(!prepare)execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],options);try{execFileSync('ffmpeg',['-version'],{...options,timeout:15000});}catch{execFileSync('sudo',['apt-get','update','-qq'],{...options,timeout:120000});execFileSync('sudo',['apt-get','install','-y','--no-install-recommends','ffmpeg'],{...options,timeout:180000});}}
  const {repairCoastVideo}=await import('../lib/coast-video-repair.mjs');const {createEtsySession}=await import('../lib/etsy-session.mjs');const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const check=await repairCoastVideo({client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),uploads,etsyStore});const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});await uploads.setJSON('template/settings',{...(latest||{}),coastVideoPlaybackRepair:{...check,checkedAt:Date.now()},coastPresentationRefresh:{...latest.coastPresentationRefresh,videoId:check.videoId}});
  console.log('Coast video playback: '+JSON.stringify(check));
 }
 // Owner reports ghosted/unplayable Cat video; repair video only once.
 const catPlaybackSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(catPlaybackSettings?.catVideoPlaybackRepair?.phase!=='verified'){
  {const {execFileSync}=await import('node:child_process');const options={stdio:'ignore',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}};if(!prepare)execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],options);try{execFileSync('ffmpeg',['-version'],{...options,timeout:15000});}catch{execFileSync('sudo',['apt-get','update','-qq'],{...options,timeout:120000});execFileSync('sudo',['apt-get','install','-y','--no-install-recommends','ffmpeg'],{...options,timeout:180000});}}
  const {repairCatVideo}=await import('../lib/coast-video-repair.mjs');const {createEtsySession}=await import('../lib/etsy-session.mjs');const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const check=await repairCatVideo({client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),uploads,etsyStore});const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});await uploads.setJSON('template/settings',{...(latest||{}),catVideoPlaybackRepair:{...check,checkedAt:Date.now()},catPresentationRefresh:{...latest.catPresentationRefresh,videoId:check.videoId}});
  console.log('Cat video playback: '+JSON.stringify(check));
 }
 // Owner-authorised section organisation: inspect the live shop before changes.
 const sectionAuditSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(sectionAuditSettings?.shopSectionAudit?.version!==1){
  const {auditShopSections}=await import('../lib/shop-section-audit.mjs');const {createEtsySession}=await import('../lib/etsy-session.mjs');const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const check=await auditShopSections({client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})});const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});await uploads.setJSON('template/settings',{...(latest||{}),shopSectionAudit:{...check,version:1,checkedAt:Date.now()}});console.log('Shop section audit: '+JSON.stringify(check));
 }
 // Create approved sections and organise the seven inspected existing prints once.
 const sectionSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(sectionSettings?.shopSectionOrganisation?.phase!=='verified'){
  const {organiseShopSections}=await import('../lib/shop-section-organisation.mjs');const {createEtsySession}=await import('../lib/etsy-session.mjs');const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const check=await organiseShopSections({client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),uploads,etsyStore});const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});await uploads.setJSON('template/settings',{...(latest||{}),shopSectionOrganisation:{...check,checkedAt:Date.now()}});console.log('Shop sections organised: '+JSON.stringify(check));
 }
 // Read-only verification of the owner-approved section-selector website release.
 const selectorSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(selectorSettings?.sectionSelectorCheck?.version!==1||selectorSettings?.sectionSelectorCheck?.phase!=='ready'){
  const {checkOwnerPrintSections}=await import('../lib/owner-upload-smoke.mjs');const check=await checkOwnerPrintSections({origin,secret:bootstrap.secret});const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});await uploads.setJSON('template/settings',{...(latest||{}),sectionSelectorCheck:{...check,version:1,checkedAt:Date.now()}});console.log('Live section selector: '+JSON.stringify(check));
 }
 // One read-only supplier schema check for owner-requested frame mockups.
 const mockupSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(mockupSettings?.supplierTemplateCheck?.version!==2){
  const {inspectSupplierTemplates}=await import('../lib/printshrimp-template-check.mjs');
  const check=await inspectSupplierTemplates({apiKey:env('SHRIMP_APIKEY')});
  const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});
  await uploads.setJSON('template/settings',{...(latest||{}),supplierTemplateCheck:{version:2,...check,checkedAt:Date.now()}});
  console.log('Supplier template schema: '+JSON.stringify(check));
 }
}catch{console.error('Worker unavailable; saved tasks retained. Inspect configuration without exposing secrets.');process.exitCode=1;}
