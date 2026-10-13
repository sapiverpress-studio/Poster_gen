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
