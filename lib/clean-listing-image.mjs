import sharp from 'sharp';
import {createHash} from 'node:crypto';

const LIMIT=100_000_000;
export const imageHash=bytes=>createHash('sha256').update(bytes).digest('hex');

/** A plain front view of the supplied artwork, not a framed or room-scene rendering. */
export async function cleanPosterFront(bytes){
 const input=Buffer.from(bytes);
 const meta=await sharp(input,{limitInputPixels:LIMIT,failOn:'warning'}).metadata();
 if(!['png','jpeg'].includes(meta.format)||!meta.width||!meta.height||(meta.pages||1)!==1)
  throw Error('Approved poster artwork must be one PNG or JPEG');
 return sharp(input,{limitInputPixels:LIMIT,failOn:'warning'}).rotate()
  .resize(1600,1600,{fit:'contain',background:'#ffffff'})
  .flatten({background:'#ffffff'}).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toBuffer();
}

/** Use only a delivered buyer image. Never create a listing hero from a sales graphic. */
export async function cleanDigitalFront(files){
 if(!Array.isArray(files))return null;
 const candidates=files.filter(f=>['png','jpg','jpeg'].includes(f.format)&&Buffer.isBuffer(f.data)&&
  Number(f.width)>=600&&Number(f.height)>=600&&!/original|draft|source|non.?seamless/i.test(f.name));
 if(!candidates.length)return null;
 const score=f=>{
  const n=String(f.name).toLowerCase();
  return (/background|colour|color|opaque/.test(n)?100:0)+
   (/seamless|repeat|tile|pattern/.test(n)?50:0)+
   (f.format==='jpg'||f.format==='jpeg'?15:0)+
   Math.min(10,Math.floor(Math.min(f.width,f.height)/500));
 };
 const selected=candidates.slice().sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name))[0];
 return cleanPosterFront(selected.data);
}

export async function cleanTrioFront(uploads,memberIds){
 if(!Array.isArray(memberIds)||memberIds.length!==3||new Set(memberIds).size!==3)throw Error('Three original artworks required');
 const pieces=[];
 for(const id of memberIds){
  if(!/^[A-Za-z0-9_-]{32}$/.test(id))throw Error('Invalid source artwork ID');
  const asset=await uploads.get('uploads/'+id+'/state',{type:'json',consistency:'strong'});
  if(!asset||asset.phase!=='published'||!asset.masterKey||!asset.image?.sha256)throw Error('Missing published trio artwork');
  const source=await uploads.get(asset.masterKey,{type:'arrayBuffer',consistency:'strong'});
  if(!source||imageHash(Buffer.from(source))!==asset.image.sha256)throw Error('Trio original artwork changed');
  pieces.push(await sharp(Buffer.from(source),{limitInputPixels:LIMIT,failOn:'warning'})
   .resize(440,640,{fit:'contain',background:'#ffffff'}).flatten({background:'#ffffff'}).jpeg({quality:91}).toBuffer());
 }
 return sharp({create:{width:1500,height:800,channels:3,background:'#ffffff'}})
  .composite(pieces.map((input,i)=>({input,left:40+i*500,top:80})))
  .jpeg({quality:92}).toBuffer();
}
