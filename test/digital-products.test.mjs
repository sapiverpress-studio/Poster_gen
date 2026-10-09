import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
import {zipFiles,inspectArchive,inspectDigitalFile,packageForEtsy,digitalPreviews} from '../lib/digital-archive.mjs';
import {productMetadata,digest,selectTaxonomy,digitalListingText} from '../lib/product-metadata.mjs';
import {prepareDigitalProduct,publishDigitalProduct} from '../lib/digital-product.mjs';
import {ensureSection,recordKey,recordRevision} from '../lib/product-records.mjs';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {seal} from '../lib/oauth.mjs';
const id='p'.repeat(32),origin='https://poster.example.test',secret='test-root-encryption-secret-123456789';
const values={CANVA_CLIENT_SECRET:secret,CANVA_SITE_ORIGIN:origin,CANVA_SETUP_PASSWORD:'owner-password',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',POSTER_PUBLICATION_ENABLED:'true'},env=n=>values[n];
export function memory(){const map=new Map();let seq=0;return {map,async get(k){return map.get(k)?.data??null;},async getWithMetadata(k){return map.get(k)||null;},async set(k,data,o={}){const old=map.get(k);if(o.onlyIfNew&&old||o.onlyIfMatch&&old?.etag!==o.onlyIfMatch)return {modified:false};map.set(k,{data,etag:String(++seq)});return {modified:true};},async setJSON(k,d,o){return this.set(k,d,o);},async delete(k){map.delete(k);},async *list({prefix}){yield {blobs:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}};}
const metadata=()=>productMetadata({kind:'pattern',subject:'Leaves',price:4.99,licence:'Personal use only. Do not resell or redistribute the source files.',instructions:'Download both files from Etsy. Unzip product.zip and open the included images.',seamlessConfirmed:true},'Green-Leaves.zip','digital');
async function archiveFixture(){const png=await sharp({create:{width:80,height:80,channels:3,background:'#007733'}}).png().toBuffer(),jpg=await sharp(png).jpeg().toBuffer(),original=await zipFiles([{name:'tile.png',data:png},{name:'repeat-preview.jpg',data:jpg},{name:'INSTRUCTIONS.txt',data:Buffer.from('Open PNG or JPG in your design application.')}]);return {png,jpg,original};}
const taxonomies=[{id:1,name:'Craft Supplies & Tools',children:[{id:20,name:'Clip Art & Image Files',children:[]}]},{id:2,name:'Art',children:[{id:30,name:'Digital Prints',children:[]}]}];
test('ZIP inspection verifies actual images and checksums; preserves original bytes and source payloads',async()=>{const f=await archiveFixture(),a=await inspectArchive(f.original);assert.equal(a.files.length,3);assert.equal(a.files[0].width,80);assert.deepEqual(a.files[0].data,f.png);const delivery=await packageForEtsy(f.original,a,metadata());assert.equal(delivery.files.length,2);assert.deepEqual(delivery.files[0].data,f.original);assert.ok(delivery.contents.some(f=>f.generated));const images=await digitalPreviews(a.files);assert.equal(images.length,2);assert.equal((await sharp(images[0]).metadata()).width,1200);});
test('independent split ZIPs preserve every payload; impossible individual file and more than five parts stop safely',async()=>{const png=await sharp(randomBytes(40*40*3),{raw:{width:40,height:40,channels:3}}).png().toBuffer(),source=[0,1,2].map(i=>({name:'tile-'+i+'.png',data:png})),original=await zipFiles(source),inspection=await inspectArchive(original);const split=await packageForEtsy(original,inspection,metadata(),{maxBytes:6500,maxFiles:5});assert.equal(split.split,true);assert.ok(split.files.length>1);const found=[];for(const file of split.files){assert.ok(file.bytes<=6500);const decoded=await inspectArchive(file.data).catch(async e=>{if(file.name.endsWith('.zip')&&file.bytes<1000)return {files:[]};throw e;});found.push(...decoded.files.filter(f=>f.name.startsWith('tile-')));}assert.equal(found.length,3);assert.ok(found.every(f=>f.sha256===digest(png)));await assert.rejects(packageForEtsy(original,inspection,metadata(),{maxBytes:1000,maxFiles:5}),/individual file/);await assert.rejects(packageForEtsy(original,inspection,metadata(),{maxBytes:6500,maxFiles:1}),/five files/);});
test('malformed, duplicate, encrypted, linked, nested, deceptive and expansion-bomb archives are rejected',async()=>{
 await assert.rejects(inspectArchive(Buffer.from('not a zip')));
 const f=await archiveFixture();await assert.rejects(inspectArchive(await zipFiles([{name:'tile.png',data:f.png},{name:'TILE.png',data:f.png}])) ,/Duplicate/);
 await assert.rejects(inspectArchive(await zipFiles([{name:'nested.zip',data:f.original}])) ,/Unsupported/);
 await assert.rejects(inspectArchive(await zipFiles([{name:'fake.png',data:Buffer.from('PNG name, HTML contents')}]))) ;
 await assert.rejects(inspectArchive(await zipFiles([{name:'huge.txt',data:Buffer.alloc(2_000_000,65)}])),/expansion/);
 const encrypted=Buffer.from(f.original);encrypted.writeUInt16LE(encrypted.readUInt16LE(6)|1,6);const central=encrypted.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));encrypted.writeUInt16LE(encrypted.readUInt16LE(central+8)|1,central+8);await assert.rejects(inspectArchive(encrypted),/Encrypted/);
 const linked=Buffer.from(f.original),c=linked.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));linked.writeUInt32LE((0xa1ff<<16)>>>0,c+38);await assert.rejects(inspectArchive(linked),/links/);
 const mismatch=Buffer.from(f.original);mismatch[30]=88;await assert.rejects(inspectArchive(mismatch),/header mismatch/);
 const badCrc=Buffer.from(f.original),bc=badCrc.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));badCrc.writeUInt32LE(0,bc+16);await assert.rejects(inspectArchive(badCrc),/checksum/);
});
test('SVG and PDF parsing rejects active content and validates real documents without modifying files',async()=>{
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>');assert.equal((await inspectDigitalFile('art.svg',svg)).format,'svg');
 for(const body of ['<script>alert(1)</script>','<image href="https://evil.example.test/a.png"/>','<rect onclick="x()"/>'])await assert.rejects(inspectDigitalFile('art.svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'+body+'</svg>')));
 await assert.rejects(inspectDigitalFile('art.svg',Buffer.from('<!DOCTYPE svg [<!ENTITY a SYSTEM "file:///etc/passwd">]><svg/>')));
 const pdf=await PDFDocument.create();pdf.addPage([595,842]);const bytes=Buffer.from(await pdf.save());assert.equal((await inspectDigitalFile('poster.pdf',bytes)).pages,1);
 pdf.catalog.set(PDFName.of('OpenAction'),pdf.context.obj({S:PDFName.of('JavaScript'),JS:PDFString.of('alert(1)')}));await assert.rejects(inspectDigitalFile('poster.pdf',Buffer.from(await pdf.save())),/Active PDF|active PDF/);
 await assert.rejects(inspectDigitalFile('fake.pdf',Buffer.from('%PDF-1.7\nnot a document\n%%EOF')));
});
test('metadata requires real licensing, price and checked repeat; taxonomy does not invent IDs or ambiguous categories',()=>{
 const m=metadata();assert.equal(m.price,4.99);assert.equal(m.sectionTitle,'Seamless Patterns');assert.equal(selectTaxonomy(m,taxonomies).id,20);assert.equal(selectTaxonomy({...m,kind:'poster'},taxonomies).id,30);assert.throws(()=>selectTaxonomy({...m,taxonomyId:999},taxonomies));assert.throws(()=>selectTaxonomy(m,[...taxonomies,{id:99,name:'Clip Art & Image Files',children:[]}]));
 assert.throws(()=>productMetadata({kind:'pattern',price:5,licence:'x',instructions:'y'},'Leaves.zip','digital'),/repeat/);assert.throws(()=>productMetadata({kind:'poster',price:5},'Poster.zip','digital'),/licence/);assert.throws(()=>productMetadata({kind:'poster',price:1.234,licence:'x',instructions:'y'},'Poster.zip','digital'),/price/);
 const text=digitalListingText(m,[{name:'art.png',format:'png',bytes:123,width:80,height:80}]);assert.match(text.description,/no physical item will be shipped/);assert.doesNotMatch(text.description,/commercial use permitted|300 DPI|A1/);assert.ok(text.tags.length<=13);
});
async function publicationFixture({update=false,failFiles=false}={}){
 const uploads=memory(),etsyStore=memory(),calls=[],source=await archiveFixture();const a={phase:'preparing',type:'digital',productId:id,filename:'Green-Leaves.zip',metadata:metadata(),bytes:source.original.length,chunks:1,previewCount:0,sourcePreviewCount:0,createdAt:Date.now()};await uploads.set('uploads/'+id+'/chunks/0',source.original);await uploads.setJSON('uploads/'+id+'/state',a);await recordRevision(uploads,id);
 let listing,files=[],images=[],sections=[{shop_section_id:44,title:'Seamless Patterns'}],created=0;const listingId=555;
 const money=n=>({amount:Math.round(Number(n)*100),divisor:100,currency_code:'GBP'});
 if(update){listing={listing_id:listingId,shop_id:456,state:'active',listing_type:'download',title:'Old',description:'Old',price:money(3),tags:['old'],taxonomy_id:20,shop_section_id:44,who_made:'i_did',when_made:'2020_2026',has_variations:false};files=[{listing_file_id:90,listing_id:listingId,filename:'old.zip',size_bytes:999}];await uploads.setJSON(recordKey(id),{productId:id,type:'digital',etsyListingId:listingId,etsyUrl:'https://www.etsy.com/listing/555/old',phase:'published',currentRevision:'q'.repeat(32),pendingRevision:id,metadata:metadata(),files:[]});await uploads.setJSON('uploads/'+id+'/state',{...a,updateProductId:id});}
 const client={session:async()=>({shop_id:456,shop_name:'SapiverPrints'}),api:async(path,o={})=>{calls.push([path,o]);if(path==='/seller-taxonomy/nodes')return {results:taxonomies};if(path==='/shops/456/sections')return {results:sections};
  if(path==='/shops/456/listings'&&o.method==='POST'){created++;const b=Object.fromEntries(new URLSearchParams(o.body));listing={...b,listing_id:listingId,shop_id:456,state:'draft',url:'https://www.etsy.com/listing/555/green-leaves',listing_type:b.type,price:money(b.price),taxonomy_id:Number(b.taxonomy_id),shop_section_id:Number(b.shop_section_id),tags:b.tags.split(','),has_variations:false,is_personalizable:false};return listing;}
  if(path.startsWith('/listings/555'))return {...listing,images};
  if(path==='/shops/456/listings/555'&&o.method==='PATCH'){const b=Object.fromEntries(new URLSearchParams(o.body));for(const [k,v]of Object.entries(b)){if(k==='price')listing.price=money(v);else if(k==='taxonomy_id'||k==='shop_section_id')listing[k]=Number(v);else if(k==='tags')listing.tags=v.split(',');else if(k==='type')listing.listing_type=v;else if(k==='image_ids')images=images.filter(i=>v.split(',').includes(String(i.listing_image_id)));else listing[k]=v;}return listing;}
  if(path==='/shops/456/listings/555/files'){if(o.method==='POST'){if(failFiles)throw Error('Ambiguous API upload');const blob=o.body.get('file'),f={listing_file_id:100+files.length,listing_id:listingId,filename:o.body.get('name'),size_bytes:blob.size};files.push(f);return f;}return {count:files.length,results:files};}
  if(path.startsWith('/shops/456/listings/555/files/')&&o.method==='DELETE'){files=files.filter(f=>f.listing_file_id!==Number(path.split('/').pop()));return null;}
  if(path==='/shops/456/listings/555/images'){const image={listing_image_id:200+images.length,listing_id:listingId};images.push(image);return image;}
  throw Error('Unexpected API endpoint: '+path);
 }};return {id,uploads,etsyStore,client,env,calls,source,created:()=>created,listing:()=>listing,files:()=>files};
}
async function approve(f){const a=await f.uploads.get('uploads/'+id+'/state');await f.uploads.setJSON('uploads/'+id+'/state',{...a,phase:'publishing',approvedAt:Date.now()});await f.uploads.setJSON('claims/'+id+'/publish',{approvalHash:a.approvalHash});return a.approvalHash;}
test('digital prepare and Deploy produce one download listing, verified files/images/section and permanent record without PrintShrimp',async()=>{
 const f=await publicationFixture();await prepareDigitalProduct(f);assert.deepEqual(Buffer.from(await f.uploads.get('uploads/'+id+'/original.zip')),f.source.original);const hash=await approve(f);const result=await publishDigitalProduct({...f,approvalHash:hash});assert.equal(result.listingId,555);assert.equal(f.created(),1);assert.equal(f.files().length,2);const record=await f.uploads.get(recordKey(id));assert.equal(record.phase,'published');assert.equal(record.etsyListingId,555);assert.equal(record.supplierProductId,null);assert.equal(record.etsyUrl,'https://www.etsy.com/listing/555/green-leaves');
 for(const [path,o]of f.calls){assert.doesNotMatch(path,/printshrimp|shipping|production-partners|inventory|orders/);if(o.method==='POST'&&path==='/shops/456/listings')assert.doesNotMatch(o.body,/shipping_profile_id|readiness_state_id|return_policy_id/);}
 await assert.rejects(publishDigitalProduct({...f,approvalHash:hash}));assert.equal(f.created(),1);
});
test('wrong approval, changed customer ZIP or changed preview prevents every merchant write',async()=>{
 for(const mode of ['wrong','zip','preview']){const f=await publicationFixture();await prepareDigitalProduct(f);const hash=await approve(f);if(mode==='zip')await f.uploads.set('uploads/'+id+'/original.zip',Buffer.from('tampered'));if(mode==='preview')await f.uploads.set('uploads/'+id+'/mockups/0.jpg',Buffer.from('changed'));await assert.rejects(publishDigitalProduct({...f,approvalHash:mode==='wrong'?'wrong':hash}));assert.equal(f.created(),0);assert.equal(f.calls.filter(([,o])=>o.method==='POST'||o.method==='PATCH').length,0);}
});
test('partial Etsy file failure retains known ID and reservation; reattempt cannot create a duplicate',async()=>{
 const f=await publicationFixture({failFiles:true});await prepareDigitalProduct(f);const hash=await approve(f);await assert.rejects(publishDigitalProduct({...f,approvalHash:hash}));assert.equal((await f.uploads.get('uploads/'+id+'/state')).listingId,555);assert.equal(f.listing().state,'draft');await assert.rejects(publishDigitalProduct({...f,approvalHash:hash}));assert.equal(f.created(),1);assert.ok(!f.calls.some(([,o])=>o.body==='state=active'));
});
test('updating digital delivery deactivates and replaces files on the same listing ID then verifies before activation',async()=>{
 const f=await publicationFixture({update:true});await prepareDigitalProduct(f);const hash=await approve(f);f.listing().url='https://www.etsy.com/listing/555/green-leaves';const result=await publishDigitalProduct({...f,approvalHash:hash});assert.equal(result.listingId,555);assert.equal(f.created(),0);assert.equal(f.files().some(f=>f.filename==='old.zip'),false);assert.equal(f.listing().state,'active');assert.ok(f.calls.some(([,o])=>o.body==='state=inactive'));
});
test('shop sections reuse exact names and ambiguous creation never automatically repeats',async()=>{
 const store=memory();let created=0,sections=[];const client={api:async(p,o={})=>{if(o.method==='POST'){created++;throw Error('Timeout');}return {results:sections};}};await assert.rejects(ensureSection({client,shopId:456,title:'Printable Posters',store}));await assert.rejects(ensureSection({client,shopId:456,title:'Printable Posters',store}));assert.equal(created,1);sections=[{title:'Printable Posters',shop_section_id:99}];assert.equal(await ensureSection({client,shopId:456,title:'Printable Posters',store}),99);assert.equal(created,1);
 sections=Array.from({length:20},(_,i)=>({title:'Section '+i,shop_section_id:i+1}));await assert.rejects(ensureSection({client,shopId:456,title:'New section',store}),/twenty/);
});
test('website accepts digital ZIP without a physical reference, preserves CSRF and exposes Deploy only on reviewed state',async()=>{
 const uploads=memory(),queued=[],handler=createPosterUploadHandler({env,uploads,dispatchJob:async(...args)=>queued.push(args)}),cookie='__Host-poster_owner='+seal({csrf:'csrf',expiry:Date.now()+3600000},secret,'poster-owner');
 const req=(path,method='GET',body)=>new Request(origin+path,{method,body,headers:{cookie,origin,'X-Poster-CSRF':'csrf','Content-Type':'application/json'}});
 const body=JSON.stringify({type:'digital',filename:'Green-Leaves.zip',bytes:500,metadata:metadata()});const response=await handler(req('/poster/uploads','POST',body),{});assert.equal(response.status,201);const created=await response.json();assert.equal((await uploads.get('uploads/'+created.id+'/state')).type,'digital');assert.equal((await uploads.get('uploads/'+created.id+'/state')).referenceListingId,null);
 assert.equal((await handler(req('/poster/uploads/'+created.id+'/finish','POST'),{})).status,202);assert.equal(queued.length,1);assert.equal((await handler(req('/poster/uploads/'+created.id+'/finish','POST'),{})).status,409);
 const dashboard=await handler(req('/poster/products?type=digital'),{});assert.equal(dashboard.status,200);assert.match(await dashboard.text(),/Green Leaves/);
 const unauth=await handler(new Request(origin+'/poster/products'),{});assert.equal(unauth.status,303);
});

test('corrected review reuses the original ZIP without treating generated previews as uploaded inputs; stale Deploy is refused',async()=>{
 const f=await publicationFixture();await prepareDigitalProduct(f);const original=await f.uploads.get('uploads/'+id+'/state');
 const queued=[],handler=createPosterUploadHandler({env,uploads:f.uploads,dispatchJob:async(...args)=>queued.push(args)}),cookie='__Host-poster_owner='+seal({csrf:'csrf',expiry:Date.now()+3600000},secret,'poster-owner');
 const response=await handler(new Request(origin+'/poster/uploads/'+id+'/configure',{method:'POST',headers:{cookie,origin,'X-Poster-CSRF':'csrf'},body:JSON.stringify({metadata:{...metadata(),tags:'leaves,green pattern',name:'Corrected Leaves'}})}),{});assert.equal(response.status,202);const revision=await response.json();
 const pending=await f.uploads.get('uploads/'+revision.id+'/state');assert.equal(pending.sourcePreviewCount,0);assert.equal(pending.reusePreviewKeys.length,0);assert.equal(pending.reuseArchiveKey,original.archiveKey);assert.equal(queued.length,1);
 await prepareDigitalProduct({...f,id:revision.id});assert.equal((await f.uploads.get('uploads/'+revision.id+'/state')).phase,'ready_for_approval');
 const stale=await handler(new Request(origin+'/poster/uploads/'+id+'/approve',{method:'POST',headers:{cookie,origin},body:new URLSearchParams({csrf:'csrf',approvalHash:original.approvalHash})}),{});assert.equal(stale.status,409);assert.equal(f.created(),0);
});

test('digital update detects marketplace edits since review and does not change or duplicate the listing',async()=>{
 const f=await publicationFixture({update:true});await prepareDigitalProduct(f);const hash=await approve(f);f.listing().title='An independent Etsy edit';
 await assert.rejects(publishDigitalProduct({...f,approvalHash:hash}),/changed since review/);assert.equal(f.created(),0);assert.equal(f.listing().state,'active');assert.equal(f.files()[0].filename,'old.zip');
});

test('bundle category must be chosen from actual compatible Etsy leaves rather than inferred from a ZIP name',()=>{
 const m={...metadata(),kind:'bundle'};assert.throws(()=>selectTaxonomy(m,taxonomies),/matches the bundle contents/);assert.equal(selectTaxonomy({...m,taxonomyId:30},taxonomies).id,30);assert.equal(selectTaxonomy({...m,taxonomyId:20},taxonomies).id,20);
});

// Seller kit fixtures exercise real ZIP/image decoding without storing customer artwork.
async function sellerKitFixture(){
 const f=await archiveFixture(),m=metadata();
 const buyer=await zipFiles([{name:'tile.png',data:f.png},{name:'tile.jpg',data:f.jpg},{name:'README.txt',data:Buffer.from(m.instructions)},{name:'LICENSE.txt',data:Buffer.from(m.licence)}]);
 const photo=await sharp(f.png).resize(240,180,{fit:'contain',background:'#f7f3ec'}).jpeg().toBuffer();
 const outer=await zipFiles([{name:'UPLOAD-TO-ETSY/green-leaves-buyer.zip',data:buyer},{name:'LISTING-IMAGES/01-pattern.jpg',data:photo},{name:'LISTING-IMAGES/02-tile.jpg',data:photo},{name:'LISTING-IMAGES/03-detail.jpg',data:photo},{name:'SELLER-CHECKLIST.txt',data:Buffer.from('Seller only: check price and approve.')},{name:'QUALITY-CHECK.txt',data:Buffer.from('Seller report')}]);
 return {buyer,photo,outer};
}

test('seller kit separates customer ZIP and three photographs, preserving original buyer bytes',async()=>{
 const {inspectDigitalUpload,sellerKitDelivery}=await import('../lib/seller-kit.mjs');const f=await sellerKitFixture();
 const k=await inspectDigitalUpload(f.outer),d=sellerKitDelivery(k);assert.equal(k.kit,true);assert.equal(k.previews.length,3);assert.equal(d.files.length,1);assert.equal(d.files[0].name,'green-leaves-buyer.zip');assert.deepEqual(d.files[0].data,f.buyer);assert.ok(d.contents.every(f=>!f.name.startsWith('LISTING-IMAGES/')&&!f.name.includes('SELLER')));assert.equal(k.sellerFiles.length,2);await assert.rejects(inspectArchive(f.outer),/Unsupported customer file/);
});

test('seller-kit prepare and publication attach only buyer ZIP, use listing photographs and bypass supplier',async()=>{
 const f=await publicationFixture(),kit=await sellerKitFixture();const a=await f.uploads.get('uploads/'+id+'/state');
 await f.uploads.set('uploads/'+id+'/chunks/0',kit.outer);await f.uploads.setJSON('uploads/'+id+'/state',{...a,bytes:kit.outer.length,metadata:productMetadata({kind:'pattern',subject:'Leaves',price:4.99,useEmbeddedText:true,seamlessConfirmed:true},'Green-Leaves.zip','digital')});
 await prepareDigitalProduct(f);const prepared=await f.uploads.get('uploads/'+id+'/state');assert.equal(prepared.sourceKind,'seller-kit');assert.equal(prepared.metadata.licence,metadata().licence);assert.equal(prepared.metadata.instructions,metadata().instructions);assert.equal(prepared.previewCount,3);assert.deepEqual(Buffer.from(await f.uploads.get(prepared.archiveKey)),kit.outer);
 assert.equal((await sharp(Buffer.from(await f.uploads.get('uploads/'+id+'/mockups/0.jpg'))).metadata()).width,240);assert.equal(prepared.plan.parts.length,1);
 const hash=await approve(f);await publishDigitalProduct({...f,approvalHash:hash});assert.equal(f.files().length,1);assert.equal(f.files()[0].filename,'green-leaves-buyer.zip');assert.equal(f.files()[0].size_bytes,kit.buyer.length);const posted=f.calls.filter(([p,o])=>p.endsWith('/files')&&o.method==='POST');assert.deepEqual(Buffer.from(await posted[0][1].body.get('file').arrayBuffer()),kit.buyer);assert.ok(f.calls.every(([p])=>!/printshrimp|shipping|inventory|orders/.test(p)));
});

test('seller-kit safety rejects arbitrary nesting, seller files in wrong paths, missing artwork and invalid SVG dimensions',async()=>{
 const {inspectDigitalUpload}=await import('../lib/seller-kit.mjs');const f=await sellerKitFixture();
 await assert.rejects(inspectDigitalUpload(await zipFiles([{name:'nested.zip',data:f.buyer}])),/Unsupported/);
 await assert.rejects(inspectDigitalUpload(await zipFiles([{name:'UPLOAD-TO-ETSY/a.zip',data:await zipFiles([{name:'nested.zip',data:f.buyer}])},{name:'LISTING-IMAGES/1.jpg',data:f.photo}])),/failed validation/);
 await assert.rejects(inspectDigitalUpload(await zipFiles([{name:'UPLOAD-TO-ETSY/a.zip',data:f.buyer},{name:'LISTING-IMAGES/1.jpg',data:f.photo},{name:'unknown.txt',data:Buffer.from('not categorised')}])),/unexpected file/);
 await assert.rejects(inspectDigitalFile('tile.svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="undefinedin" height="undefinedin" viewBox="0 0 4000 4000"><rect width="4000" height="4000"/></svg>')),/invalid dimensions/);
 await assert.rejects(inspectDigitalFile('tile.svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 4000"/>')),/invalid viewBox/);
});

test('seller kit cannot contradict its included licence or lose customer data after approval',async()=>{
 const {inspectDigitalUpload,resolveEmbeddedText}=await import('../lib/seller-kit.mjs');const k=await inspectDigitalUpload((await sellerKitFixture()).outer);
 assert.throws(()=>resolveEmbeddedText(k,{...metadata(),licence:'Commercial permission invented'}),/differs from/);
 const f=await publicationFixture(),kit=await sellerKitFixture();const a=await f.uploads.get('uploads/'+id+'/state');await f.uploads.set('uploads/'+id+'/chunks/0',kit.outer);await f.uploads.setJSON('uploads/'+id+'/state',{...a,bytes:kit.outer.length});await prepareDigitalProduct(f);const hash=await approve(f);await f.uploads.set('uploads/'+id+'/delivery/0',Buffer.from('changed'));await assert.rejects(publishDigitalProduct({...f,approvalHash:hash}),/Customer package changed/);assert.equal(f.created(),0);
});
