import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {auditInsomniaDraft} from '../lib/insomnia-draft-diagnostic.mjs';
import {TEMPLATE_VERSION} from '../lib/poster-template.mjs';
const digest=v=>createHash('sha256').update(v).digest('hex');
function fixture({description="I'm Not Napping",title='Funny Sloth Wall Art Print'}={}){
 const id='c'.repeat(32),listingId=4612345678,sku='SP-INSOMNIA-ON-STRIKE-9AE40538';
 const body={title:'Funny Sloth Wall Art Print',description:"I'm Not Napping",taxonomy_id:999,shipping_profile_id:888,readiness_state_id:777,return_policy_id:666,who_made:'someone_else',when_made:'made_to_order',tags:'sloth wall art'};
 const plan={version:TEMPLATE_VERSION,deliveryMode:'international',identity:{sku,sectionTitle:'Streak'},referenceListingId:123,body,inventory:{products:[]}};
 plan.hash=digest(JSON.stringify({version:plan.version,deliveryMode:plan.deliveryMode,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 const img={sha256:'abc'};
 const approvalHash=digest(img.sha256+':'+plan.hash+':'+TEMPLATE_VERSION);
 const asset={listingId,plan,image:img,phase:'needs_investigation',stage:'etsy_draft',failureAction:'publish',approvedAt:Date.now(),approvalHash};
 const listing={...body,description,title,state:'draft',listing_type:'physical',is_personalizable:false,listing_id:listingId,shop_id:50893070,shop_section_id:42,
  tags:body.tags.split(','),images:[1,2,3,4].map(x=>({listing_image_id:x}))};
 let writes=0;
 const uploads={
  get:async key=>key==='uploads/'+id+'/state'?asset:
   key==='claims/'+id+'/publish'?{approvalHash}:null,
  setJSON:async()=>{writes++;throw Error('Audit may not write')}
 };
 const etsyStore={
  get:async key=>key==='draft/'+sku?{uploadId:id,listingId}:null,
  setJSON:async()=>{writes++;throw Error('Audit may not write')}
 };
 const client={
  session:async()=>({shop_id:50893070,shop_name:'SapiverPrints'}),
  api:async path=>path.startsWith('/listings/'+listingId+'?')?listing:
   path==='/listings/'+listingId+'/inventory'?{products:[]}:
   path==='/shops/50893070/sections'?{results:[{title:'Streak',shop_section_id:42}]}:
   (()=>{throw Error('Unexpected endpoint')})()
 };
 const request=async()=>({status:404});
 return {uploads,etsyStore,client,request,listing,asset,getWrites:()=>writes};
}
test('Insomnia read-only audit identifies only an Etsy title alteration without merchant writes',async()=>{
 const f=fixture({title:'Modified title'});
 const d=await auditInsomniaDraft({...f,apiKey:'read-only-supplier-key'});
 assert.equal(d.approvalVerified,true);
 assert.deepEqual(d.mismatches,[{field:'title',shape:'different_value'}]);
 assert.equal(d.inventoryStatus,'verified');assert.equal(d.allImagesVerified,true);
 assert.equal(d.supplierStatus,'absent');assert.equal(d.canInvestigateRepair,true);
 assert.equal(f.getWrites(),0);
});
test('Exact HTML entity normalisations do not create a false description difference',async()=>{
 const f=fixture({description:'I&#39;m Not Napping'});
 const d=await auditInsomniaDraft({...f,apiKey:'key'});
 assert.deepEqual(d.mismatches,[]);
});
test('Never audit if Insomnia is not in the original retained draft stage',async()=>{
 const f=fixture();f.asset.phase='published';
 await assert.rejects(auditInsomniaDraft({...f,apiKey:'key'}),/no longer at the expected retained-draft stage/);
 assert.equal(f.getWrites(),0);
});
test('Differences are field names, never listing copy or sensitive Etsy text',async()=>{
 const f=fixture({description:'New description with owner private words'});
 const d=await auditInsomniaDraft({...f,apiKey:'key'});
 assert.equal(d.mismatches.length,1);
 assert.equal(d.mismatches[0].field,'description');
 assert.ok(!JSON.stringify(d).includes('owner private words'));
 assert.ok(!JSON.stringify(d).includes("I'm Not Napping"));
 assert.equal(f.getWrites(),0);
});
