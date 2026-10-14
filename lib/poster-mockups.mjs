import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {POSTER_SCENES} from './poster-scenes.mjs';

// Reuse original blank scenes. Artwork is resized without cropping or AI redraw.
export async function makePosterMockups(bytes) {
 const meta=await sharp(bytes,{limitInputPixels:100_000_000,failOn:'warning'}).metadata();
 if(meta.format!=='png'||(meta.pages||1)!==1)throw Error('One PNG page required');
 const out=[],labels=['Print only — unframed','Black frame','White frame','Oak frame'];
 for(const [i,scene] of POSTER_SCENES.entries()) {
  const background=await readFile(new URL('./assets/poster-scenes/'+scene.name+'.webp',import.meta.url));
  const art=await sharp(bytes).resize(scene.width,scene.height,{fit:'contain',background:'#ffffff'}).flatten({background:'#ffffff'}).png().toBuffer();
  const caption=Buffer.from('<svg width="1448" height="100"><rect width="1448" height="100" fill="#f4f1eb"/><text x="724" y="38" text-anchor="middle" font-family="sans-serif" font-size="27" fill="#333">'+labels[i]+'</text><text x="724" y="74" text-anchor="middle" font-family="sans-serif" font-size="21" fill="#555">Illustrative mockup • frame appearance may vary</text></svg>');
  out.push(await sharp(background).extend({bottom:100,background:'#f4f1eb'}).composite([{input:art,left:scene.left,top:scene.top},{input:caption,left:0,top:1086}]).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer());
 }
 return out;
}
