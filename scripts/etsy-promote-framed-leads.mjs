// One-off authenticated Etsy primary photo reorder (no image bytes / Netlify build).
// Frozen images from read-only image-rank audit, 21 October 2026.
const approved=[[4599438228,8758815115,8710999828],[4599437738,8758811709,8710996516],[4599399281,8758691801,8710877374],[4598485326,8703070016,8750888457],[4598462411,8750885697,8750885841],[4598484808,8703065632,8703065854],[4598484568,8750881781,8703063904],[4598484374,8703061860,8703062046],[4598461481,8703059978,8703060142],[4597439715,8694476300,8742296467],[4597439239,8742291953,8694472620],[4597438717,8742287665,8694468710],[4597459888,8694463536,8742283357],[4597459356,8694459136,8742279011],[4597458802,8742273917,8694454778],[4596569132,8734704255,8686889964],[4596568620,8734699551,8734699879],[4596550775,8686882452,8686882730],[4596568002,8734693963,8686880028],[4596550093,8686876730,8686877106],[4596567276,8686873982,8734688655],[4596504232,8686346896,8734158991],[4595944801,8681987874,8681988222],[4595921846,8681620876,8681621096],[4595900136,8681456074,8681456416],[4595774989,8680618266,8680618514],[4595765615,8728353593,8680535132],[4595277551,8725031591,8677210424],[4595028274,8675147716,8675148064],[4594997083,8675227502,8723050725]];
export async function promoteOakFramedLead({client,limit=1,start=0}){
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||!Number.isSafeInteger(seller.shop_id))throw Error('Seller mismatch');
 let changed=0,already=0;
 for(const [listingId,originalId,oakId] of approved.slice(start,start+limit)){
  console.log('IMAGE_STAGE listing_'+listingId);
  const listing=await client.api('/listings/'+listingId);
  if(listing.shop_id!==seller.shop_id||listing.state!=='active'||listing.listing_type!=='physical')
   throw Error('Listing changed '+listingId);
  console.log('IMAGE_STAGE current_images_'+listingId);
  const photo=await client.api('/listings/'+listingId+'/images'),arr=photo.results;
  if(!Array.isArray(arr)||arr.length!==4||arr.some(x=>x.full_width!==1448||x.full_height!==1186))
   throw Error('Existing four-scene mockup set changed for '+listingId);
  const first=arr.find(x=>x.rank===1),chosen=arr.find(x=>x.listing_image_id===oakId);
  if(first?.listing_image_id===oakId){already++;console.log('IMAGE_ALREADY_FRAMED '+listingId);continue;}
  if(first?.listing_image_id!==originalId||chosen?.rank!==4||arr.some(x=>![1,2,3,4].includes(x.rank)))
   throw Error('Etsy image positions no longer match audited state '+listingId);
  const form=new FormData();
  form.set('listing_image_id',String(oakId));
  form.set('rank','1');
  console.log('IMAGE_STAGE promoting_'+listingId);
  await client.api('/shops/'+seller.shop_id+'/listings/'+listingId+'/images',{method:'POST',body:form});
  console.log('IMAGE_STAGE checking_'+listingId);
  let confirmed=false;
  // Etsy processes existing-image rank reassignment asynchronously, even after
  // HTTP 201. Never make a second POST merely because the first GET is stale.
  for(let attempt=0;attempt<16;attempt++){
   const after=await client.api('/listings/'+listingId+'/images');
   if(after.results?.length===4&&after.results.find(x=>x.rank===1)?.listing_image_id===oakId&&
    after.results.some(x=>x.listing_image_id===originalId)){confirmed=true;break;}
   await new Promise(resolve=>setTimeout(resolve,1200));
  }
  if(!confirmed)throw Error('Etsy image rank still unconfirmed after waiting '+listingId);
  const check=await client.api('/listings/'+listingId);
  if(check.state!=='active'||check.shop_id!==seller.shop_id)throw Error('Listing state changed after reorder');
  changed++;console.log('IMAGE_PRIMARY_VERIFIED '+JSON.stringify({listingId,framedImageId:oakId,originalArtworkRetained:true}));
 }
 console.log('IMAGE_PROMOTION_COMPLETE '+JSON.stringify({tested:Math.min(limit,approved.length-start),changed,already,totalApproved:approved.length}));
}
