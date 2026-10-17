import test from 'node:test';
import assert from 'node:assert/strict';
import {productMetadata,PRINT_SECTIONS} from '../lib/product-metadata.mjs';
import {metadataFields} from '../lib/product-web.mjs';
test('all five independently selected sections survive metadata validation irrespective of poster type',()=>{
 for(const sectionTitle of PRINT_SECTIONS){const m=productMetadata({kind:'educational',name:'Poster',sectionTitle},'Poster.png','physical');assert.equal(m.sectionTitle,sectionTitle);assert.equal(m.kind,'educational');assert.match(metadataFields(m),new RegExp('<option[^>]* selected>'+sectionTitle+'</option>'));}
 assert.equal(productMetadata({kind:'dinosaur'},'Dinosaurs.png','physical').sectionTitle,'Kids');
 assert.throws(()=>productMetadata({sectionTitle:'Injected'},'Poster.png','physical'),/existing Etsy shop section/);
});
test('digital workflow remains independent of physical shop sections',()=>{const m=productMetadata({kind:'poster',price:5,licence:'Personal use',instructions:'Unzip',sectionTitle:'Kids'},'Poster.zip','digital');assert.equal(m.sectionTitle,'Printable Posters');});
