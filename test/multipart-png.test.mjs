import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {inspectDigitalUpload} from '../lib/seller-kit.mjs';
import {inspectArchive,zipFiles} from '../lib/digital-archive.mjs';
import {digitalListingText,digest} from '../lib/product-metadata.mjs';

const zip=(name,data)=>({name,data});
const docs=[
  zip('README.txt',Buffer.from('Download all numbered PNG ZIPs. Open REBUILD-PNG.html in the extras ZIP and restore the original full-resolution PNG.')),
  zip('LICENSE.txt',Buffer.from('Personal and finished-product commercial use; source redistribution prohibited.')),
  zip('ABOUT-SAPIVER-PRINTS.txt',Buffer.from('Sapiver Prints digital patterns.'))
];
const jpg=await sharp({create:{width:1500,height:1500,channels:3,background:'#daeae1'}}).jpeg().toBuffer();
const hero=await sharp({create:{width:1200,height:1200,channels:3,background:'#d3ede7'}}).jpeg().toBuffer();
const raw=randomBytes(3000*3000*4);
// A valid pattern master has real clear pixels. Random alpha exercises that
// path without changing the original byte-for-byte reconstruction tests.
const original=await sharp(raw,{raw:{width:3000,height:3000,channels:4}}).png({compressionLevel:4}).toBuffer();
assert.ok(original.length>20_000_000&&original.length<37_000_000,'Fixture needs exactly two 18.5 MB parts');
const originalName='sapiver-demo-seamless-master.png',parts=[];
for(let off=0;off<original.length;off+=18_500_000){
 const data=original.subarray(off,Math.min(original.length,off+18_500_000));
 const name=originalName.slice(0,-4)+'-png-part-'+String(parts.length+1).padStart(2,'0')+'.pngpart';
 parts.push({name,data,bytes:data.length,sha256:digest(data)});
}
assert.equal(parts.length,2);
const manifest={
 format:'sapiver-full-png-parts',version:1,filename:originalName,
 bytes:original.length,sha256:digest(original),width:3000,height:3000,dpi:300,
 parts:parts.map(({name,bytes,sha256})=>({name,bytes,sha256}))
};
const restorer=Buffer.from('<!doctype html><html><head><title>Sapiver Prints</title></head><body>Restore your full-resolution PNG</body></html>');
const partArchives=[];
for(let i=0;i<parts.length;i++){
 const name='sapiver-demo-buyer-'+String(i+1).padStart(2,'0')+'-png-part.zip';
 const data=await zipFiles([zip(parts[i].name,parts[i].data),...docs]);
 assert.ok(data.length<=20_000_000);
 partArchives.push(zip('UPLOAD-TO-ETSY/'+name,data));
}
const extras=await zipFiles([
 zip('sapiver-demo-seamless-master.jpg',jpg),
 zip('sapiver-demo-repeat-preview-3x3.jpg',hero),
 zip('PNG-REASSEMBLY.json',Buffer.from(JSON.stringify(manifest))),
 zip('REBUILD-PNG.html',restorer),
 ...docs
]);
assert.ok(extras.length<=20_000_000);
const customer=[...partArchives,zip('UPLOAD-TO-ETSY/sapiver-demo-buyer-03-jpg-and-extras.zip',extras)];
const listing=[zip('LISTING-IMAGES/sapiver-demo-full-pattern.jpg',hero)];
const outer=async buyer=>zipFiles([...buyer,...listing,zip('SELLER-CHECKLIST.txt',Buffer.from('Review before listing'))]);

test('nested Etsy seller kit reconstructs exact PNG bytes without resizing',async()=>{
 const imported=await inspectDigitalUpload(await outer(customer),{requireDocumentsPerBuyerZip:true});
 assert.equal(imported.kit,true);
 assert.equal(imported.packages.length,3);
 assert.deepEqual(imported.packages.map(f=>f.name),customer.map(f=>f.name.split('/').pop()));
 const master=imported.inspection.files.find(f=>f.reassembled===true);
 assert.ok(master);
 assert.equal(master.name,originalName);
 assert.equal(master.format,'png');
 assert.equal(master.bytes,original.length);
 assert.equal(master.sha256,digest(original));
 assert.equal(master.width,3000);
 assert.equal(master.height,3000);
 assert.equal(master.partCount,2);
 assert.ok(!master.data,'Do not duplicate original PNG in upload records');
 const listingCopy=digitalListingText({
  name:'Demo',kind:'pattern',subject:'demo',description:'Original repeat',
  instructions:imported.instructions,licence:imported.licence,tags:['demo seamless']
 },imported.inspection.files);
 assert.match(listingCopy.description,/exact original/i);
 assert.match(listingCopy.description,/REBUILD-PNG\.html/);
 assert.match(listingCopy.description,/3000 × 3000/);
 assert.ok(!listingCopy.description.includes('PNGPART'));
});

test('multipart binary extensions remain blocked in ordinary digital ZIPs',async()=>{
 const notSellerKit=await zipFiles([zip(parts[0].name,parts[0].data),...docs]);
 await assert.rejects(inspectArchive(notSellerKit),/Unsupported customer file/);
});

test('one missing multipart ZIP blocks seller kit before merchant writes',async()=>{
 await assert.rejects(inspectDigitalUpload(await outer(customer.slice(1)),{requireDocumentsPerBuyerZip:true}),/Unsafe or incomplete original PNG reassembly metadata|Missing or corrupted original PNG part/);
});

test('conflicting PNG hashes block seller kit before merchant writes',async()=>{
 const changed={...manifest,sha256:'0'.repeat(64)};
 const badExtras=await zipFiles([zip('sapiver-demo-seamless-master.jpg',jpg),zip('sapiver-demo-repeat-preview-3x3.jpg',hero),zip('PNG-REASSEMBLY.json',Buffer.from(JSON.stringify(changed))),zip('REBUILD-PNG.html',restorer),...docs]);
 const files=[...partArchives,zip('UPLOAD-TO-ETSY/sapiver-demo-buyer-03-jpg-and-extras.zip',badExtras)];
 await assert.rejects(inspectDigitalUpload(await outer(files),{requireDocumentsPerBuyerZip:true}),/does not match the original bytes/);
});

test('opaque original master is rejected before any Etsy write',async()=>{
 const opaque=await sharp(randomBytes(1100*1100*3),{raw:{width:1100,height:1100,channels:3}}).png().toBuffer();
 const zipOne=await zipFiles([zip('sapiver-demo-seamless-master.png',opaque),...docs]);
 const zipTwo=await zipFiles([zip('sapiver-demo-seamless-master.jpg',jpg),zip('sapiver-demo-repeat-preview-3x3.jpg',hero),...docs]);
 const kit=await outer([
  zip('UPLOAD-TO-ETSY/sapiver-demo-buyer-01-png.zip',zipOne),
  zip('UPLOAD-TO-ETSY/sapiver-demo-buyer-02-jpg-and-extras.zip',zipTwo)
 ]);
 await assert.rejects(inspectDigitalUpload(kit,{requireDocumentsPerBuyerZip:true}),/Seamless master PNG is opaque/);
});
