import sharp from 'sharp';
import {inspectArchive,ETSY_FILE_MAX,ETSY_FILE_COUNT} from './digital-archive.mjs';

// Only this named seller-kit envelope permits one nested ZIP level. Buyer archives
// still use the ordinary strict validator; arbitrary/nested customer archives stay denied.
export async function inspectDigitalUpload(original){
 const outer=await inspectArchive(original,{allowSellerKit:true});
 const buyer=outer.files.filter(f=>/^UPLOAD-TO-ETSY\/[^/]+\.zip$/i.test(f.name));
 if(!buyer.length){if(outer.files.some(f=>/^(UPLOAD-TO-ETSY|LISTING-IMAGES)\//i.test(f.name)))throw Error('Seller kit needs buyer ZIPs in UPLOAD-TO-ETSY');return {inspection:outer,kit:false};}
 const previews=outer.files.filter(f=>/^LISTING-IMAGES\/[^/]+\.(jpg|jpeg|png)$/i.test(f.name)).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 if(buyer.length>ETSY_FILE_COUNT||!previews.length||previews.length>3)throw Error('Seller kit needs one to five buyer ZIPs and one to three listing images');
 for(const f of outer.files)if(!buyer.includes(f)&&!previews.includes(f)&&! /^(SELLER-CHECKLIST|QUALITY-CHECK)\.txt$/i.test(f.name))throw Error('Seller kit has an unexpected file: '+f.name);
 const packages=[],files=[],seen=new Set();let expanded=0,entries=0;
 for(const f of buyer.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
  if(f.bytes>ETSY_FILE_MAX)throw Error('Seller kit buyer ZIP exceeds the 20 MB delivery limit: '+f.name);
  let inner;try{inner=await inspectArchive(f.data);}catch(e){throw Error(e.message==='SVG has invalid dimensions'?'Seller kit contains an SVG with invalid width or height. Export it again before listing.':'Seller kit buyer ZIP failed validation. Check its file formats, paths and artwork before retrying.');}
  expanded+=inner.uncompressedBytes;entries+=inner.files.length;if(expanded>200_000_000||entries>100)throw Error('Seller kit combined buyer packages exceed safe archive limits');
  for(const entry of inner.files){const key=entry.name.normalize('NFC').toLowerCase();if(seen.has(key))throw Error('Seller kit has duplicate customer filenames across buyer ZIPs: '+entry.name);seen.add(key);files.push({...entry,packageName:f.name.split('/').pop()});}
  packages.push({name:f.name.split('/').pop(),bytes:f.bytes,sha256:f.sha256,data:f.data});
 }
 function document(names){const matches=files.filter(f=>names.includes(f.name.toLowerCase()));if(matches.length>1)throw Error('Seller kit has ambiguous embedded licence or instructions');return matches.length?matches[0].data.toString('utf8').trim():'';}
 const licence=document(['license.txt','licence.txt']),instructions=document(['readme.txt','instructions.txt']);
 if(!licence||!instructions||licence.length>5000||instructions.length>5000)throw Error('Seller kit requires a clear LICENSE.txt and README.txt in the buyer files');
 return {kit:true,inspection:{...outer,files},packages,previews,licence,instructions,sellerFiles:outer.files.filter(f=>!buyer.includes(f)&&!previews.includes(f)).map(({data,...f})=>f)};
}

export function resolveEmbeddedText(upload,metadata){
 const result={...metadata};
 for(const key of ['licence','instructions']){
  if(upload.kit&&result[key]&&result[key].trim()!==upload[key])throw Error('Seller kit '+key+' differs from the buyer ZIP. Correct the exported kit before listing it.');
  if(!result[key]&&metadata.useEmbeddedText){if(upload.kit)result[key]=upload[key];else{const names=key==='licence'?['license.txt','licence.txt']:['readme.txt','instructions.txt'];const f=upload.inspection.files.filter(f=>names.includes(f.name.toLowerCase()));if(f.length===1)result[key]=f[0].data.toString('utf8').trim();}}
  if(!result[key]||result[key].length>5000)throw Error('Digital package needs valid '+key+' entered here or included in the buyer ZIP.');
 }
 return result;
}

export async function sellerKitPreviews(previews){
 // Preserve composition and dimensions; normalise only the private listing copy.
 const images=[];for(const file of previews)images.push(await sharp(file.data,{limitInputPixels:100_000_000,failOn:'warning'}).rotate().flatten({background:'#fff'}).jpeg({quality:95}).toBuffer());return images;
}
export function sellerKitDelivery(upload){return {files:upload.packages,contents:upload.inspection.files,split:false};}
