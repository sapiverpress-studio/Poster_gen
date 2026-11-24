import sharp from 'sharp';
import {inspectArchive,inspectDigitalFile,ETSY_FILE_MAX,ETSY_FILE_COUNT} from './digital-archive.mjs';
import {digest} from './product-metadata.mjs';
import {validatePhoneWallpapers} from './phone-wallpapers.mjs';

async function assertTransparentMasterPng(bytes){
 // Decode only a small colour/alpha sample. A PNG with an RGBA channel and
 // 255 alpha everywhere is NOT a transparent artwork master.
 const {data,info}=await sharp(bytes,{limitInputPixels:100_000_000,failOn:'warning'})
  .resize(192,192,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let clear=0;
 for(let i=3;i<data.length;i+=info.channels)if(data[i]<=12)clear++;
 if(clear/(info.width*info.height)<.01)
  throw Error('Seamless master PNG is opaque or contains less than 1% fully clear background pixels. Return to Pattern Forge, enable genuine transparent source motifs and regenerate the seller kit. No Etsy listing was changed.');
}

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
  const wallpaper=listingMetadata.format==='sapiver-wallpaper-seller-kit'&&product?.kind==='wallpaper'&&((product.wallpaperCount===5&&product.packProfile===undefined)||(product.wallpaperCount===1&&product.packProfile==='one-design-four-sizes'&&Array.isArray(product.wallpaperSizes)&&product.wallpaperSizes.join(',')==='1080x2400,1170x2532,1290x2796,1440x3200'))&&typeof product.aiAssisted==='boolean';
  const pattern=listingMetadata.format==='sapiver-seamless-seller-kit'&&product?.kind==='pattern'&&product.seamlessConfirmed===true&&((product.packProfile===undefined&&product.aiAssisted===true)||(product.packProfile==='two-size-pair'&&typeof product.aiAssisted==='boolean'));
  if((!wallpaper&&!pattern)||listingMetadata.version!==1||
   listingMetadata.reviewRequired!==true||product?.type!=='digital'||
   product.sectionTitle!=='Digital Downloads'||product.useEmbeddedText!==true)throw Error('Unsupported or incomplete seller-kit listing manifest');
  if(!Number.isFinite(product.price)||product.price<0.2||product.price>10000||
   Math.abs(Math.round(product.price*100)-product.price*100)>0.000001||
   typeof product.name!=='string'||!product.name.trim()||product.name.length>100||
   (product.etsyTitle!==undefined&&(typeof product.etsyTitle!=='string'||!product.etsyTitle.trim()||product.etsyTitle.length>140||/[<>\x00-\x1f]/.test(product.etsyTitle)))||
   typeof product.subject!=='string'||!product.subject.trim()||product.subject.length>100||
   typeof product.description!=='string'||!product.description.trim()||product.description.length>1500||
   (product.aiAssisted&&!/AI/i.test(product.description))||!Array.isArray(product.tags)||!product.tags.length||product.tags.length>13||
   product.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>20||/[<>\x00-\x1f]/.test(t))||
   new Set(product.tags.map(t=>t.toLowerCase())).size!==product.tags.length)
   throw Error('Seller-kit listing title, price, disclosure or tags are invalid');
 }
 // Optional image-specific Pattern Forge alt text must match actual seller previews.
 const imageAlts=listingMetadata?.product?.imageAltTextByFilename;
 if(imageAlts!==undefined){
  const wallpaper=listingMetadata.product.kind==='wallpaper';
  const names=wallpaper?Object.keys(imageAlts||{}):['01-pattern.jpg','02-repeat.jpg','03-cushion-visualisation.jpg','04-files-and-detail.jpg'];
  const validAlt=value=>typeof value==='string'&&value.trim()===value&&value.length>=35&&value.length<=250&&!/[<>\x00-\x1f]/.test(value);
  if(!imageAlts||typeof imageAlts!=='object'||Array.isArray(imageAlts)||
     (wallpaper?(names.length<1||names.length>10||names.some(name=>name.includes('/')||name.includes('\\')||!/^.+\.(jpg|jpeg|png)$/i.test(name))):Object.keys(imageAlts).length!==4)||names.some(name=>!validAlt(imageAlts[name]))||
     (!wallpaper&&!validAlt(listingMetadata.product.cleanLeadAltText)))
   throw Error('Seller kit requires four filename-matched image descriptions and a clean-artwork alt description.');
 }else if(listingMetadata?.product?.cleanLeadAltText!==undefined)
  throw Error('Clean artwork alt text requires the four filename-matched image descriptions.');
 const previews=outer.files.filter(f=>/^LISTING-IMAGES\/[^/]+\.(jpg|jpeg|png)$/i.test(f.name)).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 if(imageAlts&&(previews.length!==Object.keys(imageAlts).length||previews.some(p=>!Object.hasOwn(imageAlts,p.name.split('/').pop()))))throw Error('Seller kit alt descriptions do not match the listing preview filenames');
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
 const pairProfile=listingMetadata?.product?.packProfile==='two-size-pair';
 const variantFile=files.find(f=>f.name==='SAPIVER-FOUR-VARIANTS.json');
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
   ((variantFile||pairProfile)?(packages.length<manifest.parts.length+1||packages.length>5):manifest.parts.length+1!==packages.length)||manifest.parts.length>4)throw Error('Unsafe or incomplete original PNG reassembly metadata');
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
  if(requireDocumentsPerBuyerZip||pairProfile)await assertTransparentMasterPng(original);
  if(pairProfile&&((await sharp(original).metadata()).density!==300||manifest.width!==5000||manifest.height!==5000||!manifest.filename.endsWith('-seamless-master.png')))throw Error('Reassembled two-size master must be a 5000px, 300 DPI PNG.');
  // Virtual description entry only: never add the 20 MB+ original to Etsy's
  // attachments or retain a second copy in private product records.
  files.push({...inspected,reassembled:true,partCount:manifest.parts.length,bytes:manifest.bytes});
 }else if(manifestFile||restoreFile)throw Error('PNG reassembly files were supplied without numbered image parts');
 if(requireDocumentsPerBuyerZip&&!multipart.length){
  for(const f of files){
   if(f.format==='png'&&f.name.toLowerCase().endsWith('-seamless-master.png'))
    await assertTransparentMasterPng(f.data);
  }
 }
 if(variantFile){
  let variant;
  try{variant=JSON.parse(variantFile.data.toString('utf8'));}catch{throw Error('Four-background seller manifest is not valid JSON');}
  if(variant?.format!=='sapiver-four-background-pattern'||variant.version!==1||
    !variant.transparent||typeof variant.transparent.name!=='string'||
    !variant.transparent.name.endsWith('-seamless-master.png')||
    !Number.isSafeInteger(variant.transparent.width)||variant.transparent.width<1||
    !Number.isSafeInteger(variant.transparent.height)||variant.transparent.height<1||
    variant.transparent.width*variant.transparent.height>100_000_000||
    variant.transparent.dpi!==300||variant.transparent.reconstructionParts!==multipart.length||
    variant.buyerRestorationRequired!==(multipart.length>0)||
    !Array.isArray(variant.backgrounds)||variant.backgrounds.length!==3)
    throw Error('Incomplete four-background Etsy product manifest');
  const master=files.find(f=>f.name===variant.transparent.name&&f.format==='png');
  if(!master||master.width!==variant.transparent.width||master.height!==variant.transparent.height)
    throw Error('Four-background product is missing the real transparent master');
  const names=new Set(),colours=new Set();
  for(let i=0;i<variant.backgrounds.length;i++){
    const bg=variant.backgrounds[i];
    if(typeof bg?.colour!=='string'||!/^#[0-9a-f]{6}$/i.test(bg.colour)||
       colours.has(bg.colour.toLowerCase())||!Array.isArray(bg.files)||bg.files.length!==2)
      throw Error('Four-background Etsy product needs three different colours and two PNG sizes each');
    colours.add(bg.colour.toLowerCase());
    let priorSize='';
    for(const record of bg.files){
      if(typeof record?.name!=='string'||record.name.length>120||
         !record.name.toLowerCase().includes('-colour-'+String(i+1)+'-'+bg.colour.slice(1).toLowerCase()+'-')||
         !record.name.toLowerCase().endsWith('.png')||names.has(record.name)||
         !Number.isSafeInteger(record.width)||!Number.isSafeInteger(record.height)||
         record.width<100||record.height<100||
         record.dpi!==300||!Number.isSafeInteger(record.bytes)||record.bytes<=0||
         record.bytes>ETSY_FILE_MAX)throw Error('Invalid coloured PNG in four-background Etsy package');
      const matching=files.find(f=>f.name===record.name&&f.format==='png');
      if(!matching||matching.width!==record.width||matching.height!==record.height||
         matching.bytes!==record.bytes)throw Error('Four-background buyer files do not match the exported product manifest');
      const size=record.width+'x'+record.height;
      if(size===priorSize)throw Error('Each colour must include two distinct PNG sizes');
      priorSize=size;names.add(record.name);
    }
  }
  const supplied=files.filter(f=>f.format==='png'&&!f.reassembled&&f.name!==variant.transparent.name);
  if(supplied.length!==6||supplied.some(f=>!names.has(f.name)))
    throw Error('Four-background Etsy package must contain exactly six coloured PNG files');
  for(const f of supplied){
    const {data,info}=await sharp(f.data,{limitInputPixels:100_000_000,failOn:'warning'})
      .resize(96,96).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let clear=0;for(let i=3;i<data.length;i+=info.channels)if(data[i]<=12)clear++;
    if(clear/(info.width*info.height)>=.01)
      throw Error('A coloured PNG contains unexpected transparent pixels: '+f.name);
  }
  if(packages.length<4||packages.length>5)
    throw Error('Four-background product needs four or five Etsy buyer ZIPs');
 }
 if(pairProfile){
  if(variantFile)throw Error('Two-size pair must not contain the older four-background manifest.');
  const pngs=files.filter(f=>f.format==='png');
  const required=[['-seamless-master.png',5000,true],['-transparent-2500px.png',2500,true],['-solid-5000px.png',5000,false],['-solid-2500px.png',2500,false]];
  if(pngs.length!==4||files.some(f=>['jpg','jpeg','svg','pdf'].includes(f.format)))throw Error('Two-size pair requires exactly four PNG artwork files.');
  for(const [suffix,size,transparent] of required){
   const matches=pngs.filter(f=>f.name.endsWith(suffix));
   if(matches.length!==1||matches[0].width!==size||matches[0].height!==size)throw Error('Missing or invalid '+suffix+' at '+size+' pixels.');
   const f=matches[0];
   if(!f.reassembled){
    const image=sharp(f.data,{limitInputPixels:100_000_000,failOn:'warning'});
    if((await image.metadata()).density!==300)throw Error('PNG must include 300 DPI metadata: '+f.name);
    if(transparent)await assertTransparentMasterPng(f.data);
    else if(!(await image.stats()).isOpaque)throw Error('Solid background is not fully opaque: '+f.name);
   }
  }
 }
 function document(names){const matches=files.filter(f=>names.includes(f.name.toLowerCase()));if(matches.length>1)throw Error('Seller kit has ambiguous embedded licence or instructions');return matches.length?matches[0].data.toString('utf8').trim():'';}
 const licence=document(['license.txt','licence.txt']),instructions=document(['readme.txt','instructions.txt']);
 if(!licence||!instructions||licence.length>5000||instructions.length>5000)throw Error('Seller kit requires a clear LICENSE.txt and README.txt in the buyer files');
 if(listingMetadata?.product?.kind==='wallpaper'){
  const profile=listingMetadata.product.packProfile;
  const images=validatePhoneWallpapers(files,profile);
  if(profile==='one-design-four-sizes')for(const f of images){
   if(!(await sharp(f.data,{limitInputPixels:100_000_000,failOn:'warning'}).stats()).isOpaque)throw Error('Phone wallpaper must have an opaque background: '+f.name);
  }
 }
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
