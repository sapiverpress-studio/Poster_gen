// Jim authorised this one existing listing plus the defaults for future products.
// Never activate, renew now, change inventory, or touch another listing.
export async function enableCoastAutoRenew({client}) {
 const listingId=4594997083,sku='SP-COAST-TO-COAST';
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||!Number.isSafeInteger(seller.shop_id))throw Error('Unexpected seller');
 const path='/listings/'+listingId;
 const before=await client.api(path),inventory=await client.api(path+'/inventory');
 function check(listing){if(listing.listing_id!==listingId||listing.shop_id!==seller.shop_id||listing.state!=='active'||listing.listing_type!=='physical')throw Error('Unexpected listing');}
 check(before);
 if(!inventory.products?.length||inventory.products.some(p=>p.sku!==sku))throw Error('Unexpected SKU');
 let changed=false;
 if(before.should_auto_renew!==true){
  await client.api('/shops/'+seller.shop_id+'/listings/'+listingId,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'should_auto_renew=true'});
  changed=true;
 }
 const after=await client.api(path);check(after);
 if(after.should_auto_renew!==true)throw Error('Renewal setting not retained');
 if(after.title!==before.title||JSON.stringify(after.price)!==JSON.stringify(before.price)||after.quantity!==before.quantity)throw Error('Listing changed during verification');
 const retained=await client.api(path+'/inventory');
 if(JSON.stringify(retained)!==JSON.stringify(inventory))throw Error('Inventory changed during verification');
 return {phase:'verified',listingId,shouldAutoRenew:true,changed};
}
