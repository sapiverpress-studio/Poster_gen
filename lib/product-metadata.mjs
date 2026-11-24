import {PRINT_SECTIONS,DEFAULT_PRINT_SECTION} from './print-sections.mjs';
import {createHash} from 'node:crypto';
import {identityFromFilename,SIZES} from './poster-template.mjs';
import {newPosterPrintSizes} from '../public/poster-print-format.mjs';
export const PRODUCT_VERSION='sapiver-products-v1';
export const DIGITAL_KINDS=Object.freeze(['pattern','poster','bundle','wallpaper']);
export const KIND_LABELS=Object.freeze({artwork:'Printed artwork',educational:'Educational poster',dinosaur:'Dinosaur poster',pattern:'Seamless pattern',poster:'Printable poster',bundle:'Digital design bundle',wallpaper:'Five phone wallpapers'});
export const SECTION_TITLES=Object.freeze({pattern:'Digital Downloads',poster:'Printable Posters',bundle:'Digital Design Bundles',wallpaper:'Digital Downloads',...DEFAULT_PRINT_SECTION});
export {PRINT_SECTIONS,DEFAULT_PRINT_SECTION};
export const digest=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
export function productMetadata(input,filename,type,verifiedSectionTitles=PRINT_SECTIONS,existingPrintSizes){
 if(!['physical','digital'].includes(type))throw Error('Choose Physical Print or Digital Download');
 if(typeof filename!=='string'||!filename.toLowerCase().endsWith(type==='digital'?'.zip':'.png'))throw Error('Choose a PNG for physical prints or ZIP for downloads');
 if(filename.length>180||/[\\/\x00-\x1f<>]/.test(filename))throw Error('Invalid upload filename');const stem=filename.slice(0,-4),base=type==='physical'?identityFromFilename(filename):{name:stem.replace(/^SP-EL-\d{3}-/i,'').replace(/[_-]+/g,' ').trim(),sku:stem.replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30).toUpperCase()+'-'+digest(stem).slice(0,8).toUpperCase()};
 const name=String(input.name||base.name).trim();if(!name||name.length>100||/[\x00-\x1f<>]/.test(name))throw Error('Use a clear product name of at most 100 characters');
 const kind=input.kind||(type==='physical'?'artwork':'');if(!(type==='digital'?DIGITAL_KINDS:['educational','dinosaur','artwork']).includes(kind))throw Error('Choose a product group');
 const sectionTitle=type==='physical'?(input.sectionTitle||DEFAULT_PRINT_SECTION[kind]):SECTION_TITLES[kind];if(type==='physical'&&(!verifiedSectionTitles.includes(sectionTitle)||sectionTitle.length>24||/[<>\u0000-\u001f\u007f]/.test(sectionTitle)))throw Error('Choose an existing Etsy shop section');
 const etsyTitle=String(input.etsyTitle||'').trim();
 if(etsyTitle&&(etsyTitle.length>140||/[\x00-\x1f<>]/.test(etsyTitle)))throw Error('Etsy title must be at most 140 characters');
 const description=String(input.description||'').trim();if(description.length>(type==='digital'?1500:9000)||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(description))throw Error('Listing description is too long or contains invalid characters');
 const artworkAltText=type==='physical'?String(input.artworkAltText||'').trim():'';if(artworkAltText&&(artworkAltText.length>250||/[<>\x00-\x1f]/.test(artworkAltText)))throw Error('Artwork alt text must be plain text of at most 250 characters');
 const printSizes=type==='physical'?newPosterPrintSizes(existingPrintSizes?.length?existingPrintSizes:input.printSizes):null;
 // Only a server-supplied revision can retain the sizes of an existing listing.
 if(type==='physical'&&existingPrintSizes?.join('|')===SIZES.join('|'))printSizes.push('A3');
 const subject=String(input.subject||name).trim();if(!subject||subject.length>100||/[\x00-\x1f<>]/.test(subject))throw Error('Use a subject of at most 100 characters');
 const price=type==='digital'?Number(input.price):null;if(type==='digital'&&(!Number.isFinite(price)||price<0.2||price>10000||Math.abs(Math.round(price*100)-price*100)>0.000001))throw Error('Choose a GBP price with no more than two decimal places');
 const licence=type==='digital'?String(input.licence||'').trim():null,instructions=type==='digital'?String(input.instructions||'').trim():null;
 const useEmbeddedText=type==='digital'&&input.useEmbeddedText===true;
 if(type==='digital'&&((!licence||!instructions)&&!useEmbeddedText||licence.length>5000||instructions.length>5000))throw Error('Enter the actual licence and download instructions to include in the package');
 if(kind==='pattern'&&input.seamlessConfirmed!==true)throw Error('Confirm you have checked the seamless repeat');
 const tags=String(input.tags||'').split(',').map(s=>s.trim()).filter(Boolean);if(tags.length>13||tags.some(s=>s.length>20||/[\x00-\x1f<>]/.test(s))||new Set(tags.map(s=>s.toLowerCase())).size!==tags.length)throw Error('Use up to thirteen unique tags of at most twenty characters');
 // Optional digital alt corrections come from the owner's review. One line per
 // actual Etsy preview, in visual order; legacy ZIPs may leave this empty.
 const digitalAlts=type==='digital'?String(input.digitalAltTexts||'').trim():''; 
 const digitalAltTexts=digitalAlts?digitalAlts.split(/\r?\n/).map(v=>v.trim()):[];
 if(digitalAltTexts.length>10||digitalAltTexts.some(v=>v.length<35||v.length>250||/[<>\x00-\x1f]/.test(v)))
  throw Error('Enter one truthful 35–250 character alt description per digital listing image.');
 const taxonomyId=input.taxonomyId?Number(input.taxonomyId):null;if(taxonomyId!==null&&(!Number.isSafeInteger(taxonomyId)||taxonomyId<=0))throw Error('Invalid marketplace category');
 const websiteFolder=String(input.websiteFolder||'').trim();if(websiteFolder.length>45||/[<>\\x00-\\x1f\\x7f]/.test(websiteFolder))throw Error('Invalid private website folder');
 return {websiteFolder,type,name,subject,description,etsyTitle,artworkAltText,kind,price,currency:'GBP',sku:(type==='digital'?'DG-':'')+base.sku,sectionTitle,printSizes,licence,instructions,useEmbeddedText,tags,digitalAltTexts,taxonomyId,seamlessConfirmed:input.seamlessConfirmed===true};
}
export function digitalListingText(metadata,files){
 const fourFile=files.find(f=>f.name==='SAPIVER-FOUR-VARIANTS.json');
 let fourWay=null;
 if(fourFile){try{fourWay=JSON.parse(fourFile.data.toString('utf8'));}catch{throw Error('Invalid four-background manifest');}}
 const fourSummary=fourWay?[
  'FOUR SEAMLESS PATTERN BACKGROUNDS',
  'One transparent full-resolution PNG master: '+fourWay.transparent.width+' × '+fourWay.transparent.height+' pixels.',
  ...fourWay.backgrounds.map((b,i)=>'Background '+(i+1)+' ('+b.colour+'): '+b.files.map(f=>f.width+' × '+f.height+' px PNG').join(' and ')+'.'),
  'The transparent original is never automatically downsized. All versions are supplied together in this one digital listing.',
  ''
 ].join('\n')+'\n':'';

 const displayFiles=files.filter(f=>f.format!=='pngpart'&&f.name!=='PNG-REASSEMBLY.json'&&f.name!=='REBUILD-PNG.html'&&f.name!=='SAPIVER-FOUR-VARIANTS.json');
 const multipart=displayFiles.find(f=>f.reassembled===true);
 const formats=[...new Set(displayFiles.filter(f=>!f.generated).map(f=>f.format.toUpperCase()))].sort();
 const title=metadata.etsyTitle||metadata.name+' — '+KIND_LABELS[metadata.kind]+' Digital Download';if(title.length>140)throw Error('Shorten the product name');
 const inventory=displayFiles.map(f=>'- '+f.name+' ('+f.format.toUpperCase()+', '+f.bytes+' bytes'+(f.width?' • '+f.width+' × '+f.height+' pixels':'')+(f.reassembled?' — restore exact original from '+f.partCount+' numbered PNG ZIPs':'')+')').join('\n');
 const usage=metadata.kind==='wallpaper'?'Five portrait phone wallpapers for personal screen customisation. Download and unzip the files, save an image to your phone and choose it in your wallpaper settings. Phone screens and clock layouts vary; crop or reposition as needed. Phone frames in listing photos are illustrative. No app icons, widgets, physical phone or printed product are included.':'Printing results depend on the file selected, print size, printer and paper. Only the listed pixel dimensions are verified; no universal print size or print quality is promised.';
 const description=(metadata.description||metadata.name)+'\n\nDIGITAL DOWNLOAD — no physical item will be shipped.\n\n'+fourSummary+(multipart?'IMPORTANT: The transparent full-resolution PNG is supplied losslessly across '+multipart.partCount+' numbered Etsy ZIPs. Download ALL numbered parts and the colour ZIP containing REBUILD-PNG.html. Restore it offline without changing any original pixels.\n\n':'')+'Included files:\n'+inventory+'\n\nFile formats: '+formats.join(', ')+'.\nThe listing previews show artwork included in this package. Preview images are not additional promised deliverables.\n\nDownload and use:\n'+metadata.instructions+'\n\nLicence supplied and approved by the seller:\n'+metadata.licence+'\n\n'+usage;
 const defaultTags=[metadata.kind==='pattern'?'seamless pattern':metadata.kind==='poster'?'printable poster':metadata.kind==='wallpaper'?'phone wallpaper':'digital design','digital download',...formats.filter(f=>['PNG','JPG','JPEG','PDF','SVG'].includes(f)).map(f=>f.toLowerCase()+' download'),...metadata.subject.split(/\s+/).filter(s=>s.length>2&&s.length<=20)];
 const tags=metadata.tags.length?metadata.tags:[...new Set(defaultTags.map(s=>s.toLowerCase()))].slice(0,13);
 return {title,description,tags};
}
export function flattenTaxonomy(nodes){const out=[];function walk(items,path=[]){for(const n of items||[]){if(!Number.isSafeInteger(n.id)||n.id<=0||typeof n.name!=='string')throw Error('Invalid Etsy taxonomy');const p=[...path,n.name];out.push({id:n.id,name:n.name,path:p.join(' > '),leaf:!n.children?.length});walk(n.children,p);}}walk(nodes);return out;}
export function selectTaxonomy(metadata,nodes){const all=flattenTaxonomy(nodes),desired=['poster','wallpaper'].includes(metadata.kind)?['Digital Prints']:metadata.kind==='bundle'?['Digital Prints','Clip Art & Image Files']:['Clip Art & Image Files'];
 if(metadata.kind==='bundle'&&!metadata.taxonomyId)throw Error('Choose the verified category that matches the bundle contents');
 if(metadata.taxonomyId){const selected=all.find(n=>n.id===metadata.taxonomyId&&n.leaf);if(!selected)throw Error('Selected marketplace category is unavailable');if(!desired.includes(selected.name))throw Error('Selected marketplace category does not match this digital product type');return selected;}
 const matches=all.filter(n=>n.leaf&&desired.includes(n.name));if(matches.length!==1)throw Error('Review and select a supported Etsy marketplace category');return matches[0];}
