import test from 'node:test';
import assert from 'node:assert/strict';
import {listingQualityWarnings} from '../lib/listing-quality.mjs';

test('short artwork titles and sparse generic tags are flagged without inventing replacements',()=>{
 const issues=listingQualityWarnings({artworkName:'The Puddle',listingTitle:'The Puddle',tags:'framed print,printed wall art,wall art'});
 assert.ok(issues.some(message=>/short artwork name/.test(message)));
 assert.ok(issues.some(message=>/Only 3 of 13/.test(message)));
 assert.ok(issues.some(message=>/generic/.test(message)));
});
test('specific physical listing metadata passes simple structural checks',()=>{
 const tags=['dachshund print','sausage dog gift','dog walker gift','rainy day art','hallway wall art','dachshund lover','dog walking print','cosy home decor','black and tan dog','pet lover wall art','puddle illustration','dog owner birthday','burgundy wall art'];
 assert.deepEqual(listingQualityWarnings({artworkName:'The Puddle',listingTitle:'Dachshund Rainy Day Wall Art Print - The Puddle',tags}),[]);
});
test('physical marketplace category requires owner review rather than auto-reclassification',()=>{
 const issues=listingQualityWarnings({listingTitle:'Jazz Saxophone Art Print',tags:Array.from({length:13},(_,i)=>'music room '+i),taxonomyPath:'Art & Collectibles > Prints > Digital Prints'});
 assert.ok(issues.some(message=>/taxonomy says Digital Prints/.test(message)));
});

test('existing physical review shows preflight and correction control without editing the listing',async()=>{
 const {reviewBody}=await import('../lib/product-web.mjs');
 const asset={type:'physical',metadata:{name:'The Puddle',subject:'Dachshund',sectionTitle:'Wall Art'},plan:{body:{title:'The Puddle',description:'A dachshund by a puddle.',tags:'framed print,printed wall art,wall art'},identity:{name:'The Puddle',sku:'SP-TEST',taxonomyPath:'Art & Collectibles > Prints > Digital Prints',sectionTitle:'Wall Art'}},image:{width:3508,height:4961},approvalHash:'approved'};
 const html=reviewBody(asset,'x'.repeat(32),'csrf',true,[]);
 assert.match(html,/Search metadata preflight/);
 assert.match(html,/Only 3 of 13 Etsy tags/);
 assert.match(html,/Correct product details before Deploy/);
 assert.match(html,/Verify that this category suits a physical print/);
});
