import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBulkEtsySeo} from '../public/bulk-etsy-seo.mjs';
const tags=['woodland animal','fox wall art','hedgehog print','forest poster','nature decor','woodland art','nursery wall decor','wildlife artwork','nature lover gift','animal art print','country wall print','botanical woodland','forest art gift'];
const original={
 items:[{filename:'poster.png',folder:'Fox',title:'Fox',listingTitle:'Fox Physical Wall Art Print',sectionTitle:'Nature',printSizes:['A4','A5'],description:'Original licence and buyer instructions. Artwork created with AI.',tags}],
 bundles:[{title:'Woodland Friends Trio',listingTitle:'Woodland Friends Set of 3 Prints',members:['Fox','Robin','Hedgehog'],size:'A4',sectionTitle:'Nature',description:'This bundle contains three separate A4 unframed prints. Artwork created with AI. Original licence remains applicable.',tags}],
 artwork:async()=>new Uint8Array([1,2,3])
};
const answer=()=>({items:[{title:'Fox Wildlife Art Print',tags:tags.join(', '),lead:'A playful woodland fox illustration. This is a shipped physical print.'}],bundles:[{title:'Woodland Wildlife Trio Set of 3 Prints',tags:tags.join(', '),lead:'Three physical prints featuring woodland creatures, supplied as a matching A4 set.'}]});
test('bulk Etsy image SEO edits only listing fields and keeps artwork, origin details and bundle members',async()=>{
 const before=JSON.stringify(original.items);
 const result=applyBulkEtsySeo(original,answer());
 assert.equal(JSON.stringify(original.items),before);
 assert.equal(result.artwork,original.artwork);
 assert.equal(result.items[0].filename,'poster.png');
 assert.deepEqual(result.items[0].printSizes,['A4','A5']);
 assert.equal(result.items[0].sectionTitle,'Nature');
 assert.equal(result.bundles[0].members.join(','),'Fox,Robin,Hedgehog');
 assert.match(result.bundles[0].description,/Original licence remains applicable/);
 assert.match(result.items[0].description,/Original licence and buyer instructions/);
 assert.match(result.bundles[0].description,/Artwork created with AI/);
 assert.equal(result.items[0].tags.length,13);
});
test('incorrect tag counts, download promises and unsupported trio titles stop before uploads',()=>{
 assert.throws(()=>applyBulkEtsySeo(original,{...answer(),items:[{...answer().items[0],tags:tags.slice(0,12).join(', ')}]}),/13 unique/);
 assert.throws(()=>applyBulkEtsySeo(original,{...answer(),bundles:[{...answer().bundles[0],title:'Woodland Trio Digital Download'}]}),/physical/);
 assert.throws(()=>applyBulkEtsySeo(original,{...answer(),bundles:[{...answer().bundles[0],title:'Three Prints Only'}]}),/title must identify a set/);
 assert.throws(()=>applyBulkEtsySeo(original,{...answer(),bundles:[]}),/exact trio count/);
});
