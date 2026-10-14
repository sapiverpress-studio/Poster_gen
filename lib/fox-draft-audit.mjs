// Bounded GET-only inspection of the owner's retained failed draft.
export async function auditFoxDraft({client,etsyStore,uploads}){
 const sku='SP-FOX-PRINT-WITH-ORIGINAL-WOODLAND-VERSE',listingId=4595277551;
 const lock=await etsyStore.get('draft/'+sku,{type:'json',consistency:'strong'});
 if(lock?.listingId!==listingId||!/^[A-Za-z0-9_-]{32}$/.test(lock.uploadId||''))throw Error('Fox draft identity unavailable');
 const asset=await uploads.get('uploads/'+lock.uploadId+'/state',{type:'json',consistency:'strong'});
 if(asset?.listingId!==listingId||asset.plan?.identity?.sku!==sku)throw Error('Fox draft identity mismatch');
 const seller=await client.session();
 if(seller.shop_id!==50893070)throw Error('Unexpected shop');
 const listing=await client.api('/listings/'+listingId+'?includes=Images');
 if(listing.shop_id!==seller.shop_id)throw Error('Unexpected listing owner');
 let inventory,inventoryStatus=200;
 try{inventory=await client.api('/listings/'+listingId+'/inventory');}catch(e){inventoryStatus=e.etsyStatus||0;}
 const products=inventory?.products?.filter(p=>!p.is_deleted)||[];
 return {listingId,phase:asset.phase,stage:asset.stage,listingState:listing.state,
  shopSectionId:listing.shop_section_id,imageCount:listing.images?.length??null,
  inventoryStatus,inventoryProducts:products.length,expectedProducts:asset.plan.inventory.products.length,
  skuLength:sku.length,inventorySkuLengths:[...new Set(products.map(p=>(p.sku||'').length))],
  plannedSkuLengths:[...new Set(asset.plan.inventory.products.map(p=>(p.sku||'').length))],
  supplierRecorded:Boolean(asset.supplierProductId),checkedAt:Date.now()};
}
