// Browser-side, bounded ZIP reader for ONE physical collection; no server-side
// decompression, external scripts or changes to the existing Etsy/PrintShrimp worker.
// The untrusted ZIP is fully validated before the first product is reserved.
export const BULK_COUNT=6, BULK_ZIP_MAX=100_000_000, BULK_PNG_MAX=50_000_000;
const read16=(v,i)=>v.getUint16(i,true),read32=(v,i)=>v.getUint32(i,true);
const decoder=new TextDecoder('utf-8',{fatal:true});
const fail=why=>{throw Error(why)};
function safeName(name){
 if(name.length>180||name.includes('\\')||name.startsWith('/')||name.includes('\0')||/[\u0000-\u001f]/.test(name)||name.split('/').some(x=>x==='.'||x==='..'))fail('Unsafe archive filename');
 const pieces=name.split('/');if(pieces.length>2||pieces.some(x=>x.length===0))fail('Keep the six posters in one folder or at ZIP root');
 return pieces.at(-1);
}
const CRC_TABLE=Uint32Array.from({length:256},(_,index)=>{
 let crc=index;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 return crc>>>0;
});
function crc32(data){
 let crc=0xffffffff;
 for(const byte of data)crc=(crc>>>8)^CRC_TABLE[(crc^byte)&255];
 return (crc^0xffffffff)>>>0;
}
export async function openPosterCollectionZip(file){
 if(!file||!Number.isSafeInteger(file.size)||file.size<22||file.size>BULK_ZIP_MAX)fail('Use a ZIP under 100 MB');
 const tailSize=Math.min(file.size,65557),tail=new DataView(await file.slice(file.size-tailSize).arrayBuffer());
 let pos=-1;for(let i=tail.byteLength-22;i>=0;i--)if(read32(tail,i)===0x06054b50&&i+22+read16(tail,i+20)===tail.byteLength){pos=i;break;}
 if(pos<0||read16(tail,pos+4)!==0||read16(tail,pos+6)!==0||read16(tail,pos+8)!==read16(tail,pos+10))fail('Invalid ZIP directory');
 const count=read16(tail,pos+10),size=read32(tail,pos+12),offset=read32(tail,pos+16);
 if(count<BULK_COUNT*2||count>BULK_COUNT*2+1||!size||size>16384||offset+size>file.size-tailSize+pos||offset===0xffffffff)fail('ZIP must contain exactly six PNG and six TXT files');
 const central=new DataView(await file.slice(offset,offset+size).arrayBuffer());
 const entries=[],seen=new Set();let cur=0;
 for(let n=0;n<count;n++){
  if(cur+46>central.byteLength||read32(central,cur)!==0x02014b50)fail('Invalid ZIP entry');
  const flags=read16(central,cur+8),method=read16(central,cur+10),compressed=read32(central,cur+20),expanded=read32(central,cur+24);
  const nameLen=read16(central,cur+28),extraLen=read16(central,cur+30),commentLen=read16(central,cur+32),start=read32(central,cur+42);
  if(flags&1||flags&0x40||![0,8].includes(method)||compressed===0xffffffff||expanded===0xffffffff||start===0xffffffff||cur+46+nameLen+extraLen+commentLen>central.byteLength)fail('Unsupported ZIP encryption or entry');
  const name=decoder.decode(new Uint8Array(central.buffer,central.byteOffset+cur+46,nameLen));
  cur+=46+nameLen+extraLen+commentLen;
  const mode=(read32(central,cur-(46+nameLen+extraLen+commentLen)+38)>>>16);
  if((read16(central,cur-(46+nameLen+extraLen+commentLen)+4)>>>8)===3&&mode&&(mode&0xf000)!==(name.endsWith('/')?0x4000:0x8000))fail('ZIP must contain only regular files and a folder');
  if(name.endsWith('/')){if(n!==0||name.split('/').length!==2)fail('Only a single enclosing folder is allowed');continue;}
  const base=safeName(name),lower=base.normalize('NFC').toLowerCase();
  if(seen.has(lower))fail('Duplicate poster filename');seen.add(lower);
  const ext=/\.png$/i.test(base)?'png':/\.txt$/i.test(base)?'txt':null;
  if(!ext||expanded<(ext==='png'?33:30)||expanded>(ext==='png'?BULK_PNG_MAX:14000)||compressed>file.size||method===0&&expanded!==compressed)fail('ZIP contains unsupported or oversized files');
  if(read16(central,cur-(46+nameLen+extraLen+commentLen)+34)!==0)fail('Multi-disk ZIP entries are unsupported');
  if(read32(central,cur-(46+nameLen+extraLen+commentLen)+0)!==0x02014b50)fail('Invalid central ZIP header');
  entries.push({name,base,ext,method,start,compressed,expanded,crc:read32(central,cur-(46+nameLen+extraLen+commentLen)+16)});
 }
 if(cur!==central.byteLength||entries.length!==BULK_COUNT*2)fail('The collection must contain six PNG and six TXT files');
 const roots=new Set(entries.map(x=>x.name.includes('/')?x.name.split('/')[0]:''));
 if(roots.size!==1)fail('Keep all collection files together');
 const pairs=new Map();
 for(const entry of entries){
  const stem=entry.base.slice(0,-4),key=stem.normalize('NFC').toLowerCase(),pair=pairs.get(key)||{};
  if(pair[entry.ext])fail('Duplicate artwork or details');
  pair[entry.ext]=entry;pairs.set(key,pair);
 }
 if(pairs.size!==BULK_COUNT||[...pairs.values()].some(p=>!p.png||!p.txt))fail('Every PNG needs a TXT with exactly the same name');
 const readEntry=async e=>{
  const header=new DataView(await file.slice(e.start,e.start+30).arrayBuffer());
  if(header.byteLength!==30||read32(header,0)!==0x04034b50||read16(header,8)!==e.method)fail('ZIP local file header differs from central directory');
  const nameBytes=read16(header,26),extra=read16(header,28),name=decoder.decode(new Uint8Array(await file.slice(e.start+30,e.start+30+nameBytes).arrayBuffer()));
  if(name!==e.name)fail('ZIP local filename mismatch');
  const begin=e.start+30+nameBytes+extra;
  if(begin+e.compressed>offset||begin<0)fail('ZIP entry overlaps directory');
  const raw=file.slice(begin,begin+e.compressed);
  const stream=e.method===0?raw.stream():raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader=stream.getReader(),pieces=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>e.expanded)fail('ZIP expansion exceeds declared size');pieces.push(value);}}
  finally{reader.releaseLock();}
  if(size!==e.expanded)fail('ZIP entry length changed');
  const bytes=new Uint8Array(size);let at=0;for(const p of pieces){bytes.set(p,at);at+=p.length;}
  if(crc32(bytes)!==e.crc)fail('ZIP checksum mismatch');
  return bytes;
 };
 const items=[];
 for(const [key,pair] of [...pairs].sort((a,b)=>a[0].localeCompare(b[0],'en'))){
  const details=parsePosterText(decoder.decode(await readEntry(pair.txt)));
  items.push({...details,filename:pair.png.base,bytes:pair.png.expanded,entry:pair.png});
 }
 return {items,async artwork(item){const bytes=await readEntry(item.entry);validatePosterPng(bytes);return new File([bytes],item.filename,{type:'image/png'});}};
}
export function parsePosterText(source){
 if(typeof source!=='string'||source.length>12000||source.includes('\0'))fail('Invalid poster text file');
 const match=/^\uFEFF?Title:[ \t]*(.+?)\r?\nDescription:[ \t]*\r?\n([\s\S]+?)\r?\nTags:[ \t]*(.+?)[ \t\r\n]*$/i.exec(source.trim());
 if(!match)fail('TXT must contain Title:, Description: (on its own line), and Tags:');
 const title=match[1].trim(),description=match[2].trim(),tags=match[3].split(',').map(x=>x.trim());
 if(!title||title.length>100||/[<>\u0000-\u001f]/.test(title)||description.length<12||description.length>9000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(description))fail('Invalid poster title or description');
 if(tags.length!==13||tags.some(t=>!t||t.length>20||/[<>\u0000-\u001f]/.test(t))||new Set(tags.map(t=>t.toLowerCase())).size!==13)fail('Every poster needs exactly 13 unique Etsy tags, each at most 20 characters');
 return {title,description,tags};
}
export function validatePosterPng(b){
 const sig=[137,80,78,71,13,10,26,10];
 if(b.length<33||sig.some((n,i)=>b[i]!==n)||b[12]!==73||b[13]!==72||b[14]!==68||b[15]!==82)fail('Not a valid PNG');
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength),width=view.getUint32(16),height=view.getUint32(20);
 if(width<3160||height<4470||width*height>100_000_000||Math.abs(height/width-Math.SQRT2)/Math.SQRT2>0.02)fail('Poster must be A-series portrait at 270 PPI or above at A3');
 return {width,height};
}
