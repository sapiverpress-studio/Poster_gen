import sharp from 'sharp';
import {inspectPNG} from './print-check.mjs';
import {A4_PIXELS,MAX_POSTER_PIXELS} from '../public/poster-print-format.mjs';

export const printMasterKey = id=>'uploads/'+id+'/print-master.png';

export async function fitSquarePrint(bytes) {
 const source=sharp(bytes,{limitInputPixels:MAX_POSTER_PIXELS,failOn:'warning'});
 const input=await source.metadata();
 if(input.format!=='png'||(input.pages||1)!==1)throw Error('One PNG page required');
 const fitted=await source.resize({...A4_PIXELS,fit:'contain',background:'#ffffff'})
  .flatten({background:'#ffffff'}).withDensity(300).png().toBuffer();
 return {bytes:fitted,image:inspectPNG(fitted)};
}

export async function readApprovedPrintArtwork(uploads,id,asset) {
 const fitted=asset.plan?.identity?.printArtwork;
 const fileKey=fitted?printMasterKey(id):asset.masterKey;
 const image=fitted||asset.image;
 const data=await uploads.get(fileKey,{type:'arrayBuffer',consistency:'strong'});
 if(!data)throw Error('Approved print artwork changed');
 const bytes=Buffer.from(data),actual=inspectPNG(bytes);
 if(actual.sha256!==image?.sha256||(image.bytes!=null&&actual.bytes!==image.bytes))
  throw Error('Approved print artwork changed');
 return {fileKey,image:actual,bytes};
}
