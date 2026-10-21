import test from 'node:test';
import assert from 'node:assert/strict';
import {WOODLAND,woodlandSixStart,woodlandSixFinish,woodlandSixStatus,woodlandSixDownload} from '../lib/woodland-six-bulk.mjs';
import {openPosterCollectionZip} from '../public/bulk-zip.mjs';

function storage(){
 const m=new Map();
 return {
  get:async k=>m.get(k)||null,
  getWithMetadata:async k=>m.has(k)?{data:m.get(k),etag:'v1'}:null,
  set:async(k,v)=>{m.set(k,v);return {modified:true}},
  setJSON:async(k,v,opts={})=>{
   if(opts.onlyIfNew&&m.has(k))return {modified:false};
   m.set(k,v);return {modified:true};
  }
 };
}
function png(page){
 const b=Buffer.alloc(34);
 b.set([137,80,78,71,13,10,26,10]);
 b.writeUInt32BE(13,8);b.write('IHDR',12,'ascii');
 b.writeUInt32BE(3394,16);b.writeUInt32BE(4800,20);b[33]=page;
 return b;
}
function canva({badPage=false,wrongCount=false}={}){
 let n=0;
 return async(url,init={})=>{
  if(url.endsWith('/designs/DAHYoJC71wA'))return Response.json({design:{id:'DAHYoJC71wA'}});
  if(url.includes('/designs/DAHYoJC71wA/pages?'))return Response.json({items:Array.from({length:wrongCount?3:6},()=>({dimensions:{width:3394,height:4800}}))});
  if(url.endsWith('/exports')&&init.method==='POST')return Response.json({job:{id:'page'+(++n)}});
  if(/\/exports\/page[1-6]$/.test(url))return Response.json({job:{status:'success',urls:['https://export.canva.com/'+url.split('page').at(-1)+'.png']}});
  if(url.startsWith('https://export.canva.com/')){
   const page=Number(url.match(/(\d+)\.png$/)[1]),b=png(page);
   if(badPage&&page===6)b.writeUInt32BE(900,16);
   return new Response(b);
  }
  throw Error('Unexpected request '+url);
 };
}
test('exact two disjoint trios preserve all six original verse animal subjects',()=>{
 assert.deepEqual(WOODLAND.map(p=>p.slug),['fox','robin','hedgehog','badger','red-squirrel','roe-deer']);
 for(const p of WOODLAND){
  assert.equal(p.poem.length,4);
  assert.equal(p.tags.length,13);
  assert.equal(new Set(p.tags.map(x=>x.toLowerCase())).size,13);
  assert.ok(p.tags.every(x=>x.length<=20));
 }
});
test('six original Canva PNGs export into a ZIP accepted by the real eight-listing importer',async()=>{
 const uploads=storage(),request=canva();
 const args={uploads,token:'mock',request,clock:()=>100};
 assert.deepEqual((await woodlandSixStart(args)).phase,'in_progress');
 assert.equal((await woodlandSixStart(args)).phase,'in_progress');
 assert.equal((await woodlandSixFinish(args)).phase,'ready');
 assert.equal((await woodlandSixStatus({uploads})).phase,'ready');
 assert.equal((await woodlandSixStatus({uploads})).pages,6);
 const response=await woodlandSixDownload({uploads});
 const bytes=Buffer.from(await response.arrayBuffer());
 const archive=await openPosterCollectionZip(new File([bytes],'woodland-six.zip',{type:'application/zip'}));
 assert.equal(archive.listingCount,8);
 assert.equal(archive.items.length,6);
 assert.equal(archive.bundles.length,2);
 assert.deepEqual(archive.bundles[0].members,['fox','robin','hedgehog']);
 assert.deepEqual(archive.bundles[1].members,['badger','red-squirrel','roe-deer']);
 assert.equal(archive.bundles[0].size,'A4');
 assert.equal(archive.bundles[1].size,'A4');
 assert.notDeepEqual(archive.bundles[0].tags,archive.bundles[1].tags);
 for(const p of archive.items){
  assert.deepEqual(p.printSizes,['A5','A4']);
  const file=await archive.artwork(p);
  assert.equal(file.type,'image/png');
 }
});
test('six-poster exporter blocks changed pages or failed print dimensions, without publishing',async()=>{
 const uploads=storage();
 await assert.rejects(woodlandSixStart({uploads,token:'mock',request:canva({wrongCount:true})}));
 assert.equal((await woodlandSixStatus({uploads})).phase,'needs_review');
 const u=storage(),r=canva({badPage:true}),args={uploads:u,token:'mock',request:r};
 await woodlandSixStart(args);
 await assert.rejects(woodlandSixFinish(args));
 assert.equal((await woodlandSixStatus({uploads:u})).phase,'needs_review');
 await assert.rejects(woodlandSixDownload({uploads:u}));
});

test('oversized six-image original archive is rejected before download',async()=>{
 const uploads=storage(),args={uploads,token:'mock',request:canva()};
 await woodlandSixStart(args);await woodlandSixFinish(args);
 const record=await uploads.get('woodland-six-20261021/state');
 await uploads.setJSON('woodland-six-20261021/state',{...record,pages:record.pages.map(p=>({...p,bytes:21_000_000}))});
 await assert.rejects(woodlandSixDownload({uploads}),/capacity/);
});
