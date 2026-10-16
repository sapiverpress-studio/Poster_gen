import test from 'node:test';
import assert from 'node:assert/strict';
import yazl from 'yazl';
import {File} from 'node:buffer';
import {openEightPosterZip,parsePosterText,validatePosterPng} from '../public/bulk-zip.mjs';
import {productMetadata} from '../lib/product-metadata.mjs';
import {bulkCollectionBody} from '../lib/product-web.mjs';

const tags='jazz art, music wall art, saxophone print, jazz club, music room, saxophone, jazz poster, vintage jazz, art print, listening room, warm decor, music gift, home bar';
const details=i=>'Title: Jazz Nocturne '+i+'\nDescription:\nA carefully designed physical jazz club wall poster.\n\nOriginal artwork, printed in A5, A4 or A3 without digital downloads.\nTags: '+tags;
function png(){
 const b=Buffer.alloc(33);b.set([137,80,78,71,13,10,26,10],0);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(3394,16);b.writeUInt32BE(4800,20);b[24]=8;b[25]=2;return b;
}
async function zipFile({itemCount=8,folder='Jazz Collection/',badText=false,nested=false,extra=false}={}){
 const zip=new yazl.ZipFile();
 if(folder)zip.addEmptyDirectory(folder);
 for(let i=1;i<=itemCount;i++){
  const stem=String(i).padStart(2,'0')+'-Poster';
  const pref=nested&&i===1?folder+'nested/':folder;
  zip.addBuffer(png(),pref+stem+'.png',{compress:true});
  zip.addBuffer(Buffer.from(badText&&i===3?details(i).replace('home bar','jazz art'):details(i)),pref+stem+'.txt',{compress:true});
 }
 if(extra)zip.addBuffer(Buffer.from('unrelated'),'other.md');
 zip.end();const parts=[];for await(const x of zip.outputStream)parts.push(x);
 return new File(parts,'Eight-Posters.zip',{type:'application/zip'});
}
test('exactly eight matching PNG/TXT pairs in one folder are read and 13 tags parsed',async()=>{
 const file=await zipFile(),archive=await openEightPosterZip(file);
 assert.equal(archive.items.length,8);
 for(const [index,entry] of archive.items.entries()){
  assert.equal(entry.tags.length,13);assert.equal(entry.title,'Jazz Nocturne '+(index+1));
  assert.equal(entry.description.includes('physical jazz'),true);
  const img=await archive.artwork(entry);assert.equal(img.name,entry.filename);assert.equal(img.size,33);
 }
});
test('ZIPs in root directory also work',async()=>{
 const archive=await openEightPosterZip(await zipFile({folder:''}));
 assert.equal(archive.items.length,8);
});
test('ZIP rejects missing item, extra files and nested paths before any upload',async()=>{
 await assert.rejects(openEightPosterZip(await zipFile({itemCount:7})),/exactly eight|eight PNG/i);
 await assert.rejects(openEightPosterZip(await zipFile({extra:true})),/eight PNG|eight TXT|unsupported|eight posters/i);
 await assert.rejects(openEightPosterZip(await zipFile({nested:true})),/one folder|root/i);
});
test('ZIP rejects bad title/description/tag files before any monthly slot',async()=>{
 await assert.rejects(openEightPosterZip(await zipFile({badText:true})),/13 unique Etsy tags/i);
});
test('TXT demands precise 13 distinct short tags and never guesses listings',()=>{
 const parsed=parsePosterText(details(2));assert.equal(parsed.tags.length,13);
 assert.throws(()=>parsePosterText(details(2).replace('Title: Jazz','Name: Jazz')),/TXT must contain/);
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
test('bulk form is disabled if fewer than eight unreserved monthly slots remain',()=>{
 let body=bulkCollectionBody({monthly:{used:33,limit:40,remaining:7,label:'October 2026'}});
 assert.match(body,/Eight unused slots/);assert.match(body,/type="file"[^>]+disabled/);
 body=bulkCollectionBody({monthly:{used:32,limit:40,remaining:8,label:'October 2026'}});
 assert.doesNotMatch(body,/type="file"[^>]+disabled/);
 assert.match(body,/bulk-deploy/);assert.match(body,/bulk-upload\.mjs/);
});
