// Browser-only, owner-authenticated collection of the existing prepared JPGs.
// JPEG data is copied byte-for-byte into an uncompressed ZIP (no AI remake,
// re-render, server write, Etsy mutation, or PrintShrimp call).
const ID=/^[A-Za-z0-9_-]{32}$/;
const FILENAME=/^[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.jpg$/;
const NAME=/(?:[^\p{L}\p{N}]+)/gu;
const MAX_FILES=32,MAX_FILE_BYTES=12_000_000,MAX_ZIP_BYTES=160_000_000;
const LABELS={
 poster:['Print_Only','Black_Frame','White_Frame','Oak_Frame'],
 trio:['Trio_Overview','Artwork_1','Artwork_2','Artwork_3']
};
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{
 let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
export function crc32(bytes){
 let c=0xffffffff;
 for(const b of bytes)c=CRC_TABLE[(c^b)&255]^(c>>>8);
 return (c^0xffffffff)>>>0;
}
function cleanName(name){
 const s=String(name||'Poster').normalize('NFKD').replace(NAME,'_').replace(/^_+|_+$/g,'').slice(0,52);
 return s.replace(/[^A-Za-z0-9_-]/g,'')||'Poster';
}
export function validateMockupGroups(groups){
 if(!Array.isArray(groups)||groups.length<1||groups.length>8)throw Error('Choose between one and eight saved poster listings.');
 const seen=new Set();
 return groups.map((g,i)=>{
  if(!ID.test(g?.id||'')||seen.has(g.id))throw Error('Invalid or repeated saved product ID; nothing downloaded.');
  seen.add(g.id);
  const type=g.type==='trio'?'trio':'poster';
  return {id:g.id,type,name:cleanName(g.name),number:i+1};
 });
}
function put16(view,at,x){view.setUint16(at,x,true);}
function put32(view,at,x){view.setUint32(at,x,true);}
const encoder=new TextEncoder();
export function zipMockupJpegs(entries){
 if(!Array.isArray(entries)||!entries.length||entries.length>MAX_FILES)throw Error('Expected between one and 32 JPEG mock-ups.');
 const prepared=entries.map(e=>{
  if(!FILENAME.test(e?.name||'')||!(e.bytes instanceof Uint8Array)||
     e.bytes.length<4||e.bytes.length>MAX_FILE_BYTES||
     e.bytes[0]!==0xff||e.bytes[1]!==0xd8||e.bytes.at(-2)!==0xff||e.bytes.at(-1)!==0xd9)
   throw Error('A mock-up is not a valid bounded JPG. No ZIP was downloaded.');
  const name=encoder.encode(e.name);
  return {name,bytes:e.bytes,crc:crc32(e.bytes)};
 });
 if(new Set(entries.map(e=>e.name.toLowerCase())).size!==entries.length)throw Error('Mock-up filenames must be unique.');
 const bytesNeeded=prepared.reduce((n,e)=>n+30+e.name.length+e.bytes.length+46+e.name.length,22);
 if(bytesNeeded>MAX_ZIP_BYTES)throw Error('Mock-ups exceed the safe ZIP size for mobile; download each poster individually.');
 const bytes=new Uint8Array(bytesNeeded),v=new DataView(bytes.buffer);
 let cursor=0,centralStart=0;
 const positions=[];
 for(const e of prepared){
  const start=cursor;positions.push(start);
  put32(v,cursor,0x04034b50);put16(v,cursor+4,20);put16(v,cursor+6,0x0800);
  put16(v,cursor+8,0);put16(v,cursor+10,0);put16(v,cursor+12,0);
  put32(v,cursor+14,e.crc);put32(v,cursor+18,e.bytes.length);put32(v,cursor+22,e.bytes.length);
  put16(v,cursor+26,e.name.length);put16(v,cursor+28,0);
  cursor+=30;bytes.set(e.name,cursor);cursor+=e.name.length;bytes.set(e.bytes,cursor);cursor+=e.bytes.length;
 }
 centralStart=cursor;
 for(let i=0;i<prepared.length;i++){
  const e=prepared[i];
  put32(v,cursor,0x02014b50);put16(v,cursor+4,20);put16(v,cursor+6,20);
  put16(v,cursor+8,0x0800);put16(v,cursor+10,0);put16(v,cursor+12,0);put16(v,cursor+14,0);
  put32(v,cursor+16,e.crc);put32(v,cursor+20,e.bytes.length);put32(v,cursor+24,e.bytes.length);
  put16(v,cursor+28,e.name.length);put16(v,cursor+30,0);put16(v,cursor+32,0);
  put16(v,cursor+34,0);put16(v,cursor+36,0);put32(v,cursor+38,0);put32(v,cursor+42,positions[i]);
  cursor+=46;bytes.set(e.name,cursor);cursor+=e.name.length;
 }
 const centralLength=cursor-centralStart;
 put32(v,cursor,0x06054b50);put16(v,cursor+4,0);put16(v,cursor+6,0);
 put16(v,cursor+8,prepared.length);put16(v,cursor+10,prepared.length);
 put32(v,cursor+12,centralLength);put32(v,cursor+16,centralStart);put16(v,cursor+20,0);
 if(cursor+22!==bytes.length)throw Error('ZIP length does not match its directory.');
 return bytes;
}
export async function collectMockups(groups,{fetcher=fetch,onProgress=()=>{}}={}){
 const selected=validateMockupGroups(groups),total=selected.length*4,files=[];
 for(const group of selected){
  for(let i=0;i<4;i++){
   const url='/poster/uploads/'+group.id+'/mockups/'+i;
   let response;
   try{response=await fetcher(url,{credentials:'same-origin',redirect:'error',cache:'no-store'});}
   catch{throw Error('Cannot read a saved mock-up. Check your owner login and connection; no ZIP was downloaded.');}
   if(!response?.ok||response.redirected)throw Error('Mock-up '+(files.length+1)+' of '+total+' is not ready. Nothing downloaded; your saved products are unchanged.');
   if(!/^image\/jpeg(?:;|$)/i.test(response.headers?.get?.('content-type')||''))
    throw Error('The mock-up download did not return a JPG. Sign in again; no ZIP was downloaded.');
   const len=Number(response.headers?.get?.('content-length')||0);
   if(len>MAX_FILE_BYTES)throw Error('A saved mock-up is too large for mobile download.');
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.length>MAX_FILE_BYTES)throw Error('A saved mock-up is too large for mobile download.');
   const prefix=String(group.number).padStart(2,'0')+'_'+group.name;
   files.push({name:prefix+'__'+String(i+1).padStart(2,'0')+'_'+LABELS[group.type][i]+'.jpg',bytes});
   onProgress(files.length,total);
  }
 }
 const data=zipMockupJpegs(files);
 return {blob:new Blob([data],{type:'application/zip'}),filename:selected.length===1?
  'Sapiver_'+selected[0].name+'_4_Mockups.zip':'Sapiver_Collection_'+selected.length+'_Listings_'+total+'_Mockups.zip',
  count:files.length};
}
