import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedFramedPrices,quoteFramedTrio,framedTrioInventory,framedTrioDescription} from '../lib/framed-trio-options.mjs';
import {parseTrioDetails,validateTrioOnly,makeTrioOnlyPlan} from '../public/collection-trios.mjs';
const values=['Print Only','Black Frame','White Frame','Oak Frame'];
const costs=[15.99,54.99,54.99,54.99];
function inventory(sku='SP-SINGLE-1'){
 return {products:values.map((finish,i)=>({
  sku,property_values:[
   {property_id:100,property_name:'Size',values:['A4'],value_ids:[1]},
   {property_id:200,property_name:'Frame',values:[finish],value_ids:[i+10]}],
  offerings:[{is_enabled:true,quantity:10,price:{currency_code:'GBP',amount:Math.round(costs[i]*100),divisor:100}}]
 }))};
}
const pricing={success:true,currency:'GBP',sizes:[{size:'A4',print:{price:6.59,shipping:0},frame:{price:25.99,shipping:0}}]};
const quote={size:'A4',grossGbp:40.77,supplierCostGbp:15.82};
test('reads four current GBP frame prices from one verified Etsy source SKU',()=>{
 const p=verifiedFramedPrices(inventory(),{size:'A4',sku:'SP-SINGLE-1'});
 assert.deepEqual(values.map(x=>p[x]),costs);
 assert.throws(()=>verifiedFramedPrices({products:inventory().products.slice(1)},{size:'A4',sku:'SP-SINGLE-1'}),/no unambiguous/);
 assert.throws(()=>verifiedFramedPrices(inventory(),{size:'A4',sku:'WRONG'}),/no unambiguous/);
});
test('three-print and three-frame prices remain distinct; frames do not receive supplier discount',()=>{
 const q=quoteFramedTrio({pricing,size:'A4',memberPrices:[0,1,2].map(()=>verifiedFramedPrices(inventory(),{size:'A4',sku:'SP-SINGLE-1'})),
  discount:15,basePrintQuote:quote});
 assert.equal(q.variants['Print Only'].grossGbp,40.77);
 assert.equal(q.variants['Black Frame'].grossGbp,157.77);
 assert.equal(q.variants['Oak Frame'].supplierCostGbp,77.97);
 assert.ok(q.variants['Oak Frame'].contributionGbp>=6);
 assert.throws(()=>quoteFramedTrio({pricing:{success:true,currency:'GBP',sizes:[]},size:'A4',
  memberPrices:[0,1,2].map(()=>verifiedFramedPrices(inventory(),{size:'A4',sku:'SP-SINGLE-1'})),discount:15,
  basePrintQuote:quote}),/does not quote framed/);
});
test('a bundle shares one SKU across four independently priced Etsy finish choices',()=>{
 const options=quoteFramedTrio({pricing,size:'A4',memberPrices:[0,1,2].map(()=>verifiedFramedPrices(inventory(),{size:'A4',sku:'SP-SINGLE-1'})),
  discount:15,basePrintQuote:quote});
 const result=framedTrioInventory({size:'A4',sku:'SP-TRIO-TEST',referencePlan:{inventory:inventory()},options,readinessStateId:12});
 assert.equal(result.products.length,4);
 assert.ok(result.products.every(x=>x.sku==='SP-TRIO-TEST'));
 assert.deepEqual(result.price_on_property,[200]);
 assert.deepEqual(result.products.map(x=>x.offerings[0].price),[40.77,157.77,157.77,157.77]);
});
test('framed copy never says frames excluded and explicitly describes the complete set',()=>{
 const text='Three unframed A4 portrait prints, not digital files and not frames. Each of the three artworks in this collection has been reviewed with AI-assisted design and shipped on physical premium paper. Verify the unframed options for this three-print set.';
 const out=framedTrioDescription(text,'A4');
 assert.match(out,/White Frame/);
 assert.match(out,/three individually framed prints/);
 assert.doesNotMatch(out,/not frames|unframed options/);
 assert.throws(()=>framedTrioDescription('too short','A4'),/description missing/);
});
const tags='sarcastic art,black marker print,hedgehog print,british wall art,home office art,room wall decor,three art prints,physical print,black white art,funny animal art,news humour,desk decor,gift set prints';
const m=(name,members,finishes='Print Only')=>parseTrioDetails([
 'Title: '+name,'Listing title: '+name+' - Three A4 Print Set','Section: Streak','Size: A4',
 'Members: '+members.join(', '),'Finishes: '+finishes,'Tags: '+tags,'','Description:',
 'Three unframed A4 paper prints with separate sarcastic woodland artworks. These original posters were created with AI-assisted design and reviewed for print. The set contains three physical prints and no digital download.'
].join('\n'));
const items=Array.from({length:6},(_,i)=>({folder:'Collection/'+(i+1)+'-poster',listingTitle:'Poster '+(i+1)+' Print',
 sectionTitle:'Streak',printSizes:['A5','A4']}));
test('a ZIP-only 3-print group is one Etsy listing, not three singles',()=>{
 const plan=makeTrioOnlyPlan({items:items.slice(0,3),trios:[m('Trio Set One',['1-poster','2-poster','3-poster'])],
  inputs:[{sku:'SP-TRIO-1',title:'Trio Set One Prints',discount:10}]});
 assert.equal(plan.totalListings,1);
 assert.equal(plan.individualListings,0);
 assert.deepEqual(plan.bundleListings[0].memberFolders,['1-poster','2-poster','3-poster']);
});
test('a six-artwork ZIP-only collection is two distinct Etsy listings',()=>{
 const trios=[m('Trio Set One',['1-poster','2-poster','3-poster']),
  m('Trio Set Two',['4-poster','5-poster','6-poster'])];
 // Two trios must have independent descriptions and tags.
 trios[1].description+=' The second collection includes different art and themes.';
 trios[1].tags=[...trios[1].tags.slice(0,12),'gallery wall set'];
 const plan=makeTrioOnlyPlan({items,trios,inputs:[{sku:'SP-TRIO-1',title:'Trio Set One Prints',discount:10},
  {sku:'SP-TRIO-2',title:'Trio Set Two Prints',discount:15}]});
 assert.deepEqual([plan.totalListings,plan.individualListings,plan.bundleListings.length],[2,0,2]);
});
test('three-piece trio-only refuses missing artwork, duplicate member or wrong section',()=>{
 const three=items.slice(0,3),valid=m('Trio Set One',['1-poster','2-poster','3-poster']);
 assert.throws(()=>validateTrioOnly(three,[{...valid,members:['1-poster','2-poster','missing']}]),/unknown poster/);
 assert.throws(()=>validateTrioOnly(three,[{...valid,members:['1-poster','1-poster','3-poster']}]),/same artwork twice/);
 assert.throws(()=>validateTrioOnly(three,[{...valid,sectionTitle:'Nature'}]),/section differs/);
});
