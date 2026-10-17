import test from 'node:test';
import assert from 'node:assert/strict';
import {auditShopCatalogue} from '../lib/shop-catalogue-audit.mjs';
import {cataloguePage} from '../lib/catalogue-page.mjs';
import {shipping,processing,returns,carriers} from './fixtures/poster-template.mjs';

function setup({wrongSeller=false,wrongProfile=false}={}){
 const calls=[],shopId=456;
 const source=[
  {listing_id:101,shop_id:shopId,state:'active',type:'physical',title:'Fox',shipping_profile_id:wrongProfile?55:11,shop_section_id:13,skus:['SP-FOX']},
  {listing_id:102,shop_id:shopId,state:'active',type:'physical',title:'Robin',shipping_profile_id:55,shop_section_id:13,skus:['SP-ROBIN']},
  {listing_id:103,shop_id:shopId,state:'active',type:'download',title:'Digital',shipping_profile_id:null},
  {listing_id:104,shop_id:shopId,state:'inactive',type:'physical',title:'Spring',shipping_profile_id:11,shop_section_id:13}
 ];
 const uploads={async *list({prefix}){assert.equal(prefix,'products/');yield {blobs:[{key:'products/'+'a'.repeat(32)+'/record'}]};},async get(){return {productId:'a'.repeat(32),etsyListingId:101,supplierProductId:'shrimp-123',type:'physical'};}};
 const client={session:async()=>({shop_id:shopId,shop_name:wrongSeller?'NotSapiver':'SapiverPrints'}),api:async path=>{
  calls.push(path);
  if(path.includes('/shipping-carriers?'))return carriers;
  if(path.endsWith('/shipping-profiles/11'))return {...shipping,shipping_profile_id:11};
  if(path.includes('/shipping-profiles?'))return {results:[{...shipping,shipping_profile_id:11}]};
  if(path.includes('/readiness-state-definitions?'))return {results:[{...processing,readiness_state_id:22}]};
  if(path.includes('/policies/return?'))return {results:[{...returns,return_policy_id:33}]};
  if(path.endsWith('/production-partners'))return {results:[{production_partner_id:55,partner_name:'PrintShrimp',location:'Romford, England'}]};
  if(path.endsWith('/sections'))return {count:1,results:[{shop_section_id:13,title:'Nature'}]};
  if(path.includes('/listings?')){const u=new URL('https://local.test'+path),state=u.searchParams.get('state');return {count:source.filter(x=>x.state===state).length,results:source.filter(x=>x.state===state)};}
  throw Error('Unrecognised seller read '+path);
 }};
 return {client,uploads,calls};
}
test('audits every listing state, excludes digital and separates postage from supplier links',async()=>{
 const f=setup(),a=await auditShopCatalogue({...f,clock:()=>1000});
 assert.equal(a.summary.physicalTotal,3);
 assert.deepEqual(a.summary,{physicalTotal:3,activePhysical:2,activeCorrectDelivery:1,activeOtherDelivery:1,unverifiedSupplier:1});
 assert.equal(a.listings.find(l=>l.id===102).supplierMapping,'not_verified');
 assert.equal(a.listings.find(l=>l.id===101).supplierMapping,'recorded');
 assert.ok(f.calls.some(p=>p.includes('state=expired')));
 assert.ok(f.calls.every(p=>!p.includes('PATCH')&&!p.includes('POST')));
 assert.doesNotMatch(JSON.stringify(a),/access_token|refresh_token|api_key/i);
});
test('a wrong seller cannot be audited and delivery mismatch is visible',async()=>{
 await assert.rejects(auditShopCatalogue(setup({wrongSeller:true})),/Wrong Etsy seller/);
 const a=await auditShopCatalogue(setup({wrongProfile:true}));
 assert.equal(a.summary.activeOtherDelivery,2);
 const html=cataloguePage({audit:a,status:{phase:'available'}});
 assert.match(html,/DIFFERENT PROFILE ID — REVIEW/);
 assert.match(html,/Not yet linked in Sapiver uploader/);
 assert.doesNotMatch(cataloguePage({audit:a,status:{phase:'needs_investigation'}}),/Robin/);
});
