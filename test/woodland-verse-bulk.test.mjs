import test from 'node:test';
import assert from 'node:assert/strict';
import {WOODLAND,details,woodlandStart,woodlandFinish,woodlandStatus,woodlandDownload} from '../lib/woodland-verse-bulk.mjs';
function storage(){
 const data=new Map();
 return {data,
  get:async k=>data.get(k)||null,
  getWithMetadata:async k=>data.has(k)?{data:data.get(k),etag:'v1'}:null,
  set:async(k,v)=>{data.set(k,v);return{modified:true}},
  setJSON:async(k,v,o={})=>{if(o.onlyIfNew&&data.has(k))return{modified:false};data.set(k,v);return{modified:true}}
 };
}
function png(){
 const b=Buffer.alloc(33);b.set([137,80,78,71,13,10,26,10]);b.writeUInt32BE(13,8);b.write('IHDR',12,'ascii');b.writeUInt32BE(3394,16);b.writeUInt32BE(4800,20);return b;
}
function fakeCanva({badImage=false,wrongPageCount=false}={}){
 let n=0;
 return async(url,init={})=>{
  if(url.endsWith('/designs/DAHYixMhTJc'))return Response.json({design:{id:'DAHYixMhTJc'}});
  if(url.includes('/designs/DAHYixMhTJc/pages?'))return Response.json({items:Array.from({length:wrongPageCount?2:3},()=>({dimensions:{width:3394,height:4800}}))});
  if(url.endsWith('/exports')&&init.method==='POST')return Response.json({job:{id:'job'+(++n),status:'in_progress'}});
  const match=/\/exports\/job(\d)$/.exec(url);if(match)return Response.json({job:{status:'success',urls:['https://export.canva.com/'+match[1]+'.png']}});
  if(url.startsWith('https://export.canva.com/')){const bytes=png();if(badImage)bytes.writeUInt32BE(1100,16);return new Response(bytes,{status:200,headers:{'Content-Type':'image/png'}});}
  throw Error('Unexpected external URL');
 };
}
test('all three original verse posters have 13 short unique tags, explicit room, A4/A5 only',()=>{
 assert.deepEqual(WOODLAND.map(p=>p.slug),['badger','red-squirrel','roe-deer']);
 for(const p of WOODLAND){
  assert.equal(p.tags.length,13);assert.equal(new Set(p.tags).size,13);assert.ok(p.tags.every(t=>t.length<=20));
  assert.ok(p.tags.some(t=>t.includes('bedroom')));
  const d=details(p);assert.match(d,/Sizes: A5, A4/);assert.doesNotMatch(d,/\bA3\b/);assert.equal(p.poem.length,4);
 }
});
test('one protected export creates and verifies three separately exported unchanged Canva PNGs then a ZIP',async()=>{
 const uploads=storage(),request=fakeCanva(),args={uploads,token:'mock',request,clock:()=>100};
 assert.equal((await woodlandStart(args)).phase,'in_progress');
 assert.equal((await woodlandStart(args)).phase,'in_progress');
 assert.equal((await woodlandFinish(args)).phase,'ready');
 assert.equal((await woodlandStatus({uploads})).phase,'ready');
 const response=await woodlandDownload({uploads});assert.equal(response.status,200);
 const zipped=Buffer.from(await response.arrayBuffer());assert.equal(zipped.readUInt32LE(0),0x04034b50);
 const utf8=zipped.toString('utf8');
 assert.match(utf8,/badger\/poster.png/);assert.match(utf8,/red-squirrel\/details.md/);assert.match(utf8,/roe-deer\/details.md/);
 assert.equal((await woodlandStart(args)).phase,'ready');
});
test('changed source design and wrong-size Canva PNG are blocked before ready-for-upload',async()=>{
 const uploads=storage();
 await assert.rejects(woodlandStart({uploads,token:'mock',request:fakeCanva({wrongPageCount:true}),clock:()=>1}));
 assert.equal((await woodlandStatus({uploads})).phase,'needs_review');
 const other=storage(),request=fakeCanva({badImage:true});
 assert.equal((await woodlandStart({uploads:other,token:'mock',request,clock:()=>1})).phase,'in_progress');
 await assert.rejects(woodlandFinish({uploads:other,token:'mock',request,clock:()=>2}));
 assert.equal((await woodlandStatus({uploads:other})).phase,'needs_review');
 await assert.rejects(woodlandDownload({uploads:other}));
});
