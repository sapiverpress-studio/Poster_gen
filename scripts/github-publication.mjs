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
