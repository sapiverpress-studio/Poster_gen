'use strict';
// Reads only the small, STORED listing manifest from Pattern Forge's outer seller ZIP.
// The server independently validates the full ZIP and all buyer files after upload.
(function(){
 const signature=0x06054b50,centralSig=0x02014b50,localSig=0x04034b50,filename='LISTING-METADATA.json';
 const fail=message=>{throw Error('Commercial seller ZIP: '+message);};
 const u16=(d,p)=>d.getUint16(p,true),u32=(d,p)=>d.getUint32(p,true);
 const decode=data=>new TextDecoder('utf-8',{fatal:true}).decode(data);
 function validProduct(doc){
  const p=doc?.product;
  if(doc?.format!=='sapiver-seamless-seller-kit'||doc?.version!==1||doc.reviewRequired!==true||
   !p||p.type!=='digital'||p.kind!=='pattern'||p.sectionTitle!=='Digital Downloads'||p.seamlessConfirmed!==true||
   p.useEmbeddedText!==true||p.aiAssisted!==true)fail('listing manifest has an invalid format, version or required product settings.');
  const clean=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max&&!/[\x00-\x1f<>]/.test(s);
  if(!clean(p.name,100)||!clean(p.subject,100)||!clean(p.description,1500)||!/AI/i.test(p.description))
   fail('the listing title, subject or AI-disclosed description is missing or invalid.');
  if(typeof p.price!=='number'||!Number.isFinite(p.price)||p.price<0.2||p.price>10000||
   Math.abs(Math.round(p.price*100)-p.price*100)>0.000001)fail('a valid GBP selling price is required.');
  if(!Array.isArray(p.tags)||p.tags.length<1||p.tags.length>13||
   p.tags.some(t=>!clean(t,20))||new Set(p.tags.map(t=>t.toLowerCase())).size!==p.tags.length)
   fail('Etsy tags must be unique and no longer than 20 characters each.');
  return p;
 }
 async function read(file){
  if(!file||file.size<22||file.size>100_000_000)fail('choose a seller ZIP under 100 MB.');
  const tailStart=Math.max(0,file.size-65557),tail=new Uint8Array(await file.slice(tailStart,file.size).arrayBuffer());
  const td=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
  let eocd=-1;
  for(let i=tail.length-22;i>=0;i--)if(u32(td,i)===signature&&i+22+u16(td,i+20)===tail.length){eocd=i;break;}
  if(eocd<0)fail('the ZIP directory is missing.');
  if(u16(td,eocd+4)||u16(td,eocd+6))fail('multi-disk ZIPs are not supported.');
  const count=u16(td,eocd+10),size=u32(td,eocd+12),offset=u32(td,eocd+16);
  if(!count||count>100||size>1_000_000||offset+size>tailStart+eocd||count!==u16(td,eocd+8))
   fail('the ZIP directory is invalid.');
  const bytes=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),directory=new DataView(bytes.buffer);
  let position=0,match=null;
  for(let i=0;i<count;i++){
   if(position+46>bytes.length||u32(directory,position)!==centralSig)fail('the ZIP directory entry is invalid.');
   const flags=u16(directory,position+8),method=u16(directory,position+10),packed=u32(directory,position+20),unpacked=u32(directory,position+24);
   const nameLength=u16(directory,position+28),extra=u16(directory,position+30),comment=u16(directory,position+32),start=position+46,end=start+nameLength;
   if(end+extra+comment>bytes.length||!nameLength)fail('the ZIP filename is malformed.');
   const name=decode(bytes.subarray(start,end));
   if(name===filename){
    if(match)fail('duplicate listing manifests are not allowed.');
    if(flags&1||method!==0||packed!==unpacked||unpacked>32_000)fail('listing manifest must be uncompressed and smaller than 32 KB.');
    match={packed,localOffset:u32(directory,position+42),name,crc:u32(directory,position+16)};
   }
   position=end+extra+comment;
  }
  if(position!==bytes.length)fail('ZIP directory contains unexpected data.');
  if(!match)return null; // Legacy seller ZIPs retain the pre-existing manual upload path.
  const header=new DataView(await file.slice(match.localOffset,match.localOffset+30).arrayBuffer());
  if(header.byteLength!==30||u32(header,0)!==localSig||u16(header,8)!==0||u16(header,6)&1)fail('listing manifest ZIP header is invalid.');
  const nameLength=u16(header,26),extra=u16(header,28),fileStart=match.localOffset+30;
  if(fileStart+nameLength+extra+match.packed>offset)fail('listing manifest overlaps the ZIP directory.');
  const actualName=decode(new Uint8Array(await file.slice(fileStart,fileStart+nameLength).arrayBuffer()));
  if(actualName!==filename)fail('listing manifest filename differs between ZIP headers.');
  const body=new Uint8Array(await file.slice(fileStart+nameLength+extra,fileStart+nameLength+extra+match.packed).arrayBuffer());
  if(body.length!==match.packed)fail('listing manifest is incomplete.');
  // CRC32 verifies that the metadata actually matches the ZIP directory.
  let crc=0xffffffff;
  for(const b of body){crc^=b;for(let i=0;i<8;i++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}
  if(((crc^0xffffffff)>>>0)!==match.crc)fail('listing manifest checksum mismatch.');
  let doc;try{doc=JSON.parse(decode(body));}catch{fail('listing manifest JSON is not readable.');}
  return validProduct(doc);
 }
 window.SapiverSellerKitManifest={read};
})();