import {createRemoteStore} from '../lib/github-remote-store.mjs';
// Never print provider bodies, tokens, capabilities, artwork or exception text.
try{
 const origin=process.env.POSTER_SITE_ORIGIN;
 if(origin!=='https://sapiver-poster-gen-auth.netlify.app')throw Error('Unexpected origin');
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
 const jobs=(await rpc({op:'list',store:'sapiver-github-queue',prefix:'jobs/'})).jobs;
 const {runGithubJobs}=await import('../lib/github-publication.mjs');
 let prepare,publish;
 if(jobs.some(j=>j.action!=='oauth')){
  // Install image dependencies only when there is artwork work, not every poll.
  const {execFileSync}=await import('node:child_process');execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{stdio:'ignore',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}});
  ({prepareUploadedPoster:prepare,publishUploadedPoster:publish}=await import('../lib/uploaded-poster.mjs'));
 }
 const result=await runGithubJobs({jobs,queue,uploads,etsyStore,env:workerEnv,prepare,publish});console.log('Worker completed. Tasks completed: '+result.completed);
}catch{console.error('Worker unavailable; saved tasks retained. Inspect configuration without exposing secrets.');process.exitCode=1;}
