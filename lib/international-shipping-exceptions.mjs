// Read-only Etsy diagnosis of active physical listings excluded from a completed
// international delivery migration. Uses each listing's persistent migration
// receipt so that the 47 successfully changed listings are NOT misidentified
// as pre-existing international listings.
const positive=n=>Number.isSafeInteger(n)&&n>0;
const fail=message=>{throw Error(message)};

export async function auditInternationalDeliveryExceptions({client,store,clock=()=>Date.now()}) {
  const seller=await client.session();
  if(seller.shop_name!=='SapiverPrints'||!positive(seller.shop_id))
    fail('Wrong Etsy shop for international delivery audit');
  const root='/shops/'+seller.shop_id;
  const profileResponse=await client.api(root+'/shipping-profiles?limit=100');
  if(!Array.isArray(profileResponse?.results)||profileResponse.results.length>100)
    fail('Cannot identify Etsy delivery profiles');
  const profiles=new Map();
  for(const profile of profileResponse.results){
    if(positive(profile.shipping_profile_id)&&!profile.is_deleted)
      profiles.set(profile.shipping_profile_id,profile.title||'Untitled delivery profile');
  }
  const active=[];
  for(let offset=0;offset<10000;offset+=100){
    const page=await client.api(root+'/listings?'+new URLSearchParams({state:'active',limit:'100',offset:String(offset)}));
    if(!Array.isArray(page?.results)||!Number.isSafeInteger(page.count)||page.count>10000)
      fail('Etsy physical listing audit incomplete');
    for(const entry of page.results){
      if(!positive(entry.listing_id)||entry.shop_id!==seller.shop_id)
        fail('Unexpected Etsy listing owner or identity');
      if(entry.listing_type!=='physical'&&entry.type!=='physical')continue;
      // Etsy's list endpoint can omit profile/title fields. Use the exact
      // listing GET rather than inferring a missing delivery profile.
      const full=entry.shipping_profile_id==null||!entry.title?
        await client.api('/listings/'+entry.listing_id):entry;
      if(full.listing_id!==entry.listing_id||full.shop_id!==seller.shop_id||
         (full.listing_type!=='physical'&&full.type!=='physical')||
         full.state!=='active')
        fail('Etsy listing changed during read-only audit');
      active.push({listingId:full.listing_id,title:String(full.title||'Untitled listing').slice(0,140),
        profileId:full.shipping_profile_id??null});
    }
    if(offset+page.results.length>=page.count)break;
    if(page.results.length!==100)fail('Etsy physical listing pagination interrupted');
  }
  if(new Set(active.map(x=>x.listingId)).size!==active.length)
    fail('Duplicate Etsy listings in audit');
  const reviewed=[];
  // Read exact migration receipts in bounded batches, never supplier records
  // or other Blob keys. No Etsy PUT/PATCH is performed.
  for(let n=0;n<active.length;n+=8){
    const batch=active.slice(n,n+8);
    const data=await Promise.all(batch.map(async item=>{
      const receipt=await store.get('international-delivery-migration/'+item.listingId,
        {type:'json',consistency:'strong'});
      const verified=receipt?.phase==='verified'&&
        receipt.listingId===item.listingId&&receipt.targetId===item.profileId;
      return {...item,verified,receiptPhase:receipt?.phase||'none'};
    }));
    reviewed.push(...data);
  }
  const exceptions=reviewed.filter(x=>!x.verified).map(x=>({
    listingId:x.listingId,title:x.title,profileId:x.profileId,
    profileName:x.profileId==null?'No delivery profile assigned':
      profiles.get(x.profileId)||'Unlisted or deleted delivery profile',
    migrationReceipt:x.receiptPhase
  })).sort((a,b)=>a.listingId-b.listingId);
  return {shopId:seller.shop_id,checkedAt:clock(),activePhysical:reviewed.length,
    verifiedMigrated:reviewed.filter(x=>x.verified).length,
    exceptionCount:exceptions.length,exceptions};
}
