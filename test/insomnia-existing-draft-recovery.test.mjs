import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exactInsomniaTitleEncoding,recoverInsomniaDraft} from '../lib/insomnia-existing-draft-recovery.mjs';
import {plan as makePlan,shipping,processing,returns,carriers} from './fixtures/poster-template.mjs';
import {TEMPLATE_VERSION} from '../lib/poster-template.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const SKU='SP-INSOMNIA-ON-STRIKE-9AE40538',SHOP=50893070,LISTING=4613147688;
const EXPECTED="Funny Sloth Wall Art Print - I'm Not Napping I'm on Strike - Office Humour";
const ENCODED="Funny Sloth Wall Art Print - I&#39;m Not Napping I&#39;m on Strike - Office Humour";
function fixture({title=ENCODED}={}){
 const id='c'.repeat(32),files=[Buffer.from('preview one'),Buffer.from('preview two'),Buffer.from('preview three'),Buffer.from('preview four')];
 const master=Buffer.from('approved original master pixels');
 const plan=makePlan();plan.deliveryMode='domestic';
 plan.identity={...plan.identity,sku:SKU,name:'Insomnia - On Strike',sectionTitle:'Streak',previewHashes:files.map(sha),shopId:SHOP};
 plan.body={...plan.body,title:EXPECTED,description:'Insomnia a printed physical poster',production_partner_ids:'12345'};
 plan.inventory.products=plan.inventory.products.map(p=>({...p,sku:SKU}));
 plan.hash=sha(JSON.stringify({version:plan.version,deliveryMode:plan.deliveryMode,identity:plan.identity,
  referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 const image={sha256:sha(master),bytes:master.length};
 const approvalHash=sha(image.sha256+':'+plan.hash+':'+TEMPLATE_VERSION);
 let asset={listingId:LISTING,productId:id,metadata:{printSizes:['A5','A4','A3']},image,plan,
  masterKey:'uploads/'+id+'/master.png',phase:'needs_investigation',stage:'etsy_draft',failureAction:'publish',
  approvedAt:Date.now(),approvalHash};
 const product={productId:id,pendingRevision:id,etsyListingId:LISTING,phase:'needs_investigation'};
 const map=new Map([['uploads/'+id+'/state',asset],['uploads/'+id+'/master.png',master],
  ['claims/'+id+'/publish',{approvalHash}],['products/'+id+'/record',product]]);
 files.forEach((data,i)=>map.set('uploads/'+id+'/mockups/'+i+'.jpg',data));
 const privateMap=new Map([['draft/'+SKU,{phase:'inventory_pending',listingId:LISTING,uploadId:id}]]);
 let listingState='draft',supplierCreated=false;
 const operations=[];
 const uploads={
  get:async key=>map.get(key)||null,
  setJSON:async(key,data,opts={})=>{operations.push({op:'save',key});if(opts.onlyIfNew&&map.has(key))return {modified:false};
   map.set(key,data);return {modified:true};}
 };
 const etsyStore={
  get:async key=>privateMap.get(key)||null,
  setJSON:async(key,data,opts={})=>{operations.push({op:'private',key});if(opts.onlyIfNew&&privateMap.has(key))return {modified:false};
   privateMap.set(key,data);return {modified:true};}
 };
 const body=plan.body;
 const listing=()=>({...body,title,shop_id:SHOP,listing_id:LISTING,listing_type:'physical',state:listingState,
  is_personalizable:false,shop_section_id:42,tags:body.tags.split(','),
  images:[1,2,3,4].map(i=>({listing_image_id:i}))});
 const invProducts=plan.inventory.products.map(p=>({...p,offerings:p.offerings.map(o=>({...o,
  is_enabled:true,is_deleted:false,price:{amount:Math.round(o.price*100),divisor:100,currency_code:'GBP'}}))}));
 const client={
  session:async()=>({shop_id:SHOP,shop_name:'SapiverPrints'}),
  api:async(path,opts={})=>{
   operations.push({op:'etsy',path,method:opts.method||'GET'});
   if(path==='/listings/'+LISTING+'?includes=Images')return listing();
   if(path==='/listings/'+LISTING+'/inventory')return {products:invProducts};
   if(path==='/shops/'+SHOP+'/sections')return {results:[{title:'Streak',shop_section_id:42}]};
   if(path==='/shops/'+SHOP+'/shipping-profiles/'+body.shipping_profile_id)
    return {...shipping,shipping_profile_id:body.shipping_profile_id};
   if(path==='/shops/'+SHOP+'/readiness-state-definitions/'+body.readiness_state_id)
    return {...processing,shop_id:SHOP};
   if(path==='/shops/'+SHOP+'/policies/return/'+body.return_policy_id)
    return {...returns,shop_id:SHOP};
   if(path==='/shipping-carriers?origin_country_iso=GB')return carriers;
   if(path==='/shops/'+SHOP+'/production-partners')
    return {results:[{partner_name:'PrintShrimp',location:'Romford UK',production_partner_id:12345}]};
   if(path==='/shops/'+SHOP+'/listings/'+LISTING&&opts.method==='PATCH'){
    listingState='active';return {state:'active'};
   }
   throw Error('Unexpected Etsy endpoint '+path);
  }
 };
 const request=async(url,opts={})=>{
  const target=String(url);
  if(target.includes('/api-get-product?')){
   operations.push({op:'supplier_lookup'});
   if(!supplierCreated)return {status:404,ok:false};
   return {status:200,ok:true,json:async()=>({success:true,product:{sku:SKU,product_id:'confirmed-product',
    variants:['A5','A4','A3'].map(size=>({size,image_url:'https://api.printshrimp.com/original-artwork.png'}))}})};
  }
  if(target.includes('/api-create-product')&&opts.method==='POST'){
   operations.push({op:'supplier_create'});supplierCreated=true;return {status:200,ok:true};
  }
  throw Error('Unexpected supplier route');
 };
 const env=k=>({
  POSTER_PUBLICATION_ENABLED:'true',POSTER_INTERNATIONAL_SHIPPING_ENABLED:'false',
  CANVA_SITE_ORIGIN:'https://'+'sapiver-poster-gen-auth.netlify.app',SHRIMP_APIKEY:'fake-test-api-key'
 })[k];
 return {uploads,etsyStore,client,request,env,operations,map,privateMap,id,listing:listing(),asset};
}
test('exact one-to-one title entities accepted, genuine title changes blocked',()=>{
 assert.equal(exactInsomniaTitleEncoding(EXPECTED,ENCODED),true);
 assert.equal(exactInsomniaTitleEncoding(EXPECTED,EXPECTED),false);
 assert.equal(exactInsomniaTitleEncoding(EXPECTED,"Funny Sloth Digital Download"),false);
});
test('substantive Etsy title drift blocks in-place repair before any merchant write',async()=>{
 const f=fixture({title:"Funny Sloth Digital Download"});
 await assert.rejects(recoverInsomniaDraft(f),/substantive difference/);
 assert.equal(f.operations.filter(x=>x.method&&x.method!=='GET').length,0);
 assert.equal(f.operations.filter(x=>x.op==='supplier_create').length,0);
 assert.equal(f.operations.filter(x=>x.op==='save'||x.op==='private').length,0);
});
test('recover original existing draft and supplier once without POSTing a new Etsy listing',async()=>{
 const f=fixture();const result=await recoverInsomniaDraft(f);
 assert.equal(result.phase,'published');assert.equal(result.listingId,LISTING);
 assert.equal(result.existingListing,true);assert.equal(result.ordersEnabled,false);
 assert.equal(f.map.get('uploads/'+f.id+'/state').phase,'published');
 assert.equal(f.map.get('supplier/'+SKU).phase,'verified');
 assert.equal(f.operations.filter(x=>x.op==='supplier_create').length,1);
 assert.equal(f.operations.filter(x=>x.method==='PATCH').length,1);
 assert.equal(f.operations.filter(x=>x.method==='POST'&&x.op==='etsy').length,0);
 await assert.rejects(recoverInsomniaDraft(f),/no longer at the expected retained-draft stage/);
 assert.equal(f.operations.filter(x=>x.op==='supplier_create').length,1);
});
