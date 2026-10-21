import {getStore} from '@netlify/blobs';
import {createHash,timingSafeEqual} from 'node:crypto';
export default async function supplierArtwork(req){
 try{
  if(req.method!=='GET')return new Response(null,{status:405});
  const u=new URL(req.url);
  if(u.searchParams.getAll('ticket').length!==1||u.searchParams.size!==1||
   !/^[A-Za-z0-9_-]{43}$/.test(u.searchParams.get('ticket')||''))return new Response(null,{status:404});
  const uploads=getStore('sapiver-poster-uploads');
  const state=await uploads.get('transfers/'+u.searchParams.get('ticket'),{type:'json',consistency:'strong'});
  if(state?.revoked!==false||!Number.isFinite(state.expiresAt)||state.expiresAt<Date.now()||
   !/^uploads\/[A-Za-z0-9_-]{32}\/supplier-master\.jpg$/.test(state.fileKey||'')||
   !Number.isInteger(state.bytes)||state.bytes<100||state.bytes>17_500_000||
   !/^[a-f0-9]{64}$/.test(state.sha256||''))return new Response(null,{status:404});
  const data=Buffer.from(await uploads.get(state.fileKey,{type:'arrayBuffer',consistency:'strong'}));
  const h=Buffer.from(createHash('sha256').update(data).digest('hex'));
  const expected=Buffer.from(state.sha256);
  if(data.length!==state.bytes||h.length!==expected.length||!timingSafeEqual(h,expected))return new Response(null,{status:409});
  return new Response(data,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="approved-print.jpg"'}});
 }catch{return new Response(null,{status:404});}
}
export const config={path:'/poster/supplier-artwork.jpg',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:180,windowLimit:120}};
