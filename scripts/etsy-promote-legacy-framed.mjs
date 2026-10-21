// Existing Etsy image rank promotion for five educational posters, no new image files.
const approved=[[4589703919,8680544093,8632724368],
 [4589715114,8632724352,8632724640],
 [4589703441,8680540531,8680540707],
 [4589703929,8680544267,8680544417],
 [4589715100,8632724258,8680544307]];
export async function promoteLegacyFramed({client}){
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||!Number.isSafeInteger(seller.shop_id))throw Error('Unexpected Etsy seller');
 const pending=[],verified=[];
 for(const [id,original,framed] of approved){
  try{
   const listing=await client.api('/listings/'+id);
   if(listing.state!=='active'||listing.shop_id!==seller.shop_id||listing.listing_type!=='physical')
    throw Error('Listing changed');
   const images=await client.api('/listings/'+id+'/images');
   if(images?.results?.length!==3||images.results.some(i=>i.full_width!==2400||i.full_height!==2400))
    throw Error('Legacy gallery has changed');
   if(images.results.find(i=>i.rank===1)?.listing_image_id===framed){verified.push(id);continue;}
   if(images.results.find(i=>i.rank===1)?.listing_image_id!==original||
      images.results.find(i=>i.listing_image_id===framed)?.rank!==2)
    throw Error('Existing image ranks do not match original audit');
   const form=new FormData();form.set('listing_image_id',String(framed));form.set('rank','1');
   await client.api('/shops/'+seller.shop_id+'/listings/'+id+'/images',{method:'POST',body:form});
   for(let wait=0;wait<12;wait++){
    const after=await client.api('/listings/'+id+'/images');
    if(after.results.length===3&&after.results.find(i=>i.rank===1)?.listing_image_id===framed&&
       after.results.some(i=>i.listing_image_id===original)){verified.push(id);break;}
    await new Promise(resolve=>setTimeout(resolve,800));
   }
   if(!verified.includes(id))pending.push(id);
  }catch(error){pending.push(id);console.log('LEGACY_FRAMED_PENDING '+JSON.stringify({id,reason:Error(error).message.slice(0,85)}));}
 }
 const settled=[],missing=[];
 for(const [id,_,framed] of approved){
  const check=await client.api('/listings/'+id+'/images');
  (check.results?.find(i=>i.rank===1)?.listing_image_id===framed?settled:missing).push(id);
 }
 console.log('LEGACY_FRAMED_RESULT '+JSON.stringify({total:5,settled,missing,pending}));
 return {settled,missing};
}
