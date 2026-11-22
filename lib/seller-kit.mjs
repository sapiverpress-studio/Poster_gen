import sharp from 'sharp';
import {inspectArchive,inspectDigitalFile,ETSY_FILE_MAX,ETSY_FILE_COUNT} from './digital-archive.mjs';
import {digest} from './product-metadata.mjs';

// Only this named seller-kit envelope permits one nested ZIP level. Buyer archives
// still use the ordinary strict validator; arbitrary/nested customer archives stay denied.
export async function inspectDigitalUpload(original,{requireDocumentsPerBuyerZip=false}={}){
 const requiredDocs=['license.txt','readme.txt','about-sapiver-prints.txt'];
 const repeatableDocs=new Set([...requiredDocs,'licence.txt','instructions.txt']);
 const outer=await inspectArchive(original,{allowSellerKit:true});
 const buyer=outer.files.filter(f=>/^UPLOAD-TO-ETSY\/[^/]+\.zip$/i.test(f.name));
 if(!buyer.length){if(outer.files.some(f=>/^(UPLOAD-TO-ETSY|LISTING-IMAGES)\//i.test(f.name)))throw Error('Seller kit needs buyer ZIPs in UPLOAD-TO-ETSY');return {inspection:outer,kit:false};}
 const listingFile=outer.files.find(f=>f.name==='LISTING-METADATA.json');
 let listingMetadata=null;
 if(listingFile){
  if(listingFile.bytes>32_000)throw Error('Seller-kit listing manifest exceeds 32 KB');
  try{listingMetadata=JSON.parse(listingFile.data.toString('utf8'));}catch{throw Error('Seller-kit listing manifest must be valid JSON');}
  const product=listingMetadata?.product;
  if(listingMetadata.format!=='sapiver-seamless-seller-kit'||listingMetadata.version!==1||
   listingMetadata.reviewRequired!==true||product?.type!=='digital'||product.kind!=='pattern'||
   product.sectionTitle!=='Digital Downloads'||product.seamlessConfirmed!==true||
   product.useEmbeddedText!==true||product.aiAssisted!==true)throw Error('Unsupported or incomplete seller-kit listing manifest');
  if(!Number.isFinite(product.price)||product.price<0.2||product.price>10000||
   Math.abs(Math.round(product.price*100)-product.price*100)>0.000001||
   typeof product.name!=='string'||!product.name.trim()||product.name.length>100||
   (product.etsyTitle!==undefined&&(typeof product.etsyTitle!=='string'||!product.etsyTitle.trim()||product.etsyTitle.length>140||/[<>\x00-\x1f]/.test(product.etsyTitle)))||
   typeof product.subject!=='string'||!product.subject.trim()||product.subject.length>100||
   typeof product.description!=='string'||!product.description.trim()||product.description.length>1500||
   !/AI/i.test(product.description)||!Array.isArray(product.tags)||!product.tags.length||product.tags.length>13||
   product.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>20||/[<>\x00-\x1f]/.test(t))||
   new Set(product.tags.map(t=>t.toLowerCase())).size!==product.tags.length)
   throw Error('Seller-kit listing title, price, disclosure or tags are invalid');
 }
 const previews=outer.files.filter(f=>/^LISTING-IMAGES\/[^/]+\.(jpg|jpeg|png)$/i.test(f.name)).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 if(buyer.length>ETSY_FILE_COUNT||!previews.length||previews.length>10)throw Error('Seller kit needs one to five buyer ZIPs and one to ten listing images');
 for(const f of outer.files)if(!buyer.includes(f)&&!previews.includes(f)&&!(f===listingFile||/^(SELLER-CHECKLIST|QUALITY-CHECK)\.txt$/i.test(f.name)))throw Error('Seller kit has an unexpected file: '+f.name);
 const packages=[],files=[],seen=new Map();let expanded=0,entries=0;
 for(const f of buyer.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
  if(f.bytes>ETSY_FILE_MAX)throw Error('Seller kit buyer ZIP exceeds the 20 MB delivery limit: '+f.name);
  let inner;try{inner=await inspectArchive(f.data,{allowMultipart:true});}catch(e){throw Error(e.message==='SVG has invalid dimensions'?'Seller kit contains an SVG with invalid width or height. Export it again before listing.':'Seller kit buyer ZIP failed validation. Check its file formats, paths and artwork before retrying.');}
  if(requireDocumentsPerBuyerZip){
   const names=new Set(inner.files.map(entry=>entry.name.normalize('NFC').toLowerCase()));
   for(const name of requiredDocs)if(!names.has(name))throw Error('Seamless pattern buyer ZIP '+f.name+' is missing '+name+'. Every download must include the licence, About and instructions.');
  }
  expanded+=inner.uncompressedBytes;entries+=inner.files.length;if(expanded>200_000_000||entries>100)throw Error('Seller kit combined buyer packages exceed safe archive limits');
  for(const entry of inner.files){
   const key=entry.name.normalize('NFC').toLowerCase(),prior=seen.get(key);
   if(prior){
    // Only identical customer documents may repeat between separately downloadable ZIPs.
    if(!repeatableDocs.has(key)||prior!==entry.sha256)throw Error('Seller kit has duplicate or conflicting customer filenames across buyer ZIPs: '+entry.name);
    continue;
   }
   seen.set(key,entry.sha256);files.push({...entry,packageName:f.name.split('/').pop()});
  }
  packages.push({name:f.name.split('/').pop(),bytes:f.bytes,sha256:f.sha256,data:f.data});
 }
 const multipart=files.filter(f=>f.format==='pngpart');
 const manifestFile=files.find(f=>f.name==='PNG-REASSEMBLY.json');
 const restoreFile=files.find(f=>f.name==='REBUILD-PNG.html');
 if(multipart.length){
  if(!manifestFile||!restoreFile)throw Error('Multi-part original PNG requires the reassembly manifest and offline restoration HTML');
  let manifest;try{manifest=JSON.parse(manifestFile.data.toString('utf8'));}catch{throw Error('Invalid PNG reassembly manifest');}
  if(manifest?.format!=='sapiver-full-png-parts'||manifest.version!==1||
   !/^[a-z0-9_-]+\.png$/i.test(manifest.filename)||!Number.isSafeInteger(manifest.bytes)||
   manifest.bytes<20_000_000||manifest.bytes>100_000_000||
   !/^[0-9a-f]{64}$/.test(manifest.sha256)||
   !Number.isSafeInteger(manifest.width)||!Number.isSafeInteger(manifest.height)||
   manifest.width<1||manifest.height<1||manifest.width*manifest.height>100_000_000||
   manifest.dpi!==300||!Array.isArray(manifest.parts)||
   manifest.parts.length!==multipart.length||manifest.parts.length<2||
   manifest.parts.length+1!==packages.length||manifest.parts.length>4)throw Error('Unsafe or incomplete original PNG reassembly metadata');
  const ordered=[],names=new Set();
  for(let i=0;i<manifest.parts.length;i++){
   const part=manifest.parts[i];
   if(typeof part?.name!=='string'||!part.name.endsWith('-png-part-'+String(i+1).padStart(2,'0')+'.pngpart')||
     !/^[a-z0-9_-]+\.pngpart$/i.test(part.name)||names.has(part.name)||
     !Number.isSafeInteger(part.bytes)||part.bytes<=0||part.bytes>18_500_000||
     !/^[0-9a-f]{64}$/.test(part.sha256))throw Error('Invalid original PNG part metadata');
   names.add(part.name);
   const received=multipart.find(f=>f.name===part.name);
   if(!received||received.bytes!==part.bytes||received.sha256!==part.sha256)throw Error('Missing or corrupted original PNG part: '+part.name);
   const zipOwner=packages.find(p=>p.name===received.packageName);
   if(!zipOwner||!zipOwner.name.includes('-png-part.zip'))throw Error('PNG part is not in a numbered Etsy ZIP');
   ordered.push(received.data);
  }
  const original=Buffer.concat(ordered);
  if(original.length!==manifest.bytes||digest(original)!==manifest.sha256)throw Error('Restored PNG does not match the original bytes');
  const inspected=await inspectDigitalFile(manifest.filename,original);
  if(inspected.width!==manifest.width||inspected.height!==manifest.height)throw Error('Restored PNG dimensions differ from export metadata');
  // Virtual description entry only: never add the 20 MB+ original to Etsy's
  // attachments or retain a second copy in private product records.
  files.push({...inspected,reassembled:true,partCount:manifest.parts.length,bytes:manifest.bytes});
 }else if(manifestFile||restoreFile)throw Error('PNG reassembly files were supplied without numbered image parts');
 function document(names){const matches=files.filter(f=>names.includes(f.name.toLowerCase()));if(matches.length>1)throw Error('Seller kit has ambiguous embedded licence or instructions');return matches.length?matches[0].data.toString('utf8').trim():'';}
 const licence=document(['license.txt','licence.txt']),instructions=document(['readme.txt','instructions.txt']);
 if(!licence||!instructions||licence.length>5000||instructions.length>5000)throw Error('Seller kit requires a clear LICENSE.txt and README.txt in the buyer files');
 return {kit:true,inspection:{...outer,files},packages,previews,licence,instructions,listingMetadata,sellerFiles:outer.files.filter(f=>!buyer.includes(f)&&!previews.includes(f)).map(({data,...f})=>f)};
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
