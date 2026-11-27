import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {inspectArchive,zipFiles} from '../lib/digital-archive.mjs';
import {inspectCompanionPack} from '../lib/book-companion-pack.mjs';
async function fixture(){
 const plan={title:'Hen & Bea Christmas Adventure',age:'5-6',seed:123,pages:Array.from({length:35},(_,i)=>({page:i+1,area:'math',title:'Counting'})),endMatter:[36,37,38,39,40]};
 const pdf=async(w,h,n)=>{const doc=await PDFDocument.create();for(let i=0;i<n;i++)doc.addPage([w*72,h*72]);return Buffer.from(await doc.save())};
 const image=await sharp({create:{width:248,height:351,channels:3,background:'#f0f1f2'}}).jpeg().toBuffer();
 const entries=[
 {name:'BOOK_PLAN.json',data:Buffer.from(JSON.stringify(plan))},
 {name:'KDP/KDP_40_Page_Interior_A4.pdf',data:await pdf(8.27,11.69,40)},
 {name:'KDP/KDP_Full_Wrap_Cover.pdf',data:await pdf(16.88388,11.94,1)},
 {name:'Etsy/Activity_Book_A4.pdf',data:await pdf(210/25.4,297/25.4,41)},
 {name:'Interactive/index.html',data:Buffer.from('<!doctype html><html lang="en"><title>Hen &amp; Bea — Activity Book</title></html>')},
 ...[...Array.from({length:36},(_,i)=>i),39,40].map(i=>({name:'Interactive/pages/'+String(i).padStart(2,'0')+'.jpg',data:image}))
 ];
 return entries;
}
test('full pack extracts both editions, validates print geometry, and retains existing Etsy-only path',async()=>{
 const files=await fixture(),zip=await zipFiles(files),book=await inspectCompanionPack(zip);
 assert.equal(book.pages.length,38);assert.equal(book.print.pageCount,40);assert.equal(book.print.interiorBleed,false);
 assert.equal(book.identity.bookId,(await inspectCompanionPack(zip)).identity.bookId);
 assert.deepEqual(book.interior.data,files[1].data);
 assert.deepEqual((await inspectArchive(zip,{allowBookPack:true})).files.map(f=>f.name),['BOOK_PLAN.json','Etsy/Activity_Book_A4.pdf']);
});
test('missing companion assets and mismatched cover are rejected',async()=>{
 const entries=await fixture();
 await assert.rejects(inspectCompanionPack(await zipFiles(entries.filter(f=>f.name!=='Interactive/pages/40.jpg'))),/Missing/);
 const broken=entries.map(f=>f.name==='KDP/KDP_Full_Wrap_Cover.pdf'?{...f,data:entries[1].data}:f);
 await assert.rejects(inspectCompanionPack(await zipFiles(broken)),/Full-wrap/);
});
