import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotFromEtsy,validatedShopSections} from '../lib/etsy-section-snapshot.mjs';
import {productMetadata} from '../lib/product-metadata.mjs';
import {bulkCollectionBody} from '../lib/product-web.mjs';

const now=1800000000000,shopId=12345;
const payload={results:[{shop_section_id:11,title:'Nature'},{shop_section_id:12,title:'Christmas'},{shop_section_id:13,title:'Early Learning'}]};
test('every existing Etsy shop section is offered, including seasonal and empty sections',()=>{
 const source=snapshotFromEtsy({shopId,result:payload,clock:()=>now});
 assert.deepEqual(source.sections.map(x=>x.title),['Christmas','Early Learning','Nature']);
 const page=bulkCollectionBody({monthly:{limit:52,used:22,remaining:30,label:'October 2026'},sectionInfo:{sections:source.sections,checkedAt:now}});
 assert.match(page,/<label>Etsy shop section <select name="shopSection"/);
 assert.match(page,/<option value="Nature">Nature<\/option>/);
 assert.match(page,/<option value="Christmas">Christmas<\/option>/);
 assert.match(page,/Use each poster’s Section: in details.md/);
 assert.match(page,/Poster type \(advanced\)/);
 assert.match(page,/22 of 52 products started/);
 const metadata=productMetadata({name:'Winter Owl',kind:'artwork',sectionTitle:'Christmas'},'Winter-Owl.png','physical',source.sections.map(x=>x.title));
 assert.equal(metadata.sectionTitle,'Christmas');
 assert.throws(()=>productMetadata({name:'Poster',sectionTitle:'Invented'},'Poster.png','physical',source.sections.map(x=>x.title)),/existing Etsy shop section/);
});
test('reject stale, foreign, duplicate and incorrectly formatted Etsy sections',()=>{
 const valid=snapshotFromEtsy({shopId,result:payload,clock:()=>now});
 assert.throws(()=>validatedShopSections(valid,{shopId:shopId+1,clock:()=>now}),/refreshing/);
 assert.throws(()=>validatedShopSections(valid,{shopId,clock:()=>now+86400001}),/refreshing/);
 assert.throws(()=>snapshotFromEtsy({shopId,result:{results:[{shop_section_id:11,title:'Nature'},{shop_section_id:13,title:'nature'}]},clock:()=>now}),/inconsistent/);
 assert.throws(()=>snapshotFromEtsy({shopId,result:{results:[{shop_section_id:11,title:'<script>'}]},clock:()=>now}),/inconsistent/);
 assert.throws(()=>snapshotFromEtsy({shopId,result:{results:Array.from({length:21},(_,i)=>({shop_section_id:i+1,title:'Section '+i}))},clock:()=>now}),/Invalid/);
});
test('when Etsy sections have not been verified, no unverified choices are offered',()=>{
 const page=bulkCollectionBody({monthly:{limit:52,used:22,remaining:30,label:'October 2026'}});
 assert.match(page,/Verified Etsy sections are not available/);
 assert.match(page,/<select name="shopSection" disabled>/);
 assert.doesNotMatch(page,/<option value="Nature">Nature<\/option>/);
});
