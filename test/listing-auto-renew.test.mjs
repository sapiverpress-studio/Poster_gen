import test from 'node:test';
import assert from 'node:assert/strict';
import {enableCoastAutoRenew} from '../lib/listing-auto-renew.mjs';
function fixture({renew=false,sku='SP-COAST-TO-COAST',shop=12,retain=true}={}){
 const calls=[],listing={listing_id:4594997083,shop_id:shop,state:'active',listing_type:'physical',title:'Coast',quantity:120,price:{amount:1399,divisor:100,currency_code:'GBP'},should_auto_renew:renew};
 const client={session:async()=>({shop_id:12,shop_name:'SapiverPrints'}),api:async(path,o={})=>{calls.push([path,o]);if(o.method==='PATCH'){assert.equal(path,'/shops/12/listings/4594997083');assert.equal(o.body,'should_auto_renew=true');if(retain)listing.should_auto_renew=true;return {...listing};}if(path.endsWith('/inventory'))return {products:[{sku,offerings:[{price:13.99}]}]};return {...listing};}};
 return {client,calls};
}
test('only renewal configuration is changed and then read back',async()=>{const f=fixture();assert.deepEqual(await enableCoastAutoRenew(f),{phase:'verified',listingId:4594997083,shouldAutoRenew:true,changed:true});assert.equal(f.calls.filter(([,o])=>o.method==='PATCH').length,1);});
test('already enabled is verified without merchant writes',async()=>{const f=fixture({renew:true});assert.equal((await enableCoastAutoRenew(f)).changed,false);assert.equal(f.calls.filter(([,o])=>o.method).length,0);});
test('seller and SKU mismatches prevent writes',async()=>{for(const options of [{shop:99},{sku:'OTHER'}]){const f=fixture(options);await assert.rejects(enableCoastAutoRenew(f));assert.equal(f.calls.filter(([,o])=>o.method).length,0);}});
test('unretained setting cannot report success',async()=>{await assert.rejects(enableCoastAutoRenew(fixture({retain:false})),/not retained/);});
