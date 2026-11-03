import test from 'node:test';
import assert from 'node:assert/strict';
import {PRINT_SECTIONS,PRINT_SECTION_DESCRIPTIONS} from '../lib/print-sections.mjs';
import {productMetadata} from '../lib/product-metadata.mjs';
import {bulkCollectionBody} from '../lib/product-web.mjs';

test('Streak is an opt-in physical shop section without replacing any existing sections',()=>{
 assert.deepEqual(PRINT_SECTIONS.slice(0,5),['Early Learning','Nature','Kids','Wall Art','Music Learning']);
 assert.equal(PRINT_SECTIONS.includes('Streak'),true);
 assert.match(PRINT_SECTION_DESCRIPTIONS.Streak,/sarcastic/i);
});
test('Streak physical artwork defaults to A5 and A4 only',()=>{
 const result=productMetadata({name:'Dry News',kind:'artwork',sectionTitle:'Streak',etsyTitle:'Dry News Hedgehog Print',tags:'hedgehog print, dry humour print',description:'Black and white ink art'},'SP-STREAK-DRY-NEWS-ABCD1234.png','physical');
 assert.equal(result.sectionTitle,'Streak');
 assert.deepEqual(result.printSizes,['A5','A4']);
 assert.equal(result.type,'physical');
});
test('Streak cannot be selected if actual verified Etsy shop sections exclude it',()=>{
 assert.throws(()=>productMetadata({name:'Dry News',kind:'artwork',sectionTitle:'Streak'},'SP-STREAK-DRY-NEWS-ABCD1234.png','physical',['Wall Art','Nature']),/existing Etsy shop section/);
});
test('Streak may not be offered in A3',()=>{
 assert.throws(()=>productMetadata({name:'Dry News',kind:'artwork',sectionTitle:'Streak',printSizes:['A5','A4','A3']},'SP-STREAK-DRY-NEWS-ABCD1234.png','physical'),/A3 is reserved/);
});

test('bulk uploader distinguishes six artwork files from eight Etsy listing slots',()=>{
 const html=bulkCollectionBody({monthly:{used:44,limit:52,remaining:8,label:'November 2026'},sectionInfo:{sections:[{title:'Streak'}]}});
 assert.match(html,/id="bulk-eight-listing-note"/);
 assert.match(html,/Six artwork files can create eight Etsy listings/);
 assert.match(html,/requires eight available monthly product slots/);
 assert.match(html,/<option value="Streak">Streak<\/option>/);
});
test('a Streak shop option is not fabricated when seller verification does not return it',()=>{
 const html=bulkCollectionBody({monthly:{used:44,limit:52,remaining:8,label:'November 2026'},sectionInfo:{sections:[{title:'Nature'}]}});
 assert.doesNotMatch(html,/<option value="Streak">/);
});
