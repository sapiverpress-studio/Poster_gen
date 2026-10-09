// Edge-compatible: no image decoding, hashing or full buffering at the edge.
export function createMasterStreamHandler({store,clock=()=>Date.now()}) {
 return async req=>{
  const headers={'Cache-Control':'private, no-store','Netlify-CDN-Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
  if(!['GET','HEAD'].includes(req.method))return new Response(null,{status:405,headers});
  const params=new URL(req.url).searchParams,ticket=params.get('ticket');
  if(params.getAll('ticket').length!==1||!/^[A-Za-z0-9_-]{43}$/.test(ticket||''))return new Response(null,{status:403,headers});
  try {
   const privateStore=store(),grant=await privateStore.get('transfers/'+ticket,{type:'json',consistency:'strong'});
   if(!grant||grant.revoked||!Number.isFinite(grant.expiresAt)||grant.expiresAt<=clock()||grant.expiresAt>clock()+15*60*1000||grant.fileKey!=='approved/DAHXb1PdJlM/1791485393/master.png'||!Number.isSafeInteger(grant.bytes)||grant.bytes<1||grant.bytes>50_000_000||!/^[0-9a-f]{64}$/.test(grant.sha256||''))return new Response(null,{status:403,headers});
   headers['Content-Type']='image/png';headers['Content-Length']=String(grant.bytes);
   if(req.method==='HEAD')return new Response(null,{headers});
   const stream=await privateStore.get(grant.fileKey,{type:'stream',consistency:'strong'});
   if(!stream){delete headers['Content-Length'];return new Response(null,{status:404,headers});}
   return new Response(stream,{headers});
  }catch {delete headers['Content-Length'];return new Response(null,{status:503,headers});}
 };
}
