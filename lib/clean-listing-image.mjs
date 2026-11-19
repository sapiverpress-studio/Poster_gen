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

/**
 * Square thumbnail-safe cover of three separate physical prints.
 * All artwork remains fully visible at matching print sizes; no cropping,
 * mockup furniture, AI redrawing or text obscures the originals.
 */
export async function composeTrioCover(artworks){
 if(!Array.isArray(artworks)||artworks.length!==3||
    artworks.some(b=>!(Buffer.isBuffer(b)||b instanceof Uint8Array)))throw Error('Three original poster image buffers required');
 const width=1600,height=1600,paperWidth=523,paperHeight=740;
 const slots=[{left:254,top:45},{left:824,top:45},{left:539,top:807}];
 const layers=[];
 for(let i=0;i<3;i++){
  const original=Buffer.from(artworks[i]);
  const meta=await sharp(original,{limitInputPixels:LIMIT,failOn:'warning'}).metadata();
  if(!['png','jpeg'].includes(meta.format)||!meta.width||!meta.height||(meta.pages||1)!==1)
   throw Error('Each trio member must be a single verified PNG or JPEG');
  const print=await sharp(original,{limitInputPixels:LIMIT,failOn:'warning'}).rotate()
   .resize(paperWidth,paperHeight,{fit:'contain',background:'#ffffff'})
   .flatten({background:'#ffffff'}).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toBuffer();
  const {left,top}=slots[i];
  // Slight paper border and offset shadow distinguish white-on-white Streak prints.
  const paperBacking=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="545" height="762">'+
   '<rect x="13" y="13" width="523" height="740" fill="#d8d5cf" opacity="0.7"/>'+
   '<rect x="4" y="4" width="523" height="740" fill="#ffffff" stroke="#ddd9d2" stroke-width="2"/></svg>');
  layers.push({input:paperBacking,left:left-4,top:top-4},{input:print,left,top});
 }
 return sharp({create:{width,height,channels:3,background:'#f9f8f6'}})
  .composite(layers).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toBuffer();
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
  pieces.push(Buffer.from(source));
 }
 return composeTrioCover(pieces);
}
