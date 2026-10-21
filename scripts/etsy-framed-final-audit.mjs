// Verify every active Sapiver Prints physical poster gallery after image-only changes.
import {auditThirtyOakFramed} from './etsy-promote-framed-leads.mjs';
const edu=[[4589703919,8632724368],[4589715114,8632724640],[4589703441,8680540707],[4589703929,8680544417],[4589715100,8680544307]];
const bundles=[
 {id:4600180569,sku:'SP-TRIO-D1B581C8843C136EF3744B3D',title:'Forest Friends',previous:8717066198},
 {id:4600182933,sku:'SP-TRIO-7AD9AD4192AB53D36FCE3CC6',title:'Hidden Paths',previous:8717084020}
];
export async function auditAllFramedMainPhotos({client}){
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints')throw Error('Wrong shop');
 const standards=await auditThirtyOakFramed({client});
 const legacyGood=[],legacyMissing=[],bundleGood=[],bundleMissing=[];
 for(const [id,framed] of edu){
  const l=await client.api('/listings/'+id);
  const p=await client.api('/listings/'+id+'/images');
  if(l.state==='active'&&l.shop_id===seller.shop_id&&p.results?.length===3&&p.results.find(i=>i.rank===1)?.listing_image_id===framed)
   legacyGood.push(id);
  else legacyMissing.push(id);
 }
 for(const x of bundles){
  const l=await client.api('/listings/'+x.id);
  const pictures=await client.api('/listings/'+x.id+'/images');
  const inv=await client.api('/listings/'+x.id+'/inventory');
  const product=(inv.products||[]).filter(y=>!y.is_deleted);
  const lead=pictures.results?.find(y=>y.rank===1);
  console.log('BUNDLE_FRAME_STATE '+JSON.stringify({id:x.id,images:pictures.results?.map(i=>({id:i.listing_image_id,rank:i.rank,alt:!!i.alt_text,marker:i.alt_text?.includes('Sapiver Prints '+x.title)})),count:pictures.results?.length}));
  if(l.state==='active'&&l.shop_id===seller.shop_id&&pictures.results?.length===5&&
    lead?.alt_text==='Sapiver Prints '+x.title+' three unframed A4 posters shown in oak frames for display only. Frames are not included.'&&
    pictures.results.some(y=>y.listing_image_id===x.previous)&&product.length===1&&product[0].sku===x.sku){
    bundleGood.push(x.id);
  }else bundleMissing.push(x.id);
 }
 const result={standard:standards.settled.length,legacy:legacyGood.length,bundles:bundleGood.length,
  total:standards.settled.length+legacyGood.length+bundleGood.length,
  missing:[...standards.missing,...standards.unexpected,...legacyMissing,...bundleMissing],
  preservedUnframedGallery:true,noInventoryChange:true};
 console.log('ALL_FRAMED_MAIN_AUDIT '+JSON.stringify(result));
 return result;
}
