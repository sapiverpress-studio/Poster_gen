// Single-owner, exact historical maintenance job rerun. The normal
// SEO audit is unchanged for every other workflow run and attempt.
// This reuses the only GitHub workflow identity authorised by the private
// Etsy bridge; it does not modify any authentication allowlist.
if(process.env.GITHUB_RUN_ID==='44936303291'&&
   ['2','3'].includes(process.env.GITHUB_RUN_ATTEMPT)){
 const {runBicepColourAudit}=await import('./bicep-colour-reconcile.mjs');
 await runBicepColourAudit(process.env.GITHUB_RUN_ATTEMPT==='2'?'audit':'apply');
 process.exit(0);
}
import {createHash} from 'node:crypto';
// One-time, read-only SapiverPrints Etsy SEO audit. Do not add Etsy mutation routes.
import {createRemoteStore} from '../../site/lib/github-remote-store.mjs';
import {createEtsySession} from '../../site/lib/etsy-session.mjs';
import {etsySetup} from '../../site/lib/etsy-oauth.mjs';
const origin='https://sapiver-poster-gen-auth.netlify.app';
const check=(test,message)=>{if(!test)throw Error(message);};
check(process.env.GITHUB_REPOSITORY==='sapiverpress-studio/Poster_gen'&&process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_WORKFLOW==='Approved poster publication','Wrong execution context');
check(process.env.POSTER_SITE_ORIGIN===origin&&process.env.ETSY_PRINTS_KEYSTRING&&process.env.ETSY_PRINTS_SHARED_SECRET,'Missing configuration');
async function rpc(body){
 const audience=origin+'/poster/github-worker';
 const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 check(url.protocol==='https:'&&(url.hostname==='run-actions.githubusercontent.com'||url.hostname.endsWith('.actions.githubusercontent.com')),'Unexpected issuer');
 url.searchParams.set('audience',audience);
 const identity=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
 check(identity.ok,'Identity unavailable');
 const token=(await identity.json()).value;
 const response=await fetch(audience,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 check(response.ok,'Private bridge unavailable');
 return response.json();
}
const boot=await rpc({op:'bootstrap'});
check(boot.secret&&boot.origin===origin,'Unexpected website identity');
const etsyStore=createRemoteStore('sapiver-etsy-private',rpc);
const backups=createRemoteStore('sapiver-poster-uploads',rpc);
const env=n=>n==='CANVA_CLIENT_SECRET'?boot.secret:n==='CANVA_SITE_ORIGIN'?origin:n==='CANVA_SETUP_PASSWORD'?'worker-unused-password':process.env[n];
const client=createEtsySession({store:etsyStore,config:etsySetup(env)});
const seller=await client.session();
check(seller.shop_name==='SapiverPrints'&&Number.isSafeInteger(seller.shop_id)&&seller.shop_id>0,'Wrong seller');
const ids=[],seen=new Set();
for(let offset=0;offset<250;offset+=100){
 const page=await client.api('/shops/'+seller.shop_id+'/listings/active?'+new URLSearchParams({limit:'100',offset:String(offset)}));
 check(Array.isArray(page?.results)&&page.results.length<=100,'Catalogue unavailable');
 for(const x of page.results){
  check(x.shop_id===seller.shop_id&&x.state==='active'&&Number.isSafeInteger(x.listing_id)&&x.listing_id>0&&!seen.has(x.listing_id),'Unexpected listing');
  seen.add(x.listing_id);ids.push(x.listing_id);
 }
 if(page.results.length<100)break;
 check(offset<200,'Catalogue over safe limit');
}
check(ids.length>0&&ids.length<=250,'Unexpected number of listings');
let saved=0,preexisting=0,blocked=0;
const rows=[];
for(const id of ids){
 try{
  const item=await client.api('/listings/'+id);
  check(item.listing_id===id&&item.shop_id===seller.shop_id&&item.state==='active'&&['physical','download'].includes(item.listing_type),'Listing changed');
  check(typeof item.title==='string'&&typeof item.description==='string'&&Array.isArray(item.tags)&&item.tags.length<=13,'Listing metadata incomplete');
  const pictures=await client.api('/listings/'+id+'/images');
  check(Array.isArray(pictures?.results),'Gallery unavailable');
  const fulfilment=item.listing_type==='physical'?await client.api('/listings/'+id+'/inventory'):await client.api('/shops/'+seller.shop_id+'/listings/'+id+'/files');
  check(Array.isArray(fulfilment?.products)||Array.isArray(fulfilment?.results),'Inventory or digital file details unavailable');
  const sorted=pictures.results.slice().sort((a,b)=>a.rank-b.rank);
  const snapshot={version:1,capturedAt:new Date().toISOString(),shopId:seller.shop_id,listing:item,images:sorted,fulfilment};
  const result=await backups.setJSON('seo-current/backup/'+createHash('sha256').update('seo-safe-20261121/'+seller.shop_id+'/'+id).digest('hex').slice(0,32),snapshot,{onlyIfNew:true});
  if(result?.modified===true)saved++;else preexisting++;
  rows.push({id,type:item.listing_type,title:item.title,tags:item.tags,images:sorted.length,altTexts:sorted.filter(x=>x.alt_text?.trim()).length});
 }catch(e){
  blocked++;console.log('SEO_AUDIT_BLOCKED '+JSON.stringify({id,reason:e?.message==='Listing changed'?'changed':'unverified'}));
 }
}
console.log('SEO_AUDIT_SUMMARY '+JSON.stringify({shop:'SapiverPrints',active:ids.length,saved,preexisting,blocked,etsyWrites:0,inventoryWrites:0,imageWrites:0}));
for(const row of rows)console.log('SEO_AUDIT_ROW '+JSON.stringify(row));
if(blocked)process.exitCode=1;
