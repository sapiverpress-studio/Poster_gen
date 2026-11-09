import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectStreakTrioOriginalDraft} from '../lib/streak-trio-original-draft-audit.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const SKU='SP-TRIO-9661EA52B86E24784FC9A50D';
const ID='hzKirH1Ca7OCWmgxKxiAbB1OGeV-auFw';
function fixture(title='Funny Animal Set'){
 const products=['Print Only','Black Frame','White Frame','Oak Frame'].map((frame,n)=>({
  sku:SKU,property_values:[{property_id:1,values:['A4']},{property_id:2,values:[frame]}],
  offerings:[{price:25+n,quantity:10,is_enabled:true,is_deleted:false}]
 }));
 const body={title:'Funny Animal Set',description:'Set of three humorous animal prints',tags:'funny animals,hedgehog art,sloth print',
  shop_section_id:61291652,shipping_profile_id:5,taxonomy_id:7,readiness_state_id:9,return_policy_id:6,
  who_made:'someone_else',when_made:'made_to_order',production_partner_ids:'999'};
 const plan={shopId:50893070,sku:SKU,body,inventory:{products},trio:{size:'A4'}};
 plan.hash=hash(JSON.stringify(plan));
 const asset={type:'physical_bundle',productId:ID,phase:'needs_investigation',stage:'etsy_draft',
  listingId:4613186929,sku:SKU,supplierProductId:'bundle-supplier-1',plan,
  approvalHash:hash(plan.hash+':'+ID)};
 const actual={...body,title,listing_id:4613186929,shop_id:50893070,state:'draft',listing_type:'physical',
  images:[{listing_image_id:1},{listing_image_id:2},{listing_image_id:3},{listing_image_id:4}],tags:body.tags.split(',')};
 let writes=0;
 const uploads={get:async key=>key==='uploads/'+ID+'/state'?asset:
  key==='supplier-bundles/'+SKU?{phase:'verified',bundleId:'bundle-supplier-1'}:null,
  setJSON:async()=>{writes++;throw Error('Read-only audit must not write')}};
 const etsyStore={get:async key=>key==='draft/'+SKU?{listingId:4613186929,uploadId:ID}:null,
  setJSON:async()=>{writes++;throw Error('Read-only audit must not write')}};
 const client={session:async()=>({shop_id:50893070,shop_name:'SapiverPrints'}),
  api:async path=>path==='/listings/4613186929?includes=Images'?actual:
   path==='/listings/4613186929/inventory'?{products}:
   path==='/shops/50893070/sections'?{results:[{title:'Trio Collection',shop_section_id:61291652}]}:
   (()=>{throw Error('Unexpected Etsy path')})()};
 const request=async()=>({status:200,ok:true,json:async()=>({success:true,bundle:{
  sku:SKU,bundle_id:'bundle-supplier-1',total_prints:3,items:[{},{},{}]}})});
 return {uploads,etsyStore,client,apiKey:'fake-test-key',request,asset,actual,getWrites:()=>writes};
}
test('existing draft read-only audit identifies exact matching Etsy listing with no write',async()=>{
 const f=fixture();
 const r=await inspectStreakTrioOriginalDraft(f);
 assert.equal(r.listingId,4613186929);
 assert.equal(r.canResumeWithExactReadback,true);
 assert.equal(r.inventory.status,'verified');
 assert.equal(r.imagesVerified,true);
 assert.deepEqual(r.mismatches,[]);
 assert.equal(f.getWrites(),0);
});
test('exact HTML title encoding is classified without hiding real changes',async()=>{
 const f=fixture('Funny Animal Set &amp; Friends');
 f.asset.plan.body.title='Funny Animal Set & Friends';
 f.asset.plan.hash=hash(JSON.stringify(Object.fromEntries(Object.entries(f.asset.plan).filter(([k])=>k!=='hash'))));
 f.asset.approvalHash=hash(f.asset.plan.hash+':'+ID);
 const r=await inspectStreakTrioOriginalDraft(f);
 assert.deepEqual(r.mismatches,[{field:'title',result:'exact_html_entities'}]);
 assert.equal(r.canResumeWithExactReadback,true);
 assert.equal(f.getWrites(),0);
});
test('a changed title is not safe for automatic in-place continuation',async()=>{
 const f=fixture('Completely different art title');
 const r=await inspectStreakTrioOriginalDraft(f);
 assert.equal(r.canResumeWithExactReadback,false);
 assert.deepEqual(r.mismatches,[{field:'title',result:'changed'}]);
 assert.equal(f.getWrites(),0);
});
test('incomplete images and wrong supplier identity prevent continuation',async()=>{
 const f=fixture();
 f.actual.images.pop();
 const r=await inspectStreakTrioOriginalDraft(f);
 assert.equal(r.canResumeWithExactReadback,false);
 assert.equal(r.imagesVerified,false);
 assert.equal(f.getWrites(),0);
});
