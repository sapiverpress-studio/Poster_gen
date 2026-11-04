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
  const candidates=[];
  for(let offset=0;offset<10000;offset+=100){
    const page=await client.api(shopPath(seller.shop_id)+'/listings?'+new URLSearchParams({state:'active',limit:'100',offset:String(offset)}));
    if(!Array.isArray(page?.results)||!Number.isSafeInteger(page.count)||page.count>10000)
      fail('Etsy listing pagination incomplete');
    for(const listing of page.results){
      if(listing.shop_id!==seller.shop_id||!positive(listing.listing_id))
        fail('Listing belongs to another shop or has no identity');
      if(!isPhysical(listing))continue;
      if(listing.shipping_profile_id!==sourceId&&listing.shipping_profile_id!==targetId)
        fail('Active physical listing has an unexpected shipping profile');
      if(listing.shipping_profile_id===sourceId){
        if(!Array.isArray(listing.skus)||!listing.skus.length||
           listing.skus.some(s=>typeof s!=='string'||!s.trim()))
          fail('Listing has no stable existing PrintShrimp SKU');
        candidates.push({listingId:listing.listing_id,skus:listing.skus.slice().sort()});
      }
    }
    if(offset+page.results.length>=page.count)break;
    if(page.results.length!==100)fail('Etsy listing pagination interrupted');
  }
  candidates.sort((a,b)=>a.listingId-b.listingId);
  if(new Set(candidates.map(x=>x.listingId)).size!==candidates.length)
    fail('Duplicate listing in migration audit');
  const plan={shopId:seller.shop_id,sourceId,targetId,candidates};
  return {...plan,approvalHash:checksum(plan),numberToUpdate:candidates.length};
}

export async function applyInternationalMigration({client,store,plan,approvalHash,approved=false,enabled=false,limit=1,clock=()=>Date.now()}) {
  if(!approved||!enabled)fail('Separate international migration release and owner approval required');
  if(!plan||checksum({shopId:plan.shopId,sourceId:plan.sourceId,targetId:plan.targetId,candidates:plan.candidates})!==approvalHash||!Number.isSafeInteger(limit)||limit<1||limit>100)
    fail('Invalid or altered owner-approved migration plan');
  const actual=await shopAndProfiles(client);
  if(actual.seller.shop_id!==plan.shopId||actual.sourceId!==plan.sourceId||actual.targetId!==plan.targetId)
    fail('Etsy shipping profile or seller changed after owner review');
  if(!Array.isArray(plan.candidates)||plan.candidates.length>10000||
      new Set(plan.candidates.map(x=>x.listingId)).size!==plan.candidates.length)
    fail('Invalid migration listing selection');
  let completed=0;
  for(const entry of plan.candidates.slice(0,limit)){
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
