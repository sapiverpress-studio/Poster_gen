import test from 'node:test';
import assert from 'node:assert/strict';
import {bulkCollectionBody,metadataFields} from '../lib/product-web.mjs';
import {productMetadata} from '../lib/product-metadata.mjs';

const occurrences=(text,needle)=>text.split(needle).length-1;
test('bulk page keeps existing physical uploads and offers one separate digital product form',()=>{
 const html=bulkCollectionBody({
  monthly:{used:0,limit:52,remaining:52,label:'November'},
  sectionInfo:{sections:[]},websiteFolders:[]
 });
 assert.match(html,/value="single" required/);
 assert.match(html,/value="four-listings" required/);
 assert.match(html,/value="eight-listings" required/);
 assert.equal(occurrences(html,'name="uploadMode" value="digital"'),1);
 assert.equal(occurrences(html,'id="digital-bulk-panel"'),1);
 assert.equal(occurrences(html,'id="poster-upload-form"'),1);
 assert.equal(occurrences(html,'name="digitalSectionTitle" value="Digital Downloads"'),1);
 assert.match(html,/value="pattern" selected/);
 assert.match(html,/no PrintShrimp/);
});

test('backend plans digital design for the new shop section and no physical variants',()=>{
 const metadata=productMetadata({
  name:'Golden Sunflower Embroidery Texture',
  subject:'Sunflowers',
  kind:'pattern',price:'3.49',
  useEmbeddedText:true,seamlessConfirmed:true,
  digitalSectionTitle:'Digital Downloads',
  tags:'sunflower pattern,floral fabric'
 },'sunflower-commercial-seller-kit.zip','digital');
 assert.equal(metadata.type,'digital');
 assert.equal(metadata.kind,'pattern');
 assert.equal(metadata.sectionTitle,'Digital Downloads');
 assert.equal(metadata.printSizes,null);
 assert.equal(metadata.price,3.49);
 assert.equal(metadata.useEmbeddedText,true);
});

test('existing pattern listings retain their previous section unless explicitly changed',()=>{
 const meta=productMetadata({
  name:'Legacy Pattern',
  kind:'pattern',price:'3.49',
  useEmbeddedText:true,seamlessConfirmed:true
 },'legacy-pattern.zip','digital');
 assert.equal(meta.sectionTitle,'Seamless Patterns');
});

test('digital section survives a later product edit',()=>{
 const html=metadataFields({sectionTitle:'Digital Downloads',kind:'pattern'},[],[],[]);
 assert.match(html,/name="digitalSectionTitle" value="Digital Downloads"/);
});

test('unrecognised digital section cannot be submitted',()=>{
 assert.throws(()=>productMetadata({
  name:'Test',kind:'pattern',price:'3.49',
  useEmbeddedText:true,seamlessConfirmed:true,digitalSectionTitle:'Elsewhere'
 },'test.zip','digital'),/Unsupported digital shop section/);
});
