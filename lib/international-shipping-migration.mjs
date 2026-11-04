// Exact, owner-approved Etsy shipping-profile migration; no supplier writes.
// This module is NOT wired to a public route or scheduled worker. Preview is read-only.
// A future authenticated owner action must provide the exact preview hash, explicit
// approval and a separately enabled migration release switch before calling apply.
import {createHash} from 'node:crypto';
import {verifyInternationalDeliveryProfile,INTERNATIONAL_PROFILE_TITLE} from './international-delivery.mjs';

const positive=x=>Number.isSafeInteger(x)&&x>0;
const fail=message=>{throw Error(message)};
const checksum=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const columns=['listing_id','shop_id','listing_type','state','title','description','tags','skus','taxonomy_id','return_policy_id','readiness_state_id','who_made','when_made','price','quantity','production_partner_ids','is_personalizable'];
const unchanged=listing=>Object.fromEntries(columns.map(k=>[k,listing?.[k]??null]));
const shopPath=id=>'/shops/'+id;
const isPhysical=l=>l.listing_type==='physical'||l.type==='physical';

async function shopAndProfiles(client) {
  const seller=await client.session();
  if(seller.shop_name!=='SapiverPrints'||!positive(seller.shop_id))fail('Wrong Etsy seller');
  const root=shopPath(seller.shop_id);
  const profiles=await client.api(root+'/shipping-profiles?limit=100');
  if(!Array.isArray(profiles?.results)||profiles.results.length>100)fail('Shipping profile list unavailable');
  const named=title=>profiles.results.filter(p=>p.title===title&&!p.is_deleted);
  const old=named('PrintShrimp — Posters'),next=named(INTERNATIONAL_PROFILE_TITLE);
  if(old.length!==1||next.length!==1||!positive(old[0].shipping_profile_id)||
     !positive(next[0].shipping_profile_id)||old[0].shipping_profile_id===next[0].shipping_profile_id)
    fail('Exactly one old and one new shipping profile are required');
  const source=await client.api(root+'/shipping-profiles/'+old[0].shipping_profile_id);
  const target=await client.api(root+'/shipping-profiles/'+next[0].shipping_profile_id);
  // Etsy responses can omit nested destinations. Fetch them by profile ID
  // rather than rejecting a valid profile or trusting a partial response.
  for(const profile of [source,target]){
    if(!Array.isArray(profile.shipping_profile_destinations)){
      const destinations=await client.api(root+'/shipping-profiles/'+profile.shipping_profile_id+'/destinations');
      if(!Array.isArray(destinations?.results)) fail('Shipping destination read-back incomplete');
      profile.shipping_profile_destinations=destinations.results;
    }
  }
  if(source.title!=='PrintShrimp — Posters'||source.origin_country_iso!=='GB'||
     !Array.isArray(source.shipping_profile_destinations)||
     source.shipping_profile_destinations.length!==1||
     source.shipping_profile_destinations[0].destination_country_iso!=='GB')
    fail('Legacy shipping profile has changed');
  const verified=verifyInternationalDeliveryProfile(target);
  return {seller,sourceId:old[0].shipping_profile_id,targetId:verified.profileId};
}

export async function previewInternationalMigration({client}) {
  const {seller,sourceId,targetId}=await shopAndProfiles(client);
  const candidates=[];let excluded=0;
  for(let offset=0;offset<10000;offset+=100){
    const page=await client.api(shopPath(seller.shop_id)+'/listings?'+new URLSearchParams({state:'active',limit:'100',offset:String(offset)}));
    if(!Array.isArray(page?.results)||!Number.isSafeInteger(page.count)||page.count>10000)
      fail('Etsy listing pagination incomplete');
    for(const listing of page.results){
      if(listing.shop_id!==seller.shop_id||!positive(listing.listing_id))
        fail('Listing belongs to another shop or has no identity');
      if(!isPhysical(listing))continue;
      // Do not alter special-purpose, custom-shipping or already migrated listings.
      // Some Etsy list responses omit profile/SKU fields; read the listing
      // before excluding it or binding an owner approval to a SKU.
      const full=(listing.shipping_profile_id==null||!Array.isArray(listing.skus)||
        !listing.skus.length)?await client.api('/listings/'+listing.listing_id):listing;
      if(full.shop_id!==seller.shop_id||full.listing_id!==listing.listing_id||
         !isPhysical(full)||full.state!=='active') fail('Full Etsy listing identity changed');
      if(full.shipping_profile_id!==sourceId){excluded++;continue;}
      if(!Array.isArray(full.skus)||!full.skus.length||
         full.skus.some(s=>typeof s!=='string'||!s.trim()))
        fail('Listing has no stable existing PrintShrimp SKU');
      candidates.push({listingId:full.listing_id,title:String(full.title||listing.title||'Untitled physical poster').slice(0,140),skus:full.skus.slice().sort()});
    }
    if(offset+page.results.length>=page.count)break;
    if(page.results.length!==100)fail('Etsy listing pagination interrupted');
  }
  candidates.sort((a,b)=>a.listingId-b.listingId);
  if(new Set(candidates.map(x=>x.listingId)).size!==candidates.length)
    fail('Duplicate listing in migration audit');
  const plan={shopId:seller.shop_id,sourceId,targetId,candidates};
  return {...plan,approvalHash:checksum(plan),numberToUpdate:candidates.length,excluded};
}

export async function applyInternationalMigration({client,store,plan,approvalHash,approved=false,enabled=false,limit=1,selectedListingId=null,clock=()=>Date.now()}) {
  if(!approved||!enabled)fail('Separate international migration release and owner approval required');
  if(!plan||checksum({shopId:plan.shopId,sourceId:plan.sourceId,targetId:plan.targetId,candidates:plan.candidates})!==approvalHash||!Number.isSafeInteger(limit)||limit<1||limit>100)
    fail('Invalid or altered owner-approved migration plan');
  const actual=await shopAndProfiles(client);
  if(actual.seller.shop_id!==plan.shopId||actual.sourceId!==plan.sourceId||actual.targetId!==plan.targetId)
    fail('Etsy shipping profile or seller changed after owner review');
  if(!Array.isArray(plan.candidates)||plan.candidates.length>10000||
      new Set(plan.candidates.map(x=>x.listingId)).size!==plan.candidates.length)
    fail('Invalid migration listing selection');
  const chosen=selectedListingId==null?plan.candidates.slice(0,limit):
    plan.candidates.filter(entry=>entry.listingId===selectedListingId);
  if(selectedListingId!=null&&(limit!==1||chosen.length!==1))
    fail('Selected first listing is not in the reviewed Etsy preview');
  let completed=0;
  for(const entry of chosen){
    const listingId=entry.listingId;
    if(!positive(listingId)||!Array.isArray(entry.skus)||!entry.skus.length)
      fail('Unapproved listing identity');
    const path='/shops/'+plan.shopId+'/listings/'+listingId;
    const listing=await client.api('/listings/'+listingId+'?includes=Images');
    if(listing.shop_id!==plan.shopId||listing.listing_id!==listingId||
       !isPhysical(listing)||listing.state!=='active'||
       listing.shipping_profile_id!==plan.sourceId||
       JSON.stringify(listing.skus?.slice().sort())!==JSON.stringify(entry.skus))
      fail('Listing changed since approval; no update attempted');
    const before=unchanged(listing);
    const inventory=await client.api('/listings/'+listingId+'/inventory');
    const inventoryHash=checksum(inventory);
    const lock='international-delivery-migration/'+listingId;
    const claim=await store.setJSON(lock,{phase:'reserved',listingId,sourceId:plan.sourceId,targetId:plan.targetId,approvalHash,at:clock()},{onlyIfNew:true});
    if(claim?.modified!==true)fail('Migration already attempted; inspect Etsy before retry');
    try{
      await client.api(path,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({shipping_profile_id:String(plan.targetId)}).toString()});
      const after=await client.api('/listings/'+listingId+'?includes=Images');
      const newInventory=await client.api('/listings/'+listingId+'/inventory');
      if(after.shipping_profile_id!==plan.targetId||
         JSON.stringify(unchanged(after))!==JSON.stringify(before)||
         checksum(newInventory)!==inventoryHash)
        fail('Etsy changed listing metadata or inventory unexpectedly');
      await store.setJSON(lock,{phase:'verified',listingId,sourceId:plan.sourceId,targetId:plan.targetId,at:clock()});
      completed++;
    }catch{
      await store.setJSON(lock,{phase:'needs_investigation',listingId,sourceId:plan.sourceId,targetId:plan.targetId,at:clock()});
      fail('Etsy migration outcome uncertain. Stop and inspect listing; never auto-retry');
    }
  }
  return {verified:completed,remaining:plan.candidates.length-completed,shopId:plan.shopId};
}


/**
 * One owner-approved five-country activation. Checks one existing listing
 * first, then re-audits the entire seller catalogue to prove the reviewed
 * candidates did not change before migrating the rest. Any uncertainty stops.
 */
export async function applyAllInternationalMigration({client,store,plan,approvalHash,
 selectedListingId,approved=false,enabled=false,clock=()=>Date.now(),
 onFirstVerified=async()=>{}}){
 if(!approved||!enabled)fail('Owner-approved international release required');
 if(!positive(selectedListingId)||!Array.isArray(plan?.candidates)||
    !plan.candidates.some(row=>row.listingId===selectedListingId))
  fail('First Etsy listing is not in the approved preview');
 const one=await applyInternationalMigration({client,store,plan,approvalHash,
  approved,enabled,limit:1,selectedListingId,clock});
 if(one.verified!==1)fail('First international delivery update not verified');
 await onFirstVerified({shopId:plan.shopId,listingId:selectedListingId,verifiedAt:clock()});
 const updated=await previewInternationalMigration({client});
 const expected=plan.candidates.filter(row=>row.listingId!==selectedListingId);
 if(updated.shopId!==plan.shopId||updated.sourceId!==plan.sourceId||
    updated.targetId!==plan.targetId||updated.numberToUpdate!==expected.length||
    JSON.stringify(updated.candidates)!==JSON.stringify(expected))
  fail('Other Etsy listings changed since owner approval; remaining updates stopped');
 const remaining=expected.length?await applyInternationalMigration({
  client,store,plan:updated,approvalHash:updated.approvalHash,approved,enabled,
  limit:expected.length,clock}):
  {verified:0,remaining:0,shopId:plan.shopId};
 return {verified:one.verified+remaining.verified,remaining:remaining.remaining,
  shopId:plan.shopId};
}
