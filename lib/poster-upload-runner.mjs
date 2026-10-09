import {unseal} from './oauth.mjs';
import {assetKey,prepareUploadedPoster,publishUploadedPoster} from './uploaded-poster.mjs';
export function createUploadRunner({env,uploads,etsyStore,client,request=fetch,mockups,clock=()=>Date.now()}) {
 return async req=>{
  try{
   if(req.method!=='POST'||Number(req.headers.get('content-length')||0)>8192)return;
   const body=await req.text();if(Buffer.byteLength(body)>8192)return;
   const signed=unseal(body,env('CANVA_CLIENT_SECRET'),'poster-upload-run');
   if(!/^[A-Za-z0-9_-]{32}$/.test(signed.id)||!['prepare','publish'].includes(signed.action)||!Number.isFinite(signed.expiry)||signed.expiry<=clock()||signed.expiry>clock()+600000)return;
   const claim=await uploads.setJSON('runner/'+signed.id+'/'+signed.action,{at:clock()},{onlyIfNew:true});if(claim?.modified!==true)return;
   try{
    if(signed.action==='prepare'){await prepareUploadedPoster({id:signed.id,uploads,client,mockups});const a=await uploads.get(assetKey(signed.id),{type:'json',consistency:'strong'});await uploads.setJSON('template/settings',{referenceListingId:a.referenceListingId});}
    else await publishUploadedPoster({id:signed.id,approvalHash:signed.approvalHash,uploads,etsyStore,client,env,request,clock});
   }catch{const a=await uploads.get(assetKey(signed.id),{type:'json',consistency:'strong'});if(a)await uploads.setJSON(assetKey(signed.id),{...a,phase:'needs_investigation',failedAt:clock()});}
  }catch{/* Do not expose provider errors, credentials, artwork tickets or exception text. */}
 };
}
