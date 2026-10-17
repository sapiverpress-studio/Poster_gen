import {discoverPhysicalSetup} from './physical-shop-setup.mjs';
export const LEGACY_ALPHABET={id:4589715100,sku:'SP-EL-005-ANIMAL-ALPHABET',oldProfileId:316847314881};
const valid=n=>Number.isSafeInteger(n)&&n>0;
const hashFields=l=>JSON.stringify([l.shop_id,l.listing_id,l.state,l.listing_type,l.title,l.description,l.tags,l.skus,l.shop_section_id,l.taxonomy_id,l.return_policy_id,l.readiness_state_id,l.price,l.quantity,l.production_partner_ids]);
// This is deliberately a single-owner-approved legacy shipping correction, not a bulk merchant updater.
export async function repairLegacyAlphabetDelivery({client,uploads,jobId,clock=()=>Date.now()}){
 const status=await uploads.get('catalogue/repair-status',{type:'json',consistency:'strong'});
 if(status?.phase!=='pending'||status.jobId!==jobId||status.listingId!==LEGACY_ALPHABET.id||status.expectedOld!==LEGACY_ALPHABET.oldProfileId||status.confirmed!==true)throw Error('Shipping repair approval missing');
 if(!Number.isFinite(status.createdAt)||clock()-status.createdAt>10*60*1000||status.createdAt>clock()+30000)throw Error('Shipping repair approval expired');
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||!valid(seller.shop_id))throw Error('Wrong Etsy seller');
 const setup=await discoverPhysicalSetup({client,clock});
 if(setup.phase!=='ready'||setup.shopId!==seller.shop_id||!valid(setup.selection?.shippingProfileId))throw Error('Canonical PrintShrimp delivery profile unavailable');
 const audit=await uploads.get('catalogue/audit',{type:'json',consistency:'strong'});
 if(audit?.shopId!==seller.shop_id||!Number.isFinite(audit.checkedAt)||clock()-audit.checkedAt>86400000)throw Error('Seller audit is stale');
 const record=audit.listings?.find(x=>x.id===LEGACY_ALPHABET.id);
 if(!record||record.state!=='active'||record.shippingProfileId!==LEGACY_ALPHABET.oldProfileId||!record.sku?.includes(LEGACY_ALPHABET.sku)||audit.intendedProfile.id!==setup.selection.shippingProfileId)throw Error('Shipping approval does not match the saved audit');
 const path='/listings/'+LEGACY_ALPHABET.id;
 const listing=await client.api(path);
 if(listing.shop_id!==seller.shop_id||listing.listing_id!==record.id||listing.listing_type!=='physical'||listing.state!=='active'||listing.shipping_profile_id!==LEGACY_ALPHABET.oldProfileId||!Array.isArray(listing.skus)||!listing.skus.includes(LEGACY_ALPHABET.sku))throw Error('Current Etsy listing differs from approved shipping correction');
 const original=hashFields(listing);
 const beforeInventory=await client.api(path+'/inventory'),serializedInventory=JSON.stringify(beforeInventory);
 // Lock the exact attempted write before the provider request. Never replay after an ambiguous response.
 await uploads.setJSON('catalogue/repair-status',{...status,phase:'sending',startedAt:clock(),targetProfileId:setup.selection.shippingProfileId});
 await client.api('/shops/'+seller.shop_id+'/listings/'+LEGACY_ALPHABET.id,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({shipping_profile_id:String(setup.selection.shippingProfileId)}).toString()});
 const updated=await client.api(path),updatedInventory=await client.api(path+'/inventory');
 if(updated.shipping_profile_id!==setup.selection.shippingProfileId||hashFields(updated)!==original||JSON.stringify(updatedInventory)!==serializedInventory)throw Error('Shipping correction read-back differs; inspect listing before any retry');
 await uploads.setJSON('catalogue/repair-status',{...status,phase:'complete',completedAt:clock(),oldProfileId:LEGACY_ALPHABET.oldProfileId,targetProfileId:setup.selection.shippingProfileId});
 return {listingId:LEGACY_ALPHABET.id,phase:'complete',shippingProfileId:setup.selection.shippingProfileId};
}
