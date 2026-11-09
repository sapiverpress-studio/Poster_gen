import {workerFailure,reportWorkerResult} from '../lib/worker-diagnostics.mjs';
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
 const env=n=>n==='CANVA_CLIENT_SECRET'?bootstrap.secret:n==='CANVA_SITE_ORIGIN'?origin:n==='POSTER_PUBLICATION_ENABLED'?(bootstrap.publicationEnabled?'true':'false'):process.env[n];
 // etsySetup needs owner-password presence, but Actions never authenticates owners.
 const workerEnv=n=>n==='CANVA_SETUP_PASSWORD'?'worker-unused-password':env(n);
 // Original failed Streak trio run, attempt THREE only. Never replay the
 // publish job or create another Etsy listing. Existing draft was diagnosed
 // read-only on attempt TWO; any changed field fails closed.
 if(process.env.GITHUB_RUN_ID==='42615571498'&&process.env.GITHUB_RUN_ATTEMPT==='3'){
  if(process.env.GITHUB_REPOSITORY!=='sapiverpress-studio/Poster_gen'||
     process.env.GITHUB_REF!=='refs/heads/main'||
     process.env.GITHUB_WORKFLOW!=='Approved poster publication')
   throw Error('Wrong Streak trio reconciliation context');
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const {verifyExistingStreakTrio}=await import('../lib/streak-trio-inplace-verification.mjs');
  const result=await verifyExistingStreakTrio({
   uploads,etsyStore,env:workerEnv,
   client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})
  });
  console.log('STREAK_TRIO_EXISTING_DRAFT_RECOVERY '+JSON.stringify(result));
  process.exit(result.phase==='draft_verified'?0:1);
 }
 // Owner-approved original Streak trio draft audit, read-only.
 // Restricted to the FAILED worker run, second attempt. No queue replay.
 if(process.env.GITHUB_RUN_ID==='42615571498'&&process.env.GITHUB_RUN_ATTEMPT==='2'){
  if(process.env.GITHUB_REPOSITORY!=='sapiverpress-studio/Poster_gen'||
     process.env.GITHUB_REF!=='refs/heads/main'||
     process.env.GITHUB_WORKFLOW!=='Approved poster publication')
   throw Error('Invalid trusted Streak trio audit execution context');
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const {inspectStreakTrioOriginalDraft}=await import('../lib/streak-trio-original-draft-audit.mjs');
  const report=await inspectStreakTrioOriginalDraft({
   uploads,etsyStore,apiKey:env('SHRIMP_APIKEY'),
   client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})
  });
  console.log('STREAK_TRIO_ORIGINAL_READ_ONLY '+JSON.stringify(report));
  process.exit(0);
 }
 // Trusted owner-approved workflow, attempt FOUR only; prior attempt failed
 // during a 52-request parallel monthly quota scan before confirmed completion.
 // Attempt TWO exited before library import because sharp is not installed.
 // Install pinned image dependencies before importing bundle-preparation code.
 // Never poll or replay other queued merchant work on this attempt.
 if(process.env.GITHUB_RUN_ID==='42609030669'&&process.env.GITHUB_RUN_ATTEMPT==='4'){
  if(process.env.GITHUB_REPOSITORY!=='sapiverpress-studio/Poster_gen'||
     process.env.GITHUB_REF!=='refs/heads/main'||
     process.env.GITHUB_WORKFLOW!=='Approved poster publication')
   throw Error('Wrong trusted recovery workflow');
  let stage='dependencies';
  try{
   const {execFileSync}=await import('node:child_process');
   execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{
    stdio:'ignore',timeout:180000,
    env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}
   });
   stage='verified_trio_source_import';
   const {createEtsySession}=await import('../lib/etsy-session.mjs');
   const {etsySetup}=await import('../lib/etsy-oauth.mjs');
   const {prepareMissingStreakNov9Trio}=await import('../lib/streak-nov9-missing-trio.mjs');
   stage='existing_source_audit_and_review';
   const result=await prepareMissingStreakNov9Trio({
    uploads,client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),
    env:workerEnv
   });
   console.log('STREAK_NOV9_TRUSTED_RECOVERY '+JSON.stringify(result));
   process.exit(['ready_for_approval','existing'].includes(result.phase)?0:1);
  }catch(error){
   const msg=String(error?.message||'unavailable').slice(0,180).replace(/[^a-zA-Z0-9 ,.:;_\-()/]/g,'');
   console.log('STREAK_NOV9_RECOVERY_STOP stage='+stage+' reason='+msg);
   process.exit(1);
  }
 }
 // One-time Streak 9 Nov THREE existing listings -> ONE owner-reviewable
 // trio. No ordinary worker queue processing and no merchant listing writes.
 if(process.env.STREAK_NOV9_TRIO_RECOVERY==='owner-20261109-one-trio-only'){
  if(process.env.GITHUB_REPOSITORY!=='sapiverpress-studio/Poster_gen'||process.env.GITHUB_REF!=='refs/heads/feature/canva-oauth-callback')
   throw Error('One-off Streak recovery is restricted to the production-linked repository');
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const {prepareMissingStreakNov9Trio}=await import('../lib/streak-nov9-missing-trio.mjs');
  const result=await prepareMissingStreakNov9Trio({
   uploads,client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),
   env:workerEnv
  });
  console.log('STREAK_NOV9_TRIO_RECOVERY '+JSON.stringify(result));
  process.exit(['ready_for_approval','existing'].includes(result.phase)?0:1);
 }
 // Single-use owner-authorised recovery of the precise Etsy draft found
 // in run 42600068671 attempt 2. Attempt THREE exits without polling or
 // replaying any other merchant work. Never creates an Etsy listing.
 if(process.env.GITHUB_RUN_ID==='42600068671'&&process.env.GITHUB_RUN_ATTEMPT==='3'){
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const {recoverInsomniaDraft}=await import('../lib/insomnia-existing-draft-recovery.mjs');
  const result=await recoverInsomniaDraft({
   uploads,etsyStore,client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),
   env:workerEnv
  });
  console.log('INSOMNIA_INPLACE_RECOVERY '+JSON.stringify(result));
  process.exit(result.phase==='published'?0:1);
 }
 // Isolated emergency diagnostic workflow, available only to a specific
 // trusted GitHub Action environment. No ordinary tasks or seller mutations.
 // The workflow runs once on its own filename and is removed after diagnosis.
 if(process.env.INSOMNIA_READ_ONLY_DIAG==='owner-20261109'){
  if(process.env.GITHUB_REPOSITORY!=='sapiverpress-studio/Poster_gen'||process.env.GITHUB_REF!=='refs/heads/feature/canva-oauth-callback')
   throw Error('Wrong read-only diagnostic execution context');
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const {auditInsomniaDraft}=await import('../lib/insomnia-draft-diagnostic.mjs');
  const result=await auditInsomniaDraft({
   uploads,etsyStore,apiKey:env('SHRIMP_APIKEY'),
   client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})
  });
  console.log('INSOMNIA_READ_ONLY_AUDIT '+JSON.stringify(result));
  process.exit(0);
 }
 // Exact read-only investigation of Insomnia - On Strike. The original
 // publication worker 42600068671 failed after creating its Etsy draft.
 // Attempt TWO never polls queued jobs, creates an Etsy listing, or writes.
 if(process.env.GITHUB_RUN_ID==='42600068671'&&process.env.GITHUB_RUN_ATTEMPT==='2'){
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const {auditInsomniaDraft}=await import('../lib/insomnia-draft-diagnostic.mjs');
  const result=await auditInsomniaDraft({
   uploads,etsyStore,apiKey:env('SHRIMP_APIKEY'),
   client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})
  });
  console.log('INSOMNIA_READ_ONLY_AUDIT '+JSON.stringify(result));
  process.exit(0);
 }
 // One supplementary owner-authorised READ-ONLY verification on attempt 2
 // of the other failed Woodland audit run. No queued job may be consumed,
 // no original upgrade state changed and no merchant request other than GET.
 if(process.env.GITHUB_RUN_ID==='41789751309'&&process.env.GITHUB_RUN_ATTEMPT==='2'){
  let stage='dependencies';
  try{
   const {execFileSync}=await import('node:child_process');
   execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{
    stdio:'ignore',timeout:180000,
    env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}
   });
   stage='imports';
   const {createEtsySession}=await import('../lib/etsy-session.mjs');
   const {etsySetup}=await import('../lib/etsy-oauth.mjs');
   const {auditWoodlandTrioFrames}=await import('../lib/woodland-trio-frame-diagnostic.mjs');
   stage='readbacks';
   const result=await auditWoodlandTrioFrames({
    uploads,client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),
    env:workerEnv
   });
   console.log('WOODLAND_TRIO_DETAIL_READ_ONLY '+JSON.stringify(result));
   process.exit(0);
  }catch{
   console.log('WOODLAND_TRIO_DETAIL_READ_ONLY unavailable_at='+stage+'; no merchant or saved state was changed');
   process.exit(1);
  }
 }
 // Attempt 2 of the original failed frame-audit exited at module import
 // before the read-only report, because sharp was not installed on this path.
 // Attempt 3 only loads image dependencies with scripts disabled, then performs
 // the exact-two-listing diagnosis and EXITS before collecting queued work.
 // Neither attempt can replay a merchant mutation, clear a claim or publish.
 if(process.env.GITHUB_RUN_ID==='41789870058'&&process.env.GITHUB_RUN_ATTEMPT==='3'){
  let stage='dependencies';
  try{
   const {execFileSync}=await import('node:child_process');
   execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{
    stdio:'ignore',timeout:180000,
    env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}
   });
   stage='imports';
   const {createEtsySession}=await import('../lib/etsy-session.mjs');
   const {etsySetup}=await import('../lib/etsy-oauth.mjs');
   const {auditWoodlandTrioFrames}=await import('../lib/woodland-trio-frame-diagnostic.mjs');
   stage='readbacks';
   const result=await auditWoodlandTrioFrames({
    uploads,client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),
    env:workerEnv
   });
   console.log('WOODLAND_TRIO_FRAME_READ_ONLY '+JSON.stringify(result));
   process.exit(0);
  }catch{
   console.log('WOODLAND_TRIO_FRAME_READ_ONLY unavailable_at='+stage+'; no saved records or merchants changed');
   process.exit(1);
  }
 }
 // Retry only the exact owner-authorised Streak request whose first worker
 // run was blocked by a denied private bridge key before reaching Etsy.
 // Do not rerun any other queued or unrelated merchant task on this path.
 if(process.env.GITHUB_RUN_ID==='41682084491'&&process.env.GITHUB_RUN_ATTEMPT==='2'){
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const {recoverOriginalStreakSection}=await import('../lib/streak-section-recovery.mjs');
  const result=await recoverOriginalStreakSection({
   runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,
   uploads,etsyStore,client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})
  });
  console.log('Original Streak Etsy API request reconciled; status='+result.phase+
   '; section ID='+result.sectionId+'; reused existing='+(!result.created));
  process.exit(0);
 }

 // One strict recovery of the owner-approved Trio Collection section
 // request whose original worker run failed on the bridge key allowlist.
 // Do not poll or replay any other queued merchant task on this attempt.
 if(process.env.GITHUB_RUN_ID==='41998001142'&&process.env.GITHUB_RUN_ATTEMPT==='2'){
  const {createEtsySession}=await import('../lib/etsy-session.mjs');
  const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const {recoverOriginalTrioSection}=await import('../lib/streak-section-recovery.mjs');
  const result=await recoverOriginalTrioSection({
   runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,
   uploads,etsyStore,client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)})
  });
  console.log('Original Trio Collection Etsy section reconciled; verified='+ (result.phase==='verified')+'; reused existing='+(!result.created));
  process.exit(0);
 }
 // Finished Etsy framed-first catalogue migration (all 37 records read back).
 // One-off rerun triggers intentionally retired; normal queue handling follows.
 if(process.env.GITHUB_RUN_ID==='39606841309'&&process.env.GITHUB_RUN_ATTEMPT==='2'){
  const {createEtsySession}=await import('../lib/etsy-session.mjs');const {etsySetup}=await import('../lib/etsy-oauth.mjs');
  const {auditAlignment}=await import('./woodland-alignment-audit.mjs');
  await auditAlignment({uploads,client:createEtsySession({store:etsyStore,config:etsySetup(workerEnv)}),apiKey:env('SHRIMP_APIKEY')});
  process.exit(0);
 }
 // The Robin draft audit is allowed only on attempt TWO of its original
 // failed workflow. The branch never polls queued jobs or mutates merchants.
 // Historical Robin publication is complete; do not execute one-off recovery in ordinary worker.
 // The completed butterfly one-off no longer gates ordinary worker jobs.
 await etsyStore.setJSON('github-config',{clientId:process.env.ETSY_PRINTS_KEYSTRING});
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
 if(reportWorkerResult(result))process.exitCode=1;
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
 if(selectorSettings?.sectionSelectorCheck?.version!==2||selectorSettings?.sectionSelectorCheck?.phase!=='ready'){
  const {checkOwnerPrintSections}=await import('../lib/owner-upload-smoke.mjs');const check=await checkOwnerPrintSections({origin,secret:bootstrap.secret});const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});await uploads.setJSON('template/settings',{...(latest||{}),sectionSelectorCheck:{...check,version:2,checkedAt:Date.now()}});console.log('Live section selector: '+JSON.stringify(check));
 }
 // Completed fox recovery was verified on 2026-10-14. The one-off merchant
 // rescue/audit must not gate unrelated future poster publication jobs.
 // One read-only supplier schema check for owner-requested frame mockups.
 const mockupSettings=await uploads.get('template/settings',{type:'json',consistency:'strong'});
 if(mockupSettings?.supplierTemplateCheck?.version!==2){
  const {inspectSupplierTemplates}=await import('../lib/printshrimp-template-check.mjs');
  const check=await inspectSupplierTemplates({apiKey:env('SHRIMP_APIKEY')});
  const latest=await uploads.get('template/settings',{type:'json',consistency:'strong'});
  await uploads.setJSON('template/settings',{...(latest||{}),supplierTemplateCheck:{version:2,...check,checkedAt:Date.now()}});
  console.log('Supplier template schema: '+JSON.stringify(check));
 }
 // End of standard publication job and read-only checks
}catch(error){console.error('::error::Worker stopped: '+JSON.stringify(workerFailure(error))+'. Saved tasks retained; no automatic replay.');process.exitCode=1;}
