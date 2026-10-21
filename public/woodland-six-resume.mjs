// Verified original Canva PNG chunks on a private same-origin, owner-authenticated page.
// Persist successful chunks in this phone's IndexedDB so intermittent mobile data cannot
// force a 100+ MB download to restart. Never persist credentials or a merchant write.
const DATABASE='sapiver-woodland-verified-png-chunks-v1';
const STORE='chunks';
const MAX_ATTEMPTS=5;
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));

export async function openWoodlandChunkCache({database=globalThis.indexedDB}={}){
 if(!database)return null;
 let db;
 try{
  db=await new Promise((resolve,reject)=>{
   const req=database.open(DATABASE,1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error||Error('Chunk cache unavailable'));
   req.onblocked=()=>reject(Error('Chunk cache busy'));
  });
 }catch{return null;}
 const op=(kind,key,bytes)=>{
  return new Promise((resolve,reject)=>{
   try{
    const tx=db.transaction(STORE,kind==='get'?'readonly':'readwrite');
    const req=kind==='get'?tx.objectStore(STORE).get(key):kind==='put'?tx.objectStore(STORE).put(bytes,key):tx.objectStore(STORE).clear();
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('Chunk cache failed'));
    tx.onabort=()=>reject(tx.error||Error('Chunk cache aborted'));
   }catch(e){reject(e);}
  });
 };
 return {
  async get(key){const bytes=await op('get',key);return bytes?new Uint8Array(bytes):null;},
  async put(key,bytes){await op('put',key,bytes);},
  async clear(){await op('clear');db.close();}
 };
}

export async function createResumableChunkFetcher({
 manifest,request=fetch,progress=()=>{},cache,wait=delay,maxAttempts=MAX_ATTEMPTS
}={}){
 if(manifest?.phase!=='ready'||manifest?.chunkSize!==3000000||manifest?.images?.length!==6)throw Error('Artwork manifest is not ready');
 const db=cache===undefined?await openWoodlandChunkCache():cache;
 const version=manifest.images.map(x=>x.slug+':'+x.sha256+':'+x.bytes).join('|');
 let writable=!!db;
 const key=(img,part)=>version+'|'+img.slug+'|'+part;
 const getPart=async(img,part)=>{
  if(!manifest.images.some(x=>x.slug===img.slug&&x.sha256===img.sha256&&x.bytes===img.bytes)||!Number.isSafeInteger(part)||part<0||part>=Math.ceil(img.bytes/manifest.chunkSize))throw Error('Invalid verified original');
  const expected=Math.min(manifest.chunkSize,img.bytes-part*manifest.chunkSize);
  const name=img.slug+' part '+(part+1)+'/'+Math.ceil(img.bytes/manifest.chunkSize);
  const k=key(img,part);
  if(db){try{
   const stored=await db.get(k);
   if(stored?.byteLength===expected){progress('Resuming saved '+name);return stored;}
  }catch{writable=false;}}
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   try{
    progress(attempt===1?'Downloading '+name:'Retry '+attempt+'/'+maxAttempts+' for '+name);
    const path='/poster/woodland-six/chunk?'+new URLSearchParams({slug:img.slug,part:String(part)});
    const response=await request(path,{credentials:'same-origin',cache:'no-store'});
    if(!response.ok){
     if(![429,500,502,503,504].includes(response.status))throw Object.assign(Error('Server rejected '+name+' (HTTP '+response.status+'). Reopen your authenticated studio.'),{permanent:true});
     throw Error('Temporary server response '+response.status);
    }
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length!==expected)throw Error('Interrupted '+name+' transfer');
    if(writable){try{await db.put(k,bytes);}catch{writable=false;}}
    return bytes;
   }catch(e){
    if(e?.permanent)throw e;
    if(attempt===maxAttempts)throw Error(name+' could not be downloaded after '+maxAttempts+' tries. Check the connection and try again.');
    await wait(Math.min(8000,750*2**(attempt-1)));
   }
  }
 };
 return {getPart,clear:()=>db?.clear?.()||Promise.resolve(),cacheAvailable:!!db};
}
