import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverPhysicalSetup,physicalSetupSummary} from '../lib/physical-shop-setup.mjs';
import {shipping,processing,returns,carriers} from './fixtures/poster-template.mjs';
function fixture(overrides={}){
 const calls=[],data={shipping:[{...shipping,shipping_profile_id:11}],processing:[{...processing,readiness_state_id:22}],returns:[{...returns,return_policy_id:33}],partner:[{production_partner_id:55,partner_name:'PrintShrimp',location:'Romford, England'}],...overrides};
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:456}),api:async(path,options)=>{calls.push(path);assert.equal(options,undefined);if(path.includes('/shipping-carriers?'))return carriers;if(path.endsWith('/shipping-profiles/11'))return data.shipping[0];if(path.includes('/shipping-profiles?'))return {results:data.shipping};if(path.includes('/readiness-state-definitions?'))return {results:data.processing};if(path.includes('/policies/return?'))return {results:data.returns};if(path.endsWith('/production-partners'))return {results:data.partner};throw Error('Unexpected read');}};
 return {client,calls};
}
test('first-product setup uses existing shop profiles without any listing or supplier write',async()=>{
 const f=fixture(),result=await discoverPhysicalSetup({client:f.client,clock:()=>123});
 assert.deepEqual(result.selection,{shippingProfileId:11,readinessStateId:22,returnPolicyId:33,productionPartnerId:55});assert.equal(result.phase,'ready');
 assert.ok(f.calls.every(p=>!p.includes('/listings')));assert.doesNotMatch(JSON.stringify(result),/secret|access_token|image_url|origin_postal/);
});
test('missing or duplicate merchant profiles never select an arbitrary value',async()=>{
 for(const [override,kind,phase]of [[{processing:[]},'processing','setup_required'],[{returns:[{...returns,return_policy_id:33},{...returns,return_policy_id:34}]},'returns','ambiguous'],[{partner:[]},'partner','setup_required']]){
  const result=await discoverPhysicalSetup({client:fixture(override).client});assert.equal(result.phase,phase);assert.equal(result.selection,undefined);assert.ok((result.missing||result.ambiguous).includes(kind)||result.ambiguous.includes(kind));
 }
});
test('wrong shop and incompatible shipping stop direct setup; safe log reports only counts',async()=>{
 const f=fixture({shipping:[{...shipping,shipping_profile_id:11,origin_country_iso:'US'}]});assert.equal((await discoverPhysicalSetup({client:f.client})).phase,'setup_required');
 await assert.rejects(discoverPhysicalSetup({client:{session:async()=>({shop_name:'SapiverPress',shop_id:456})}}),/Wrong physical shop/);
 assert.equal(physicalSetupSummary({phase:'ready',counts:{shipping:1,processing:1,returns:1,partner:1},access_token:'secret'}),'Physical shop setup: ready; shipping=1; processing=1; returns=1; partner=1; delivery checks=[]');
});
