import {createHash} from 'node:crypto';
import {identityFromFilename} from './poster-template.mjs';
export const PRODUCT_VERSION='sapiver-products-v1';
export const KIND_LABELS=Object.freeze({pattern:'Seamless pattern',poster:'Printable poster',bundle:'Digital design bundle',educational:'Educational poster',dinosaur:'Dinosaur poster',artwork:'Printed artwork'});
export const SECTION_TITLES=Object.freeze({pattern:'Seamless Patterns',poster:'Printable Posters',bundle:'Digital Design Bundles',educational:'Educational Posters',dinosaur:'Dinosaur Posters',artwork:'Printed Artwork'});
export const digest=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
export function productMetadata(input,filename,type){
 if(!['physical','digital'].includes(type))throw Error('Choose Physical Print or Digital Download');
 if(typeof filename!=='string'||!filename.toLowerCase().endsWith(type==='digital'?'.zip':'.png'))throw Error('Choose a PNG for physical prints or ZIP for downloads');
 if(filename.length>180||/[\\/\x00-\x1f<>]/.test(filename))throw Error('Invalid upload filename');const stem=filename.slice(0,-4),base=type==='physical'?identityFromFilename(filename):{name:stem.replace(/^SP-EL-\d{3}-/i,'').replace(/[_-]+/g,' ').trim(),sku:stem.replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30).toUpperCase()+'-'+digest(stem).slice(0,8).toUpperCase()};
 const name=String(input.name||base.name).trim();if(!name||name.length>100||/[\x00-\x1f<>]/.test(name))throw Error('Use a clear product name of at most 100 characters');
 const kind=input.kind||(type==='physical'?'educational':'');if(!(type==='digital'?['pattern','poster','bundle']:['educational','dinosaur','artwork']).includes(kind))throw Error('Choose a product group');
 const subject=String(input.subject||name).trim();if(!subject||subject.length>100||/[\x00-\x1f<>]/.test(subject))throw Error('Use a subject of at most 100 characters');
 const price=type==='digital'?Number(input.price):null;if(type==='digital'&&(!Number.isFinite(price)||price<0.2||price>10000||Math.abs(Math.round(price*100)-price*100)>0.000001))throw Error('Choose a GBP price with no more than two decimal places');
 const licence=type==='digital'?String(input.licence||'').trim():null,instructions=type==='digital'?String(input.instructions||'').trim():null;
 if(type==='digital'&&(!licence||licence.length>5000||!instructions||instructions.length>5000))throw Error('Enter the actual licence and download instructions to include in the package');
 if(kind==='pattern'&&input.seamlessConfirmed!==true)throw Error('Confirm you have checked the seamless repeat');
 const tags=String(input.tags||'').split(',').map(s=>s.trim()).filter(Boolean);if(tags.length>13||tags.some(s=>s.length>20||/[\x00-\x1f<>]/.test(s))||new Set(tags.map(s=>s.toLowerCase())).size!==tags.length)throw Error('Use up to thirteen unique tags of at most twenty characters');
 const taxonomyId=input.taxonomyId?Number(input.taxonomyId):null;if(taxonomyId!==null&&(!Number.isSafeInteger(taxonomyId)||taxonomyId<=0))throw Error('Invalid marketplace category');
 return {type,name,subject,kind,price,currency:'GBP',sku:(type==='digital'?'DG-':'')+base.sku,sectionTitle:SECTION_TITLES[kind],licence,instructions,tags,taxonomyId,seamlessConfirmed:input.seamlessConfirmed===true};
}
export function digitalListingText(metadata,files){
 const formats=[...new Set(files.filter(f=>!f.generated).map(f=>f.format.toUpperCase()))].sort();
 const title=metadata.name+' — '+KIND_LABELS[metadata.kind]+' Digital Download';if(title.length>140)throw Error('Shorten the product name');
 const inventory=files.map(f=>'- '+f.name+' ('+f.format.toUpperCase()+', '+f.bytes+' bytes'+(f.width?' • '+f.width+' × '+f.height+' pixels':'')+')').join('\n');
 const description=metadata.name+'\n\nDIGITAL DOWNLOAD — no physical item will be shipped.\n\nIncluded files:\n'+inventory+'\n\nFile formats: '+formats.join(', ')+'.\nThe listing previews show artwork included in this package. Preview images are not additional promised deliverables.\n\nDownload and use:\n'+metadata.instructions+'\n\nLicence supplied and approved by the seller:\n'+metadata.licence+'\n\nPrinting results depend on the file selected, print size, printer and paper. Only the listed pixel dimensions are verified; no universal print size or print quality is promised.';
 const defaultTags=[metadata.kind==='pattern'?'seamless pattern':metadata.kind==='poster'?'printable poster':'digital design','digital download',...formats.filter(f=>['PNG','JPG','JPEG','PDF','SVG'].includes(f)).map(f=>f.toLowerCase()+' download'),...metadata.subject.split(/\s+/).filter(s=>s.length>2&&s.length<=20)];
 const tags=metadata.tags.length?metadata.tags:[...new Set(defaultTags.map(s=>s.toLowerCase()))].slice(0,13);
 return {title,description,tags};
}
export function flattenTaxonomy(nodes){const out=[];function walk(items,path=[]){for(const n of items||[]){if(!Number.isSafeInteger(n.id)||n.id<=0||typeof n.name!=='string')throw Error('Invalid Etsy taxonomy');const p=[...path,n.name];out.push({id:n.id,name:n.name,path:p.join(' > '),leaf:!n.children?.length});walk(n.children,p);}}walk(nodes);return out;}
export function selectTaxonomy(metadata,nodes){const all=flattenTaxonomy(nodes),desired=metadata.kind==='poster'?['Digital Prints']:metadata.kind==='bundle'?['Digital Prints','Clip Art & Image Files']:['Clip Art & Image Files'];
 if(metadata.kind==='bundle'&&!metadata.taxonomyId)throw Error('Choose the verified category that matches the bundle contents');
 if(metadata.taxonomyId){const selected=all.find(n=>n.id===metadata.taxonomyId&&n.leaf);if(!selected)throw Error('Selected marketplace category is unavailable');if(!desired.includes(selected.name))throw Error('Selected marketplace category does not match this digital product type');return selected;}
 const matches=all.filter(n=>n.leaf&&desired.includes(n.name));if(matches.length!==1)throw Error('Review and select a supported Etsy marketplace category');return matches[0];}
