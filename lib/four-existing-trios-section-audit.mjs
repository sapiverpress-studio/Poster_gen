// Exact read-only audit for four EXISTING active Etsy three-print sets.
// Does not move, create, deactivate or update any listing or supplier product.
import {normalizeSize} from './poster-template.mjs';
export const SHOP=50893070;
export const TRIO_SECTION='Trio Collection';
export const FOUR_TRIOS=Object.freeze([
 {id:4600180569,titlePrefix:'Woodland Verse Prints - Fox Robin Hedgehog Set of 3'},
 {id:4600182933,titlePrefix:'Woodland Verse Prints - Badger Red Squirrel'},
 {id:4609483175,titlePrefix:'Streak Set 1'},
 {id:4609504500,titlePrefix:'Streak Set 2'}
]);
const err=x=>{throw Error(x)};
function arrayEq(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function distinctSizes(inventory){
 const current=(inventory?.products||[]).filter(p=>!p.is_deleted);
 if(current.length===0)err('Trio inventory missing');
 const sizes=new Set(),other=[];
 for(const p of current)for(const v of p.property_values||[]){
  for(const value of v.values||[]){
   const s=normalizeSize(String(value));
   if(s)sizes.add(s);
   else other.push(String(v.property_name||''));
  }
 }
 if(sizes.has('A3'))return {kind:'contains_A3',sizes:[...sizes].sort(),variants:current.length};
 if(sizes.size)return {kind:'explicit_sizes',sizes:[...sizes].sort(),variants:current.length};
 return {kind:'no_size_variation',sizes:[],variants:current.length};
}
function photoCount(l){
 const images=Array.isArray(l.images)?l.images:Array.isArray(l.Images)?l.Images:[];
 return images.length;
}
export async function auditFourTrioSections({client}){
 const seller=await client.session();
 if(seller?.shop_id!==SHOP||seller?.shop_name!=='SapiverPrints')
  err('Wrong Etsy shop; no trio audit');
 const sections=await client.api('/shops/'+SHOP+'/sections');
 const match=sections?.results?.filter(s=>s.title===TRIO_SECTION);
 if(match?.length!==1||!Number.isSafeInteger(match[0].shop_section_id))
  err('Trio Collection must be an existing unique Etsy section');
 const target=match[0].shop_section_id,rows=[];
 for(const spec of FOUR_TRIOS){
  const l=await client.api('/listings/'+spec.id+'?includes=Images');
  if(l?.listing_id!==spec.id||l.shop_id!==SHOP||l.state!=='active'||
     l.listing_type!=='physical'||!String(l.title||'').startsWith(spec.titlePrefix))
    err('One of the four original trio listings changed identity');
  const inv=await client.api('/listings/'+spec.id+'/inventory');
  const sizes=distinctSizes(inv);
  const inventorySkus=(inv.products||[]).filter(p=>!p.is_deleted).map(p=>p.sku);
  if(inventorySkus.some(s=>typeof s!=='string'||!s.length))err('Original trio inventory has missing SKU');
  rows.push({
   id:spec.id,titleMatch:true,active:true,listingType:'physical',
   fromSectionId:l.shop_section_id??null,toSectionId:target,
   alreadyCategorised:l.shop_section_id===target,
   noChangeToEtsyTaxonomy:true,taxonomyIdPresent:Number.isSafeInteger(l.taxonomy_id),
   shippingProfilePresent:Number.isSafeInteger(l.shipping_profile_id),
   variants:sizes.variants,inventorySizes:sizes.sizes,sizeMode:sizes.kind,
   distinctSkus:[...new Set(inventorySkus)].length,images:photoCount(l),
   hasUnverifiedSize:sizes.kind==='contains_A3'
  });
 }
 return {audit:'four_existing_trios_shop_section_read_only',shopId:SHOP,
  targetSectionTitle:TRIO_SECTION,targetSectionId:target,listings:rows,
  toMove:rows.filter(r=>!r.alreadyCategorised).length,
  sizeDecision:'No size variants will be removed without a separate exact inventory review',
  noSellerMutation:true};
}
