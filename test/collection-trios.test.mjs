import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTrioDetails,validateTwoTrios,makeEightListingPlan,validateBundleInput} from '../public/collection-trios.mjs';
const tags=i=>['woodland wall art','nature picture set','british animal art','kids reading nook','forest wall decor','woodland nursery','animal print trio','art set of three','wildlife illustration','nature room prints','animal verse prints','bedroom wall prints',i===1?'woodland animals':'forest nature art'].join(', ');
function trioText(i,members){
 return ['Title: Woodland Trio '+i,'Listing title: British Woodland Trio '+i+' Set of 3 A4 Prints',
 'Section: Nature','Size: A4','Members: '+members.join(', '),'Tags: '+tags(i),'','Description:',
 'Three unframed A4 prints in a distinctive British Woodland '+i+' collection. This trio features '+members.join(', ')+
 ' and has its own story and room styling. Our original directions use AI-assisted illustration and writing tools; final artwork has been reviewed by Sapiver Prints. Frames are not supplied.'].join('\n');
}
const items=Array.from({length:6},(_,i)=>({folder:'Collection/'+(i+1)+'-animal',listingTitle:'Animal '+(i+1)+' Print',sectionTitle:'Nature',printSizes:['A5','A4']}));
const tri=(a=items)=>[
 parseTrioDetails(trioText(1,a.slice(0,3).map(x=>x.folder.split('/').at(-1))),{filename:'bundle-1.md'}),
 parseTrioDetails(trioText(2,a.slice(3).map(x=>x.folder.split('/').at(-1))),{filename:'bundle-2.md'})
];
test('the fixed six plus two independent trios results in precisely 8 listings',()=>{
 const bundles=tri(),plan=makeEightListingPlan({items,trios:bundles,inputs:[
  {sku:'SP-WOODLAND-TRIO-ONE',title:'Woodland Trio One A4 Print Set',discount:15},
  {sku:'SP-WOODLAND-TRIO-TWO',title:'Woodland Trio Two A4 Print Set',discount:10}
 ]});
 assert.equal(plan.totalListings,8);
 assert.equal(plan.individualListings,6);
 assert.equal(plan.bundleListings.length,2);
 assert.notEqual(plan.bundleListings[0].description,plan.bundleListings[1].description);
 assert.deepEqual(plan.bundleListings.map(x=>x.memberFolders),[['1-animal','2-animal','3-animal'],['4-animal','5-animal','6-animal']]);
 assert.deepEqual(plan.bundleListings.map(x=>x.discount),[15,10]);
});
test('reject a repeated animal, missing animal, or reused poster folder',()=>{
 const b=tri();b[1].members[0]=b[0].members[0];
 assert.throws(()=>validateTwoTrios(items,b),/both trio/);
 const c=tri();c[1].members[0]='unknown-animal';
 assert.throws(()=>validateTwoTrios(items,c),/unknown poster/);
 assert.throws(()=>validateTwoTrios([...items.slice(0,5),items[0]],tri()),/unique poster/);
});
test('reject different size not supported by all members, including unverified A3',()=>{
 const b=tri();b[0].size='A3';
 assert.throws(()=>validateTwoTrios(items,b),/not approved/);
});
test('enforce unique set copy, title and tags instead of duplicating trio 1',()=>{
 const b=tri();b[1].description=b[0].description;
 assert.throws(()=>validateTwoTrios(items,b),/description values must be different/);
 const c=tri();c[1].tags=c[0].tags;
 assert.throws(()=>validateTwoTrios(items,c),/distinct set/);
 const d=tri();d[1].listingTitle=d[0].listingTitle;
 assert.throws(()=>validateTwoTrios(items,d),/listingTitle values must be different/);
});
test('force honest bundle contents, unframed fixed size, AI disclosure and separate 13 tags',()=>{
 const good=trioText(1,['1-animal','2-animal','3-animal']);
 assert.equal(parseTrioDetails(good).tags.length,13);
 assert.throws(()=>parseTrioDetails(good.replace('AI-assisted','computer-assisted')),/AI assistance/);
 assert.throws(()=>parseTrioDetails(good.replace('Three unframed A4','Three framed A4')),/unframed/);
 assert.throws(()=>parseTrioDetails(good.replace('Size: A4','Size: A2')),/Size must/);
 assert.throws(()=>parseTrioDetails(good.replace('animal print trio','woodland wall art')),/13 distinct/);
});
test('reject reused PrintShrimp bundle SKU or malformed untrusted SKU',()=>{
 const bundles=tri(),inputs=[{sku:'SAME-SKU',title:'Woodland One Print Set',discount:15},{sku:'same-sku',title:'Woodland Two Print Set',discount:10}];
 assert.throws(()=>makeEightListingPlan({items,trios:bundles,inputs}),/different SKUs/);
 assert.throws(()=>validateBundleInput({sku:'https://bad.example/a',title:'Woodland Print Set',discount:10,trio:bundles[0]}),/SKU/);
 assert.throws(()=>validateBundleInput({sku:'A4',title:'Woodland Print Set',discount:85,trio:bundles[0]}),/discount/);
});
test('correct members cannot be silently moved to a different Etsy section',()=>{
 const b=tri();b[0].sectionTitle='Music Learning';
 assert.throws(()=>validateTwoTrios(items,b),/actual Etsy section/);
});
