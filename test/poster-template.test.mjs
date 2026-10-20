import test from 'node:test';
import assert from 'node:assert/strict';
import {identityFromFilename,templateDraftPlan,verifyTemplateProfiles,verifyTemplateInventory,FOOTER,TAGS,PRICES,SIZES,FRAMES} from '../lib/poster-template.mjs';
import {reference,inventory,shipping,processing,returns,plan} from './fixtures/poster-template.mjs';
test('filename derives subject and one SKU without inventing learning claims',()=>{const a=identityFromFilename('SP-EL-006-DINOSAURS-ACROSS-TIME.png');assert.equal(a.name,'Dinosaurs Across Time');assert.equal(a.sku,'SP-EL-006-DINOSAURS-ACROSS-TIME');assert.equal(a.title,'Dinosaurs Across Time Educational Poster for Kids');assert.equal(a.description,'Dinosaurs Across Time printed educational poster. This is a physical print offered framed or unframed, not downloadable artwork.\n\n'+FOOTER);assert.equal(identityFromFilename('Counting 1–9.png').name,'Counting 1–9');for(const f of ['../poster.png','poster.jpg','poster (1).png','a'.repeat(60)+'.png','123.png'])assert.throws(()=>identityFromFilename(f));});
test('template has exactly twelve combinations, fixed prices and thirteen unchanged tags',()=>{const p=plan();assert.equal(p.inventory.products.length,12);assert.equal(new Set(p.inventory.products.map(v=>v.sku)).size,1);assert.equal(p.body.who_made,'someone_else');assert.equal(p.body.tags.split(',').length,13);assert.equal(p.body.tags,TAGS.join(','));assert.deepEqual(p.inventory.products.map(v=>v.offerings[0].price),Object.values(PRICES).flat());assert.equal(p.body.should_auto_renew,true);assert.deepEqual(FRAMES,['Print Only','Black Frame','White Frame','Oak Frame']);assert.equal(p.body.price,13.99);assert.equal(identityFromFilename('SP-COAST-001.png').sku,'SP-COAST-001');assert.equal(p.body.state,undefined);assert.deepEqual(p.inventory.sku_on_property,[]);});
test('reference drift, missing frame, duplicate combination or wrong price blocks plan',()=>{assert.throws(()=>templateDraftPlan({filename:'Space.png',reference:{...reference,who_made:'i_did'},inventory,shopId:456}));for(const products of [inventory.products.slice(1),[...inventory.products,inventory.products[0]],inventory.products.map((p,i)=>i?p:{...p,offerings:[{...p.offerings[0],price:{amount:1,divisor:100,currency_code:'GBP'}}]})])assert.throws(()=>templateDraftPlan({filename:'Space.png',reference,inventory:{products},shopId:456}));});
test('UK-only free shipping, processing and returns are checked against exact template',()=>{verifyTemplateProfiles(shipping,processing,returns,456);assert.throws(()=>verifyTemplateProfiles({...shipping,shipping_profile_destinations:[...shipping.shipping_profile_destinations,{destination_country_iso:'US'}]},processing,returns,456));assert.throws(()=>verifyTemplateProfiles(shipping,{...processing,max_processing_days:3},returns,456));assert.throws(()=>verifyTemplateProfiles(shipping,processing,{...returns,accepts_exchanges:false},456));});
test('inventory read-back rejects changed price, SKU and variation counts',()=>{const p=plan(),data={products:inventory.products.map(v=>({...v,sku:p.identity.sku}))};verifyTemplateInventory(data,p);assert.throws(()=>verifyTemplateInventory({products:data.products.slice(1)},p));assert.throws(()=>verifyTemplateInventory({products:data.products.map(v=>({...v,sku:'OTHER'}))},p));});
import {verifyTemplateCarrier,verifyTemplateListing} from '../lib/poster-template.mjs';
import {carriers} from './fixtures/poster-template.mjs';
test('wrong carrier service, personalisation or changed description blocks publication',()=>{verifyTemplateCarrier(shipping,carriers);assert.throws(()=>verifyTemplateCarrier(shipping,{results:[{...carriers.results[0],name:'Different carrier'}]}));const p=plan(),l={...p.body,tags:TAGS.slice(),shop_id:456,state:'draft',listing_type:'physical',is_personalizable:false};verifyTemplateListing(l,p,{shopId:456,state:'draft'});assert.throws(()=>verifyTemplateListing({...l,description:'Changed' },p,{shopId:456,state:'draft'}));assert.throws(()=>verifyTemplateListing({...l,is_personalizable:true},p,{shopId:456,state:'draft'}));});

test('saved draft reference uses its independently verified inventory processing profile',()=>{
 const p=templateDraftPlan({filename:'Coast.png',reference:{...reference,state:'draft',readiness_state_id:null},inventory,shopId:456});
 assert.equal(p.body.readiness_state_id,22);assert.equal(p.inventory.products.length,12);
 const l={...p.body,tags:p.body.tags.split(','),shop_id:456,state:'draft',listing_type:'physical',is_personalizable:false,readiness_state_id:null};
 verifyTemplateListing(l,p,{shopId:456,state:'draft'});
 assert.throws(()=>verifyTemplateListing({...l,state:'active'},p,{shopId:456,state:'active'}));
 assert.throws(()=>verifyTemplateListing({...l,readiness_state_id:99},p,{shopId:456,state:'draft'}));
});
test('draft reference cannot guess processing, copy another shop or use sold-out inventory',()=>{
 const draft={...reference,state:'draft',readiness_state_id:null};
 for(const offerings of [[{is_enabled:true,quantity:10,readiness_state_id:null}],[{is_enabled:true,quantity:10,readiness_state_id:22},{is_enabled:true,quantity:10,readiness_state_id:23}]]){
  assert.throws(()=>templateDraftPlan({filename:'Coast.png',reference:draft,inventory:{products:[{offerings}]},shopId:456}));
 }
 assert.throws(()=>templateDraftPlan({filename:'Coast.png',reference:{...draft,shop_id:999},inventory,shopId:456}));
 assert.throws(()=>templateDraftPlan({filename:'Coast.png',reference:{...reference,state:'sold_out'},inventory,shopId:456}));
});

test('real carrier-based Etsy shipping accepts null days but rejects incomplete or changed delivery estimates',()=>{
 const destination=shipping.shipping_profile_destinations[0];
 const p={...shipping,shipping_profile_destinations:[{...destination,min_delivery_days:null,max_delivery_days:null}]};
 verifyTemplateCarrier(p,carriers);
 for(const changed of [{min_delivery_days:2,max_delivery_days:null},{min_delivery_days:null,max_delivery_days:3},{min_delivery_days:4,max_delivery_days:5},{shipping_carrier_id:999}])assert.throws(()=>verifyTemplateCarrier({...p,shipping_profile_destinations:[{...p.shipping_profile_destinations[0],...changed}]},carriers));
});

test('A4/A5 Nature configuration creates eight options and does not alter three-size wall art',()=>{
 const settings={filename:'Nature.png',reference,inventory,shopId:456};
 const two=templateDraftPlan({...settings,printSizes:['A5','A4']});
 assert.equal(two.inventory.products.length,8);
 assert.deepEqual([...new Set(two.inventory.products.map(x=>x.property_values[0].values[0]))],['A5','A4']);
 const readBack={products:inventory.products.slice(0,8).map(x=>({...x,sku:two.identity.sku}))};
 verifyTemplateInventory(readBack,two);
 assert.throws(()=>verifyTemplateInventory({products:inventory.products.map(x=>({...x,sku:two.identity.sku}))},two),/size\\/frame/);
 assert.equal(templateDraftPlan(settings).inventory.products.length,12);
 assert.throws(()=>templateDraftPlan({...settings,printSizes:['A5','A3']}),/print-size/);
});
