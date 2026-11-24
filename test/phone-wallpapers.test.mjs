import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import sharp from 'sharp';
import yazl from 'yazl';
import {zipFiles,inspectArchive} from '../lib/digital-archive.mjs';
import {inspectDigitalUpload} from '../lib/seller-kit.mjs';
import {productMetadata,digest,selectTaxonomy,digitalListingText} from '../lib/product-metadata.mjs';
import {prepareDigitalProduct} from '../lib/digital-product.mjs';
import {validatePhoneWallpapers} from '../lib/phone-wallpapers.mjs';
import {bulkCollectionBody,metadataFields} from '../lib/product-web.mjs';
import {sellerKitAltTexts} from '../lib/etsy-seller-kit-alt.mjs';

const window={};
runInNewContext(readFileSync(new URL('../public/seller-kit-manifest.js',import.meta.url),'utf8'),{window,Uint8Array,DataView,TextDecoder,Blob});
const readManifest=window.SapiverSellerKitManifest.read;
const product={type:'digital',kind:'wallpaper',wallpaperCount:5,name:'Winter Windows',subject:'Winter Windows',
 etsyTitle:'Winter Windows Phone Wallpapers, Five Christmas Backgrounds',description:'Five original winter scenes, created with the aid of AI.',
 price:2.99,sectionTitle:'Digital Downloads',tags:['phone wallpaper','winter phone screen','christmas wallpaper'],useEmbeddedText:true,aiAssisted:true};
const manifest={format:'sapiver-wallpaper-seller-kit',version:1,reviewRequired:true,product};
const licence='Personal use on your own devices. Do not resell or redistribute the files.';
const instructions='Download and unzip the files, save an image to your phone and select it in wallpaper settings. Crop or reposition as needed.';
const names=['51677.jpg','Canva snowy window (2).png','my drawing.jpeg','Red berries and snow.jpg','canva-export-928.png'];
let cached;
async function fixture(){
 if(cached)return cached;
 const files=[];
 for(let i=0;i<5;i++){
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="3200"><rect width="1440" height="3200" fill="'+['#e7b6a1','#a2bdaa','#8196af','#bf7870','#c7a37c'][i]+'"/><path d="M0 1000L1440 2200M0 2200L1440 1000" stroke="#f7f3ec" stroke-width="130"/><circle cx="720" cy="1600" r="370" fill="#334455"/></svg>');
  const image=sharp(svg);const data=await (names[i].endsWith('.png')?image.png():image.jpeg({quality:92})).toBuffer();
  files.push({name:names[i],data});
 }
 const docs=[{name:'LICENSE.txt',data:Buffer.from(licence)},{name:'README.txt',data:Buffer.from(instructions)}];
 const raw=await zipFiles([...files,...docs]);
 const inspected=await inspectArchive(raw);
 cached={files,docs,raw,inspected};return cached;
}
async function outerZip(entries){
 const zip=new yazl.ZipFile(),chunks=[];
 const done=new Promise((resolve,reject)=>{zip.outputStream.on('data',c=>chunks.push(c));zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));zip.outputStream.on('error',reject);});
 for(const e of entries)zip.addBuffer(e.data,e.name,{compress:false});zip.end();return done;
}
async function sellerKit(doc=manifest,buyer){
 const f=await fixture(),photo=await sharp(f.files[0].data).resize(200,400,{fit:'inside'}).jpeg().toBuffer(),pngPhoto=await sharp(photo).png().toBuffer();
 const imageNames=Object.keys(doc.product.imageAltTextByFilename||{'my cover.jpg':true,'all-five.png':true});
 return outerZip([{name:'UPLOAD-TO-ETSY/Winter-phone-pack.zip',data:buyer||f.raw},
  ...imageNames.map(name=>({name:'LISTING-IMAGES/'+name,data:name.endsWith('.png')?pngPhoto:photo})),
  {name:'LISTING-METADATA.json',data:Buffer.from(JSON.stringify(doc))}]);
}
function memory(){const map=new Map();return {map,async get(k){return map.get(k)??null;},async set(k,v){map.set(k,v);return {modified:true};},async setJSON(k,v){return this.set(k,v);},async delete(k){map.delete(k);}};}
const metadata=()=>productMetadata({...product,licence,instructions,tags:product.tags.join(',')},'Whatever Canva called this.zip','digital');
async function prepare(raw,md=metadata()){
 const uploads=memory(),id='w'.repeat(32),calls=[];
 await uploads.set('uploads/'+id+'/chunks/0',raw);
 await uploads.setJSON('uploads/'+id+'/state',{phase:'preparing',type:'digital',metadata:md,bytes:raw.length,chunks:1,sourcePreviewCount:0,createdAt:Date.now()});
 const client={async api(path,options){calls.push([path,options]);assert.equal(path,'/seller-taxonomy/nodes');return {results:[{id:30,name:'Digital Prints',children:[]}]};},async session(){return {shop_id:456,shop_name:'SapiverPrints'};}};
 return {uploads,id,calls,run:()=>prepareDigitalProduct({id,uploads,client})};
}

test('five real portrait JPG/PNG wallpapers retain arbitrary Canva names and original bytes',async()=>{
 const f=await fixture(),images=validatePhoneWallpapers(f.inspected.files);
 assert.equal(images.length,5);assert.deepEqual(images.map(f=>f.name),names);
 for(let i=0;i<5;i++){assert.equal(images[i].width,1440);assert.equal(images[i].height,3200);assert.deepEqual(images[i].data,f.files[i].data);}
});
test('four, six, undersized, landscape, duplicate and extra SVG wallpaper files are rejected',async()=>{
 const f=await fixture(),images=f.inspected.files.filter(f=>f.width);
 for(const bad of [images.slice(0,4),[...images,{...images[0],name:'six.jpg'}],
  images.map((f,i)=>i?f:{...f,width:1080}),images.map((f,i)=>i?f:{...f,width:3200,height:1440}),
  images.map((f,i)=>i===4?{...f,sha256:images[0].sha256}:f),[...images,{name:'bonus.svg',format:'svg'}]])assert.throws(()=>validatePhoneWallpapers(bad),/five|1440|different|customer documents/);
});
test('a rotation tag cannot disguise a landscape image as an upright phone wallpaper',async()=>{
 const f=await fixture(),rotated=await sharp(f.files[0].data).withMetadata({orientation:6}).jpeg().toBuffer();
 const raw=await zipFiles([{name:'rotated.jpg',data:rotated},...f.files.slice(1),...f.docs]);
 const inspected=await inspectArchive(raw);assert.equal(inspected.files[0].orientation,6);
 assert.throws(()=>validatePhoneWallpapers(inspected.files),/portrait/);
});
test('wallpaper metadata uses digital category and screen-specific listing text',()=>{
 const m=metadata();assert.equal(m.kind,'wallpaper');assert.equal(m.sectionTitle,'Digital Downloads');
 assert.equal(selectTaxonomy(m,[{id:30,name:'Digital Prints',children:[]}]).id,30);
 assert.throws(()=>selectTaxonomy({...m,taxonomyId:20},[{id:20,name:'Clip Art & Image Files',children:[]}]),/does not match/);
 const listing=digitalListingText(m,[{name:'my picture.jpg',format:'jpg',bytes:200,width:1440,height:3200}]);
 assert.equal(listing.title,product.etsyTitle);assert.match(listing.description,/Five portrait phone wallpapers/);assert.match(listing.description,/crop or reposition/i);
 assert.doesNotMatch(listing.description,/Printing results|300 DPI|A4|A5|seamless repeat/);
});
test('plain buyer ZIP preparation creates one review, six genuine phone previews, zero merchant writes',async()=>{
 const f=await fixture(),p=await prepare(f.raw);await p.run();
 const asset=await p.uploads.get('uploads/'+p.id+'/state');
 assert.equal(asset.phase,'ready_for_approval');assert.equal(asset.plan.type,'digital');assert.equal(asset.previewCount,6);
 assert.deepEqual(await p.uploads.get(asset.archiveKey),f.raw);
 const delivered=await inspectArchive(await p.uploads.get(asset.plan.parts[0].key));
 assert.deepEqual(delivered.files.filter(f=>f.width).map(f=>[f.name,f.sha256]),f.inspected.files.filter(f=>f.width).map(f=>[f.name,f.sha256]));
 assert.equal(asset.plan.sourceHash,digest(f.raw));assert.equal(asset.plan.previewHashes.length,6);
 assert.equal(asset.plan.imageAltTexts.length,6);assert.match(asset.plan.imageAltTexts[0],/all five/);
 assert.equal(p.calls.length,1);assert.ok(p.calls.every(([,options])=>!options));
 for(let i=0;i<6;i++){const m=await sharp(await p.uploads.get('uploads/'+p.id+'/mockups/'+i+'.jpg')).metadata();assert.equal(m.width,2000);assert.equal(m.height,2000);}
});
test('invalid wallpaper count stops preparation before Etsy category or account calls',async()=>{
 const f=await fixture(),raw=await zipFiles([...f.files.slice(0,4),...f.docs]),p=await prepare(raw);
 await assert.rejects(p.run(),/exactly five/);assert.deepEqual(p.calls,[]);
 assert.equal((await p.uploads.get('uploads/'+p.id+'/state')).phase,'preparing');
});
test('wallpaper seller ZIP auto-imports listing details and preserves the buyer ZIP exactly',async()=>{
 const f=await fixture(),raw=await sellerKit(),doc=await readManifest(new Blob([raw]));
 assert.equal(doc.kind,'wallpaper');assert.equal(doc.wallpaperCount,5);assert.deepEqual([...doc.tags],product.tags);
 const checked=await inspectDigitalUpload(raw);assert.equal(checked.kit,true);assert.equal(checked.previews.length,2);
 assert.deepEqual(checked.packages[0].data,f.raw);assert.equal(checked.licence,licence);
 const p=await prepare(raw);await p.run();const asset=await p.uploads.get('uploads/'+p.id+'/state');
 assert.equal(asset.plan.parts.length,1);assert.equal(asset.previewCount,2);
 assert.deepEqual(await p.uploads.get(asset.plan.parts[0].key),f.raw);
 assert.match(asset.plan.body.description,/Five portrait phone wallpapers/);
});
test('wallpaper seller photo alts follow actual filenames and do not require pattern photos',async()=>{
 const captions={'my cover.jpg':'Five winter phone wallpaper designs shown together in an illustrative phone layout.',
  'all-five.png':'A close view of the winter window phone wallpaper artwork included in this bundle.'};
 const raw=await sellerKit({...manifest,product:{...product,imageAltTextByFilename:captions}});
 const doc=await readManifest(new Blob([raw]));assert.deepEqual({...doc.imageAltTextByFilename},captions);
 const imported=await inspectDigitalUpload(raw);
 assert.deepEqual(sellerKitAltTexts({imported,defaults:['first default','second default']}),imported.previews.map(p=>captions[p.name.split('/').pop()]));
});
test('wallpaper manifest count, AI disclosure and conflicting group fail independently on server',async()=>{
 for(const bad of [{...product,wallpaperCount:4},{...product,description:'Original winter scenes without a disclosure.'}]){
  const raw=await sellerKit({...manifest,product:bad});
  await assert.rejects(readManifest(new Blob([raw])));await assert.rejects(inspectDigitalUpload(raw));
 }
 const raw=await sellerKit(),p=await prepare(raw,{...metadata(),kind:'poster'});
 await assert.rejects(p.run(),/group does not match/);assert.deepEqual(p.calls,[]);
});
test('hand-drawn wallpaper manifests do not invent an AI disclosure',async()=>{
 const p={...product,aiAssisted:false,description:'Five original hand-drawn winter scenes.'};
 const raw=await sellerKit({...manifest,product:p});assert.equal((await readManifest(new Blob([raw]))).aiAssisted,false);
 assert.equal((await inspectDigitalUpload(raw)).listingMetadata.product.description,p.description);
});
test('five-image checks use the real buyer files, not manifest count claims or previews',async()=>{
 const f=await fixture(),buyer=await zipFiles([...f.files.slice(0,4),...f.docs]),raw=await sellerKit(manifest,buyer);
 assert.equal((await readManifest(new Blob([raw]))).wallpaperCount,5);
 await assert.rejects(inspectDigitalUpload(raw),/exactly five/);
});
test('bulk and digital forms expose five wallpapers separately from physical poster modes',()=>{
 const html=bulkCollectionBody({monthly:{used:0,limit:52,remaining:52,label:'November'}});
 assert.match(html,/name="uploadMode" value="wallpaper"/);assert.match(html,/id="bulk-wallpaper-fields" hidden/);
 assert.match(html,/type=digital&amp;kind=wallpaper/);assert.match(html,/five designs, one digital Etsy listing/);
 assert.match(metadataFields({kind:'wallpaper'}),/data-type="digital" value="wallpaper" selected/);
});
