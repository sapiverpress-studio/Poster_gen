import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import yazl from 'yazl';
import sharp from 'sharp';
import {zipFiles} from '../lib/digital-archive.mjs';
import {inspectDigitalUpload} from '../lib/seller-kit.mjs';
import {productMetadata,digitalListingText} from '../lib/product-metadata.mjs';

const source=readFileSync(new URL('../public/seller-kit-manifest.js',import.meta.url),'utf8');
const window={};
runInNewContext(source,{window,Uint8Array,DataView,TextDecoder,Blob});
const read=window.SapiverSellerKitManifest.read;
const product={type:'digital',kind:'pattern',name:'Blue Grid Textile Pattern',subject:'Blue Grid Textile Pattern',
 description:'Blue woven geometry. Created with the aid of AI.',price:4.95,sectionTitle:'Digital Downloads',
 tags:['blue grid','woven textile','seamless pattern','blue geometric','soft blue'],seamlessConfirmed:true,
 useEmbeddedText:true,aiAssisted:true};
const manifest={format:'sapiver-seamless-seller-kit',version:1,product,
 listingSource:'AI visual description; keyword demand and search volumes are not measured.',reviewRequired:true};
async function storedZip(entries){
 const zip=new yazl.ZipFile(),chunks=[];
 const done=new Promise((resolve,reject)=>{zip.outputStream.on('data',x=>chunks.push(x));zip.outputStream.on('error',reject);zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));});
 for(const e of entries)zip.addBuffer(e.data,e.name,{compress:false,mtime:new Date('2020-01-01T00:00:00Z')});
 zip.end();return done;
}
async function sellerKit(data=manifest){
 const art=await sharp({create:{width:64,height:64,channels:3,background:'#b1c8d8'}}).png().toBuffer();
 const photo=await sharp(art).jpeg().toBuffer();
 const buyer=await zipFiles([
  {name:'tile.png',data:art},{name:'LICENSE.txt',data:Buffer.from('Commercial licence. May sell finished products.')},
  {name:'README.txt',data:Buffer.from('Download and unzip this archive.')},
  {name:'ABOUT-SAPIVER-PRINTS.txt',data:Buffer.from('An independent British design studio.')}
 ]);
 return storedZip([
  {name:'UPLOAD-TO-ETSY/one-design.zip',data:buyer},
  {name:'LISTING-IMAGES/01.jpg',data:photo},
  {name:'LISTING-METADATA.json',data:Buffer.from(JSON.stringify(data))},
  {name:'SELLER-CHECKLIST.txt',data:Buffer.from('Seller only')}
 ]);
}
test('one actual seller ZIP auto-loads title, GBP price, description and Etsy tags, while retaining all customer files',async()=>{
 const raw=await sellerKit();
 const extracted=await read(new Blob([raw]));
 assert.equal(extracted.name,product.name);
 assert.equal(extracted.price,4.95);
 assert.equal(extracted.description,product.description);
 assert.deepEqual([...extracted.tags],product.tags);
 const inspected=await inspectDigitalUpload(raw,{requireDocumentsPerBuyerZip:true});
 assert.equal(inspected.kit,true);
 assert.equal(inspected.packages.length,1);
 assert.equal(inspected.previews.length,1);
 assert.equal(inspected.listingMetadata.product.name,product.name);
 const m=productMetadata({...product,licence:'',instructions:''},'blue-grid-commercial-seller-kit.zip','digital');
 assert.equal(m.description,product.description);
 assert.equal(m.price,product.price);
 const listing=digitalListingText({...m,instructions:inspected.instructions,licence:inspected.licence},inspected.inspection.files);
 assert.match(listing.description,/Blue woven geometry/);
 assert.match(listing.description,/no physical item will be shipped/);
});
test('legacy ZIP without a listing manifest remains eligible for existing manual upload flow',async()=>{
 const raw=await storedZip([{name:'README.txt',data:Buffer.from('Older kit without manifest')}]);
 assert.equal(await read(new Blob([raw])),null);
});
test('malformed price or keywords are rejected by both ZIP reader and importer',async()=>{
 for(const bad of [{...product,price:0},{...product,tags:['a'.repeat(21)]}]){
  const zip=await sellerKit({...manifest,product:bad});
  await assert.rejects(read(new Blob([zip])),/price|tags/);
  await assert.rejects(inspectDigitalUpload(zip,{requireDocumentsPerBuyerZip:true}),/title, price, disclosure or tags/);
 }
});
test('corrupted listing manifest bytes are rejected before any upload',async()=>{
 const zip=await sellerKit();
 const changed=Buffer.from(zip);
 const needle=Buffer.from('Blue Grid Textile Pattern');
 const i=changed.indexOf(needle);
 assert.ok(i>0);
 changed[i]=0x58;
 await assert.rejects(read(new Blob([changed])),/checksum mismatch/);
});
