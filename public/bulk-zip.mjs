import {parseTrioDetails,validateTwoTrios} from './collection-trios.mjs';
// Browser-side, bounded ZIP reader for ONE physical collection; no server-side
// decompression, external scripts or changes to the existing Etsy/PrintShrimp worker.
// The untrusted ZIP is fully validated before the first product is reserved.
export const BULK_MIN_COUNT=2, BULK_MAX_COUNT=6, BULK_ZIP_MAX=100_000_000, BULK_PNG_MAX=50_000_000;
const read16=(v,i)=>v.getUint16(i,true),read32=(v,i)=>v.getUint32(i,true);
const decoder=new TextDecoder('utf-8',{fatal:true});
const fail=why=>{throw Error(why)};
function safeName(name){
 if(name.length>180||name.includes('\\')||name.startsWith('/')||name.includes('\0')||/[\u0000-\u001f]/.test(name)||name.split('/').some(x=>x==='.'||x==='..'))fail('Unsafe archive filename');
 const pieces=name.split('/');if(pieces.length>3||pieces.some(x=>x.length===0))fail('Use 2 to 6 poster subfolders, optionally inside one collection folder');
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
export async function openPosterCollectionZip(file,{allowLegacySix=false}={}){
 if(!file||!Number.isSafeInteger(file.size)||file.size<22||file.size>BULK_ZIP_MAX)fail('Use a ZIP under 100 MB');
 const tailSize=Math.min(file.size,65557),tail=new DataView(await file.slice(file.size-tailSize).arrayBuffer());
 let pos=-1;for(let i=tail.byteLength-22;i>=0;i--)if(read32(tail,i)===0x06054b50&&i+22+read16(tail,i+20)===tail.byteLength){pos=i;break;}
 if(pos<0||read16(tail,pos+4)!==0||read16(tail,pos+6)!==0||read16(tail,pos+8)!==read16(tail,pos+10))fail('Invalid ZIP directory');
 const count=read16(tail,pos+10),size=read32(tail,pos+12),offset=read32(tail,pos+16);
 if(count<BULK_MIN_COUNT*2||count>BULK_MAX_COUNT*3+1||!size||size>16384||offset+size>file.size-tailSize+pos||offset===0xffffffff)fail('ZIP must contain 2 to 6 poster folders with poster.png and details.md');
 const central=new DataView(await file.slice(offset,offset+size).arrayBuffer());
 const entries=[],directories=[],seen=new Set();let cur=0;
 for(let n=0;n<count;n++){
  if(cur+46>central.byteLength||read32(central,cur)!==0x02014b50)fail('Invalid ZIP entry');
  const flags=read16(central,cur+8),method=read16(central,cur+10),compressed=read32(central,cur+20),expanded=read32(central,cur+24);
  const nameLen=read16(central,cur+28),extraLen=read16(central,cur+30),commentLen=read16(central,cur+32),start=read32(central,cur+42);
  if(flags&1||flags&0x40||![0,8].includes(method)||compressed===0xffffffff||expanded===0xffffffff||start===0xffffffff||cur+46+nameLen+extraLen+commentLen>central.byteLength)fail('Unsupported ZIP encryption or entry');
  const name=decoder.decode(new Uint8Array(central.buffer,central.byteOffset+cur+46,nameLen));
  cur+=46+nameLen+extraLen+commentLen;
  const mode=(read32(central,cur-(46+nameLen+extraLen+commentLen)+38)>>>16);
  if((read16(central,cur-(46+nameLen+extraLen+commentLen)+4)>>>8)===3&&mode&&(mode&0xf000)!==(name.endsWith('/')?0x4000:0x8000))fail('ZIP must contain only regular files and a folder');
  if(name.endsWith('/')){safeName(name.slice(0,-1));if(name.split('/').length>3)fail('Unexpected nested folder');directories.push(name.slice(0,-1));continue;}
  const base=safeName(name),lower=name.normalize('NFC').toLowerCase();
  if(seen.has(lower))fail('Duplicate poster filename');seen.add(lower);
  const ext=base.toLowerCase()==='poster.png'?'png':base.toLowerCase()==='details.md'?'md':/^bundle-[12]\.md$/i.test(base)?'trio':null;
  if(!ext||expanded<(ext==='png'?33:30)||expanded>(ext==='png'?BULK_PNG_MAX:14000)||compressed>file.size||method===0&&expanded!==compressed)fail('ZIP contains unsupported or oversized files');
  if(read16(central,cur-(46+nameLen+extraLen+commentLen)+34)!==0)fail('Multi-disk ZIP entries are unsupported');
  if(read32(central,cur-(46+nameLen+extraLen+commentLen)+0)!==0x02014b50)fail('Invalid central ZIP header');
  entries.push({name,base,ext,method,start,compressed,expanded,crc:read32(central,cur-(46+nameLen+extraLen+commentLen)+16)});
 }
 const posterEntries=entries.filter(e=>e.ext!=='trio'),trioEntries=entries.filter(e=>e.ext==='trio');
 if(cur!==central.byteLength||posterEntries.length<BULK_MIN_COUNT*2||posterEntries.length>BULK_MAX_COUNT*2||posterEntries.length%2!==0||!([0,2].includes(trioEntries.length))||entries.length!==posterEntries.length+trioEntries.length)
  fail('Expected 2–6 artwork folders and, for a six-poster set, exactly bundle-1.md and bundle-2.md');
 const depths=new Set(posterEntries.map(x=>x.name.split('/').length));
 if(depths.size!==1||![2,3].includes([...depths][0]))fail('Use 2 to 6 poster subfolders, optionally inside one collection folder');
 if([...depths][0]===3&&new Set(posterEntries.map(x=>x.name.split('/')[0])).size!==1)fail('Use only one enclosing collection folder');
 const pairs=new Map();
 for(const entry of posterEntries){
  const folder=entry.name.slice(0,entry.name.lastIndexOf('/')),key=folder.normalize('NFC').toLowerCase(),pair=pairs.get(key)||{folder};
  if(pair.folder!==folder)fail('Inconsistent poster folder spelling');
  if(pair[entry.ext])fail('Duplicate artwork or details');
  pair[entry.ext]=entry;pairs.set(key,pair);
 }
 if(pairs.size<BULK_MIN_COUNT||pairs.size>BULK_MAX_COUNT||[...pairs.values()].some(p=>!p.png||!p.md))fail('Each of the 2 to 6 poster folders needs poster.png and details.md');
 const allowedDirs=new Set([...pairs.values()].flatMap(p=>[p.folder,...(p.folder.includes('/')?[p.folder.split('/')[0]]:[])]));
 if(pairs.size===6&&trioEntries.length!==2&&!(allowLegacySix&&trioEntries.length===0))fail('Every new six-poster collection requires two distinct trio listings in bundle-1.md and bundle-2.md');
 if(pairs.size!==6&&trioEntries.length!==0)fail('Trio manifests are only supported for exactly six individual posters');
 if(trioEntries.length){
  const root=[...depths][0]===3?posterEntries[0].name.split('/')[0]+'/':'';
  const required=new Set([root+'bundle-1.md',root+'bundle-2.md']);
  if(trioEntries.some(e=>!required.has(e.name)))fail('Put bundle-1.md and bundle-2.md next to the six poster folders, not inside them');
 }
 if(directories.some(d=>!allowedDirs.has(d))||new Set(directories).size!==directories.length)fail('Unexpected or duplicate empty folder');
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
  const details=parsePosterText(decoder.decode(await readEntry(pair.md)));
  items.push({...details,folder:pair.folder,filename:pair.png.base,bytes:pair.png.expanded,entry:pair.png});
 }
 let bundles=[];
 if(trioEntries.length){
  const sorted=trioEntries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  bundles=validateTwoTrios(items,await Promise.all(sorted.map(async e=>parseTrioDetails(decoder.decode(await readEntry(e)),{filename:e.name}))));
 }
 return {items,bundles,listingCount:items.length+bundles.length,
  async artwork(item){const bytes=await readEntry(item.entry);validatePosterPng(bytes,item.printSizes);return new File([bytes],item.filename,{type:'image/png'});}};
}
export function parsePosterText(source){
 if(typeof source!=='string'||source.length>12000||source.includes('\0'))fail('Invalid details.md file');
 const lines=source.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim().split('\n'),fields={};
 const split=lines.findIndex(line=>/^Description:[ \t]*$/i.test(line));
 if(split<0)fail('details.md needs Description: on its own line after the metadata fields');
 for(const line of lines.slice(0,split)){
  if(!line.trim())continue;
  const m=/^(Title|Listing title|Section|Sizes|Tags):[ \t]*(.+)$/i.exec(line);
  if(!m)fail('Unknown or invalid details.md field');
  const key=m[1].toLowerCase();if(Object.hasOwn(fields,key))fail('Duplicate details.md field');fields[key]=m[2].trim();
 }
 const title=fields.title,listingTitle=fields['listing title'],sectionTitle=fields.section;
 const description=lines.slice(split+1).join('\n').trim(),tags=(fields.tags||'').split(',').map(x=>x.trim());
 if(!title||title.length>100||/[<>\u0000-\u001f]/.test(title)||description.length<12||description.length>9000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(description))fail('Invalid poster title or description');
 if(!listingTitle)fail('Listing title is required for each physical poster');
 if(listingTitle.length>140||/[<>\u0000-\u001f]/.test(listingTitle))fail('Listing title must be at most 140 characters');
 if(!/\b(?:prints?|posters?|wall art)\b/i.test(listingTitle))fail('Listing title must identify a physical print or poster');
 if(typeof sectionTitle!=='string'||sectionTitle.length>24||/[<>\u0000-\u001f\u007f]/.test(sectionTitle))fail('Section must be a valid Etsy shop section name (up to 24 characters)');
 if(tags.length!==13||tags.some(t=>!t||t.length>20||/[<>\u0000-\u001f]/.test(t))||new Set(tags.map(t=>t.toLowerCase())).size!==13)fail('Every poster needs exactly 13 unique Etsy tags, each at most 20 characters');
 const decorativeWallArt=sectionTitle==='Wall Art';
 const printSizes=fields.sizes?fields.sizes.split(',').map(x=>x.trim()):(decorativeWallArt?['A5','A4','A3']:['A5','A4']);
 if(!['A5|A4','A5|A4|A3'].includes(printSizes.join('|')))fail('Sizes must be A5, A4 or A5, A4, A3 in that order');
 if(!decorativeWallArt&&printSizes.length!==2)fail('A3 is reserved for individual decorative Wall Art; Nature and learning ZIPs offer A5 and A4 only');
 return {title,listingTitle,sectionTitle,description,tags,printSizes};
}
// A stable short internal filename uses the artwork hash to distinguish namesakes.
// The existing server derives the SKU from it and reuses it for later metadata edits.
export function collectionUploadFilename(title,sha256){
 if(!/^[a-f0-9]{64}$/.test(sha256))fail('Missing validated artwork hash');
 const stem=title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,18).replace(/-$/,'')||'POSTER';
 return 'SP-'+stem.toUpperCase()+'-'+sha256.slice(0,8).toUpperCase()+'.png';
}
export function validatePosterPng(b,printSizes=['A5','A4','A3']){
 if(!['A5|A4','A5|A4|A3'].includes(printSizes.join('|')))fail('Unsupported print-size selection');
 const sig=[137,80,78,71,13,10,26,10];
 if(b.length<33||sig.some((n,i)=>b[i]!==n)||b[12]!==73||b[13]!==72||b[14]!==68||b[15]!==82)fail('Not a valid PNG');
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength),width=view.getUint32(16),height=view.getUint32(20);
 const a4Only=printSizes.length===2,minWidth=a4Only?2480:3160,minHeight=a4Only?3508:4470;
 if(width<minWidth||height<minHeight||width*height>100_000_000||Math.abs(height/width-Math.SQRT2)/Math.SQRT2>0.02)fail(a4Only?'Poster must be A-series portrait at 300 PPI at A4 or above':'Poster must be A-series portrait at 270 PPI or above at A3');
 return {width,height};
}
