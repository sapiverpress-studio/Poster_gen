// Read back and, if needed, move only the former plain cover behind its already
// uploaded framed cover. Never upload another image or change seller inventory.
const sets=[
 {id:4600180569,sku:'SP-TRIO-D1B581C8843C136EF3744B3D',name:'Forest Friends',original:8717066198,framed:8717651560},
 {id:4600182933,sku:'SP-TRIO-7AD9AD4192AB53D36FCE3CC6',name:'Hidden Paths',original:8717084020,framed:null}
];
export async function repairFramedBundleRank({client,listingId}){
 const s=sets.find(x=>x.id===listingId);
 if(!s)throw Error('Unapproved bundle identity');
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints')throw Error('Wrong seller');
 const listing=await client.api('/listings/'+s.id);
 const inv=await client.api('/listings/'+s.id+'/inventory');
 if(listing.shop_id!==seller.shop_id||listing.state!=='active'||(inv.products||[]).filter(x=>!x.is_deleted).length!==1||
  (inv.products||[]).filter(x=>!x.is_deleted)[0].sku!==s.sku)throw Error('Bundle identity/inventory changed');
 const out=await client.api('/listings/'+s.id+'/images'),gallery=out?.results||[];
 if(gallery.length!==5||!gallery.some(x=>x.listing_image_id===s.original))throw Error('Existing bundle gallery incomplete');
 const framed=gallery.find(x=>x.listing_image_id===s.framed);
 if(!framed||framed.alt_text!=='Sapiver Prints '+s.name+' three unframed A4 posters shown in oak frames for display only. Frames are not included.')
  throw Error('Approved framed bundle cover absent');
 const originals=gallery.filter(x=>x.listing_image_id===s.original);
 if(originals.length!==1||gallery.filter(x=>x.listing_image_id===s.framed).length!==1)
  throw Error('Duplicate gallery entries');
 if(framed.rank===1&&originals[0].rank!==1){
  console.log('BUNDLE_FRAMED_RANK_ALREADY '+JSON.stringify({id:s.id,framed:s.framed,plain:s.original,plainRank:originals[0].rank}));return;
 }
 if(framed.rank!==1||originals[0].rank!==1)throw Error('Gallery rank state changed; no write');
 const form=new FormData();
 form.set('listing_image_id',String(s.original));form.set('rank','5');
 await client.api('/shops/'+seller.shop_id+'/listings/'+s.id+'/images',{method:'POST',body:form});
 let latest;
 for(let i=0;i<12;i++){
  const res=await client.api('/listings/'+s.id+'/images');
  latest=res?.results;
  if(latest?.length===5&&latest.find(x=>x.listing_image_id===s.framed)?.rank===1&&
   latest.find(x=>x.listing_image_id===s.original)?.rank!==1)break;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 console.log('BUNDLE_FRAMED_RANK_RESULT '+JSON.stringify({listingId:s.id,framedRank:latest?.find(x=>x.listing_image_id===s.framed)?.rank,
  plainRank:latest?.find(x=>x.listing_image_id===s.original)?.rank,
  galleryRetained:latest?.length===5,skuUnchanged:true}));
}
