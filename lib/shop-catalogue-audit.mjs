import {discoverPhysicalSetup} from './physical-shop-setup.mjs';
import {listProducts,recordKey,validId as validProductId} from './product-records.mjs';
import {externalRecordKey,BULK_ETS_IDS} from './existing-supplier-links.mjs';

// Seller-authorised, read-only audit. Never equate an Etsy postage profile with a supplier order.
const STATES=Object.freeze(['active','inactive','draft','sold_out','expired']);
const validId=x=>Number.isSafeInteger(x)&&x>0;
function entries(result,label){
 if(!Array.isArray(result?.results)||result.results.length>100||!Number.isSafeInteger(result.count)&&result.count!==undefined)throw Error(label+' response incomplete');
 return result.results;
}
export async function auditShopCatalogue({client,uploads,clock=()=>Date.now()}){
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||!validId(seller.shop_id))throw Error('Wrong Etsy seller');
 const setup=await discoverPhysicalSetup({client,clock});
 if(setup.shopId!==seller.shop_id||setup.phase!=='ready'||!validId(setup.selection?.shippingProfileId))throw Error('PrintShrimp delivery profile is not uniquely verified');
 const sections=entries(await client.api('/shops/'+seller.shop_id+'/sections'),'Etsy sections');
 const sectionTitles=new Map(sections.filter(s=>validId(s.shop_section_id)).map(s=>[s.shop_section_id,s.title]));
 const seen=new Set(),listings=[];
 for(const state of STATES){
  for(let offset=0;offset<=900;offset+=100){
   const page=await client.api('/shops/'+seller.shop_id+'/listings?'+new URLSearchParams({state,limit:'100',offset:String(offset)}));
   const rows=entries(page,'Etsy '+state+' listings');
   if(page.count>1000)throw Error('Etsy listing audit exceeds safe limit');
   for(const row of rows){
    if(!validId(row.listing_id)||row.shop_id!==seller.shop_id||row.state!==state||seen.has(row.listing_id))throw Error('Etsy listing audit inconsistent');
    seen.add(row.listing_id);
    const physical=row.listing_type==='physical'||row.type==='physical';
    const digital=row.listing_type==='download'||row.type==='download';
    if(!physical&&!digital)continue;
    // Only physical prints need a shipping-profile readback. Digital downloads never use PrintShrimp.
    let current=row;
    if(physical&&!validId(row.shipping_profile_id))current=await client.api('/listings/'+row.listing_id);
    if(current.shop_id!==seller.shop_id||current.listing_id!==row.listing_id||current.state!==state)throw Error('Etsy listing changed while auditing');
    // Listing photos are read-only and optional. Never fail the entire audit if Etsy's image endpoint is unavailable.
    let image=null;
    try{
     const photo=await client.api('/listings/'+row.listing_id+'?includes=Images');
     const imgs=Array.isArray(photo.images)?photo.images:Array.isArray(photo.Images)?photo.Images:[];
     const candidate=imgs[0]?.url_300x300||imgs[0]?.url_170x135||imgs[0]?.url_fullxfull;
     if(typeof candidate==='string'&&/^https:\/\/i\.etsystatic\.com\/[A-Za-z0-9_./%-]+(?:\?[A-Za-z0-9_=&%-]+)?$/.test(candidate))image=candidate;
    }catch{/* Keep the poster card visible with a placeholder. */}
    listings.push({id:row.listing_id,type:physical?'physical':'digital',title:String(current.title||'').slice(0,140),state,sectionId:current.shop_section_id||null,section:sectionTitles.get(current.shop_section_id)||'Uncategorised',shippingProfileId:validId(current.shipping_profile_id)?current.shipping_profile_id:null,sku:Array.isArray(current.skus)?current.skus.slice(0,20).map(v=>String(v).slice(0,50)):[],url:typeof current.url==='string'&&current.url.startsWith('https://www.etsy.com/')?current.url:null,...image?{image}:{}});
   }
   if(rows.length===0||offset+rows.length>=page.count)break;
   if(offset===900)throw Error('Etsy listing audit pagination incomplete');
  }
 }
 const records=await listProducts(uploads),byId=new Map();
 for(const record of records){
  if(!validId(record.etsyListingId)||!['physical','digital','physical_bundle'].includes(record.type))continue;
  if(byId.has(record.etsyListingId))throw Error('Multiple local product records refer to one Etsy listing');
  byId.set(record.etsyListingId,record);
 }
 const desired=setup.selection.shippingProfileId;
 const physical=await Promise.all(listings.filter(item=>item.type==='physical').map(async item=>{
  const p=byId.get(item.id);
  const external=BULK_ETS_IDS.includes(item.id)?await uploads.get(externalRecordKey(item.id),{type:'json',consistency:'strong'}):null;
  const verifiedLink=external?.shopId===seller.shop_id&&external?.etsyListingId===item.id&&external?.source==='printshrimp_bulk'&&external?.sku===item.sku?.[0]&&item.sku?.length===1&&typeof external.supplierProductId==='string'&&external.supplierProductId.length>0;
  return {...item,deliveryMatches:item.shippingProfileId===desired,supplierMapping:p?.supplierProductId?'recorded':verifiedLink?'existing_bulk_linked':'not_verified',...(verifiedLink?{supplierProductId:external.supplierProductId}:{}),productId:p?.productId||null};
 }));
 physical.sort((a,b)=>a.id-b.id);
 const digital=listings.filter(item=>item.type==='digital').map(item=>({...item,productId:byId.get(item.id)?.productId||null}));
 const active=physical.filter(x=>x.state==='active');
 const summary={physicalTotal:physical.length,activePhysical:active.length,activeCorrectDelivery:active.filter(x=>x.deliveryMatches).length,activeOtherDelivery:active.filter(x=>!x.deliveryMatches).length,unverifiedSupplier:active.filter(x=>x.supplierMapping==='not_verified').length,digitalTotal:digital.length,activeDigital:digital.filter(x=>x.state==='active').length,totalListings:physical.length+digital.length};
 return {version:1,shopId:seller.shop_id,checkedAt:clock(),intendedProfile:{id:desired,title:'PrintShrimp — Posters'},sections:sections.map(s=>({id:s.shop_section_id,title:s.title})),summary,listings:[...physical,...digital].sort((a,b)=>a.id-b.id)};
}

// Update local display state from seller readback, never the uploader's approved phase or supplier identity.
export async function reconcileCatalogueProductStates({uploads,audit}){
 if(audit?.version!==1||!validId(audit.shopId)||!Number.isFinite(audit.checkedAt)||!Array.isArray(audit.listings))throw Error('Verified Etsy audit required');
 const listingById=new Map(audit.listings.map(item=>[item.id,item]));
 let updated=0;
 for(const product of await listProducts(uploads)){
  if(!validProductId(product.productId)||!validId(product.etsyListingId))continue;
  const live=listingById.get(product.etsyListingId);
  if(!live)continue; // Never declare a product absent from a partial/filtered Etsy response.
  if(live.type!==(product.type==='digital'?'digital':'physical'))throw Error('Existing product and Etsy listing types disagree');
  const key=recordKey(product.productId),latest=await uploads.get(key,{type:'json',consistency:'strong'});
  if(!latest||latest.etsyListingId!==product.etsyListingId||latest.type!==product.type)throw Error('Product record changed during Etsy sync');
  if(latest.etsyState===live.state&&latest.etsySeenAt===audit.checkedAt)continue;
  await uploads.setJSON(key,{...latest,etsyState:live.state,etsySeenAt:audit.checkedAt});
  updated++;
 }
 return {updated};
}
