// Browser-side ZIP32 builder: unchanged source PNG bytes, CRC and SHA checked.
const enc=new TextEncoder();
const table=Uint32Array.from({length:256},(_,i)=>{let v=i;for(let j=0;j<8;j++)v=(v>>>1)^((v&1)?0xedb88320:0);return v>>>0;});
const update=(c,b)=>{for(const x of b)c=(c>>>8)^table[(c^x)&255];return c>>>0};
const digestHex=buf=>Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,'0')).join('');
export async function makeWoodlandZip(m,getPart,progress=()=>{}){
 if(m?.phase!=='ready'||m.images?.length!==6||m.bundles?.length!==2||m.chunkSize!==3000000)throw Error('Invalid six-artwork manifest');
 if(new Set(m.images.map(x=>x.slug)).size!==6)throw Error('Repeated poster');
 const parts=[],central=[];let offset=0;
 function add(name,content,length,crc){
  const n=enc.encode(name);if(n.length>180)throw Error('Invalid file name');
  const local=new Uint8Array(30+n.length),l=new DataView(local.buffer);
  l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x0800,true);l.setUint32(14,crc,true);l.setUint32(18,length,true);l.setUint32(22,length,true);l.setUint16(26,n.length,true);local.set(n,30);
  const h=new Uint8Array(46+n.length),v=new DataView(h.buffer);
  v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x0800,true);v.setUint32(16,crc,true);v.setUint32(20,length,true);v.setUint32(24,length,true);v.setUint16(28,n.length,true);v.setUint32(42,offset,true);h.set(n,46);
  parts.push(local,...content);central.push(h);offset+=local.length+length;
 }
 function addText(n,t){if(typeof t!=='string'||t.length>12000)throw Error('Invalid details text');
  const bytes=enc.encode(t);add(n,[bytes],bytes.length,(update(0xffffffff,bytes)^0xffffffff)>>>0);
 }
 for(let i=0;i<6;i++){
  const x=m.images[i];if(!/^[a-z-]{3,25}$/.test(x.slug)||x.bytes<33||x.bytes>40000000||!/^[a-f0-9]{64}$/.test(x.sha256))throw Error('Invalid original art');
  const chunks=[],count=Math.ceil(x.bytes/m.chunkSize);let got=0,crc=0xffffffff;
  for(let j=0;j<count;j++){
   progress('Downloading '+x.slug+' '+(i+1)+'/6: part '+(j+1)+'/'+count);
   const bytes=await getPart(x,j),expected=Math.min(m.chunkSize,x.bytes-j*m.chunkSize);
   if(!(bytes instanceof Uint8Array)||bytes.length!==expected)throw Error('Truncated source PNG');
   chunks.push(bytes);got+=bytes.length;crc=update(crc,bytes);
  }
  const concat=new Uint8Array(got);let at=0;for(const b of chunks){concat.set(b,at);at+=b.length;}
  const sha=digestHex(await crypto.subtle.digest('SHA-256',concat));
  if(sha!==x.sha256)throw Error('PNG SHA-256 differs from saved Canva source');
  add(x.slug+'/poster.png',chunks,got,(crc^0xffffffff)>>>0);
  addText(x.slug+'/details.md',x.details);
 }
 addText('bundle-1.md',m.bundles[0]);addText('bundle-2.md',m.bundles[1]);
 const dirStart=offset;for(const h of central){parts.push(h);offset+=h.length;}
 const e=new Uint8Array(22),v=new DataView(e.buffer);
 v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,offset-dirStart,true);v.setUint32(16,dirStart,true);parts.push(e);
 if(offset+22>250000000)throw Error('250 MB importer limit reached');
 progress('All six original SHA-256 checks passed. Preparing download...');
 return new Blob(parts,{type:'application/zip'});
}
