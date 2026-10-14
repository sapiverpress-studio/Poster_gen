import {randomBytes} from 'node:crypto';
import {seal} from './oauth.mjs';
// Existing trusted worker performs one short-lived, read-only application check.
// No persistent credential, browser login, product, or merchant write is created.
export async function checkOwnerUpload({origin,secret,request=fetch,clock=()=>Date.now()}){
 try{
  const target=new URL(origin);if(target.protocol!=='https:'||target.origin!==origin)throw Error('Invalid origin');
  const token=seal({csrf:randomBytes(18).toString('base64url'),expiry:clock()+60000},secret,'poster-owner');
  const response=await request(origin+'/poster/upload',{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Cookie:'__Host-poster_owner='+token,'Cache-Control':'no-store'}});
  const html=response.status===200?await response.text():'';
  const formPresent=html.includes('id="poster-upload-form"'),directUpload=html.includes('No previous listing needed.');
  return {phase:response.status===200&&formPresent&&directUpload?'ready':'not_ready',httpStatus:response.status,formPresent,directUpload};
 }catch{return {phase:'unavailable'};}
}
// Queue one read-only catalogue check through the actual owner endpoint. The
// trusted worker retains its transient session in memory; no merchant writes.
export async function checkOwnerWorkerTrigger({origin,secret,request=fetch,clock=()=>Date.now()}){
 try{
  const target=new URL(origin);if(target.protocol!=='https:'||target.origin!==origin)throw Error('Invalid origin');
  const csrf=randomBytes(18).toString('base64url'),token=seal({csrf,expiry:clock()+60000},secret,'poster-owner');
  const headers={Cookie:'__Host-poster_owner='+token,'Cache-Control':'no-store'};
  const form=await request(origin+'/poster/upload',{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers});
  const html=form.status===200?await form.text():'';
  const stageFour=html.includes('id="physical-fulfilment-step"');
  if(!stageFour)return {phase:'not_ready',stageFour:false};
  const response=await request(origin+'/poster/catalog/refresh',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{...headers,Origin:origin,'X-Poster-CSRF':csrf}});
  const result=response.status===202?await response.json():null;
  return {phase:response.status===202&&result?.phase==='pending'?'queued':'not_ready',httpStatus:response.status,stageFour};
 }catch{return {phase:'unavailable'};}
}
