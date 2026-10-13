import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedSapiverPrintsShop} from '../lib/etsy-shop-response.mjs';

const seller={shop_name:'SapiverPrints',shop_id:456,user_id:123};
test('legacy Etsy getUserShops results array selects exact SapiverPrints, not first shop',()=>{
 const response={count:2,results:[{shop_name:'SapiverPress',shop_id:789,user_id:123},seller]};
 assert.equal(verifiedSapiverPrintsShop(response,'123').shop_id,456);
 assert.equal(verifiedSapiverPrintsShop({shops:[seller]},'123').shop_id,456);
 assert.equal(verifiedSapiverPrintsShop(seller,'123').shop_id,456);
 assert.equal(verifiedSapiverPrintsShop({results:[{shop_name:'SapiverPrints',shop_id:456}]},'123').shop_id,456);
});
test('reject wrong shop, wrong owner, missing or duplicate seller and invalid Etsy shapes',()=>{
 const invalid=[
  {results:[{shop_name:'SapiverPress',shop_id:789,user_id:123}]},
  {results:[{...seller,user_id:999}]},
  {results:[seller,seller]},
  {results:[{...seller,shop_id:'456'}]},
  {results:[]}, {count:1,results:{}}, null,
 ];
 for(const x of invalid)assert.throws(()=>verifiedSapiverPrintsShop(x,'123'),/Wrong Etsy seller/);
 for(const uid of ['',0,'no','000123'])assert.throws(()=>verifiedSapiverPrintsShop({results:[seller]},uid),/Wrong Etsy seller/);
});
