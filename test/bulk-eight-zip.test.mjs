import test from 'node:test';
import assert from 'node:assert/strict';
import yazl from 'yazl';
import {File} from 'node:buffer';
import {openPosterCollectionZip,parsePosterText,validatePosterPng,collectionUploadFilename} from '../public/bulk-zip.mjs';
import {productMetadata} from '../lib/product-metadata.mjs';
import {bulkCollectionBody} from '../lib/product-web.mjs';

const tags='jazz art, music wall art, saxophone print, jazz club, music room, saxophone, jazz poster, vintage jazz, art print, listening room, warm decor, music gift, home bar';
const trioTags=n=>['woodland set','animal art trio','forest wall prints','three animal prints','a4 nature art','woodland nursery','animal story art','fox robin artwork','reading nook decor','countryside print','british animal art','print collection',n===1?'woodland gift':'nature triptych'].join(', ');
const trioDetails=n=>`Title: Woodland Set ${n}\nListing title: Woodland Forest Print Set of 3 - Group ${n}\nSection: Wall Art\nSize: A4\nMembers: ${[1,2,3].map(i=>String(i+3*(n-1)).padStart(2,'0')+'-Poster').join(', ')}\nTags: ${trioTags(n)}\n\nDescription:\nThree unframed A4 prints showing nature illustration set ${n}, described independently for the buyer. These three artworks have been created with AI-assisted illustration, and the entire separate group is reviewed individually for accuracy and quality. Frames are not included. This is a physical product.`;
const details=i=>'Title: Jazz Nocturne '+i+'\nListing title: Nocturne Art Print '+i+'\nSection: Wall Art\nTags: '+tags+'\n\nDescription:\nA carefully designed physical jazz club wall poster.\n\nOriginal artwork, printed in A5, A4 or A3 without digital downloads.';
function png(){
 const b=Buffer.alloc(33);b.set([137,80,78,71,13,10,26,10],0);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(3394,16);b.writeUInt32BE(4800,20);b[24]=8;b[25]=2;return b;
}
async function zipFile({itemCount=6,folder='Jazz Collection/',badText=false,nested=false,extra=false,compress=true,dirs=true,trios=true}={}){
 const zip=new yazl.ZipFile();
 if(folder)zip.addEmptyDirectory(folder);
 for(let i=1;i<=itemCount;i++){
  const stem=String(i).padStart(2,'0')+'-Poster';
  const pref=folder+stem+'/' +(nested&&i===1?'nested/':'');
  if(dirs)zip.addEmptyDirectory(pref);
  zip.addBuffer(png(),pref+'poster.png',{compress});
  zip.addBuffer(Buffer.from(badText&&i===3?details(i).replace('home bar','jazz art'):details(i)),pref+'details.md',{compress});
 }
 if(itemCount===6&&trios){for(let n=1;n<=2;n++)zip.addBuffer(Buffer.from(trioDetails(n)),folder+'bundle-'+n+'.md',{compress});}
 if(extra)zip.addBuffer(Buffer.from('unrelated'),'other.md');
 zip.end();const parts=[];for await(const x of zip.outputStream)parts.push(x);
 return new File(parts,'Six-Posters.zip',{type:'application/zip'});
}
test('exactly six poster folders are read and 13 tags parsed',async()=>{
 const file=await zipFile(),archive=await openPosterCollectionZip(file);
 assert.equal(archive.items.length,6);
 assert.equal(archive.bundles.length,2);assert.equal(archive.listingCount,8);
 for(const [index,entry] of archive.items.entries()){
  assert.equal(entry.tags.length,13);assert.equal(entry.title,'Jazz Nocturne '+(index+1));
  assert.equal(entry.description.includes('physical jazz'),true);
  const img=await archive.artwork(entry);assert.equal(img.name,entry.filename);assert.equal(img.size,33);
 }
});
test('Six subfolders at ZIP root with two bundle manifests also work',async()=>{
 const archive=await openPosterCollectionZip(await zipFile({folder:''}));
 assert.equal(archive.items.length,6);assert.equal(archive.bundles.length,2);
});
test('ZIP accepts every batch size from two to six, at root or in a collection folder',async()=>{
 for(const itemCount of [2,3,4,5,6]){
  const file=await zipFile({itemCount,folder:itemCount%2?'':'Collection/'});
  const archive=await openPosterCollectionZip(file);
  assert.equal(archive.items.length,itemCount);
  assert.equal((await archive.artwork(archive.items.at(-1))).size,33);
 }
});
test('ZIP rejects one item, seven or more, extra files and nested paths before any upload',async()=>{
 for(const itemCount of [1,7,8])await assert.rejects(openPosterCollectionZip(await zipFile({itemCount})),/2 to 6|poster folders/i);
 await assert.rejects(openPosterCollectionZip(await zipFile({extra:true})),/2 to 6|unsupported|Unexpected/i);
 await assert.rejects(openPosterCollectionZip(await zipFile({nested:true})),/subfolders|nested|folder/i);
});
test('ZIP rejects bad title/description/tag files before any monthly slot',async()=>{
 await assert.rejects(openPosterCollectionZip(await zipFile({badText:true})),/13 unique Etsy tags/i);
});
test('details.md demands precise 13 distinct short tags and never guesses listings',()=>{
 const parsed=parsePosterText(details(2));assert.equal(parsed.tags.length,13);
 assert.throws(()=>parsePosterText(details(2).replace('Title: Jazz','Name: Jazz')),/Unknown or invalid|title/);
 assert.throws(()=>parsePosterText(details(2).replace('home bar','jazz art')),/13 unique/);
 assert.throws(()=>parsePosterText(details(2).replace('home bar','this tag is much longer than twenty characters')),/13 unique/);
});
test('PNG must be at least A3 at 270 PPI with A-series portrait proportions',()=>{
 assert.deepEqual(validatePosterPng(png()),{width:3394,height:4800});
 const b=png();b.writeUInt32BE(1200,16);assert.throws(()=>validatePosterPng(b),/270 PPI/);
});
test('bulk keeps the owner written short Etsy title and exact thirteen tags',()=>{
 const m=productMetadata({name:'Jazz Nocturne 1',etsyTitle:'Midnight Saxophone',description:details(1),tags,kind:'artwork'},'01-Poster.png','physical');
 assert.equal(m.etsyTitle,'Midnight Saxophone');assert.equal(m.tags.length,13);
 assert.throws(()=>productMetadata({name:'Jazz Nocturne',etsyTitle:'x'.repeat(141)},'01-Poster.png','physical'),/140/);
});
test('bulk form uses dynamic batch quota guidance, not a blanket six-slot storage rule',()=>{
 let body=bulkCollectionBody({monthly:{used:47,limit:52,remaining:5,label:'October 2026'}});
 assert.match(body,/ZIP size determines/);assert.doesNotMatch(body,/name="storeOnly" type="checkbox" checked/);assert.doesNotMatch(body,/type="file"[^>]+disabled/);
 body=bulkCollectionBody({monthly:{used:46,limit:52,remaining:6,label:'October 2026'}});
 assert.doesNotMatch(body,/type="file"[^>]+disabled/);
 assert.match(body,/2 to 6 posters/);
 assert.match(body,/bulk-deploy/);assert.match(body,/bulk-upload\.mjs/);
});

test('folder ZIP supports stored files and omitted directory entries',async()=>{
 const a=await openPosterCollectionZip(await zipFile({compress:false,dirs:false}));
 assert.equal(a.items.length,6);assert.equal(a.items[0].sectionTitle,'Wall Art');
 assert.equal(a.items[0].listingTitle,'Nocturne Art Print 1');
 assert.equal((await a.artwork(a.items[0])).size,33);
});
test('details validate metadata before any upload and preserve complete description',()=>{
 const source=details(1),parsed=parsePosterText(source);
 assert.match(parsed.description,/Original artwork/);
 assert.throws(()=>parsePosterText(source.replace('Listing title: Nocturne Art Print 1\n','')),/Listing title is required/);
 assert.throws(()=>parsePosterText(source.replace('Listing title: Nocturne Art Print 1','Listing title: Jazz Nocturne')),/physical print or poster/);
 assert.equal(parsePosterText(source.replace('Section: Wall Art','Section: Spring Gifts')).sectionTitle,'Spring Gifts');
 assert.throws(()=>parsePosterText(source.replace('Section: Wall Art','Section: <Unknown>')),/Section/);
 assert.throws(()=>parsePosterText(source.replace('Section: Wall Art','')),/Section/);
 assert.throws(()=>parsePosterText(source.replace('Section: Wall Art','Section: Wall Art\nSection: Nature')),/Duplicate/);
 assert.throws(()=>parsePosterText(source.replace('Listing title: Nocturne Art Print 1','Listing title: '+ 'a'.repeat(141))),/140/);
 assert.throws(()=>parsePosterText(source.replace('Section: Wall Art','SKU: manual\nSection: Wall Art')),/Unknown/);
});
test('namesake posters get short distinct SKUs; editing the title retains saved SKU',()=>{
 const f=collectionUploadFilename('The Puddle','a'.repeat(64)),other=collectionUploadFilename('The Puddle','b'.repeat(64));
 const first=productMetadata({name:'The Puddle',kind:'artwork'},f,'physical');
 const renamed=productMetadata({name:'Quiet Water',kind:'artwork'},f,'physical');
 assert.equal(first.sku,'SP-THE-PUDDLE-AAAAAAAA');assert.equal(renamed.sku,first.sku);
 assert.notEqual(productMetadata({name:'The Puddle'},other,'physical').sku,first.sku);
 const longest=collectionUploadFilename('An unusually long but allowed artwork title','c'.repeat(64));
 assert.ok(productMetadata({name:'Long name'},longest,'physical').sku.length<=32);
});

test('Nature and verse ZIP metadata selects A4/A5; older three-size ZIPs stay compatible',()=>{
 const nature=details(1).replace('Section: Wall Art','Section: Nature'+String.fromCharCode(10)+'Sizes: A5, A4');
 const selected=parsePosterText(nature);
 assert.deepEqual(selected.printSizes,['A5','A4']);
 assert.deepEqual(parsePosterText(details(1)).printSizes,['A5','A4','A3']);
 assert.throws(()=>parsePosterText(nature.replace('A5, A4','A5, A3')),/Sizes must/);
 assert.throws(()=>parsePosterText(nature.replace('A5, A4','A3, A4, A5')),/Sizes must/);
 assert.deepEqual(parsePosterText(details(1).replace('Section: Wall Art','Section: Nature')).printSizes,['A5','A4']);
 assert.throws(()=>parsePosterText(nature.replace('A5, A4','A5, A4, A3')),/A3 is reserved/);
 const m=productMetadata({name:'River Whisper',kind:'artwork',sectionTitle:'Nature',printSizes:selected.printSizes},'Nature.png','physical');
 assert.deepEqual(m.printSizes,['A5','A4']);
 assert.throws(()=>productMetadata({name:'River Whisper',kind:'artwork',printSizes:['A5','A3']},'Nature.png','physical'),/print sizes/);
 assert.throws(()=>productMetadata({name:'River Whisper',kind:'artwork',sectionTitle:'Nature',printSizes:['A5','A4','A3']},'Nature.png','physical'),/A3 is reserved/);
 assert.deepEqual(productMetadata({name:'Dinosaur Timeline',kind:'dinosaur'},'Dino.png','physical').printSizes,['A5','A4']);
 assert.deepEqual(productMetadata({name:'Learning Chart',kind:'educational'},'Learning.png','physical').printSizes,['A5','A4']);
 assert.deepEqual(productMetadata({name:'Jazz Club',kind:'artwork',sectionTitle:'Wall Art'},'Jazz.png','physical').printSizes,['A5','A4','A3']);
});

test('A4/A5 ZIPs accept genuine 300 PPI A4 artwork without requiring A3 enlargement',()=>{
 const b=png();b.writeUInt32BE(2480,16);b.writeUInt32BE(3508,20);
 assert.deepEqual(validatePosterPng(b,['A5','A4']),{width:2480,height:3508});
 assert.throws(()=>validatePosterPng(b),/270 PPI or above at A3/);
 const low=Buffer.from(b);low.writeUInt32BE(1200,16);low.writeUInt32BE(1700,20);
 assert.throws(()=>validatePosterPng(low,['A5','A4']),/300 PPI at A4/);
});

test('six posters without both distinct trio manifests fail before starting uploads',async()=>{
 await assert.rejects(openPosterCollectionZip(await zipFile({trios:false})),/two distinct trio/);
});
test('two trio manifests preserve different descriptions, titles, tags and non-overlapping members',async()=>{
 const archive=await openPosterCollectionZip(await zipFile());
 const [one,two]=archive.bundles;
 assert.deepEqual(one.members,['01-Poster','02-Poster','03-Poster']);
 assert.deepEqual(two.members,['04-Poster','05-Poster','06-Poster']);
 assert.notEqual(one.description,two.description);
 assert.notEqual(one.listingTitle,two.listingTitle);
 assert.notDeepEqual(one.tags,two.tags);
});
