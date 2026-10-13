// The Etsy getUserShops response is normally a results array, not one shop
// object. The legacy Sapiver Etsy uploader explicitly unwraps this response.
// Never select the first result: accept exactly one shop matching our seller.
export function verifiedSapiverPrintsShop(payload,userId){
 const shops=Array.isArray(payload?.results)?payload.results:Array.isArray(payload?.shops)?payload.shops:payload?.shop_id?[payload]:null;
 if(!shops||! /^[1-9][0-9]*$/.test(String(userId)))throw Error('Wrong Etsy seller');
 const matching=shops.filter(shop=>shop&&shop.shop_name==='SapiverPrints'&&Number.isSafeInteger(shop.shop_id)&&shop.shop_id>0&&(shop.user_id==null||String(shop.user_id)===String(userId)));
 if(matching.length!==1)throw Error('Wrong Etsy seller');
 return matching[0];
}
