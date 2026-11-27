import test from 'node:test';
import assert from 'node:assert/strict';
import {bookDetails,inspectActivityBook} from '../lib/activity-book.mjs';
import {zipFiles} from '../lib/digital-archive.mjs';
import {PDFDocument} from 'pdf-lib';
const plan=(age='5-6',areas=['bsl','music','hand','math','spell','maze','color'])=>({title:'Hen & Bea Activity Book',age,pages:Array.from({length:35},(_,i)=>({page:i+1,area:areas[i%areas.length],title:i===4&&areas.includes('spell')?'Word Search':'Activity'})),endMatter:[36,37,38,39,40]});
test('tags derive from age and actual activities; do not carry over earlier ages',()=>{
 const a=bookDetails(plan()),b=bookDetails(plan('7-8',['math','hand','maze']));
 assert.equal(a.tags.length,13);assert.equal(new Set(a.tags).size,13);assert.ok(a.tags.every(t=>t.length<=20));assert.ok(a.tags.includes('ages 5 6'));assert.ok(a.tags.includes('kids word search'));assert.ok(a.tags.includes('bsl fingerspelling'));assert.ok(b.tags.includes('ages 7 8'));assert.ok(!b.tags.some(t=>/bsl|music|word search|5 6/.test(t)));
});
test('only Etsy PDF content is delivered and reused outer name does not determine SKU',async()=>{
 const doc=await PDFDocument.create();for(let i=0;i<41;i++)doc.addPage([595.276,841.89]);const pdf=Buffer.from(await doc.save());const entries=[{name:'BOOK_PLAN.json',data:Buffer.from(JSON.stringify(plan()))},{name:'Etsy/Activity_Book_A4.pdf',data:pdf},{name:'Interactive/index.html',data:Buffer.from('<html>private</html>')},{name:'KDP/private.pdf',data:Buffer.from('private')}];
 const book=await inspectActivityBook(await zipFiles(entries));assert.equal(book.inspection.files.length,1);assert.equal(book.delivery.files.length,1);assert.equal(book.delivery.contents[0].name,'Activity_Book_A4.pdf');assert.deepEqual(book.delivery.contents[0].data,pdf);
 await assert.rejects(inspectActivityBook(await zipFiles(entries.filter(e=>!e.name.startsWith('Etsy/')))),/artwork|Etsy/);
});
test('invalid age or 40-page manifest rejected',()=>{assert.throws(()=>bookDetails(plan('unknown')));assert.throws(()=>bookDetails({...plan(),endMatter:[]}));});

test('activity-book tags balance theme, age, subjects, activities and broad buying intent',()=>{
 const themed=(title,age='5-6',areas=['bsl','music','hand','math','spell','maze','color'])=>({...plan(age,areas),title,pages:plan(age,areas).pages.map(p=>({...p,title:p.area==='spell'?'Word Search':p.area==='music'?'Name the Note':'Activity',variant:p.area==='spell'?'search':p.area==='music'?'note-name':undefined}))});
 const cases=[['Hen & Bea’s Christmas Adventure','christmas'],['Dinosaur Adventure','dinosaur'],['Ocean Adventure','ocean'],['Space Adventure','space'],['Easter Adventure','easter'],['Hen & Bea Activity Book',''],['Hen & Bea’s Robot Adventure','robot'],['Woodland','woodland'],['Summer','summer'],['Halloween','halloween'],['Hen & Bea’s Fairy Garden','nature']];
 const groups=[['bsl','music','hand','math','spell','maze','color'],['math','hand','maze'],['math'],['color'],['bsl'],['spell']];
 for(const [title,theme] of cases)for(const age of ['4-5','5-6','6-7','7-8'])for(const areas of groups){
  const d=bookDetails(themed(title,age,areas)),tags=d.tags;
  assert.equal(tags.length,13);assert.equal(new Set(tags).size,13);assert.ok(tags.every(t=>t.length<=20));
  assert.ok(tags.includes('ages '+age.replace('-',' ')));
  assert.ok(tags.includes('kids activities'));assert.ok(tags.includes('holiday activities'));
  if(theme)assert.ok(tags.includes(theme+' activities'));
  else assert.ok(!tags.some(t=>/christmas|hen|bea/.test(t)));
  if(!areas.includes('bsl'))assert.ok(!tags.some(t=>/\bbsl\b/.test(t)));
  if(!areas.includes('music'))assert.ok(!tags.some(t=>/\bmusic\b/.test(t)));
  if(!areas.includes('spell'))assert.ok(!tags.some(t=>/word ?search|^spelling practice$/.test(t)));
  if(!areas.includes('maze'))assert.ok(!tags.some(t=>/maze/.test(t)));
 }
 const christmas=bookDetails(themed(cases[0][0])).tags;
 for(const t of ['christmas activities','christmas printable','christmas holiday','christmas wordsearch','maths worksheets','music worksheets','bsl fingerspelling','handwriting practice','kids mazes','kids activities','holiday activities'])assert.ok(christmas.includes(t),t);
 const ref=themed('Ocean','5-6',['music']);ref.pages=ref.pages.map(p=>({...p,title:'Music Symbols and Notation',variant:'music-reference'}));assert.ok(bookDetails(ref).tags.includes('music notation'));
});
test('search variant is recognised without a descriptive page title',()=>{
 const p=plan('5-6',['spell']);p.pages=p.pages.map(x=>({...x,title:'Activity',variant:'search'}));
 assert.ok(bookDetails(p).hasSearch);assert.ok(bookDetails(p).tags.includes('kids word search'));
});
