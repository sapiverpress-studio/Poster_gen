import test from 'node:test';
import assert from 'node:assert/strict';
import {zipPreviewFingerprint,savedSessionMatchesZip,titleForSelectedZip} from '../public/bulk-session.mjs';

function archive(title,crc=100){
 return {mode:'four-listings',items:[1,2,3].map(n=>({
  folder:'0'+n+'_Print',title:'Print '+n,listingTitle:'Art Print '+n,sectionTitle:'Wall Art',
  description:'Print '+n+' details',tags:['art print '+n],printSizes:['A5','A4'],bytes:1000,
  entry:{crc:crc+n}
 })),bundles:[{
  title:'New Trio',listingTitle:title,sectionTitle:'Wall Art',size:'A4',
  members:['01_Print','02_Print','03_Print'],tags:['one','two'],description:'description'
 }]};
}
const select=(state,zip,signature='upload.zip|35000')=>titleForSelectedZip({state,archive:zip,signature,index:0});

test('new ZIP title must win over previously saved trio title',()=>{
 const oldZip=archive('Old Blue Copper Trio Wall Art Prints');
 const saved={version:4,signature:'upload.zip|35000',uploadMode:'four-listings',
  previewFingerprint:zipPreviewFingerprint(oldZip),
  bundles:[{input:{title:'Old custom Etsy title for Blue Copper'}}]};
 const newZip=archive('New Modern Eclectic Set of Three Prints',200);
 assert.equal(select(saved,newZip),'New Modern Eclectic Set of Three Prints');
 assert.equal(savedSessionMatchesZip({state:saved,archive:newZip,signature:saved.signature}),false);
});
test('the exact same ZIP retains an intentionally edited existing review title',()=>{
 const zip=archive('From the current bundle-1.md');
 const saved={version:4,signature:'upload.zip|35000',uploadMode:'four-listings',
  previewFingerprint:zipPreviewFingerprint(zip),
  bundles:[{input:{title:'Approved customer-edited A4 Trio Prints'}}]};
 assert.equal(select(saved,zip),'Approved customer-edited A4 Trio Prints');
 assert.equal(savedSessionMatchesZip({state:saved,archive:zip,signature:saved.signature}),true);
});
test('changed manifest takes priority even when ZIP filename and size match',()=>{
 const oldZip=archive('Blue Copper Collection Prints');
 const saved={version:4,signature:'upload.zip|35000',uploadMode:'four-listings',
  previewFingerprint:zipPreviewFingerprint(oldZip),
  bundles:[{input:{title:'Old cached listing title'}}]};
 const newlySelected=archive('River Staircase Dressmaker Set of 3 Wall Art Prints');
 assert.equal(select(saved,newlySelected),'River Staircase Dressmaker Set of 3 Wall Art Prints');
});
test('old sessions without preview fingerprints cannot contaminate new ZIPs',()=>{
 const oldSession={version:4,signature:'upload.zip|35000',uploadMode:'four-listings',
  bundles:[{input:{title:'Previous trio title'}}]};
 assert.equal(select(oldSession,archive('New item physical wall art prints')),'New item physical wall art prints');
});
test('missing listing title fails rather than silently using an old title',()=>{
 const zip=archive('');
 const oldSession={version:4,bundles:[{input:{title:'Old physical wall art prints'}}]};
 assert.throws(()=>select(oldSession,zip),/no valid Etsy listing title/);
});
