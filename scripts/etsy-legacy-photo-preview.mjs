// Read-only image inspection for five educational listings; never creates or edits Etsy records.
// Thumbnails originate from Etsy's public images, not private master source files.
export async function previewLegacyPhotos({client}){
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints')throw Error('Wrong seller');
 const ids=[4589703919,4589715114,4589703441,4589703929,4589715100];
 for(const listingId of ids){
  const e=await client.api('/listings/'+listingId);
  if(e.state!=='active'||e.shop_id!==seller.shop_id)throw Error('Legacy poster no longer active');
  const im=await client.api('/listings/'+listingId+'/images');
  if(!Array.isArray(im.results)||im.results.length!==3)throw Error('Legacy picture count changed '+listingId);
  for(const picture of im.results){
   const src=new URL(picture.url_570xN);
   if(src.protocol!=='https:'||!/\.etsystatic\.com$/.test(src.hostname))throw Error('Unexpected Etsy photo host');
   const response=await fetch(src,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Etsy image unavailable '+listingId);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>450000||bytes.length<1500)throw Error('Unexpected Etsy image bytes');
   console.log('LEGACY_VISUAL '+listingId+' '+picture.rank+' '+bytes.toString('base64'));
  }
 }
 console.log('LEGACY_VISUAL_COMPLETE 15 photos retrieved; writes 0');
}
