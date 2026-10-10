import {verifyGithubIdentity} from './github-identity.mjs';
const MAX=2_000_000,STORES=new Set(['sapiver-poster-uploads','sapiver-etsy-private','sapiver-github-queue']);
const response=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function validKey(store,key){if(typeof key!=='string'||key.length>250||key.includes('..')||! /^[A-Za-z0-9_./-]+$/.test(key))return false;
 if(store==='sapiver-poster-uploads')return /^(uploads\/[A-Za-z0-9_-]{32}\/(state|master\.png|original\.zip|delivery\/[0-4]|preview-input\/[012]\.jpg|chunks\/\d+|mockups\/[0-9]\.jpg)|template\/(settings|catalog|taxonomy)|claims\/[A-Za-z0-9_-]{32}\/(prepare|publish)|runner\/[A-Za-z0-9_-]{32}\/(prepare|publish)|supplier\/[A-Za-z0-9_-]+|transfers\/[A-Za-z0-9_-]{43}|products\/[A-Za-z0-9_-]{32}\/(record|revisions\/[A-Za-z0-9_-]{32}))$/.test(key);
 if(store==='sapiver-etsy-private')return /^(primary|flows\/[A-Za-z0-9_-]+|refresh\/[0-9/]+|draft\/[A-Za-z0-9_-]+|github-config|oauth-status\/[A-Za-z0-9_-]+|sections\/[a-f0-9]{64}|products\/[A-Za-z0-9_-]{32}\/revision\/[A-Za-z0-9_-]{32}|product-create\/[A-Za-z0-9_-]{32}|digital-identity\/[a-f0-9]{64})$/.test(key);
 return /^(jobs\/[A-Za-z0-9_-]{32}|claims\/[A-Za-z0-9_-]{32})$/.test(key);
}
export function createGithubBridge({env,store,authenticate=verifyGithubIdentity}){return async req=>{
 try{
  if(req.method!=='POST')return response({error:'Method not allowed'},405);
  const origin=env('CANVA_SITE_ORIGIN');await authenticate((req.headers.get('authorization')||'').replace(/^Bearer /,''),{audience:origin+'/poster/github-worker'});
  if(Number(req.headers.get('content-length')||0)>3_000_000)return response({error:'Too large'},413);
  const raw=await req.text();if(Buffer.byteLength(raw)>3_000_000)return response({error:'Too large'},413);const b=JSON.parse(raw);
  if(b.op==='bootstrap')return response({secret:env('CANVA_CLIENT_SECRET'),origin,publicationEnabled:env('POSTER_PUBLICATION_ENABLED')==='true'});
  if(!STORES.has(b.store))throw Error('Denied');const s=store(b.store);
  if(b.op==='list'){
   if(b.store!=='sapiver-github-queue'||b.prefix!=='jobs/')throw Error('Denied');
   const found=[];for await(const page of s.list({prefix:'jobs/',paginate:true})){for(const blob of page.blobs){const task=await s.get(blob.key,{type:'json',consistency:'strong'});if(task?.phase==='queued')found.push({key:blob.key,...task});if(found.length>=10)break;}if(found.length>=10)break;}
   return response({jobs:found});
  }
  if(!validKey(b.store,b.key))throw Error('Denied');
  const options={};if(b.onlyIfNew===true)options.onlyIfNew=true;if(typeof b.onlyIfMatch==='string')options.onlyIfMatch=b.onlyIfMatch;
  if(b.op==='get'){
   if(!['text','json','arrayBuffer'].includes(b.type))throw Error('Denied');
   const result=await s.getWithMetadata(b.key,{type:b.type,consistency:'strong'});if(!result)return response({data:null});
   if(b.type==='arrayBuffer'){if(!Number.isSafeInteger(b.offset)||b.offset<0)throw Error('Denied');const bytes=Buffer.from(result.data);return response({data:bytes.subarray(b.offset,b.offset+MAX).toString('base64'),total:bytes.length,etag:result.etag,metadata:result.metadata});}
   return response({data:result.data,etag:result.etag,metadata:result.metadata});
  }
  if(b.op==='set'){
   if(!['text','json'].includes(b.type))throw Error('Denied');return response(await (b.type==='json'?s.setJSON(b.key,b.data,options):s.set(b.key,String(b.data),options)));
  }
  if(b.op==='put-part'){
   if(b.store!=='sapiver-poster-uploads'||!/^uploads\/[A-Za-z0-9_-]{32}\/(master\.png|original\.zip|delivery\/[0-4]|mockups\/[0-9]\.jpg)$/.test(b.key)||!Number.isInteger(b.part)||b.part<0||b.part>49||! /^[A-Za-z0-9_-]{32}$/.test(b.transfer))throw Error('Denied');
   const bytes=Buffer.from(b.data,'base64');if(bytes.length>MAX)throw Error('Denied');
   const key='bridge-parts/'+b.transfer+'/'+b.part;const prior=await s.get(key,{type:'arrayBuffer',consistency:'strong'});if(prior&&!Buffer.from(prior).equals(bytes))throw Error('Denied');return response(prior?{modified:true}:await s.set(key,bytes,{onlyIfNew:true}));
  }
  if(b.op==='commit-parts'){
   if(b.store!=='sapiver-poster-uploads'||!/^uploads\/[A-Za-z0-9_-]{32}\/(master\.png|original\.zip|delivery\/[0-4]|mockups\/[0-9]\.jpg)$/.test(b.key)||!Number.isInteger(b.parts)||b.parts<1||b.parts>50||! /^[A-Za-z0-9_-]{32}$/.test(b.transfer))throw Error('Denied');
   const chunks=[];for(let i=0;i<b.parts;i++){const x=await s.get('bridge-parts/'+b.transfer+'/'+i,{type:'arrayBuffer',consistency:'strong'});if(!x)throw Error('Denied');chunks.push(Buffer.from(x));}
   const bytes=Buffer.concat(chunks);if(bytes.length>(b.key.endsWith('/original.zip')?100_000_000:50_000_000))throw Error('Denied');const result=await s.set(b.key,bytes,options);for(let i=0;i<b.parts;i++)await s.delete('bridge-parts/'+b.transfer+'/'+i);return response(result);
  }
  if(b.op==='delete'){if(b.store!=='sapiver-poster-uploads'||! /^uploads\/[A-Za-z0-9_-]{32}\/chunks\/\d+$/.test(b.key))throw Error('Denied');await s.delete(b.key);return response({deleted:true});}
  throw Error('Denied');
 }catch{return response({error:'Worker request denied'},403);}
};}
