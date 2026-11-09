// Owner-authorised one-time assignment of FOUR EXISTING active trio listings
// to existing Etsy shop section "Trio Collection". No changes to taxonomy,
// title, artwork, price, shipping, PrintShrimp, size inventory or listing state.
import {createHash} from 'node:crypto';
import {auditFourTrioSections,FOUR_TRIOS,SHOP,TRIO_SECTION} from './four-existing-trios-section-audit.mjs';
const SECTION_ID=61291652;
const claimKey='sections/'+createHash('sha256').update(
 'exact-existing-four-trios:2026-11-09:'+FOUR_TRIOS.map(x=>x.id).join(',')
).digest('hex');
const must=(v,msg)=>{if(!v)throw Error(msg)};
const retainedKeys=[
 'listing_id','shop_id','state','listing_type','title','description',
 'price','quantity','tags','should_auto_renew','shipping_profile_id',
 'readiness_state_id','return_policy_id','taxonomy_id','who_made',
 'when_made','production_partner_ids','is_personalizable','skus'
];
const stableListing=l=>JSON.stringify(Object.fromEntries(retainedKeys.map(k=>[k,l?.[k]??null])));
const photoIds=l=>(Array.isArray(l.images)?l.images:Array.isArray(l.Images)?l.Images:[])
 .map(x=>x.listing_image_id).sort((a,b)=>a-b).join('|');
async function readListing(client,id){
 const listing=await client.api('/listings/'+id+'?includes=Images');
 const inventory=await client.api('/listings/'+id+'/inventory');
 return {listing,inventoryJson:JSON.stringify(inventory),retained:stableListing(listing),photoIds:photoIds(listing)};
}
export async function assignExistingFourTrios({
 client,etsyStore,clock=()=>Date.now()
}){
 const report=await auditFourTrioSections({client});
 must(report.shopId===SHOP&&report.targetSectionTitle===TRIO_SECTION&&
  report.targetSectionId===SECTION_ID&&report.listings.length===4,
  'Trio shop or section verification changed');
 must(report.listings.every(x=>x.active&&x.titleMatch&&x.listingType==='physical'&&
  x.fromSectionId===null&&!x.alreadyCategorised&&
  x.toSectionId===SECTION_ID&&x.images>=4&&x.shippingProfilePresent&&
  x.taxonomyIdPresent&&x.sizeMode!=='contains_A3'),
  'One of the four expected uncategorised active trios changed; do not update');
 must(report.listings[0].variants===1&&report.listings[1].variants===1&&
  report.listings[2].variants===4&&report.listings[3].variants===4&&
  report.listings[2].inventorySizes.join('|')==='A4'&&
  report.listings[3].inventorySizes.join('|')==='A4',
  'Original three-print inventory changed; do not update');
 const snapshots=[];
 for(const spec of FOUR_TRIOS){
  const x=await readListing(client,spec.id);
  must(x.listing.listing_id===spec.id&&x.listing.shop_id===SHOP&&
   x.listing.state==='active'&&x.listing.listing_type==='physical'&&
   x.listing.shop_section_id==null&&x.listing.title.startsWith(spec.titlePrefix)&&
   x.photoIds.split('|').length>=4,
   'Trio identity or images changed before assignment');
  snapshots.push({id:spec.id,...x});
 }
 // One immutable batch claim: never re-run uncertain Etsy PATCH operations.
 const claim=await etsyStore.setJSON(claimKey,{
  phase:'running',ids:FOUR_TRIOS.map(x=>x.id),targetSectionId:SECTION_ID,
  completedIds:[],at:clock(),purpose:'existing_etsy_shop_section_only'
 },{onlyIfNew:true});
 must(claim?.modified===true,'Original four-trio category assignment already claimed; inspect instead');
 const completed=[];
 try{
  for(const snapshot of snapshots){
   const before=await readListing(client,snapshot.id);
   must(before.listing.shop_section_id==null&&before.retained===snapshot.retained&&
    before.inventoryJson===snapshot.inventoryJson&&
    before.photoIds===snapshot.photoIds,
    'Listing changed after initial audit; stop without replacing or retrying');
   const path='/shops/'+SHOP+'/listings/'+snapshot.id;
   await client.api(path,{
    method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({shop_section_id:String(SECTION_ID)}).toString()
   });
   const after=await readListing(client,snapshot.id);
   must(after.listing.shop_section_id===SECTION_ID&&
    after.retained===snapshot.retained&&
    after.inventoryJson===snapshot.inventoryJson&&
    after.photoIds===snapshot.photoIds,
    'Etsy section update or retained listing data was not verified');
   completed.push(snapshot.id);
   await etsyStore.setJSON(claimKey,{phase:'running',ids:FOUR_TRIOS.map(x=>x.id),
    targetSectionId:SECTION_ID,completedIds:completed,at:clock()});
  }
  const sections=await client.api('/shops/'+SHOP+'/sections');
  must(sections.results?.filter(x=>x.title===TRIO_SECTION&&
   x.shop_section_id===SECTION_ID).length===1,'Trio Collection section changed');
  await etsyStore.setJSON(claimKey,{phase:'complete',ids:FOUR_TRIOS.map(x=>x.id),
   targetSectionId:SECTION_ID,completedIds:completed,at:clock()});
  return {phase:'complete',section:TRIO_SECTION,sectionId:SECTION_ID,
   movedIds:completed,originalListingsRetained:true,inventoryUnchanged:true,
   sizesUnchanged:true,newListings:0,orders:0};
 }catch(error){
  await etsyStore.setJSON(claimKey,{phase:'needs_investigation',
   ids:FOUR_TRIOS.map(x=>x.id),completedIds:completed,
   targetSectionId:SECTION_ID,at:clock(),
   notice:'An in-place section assignment is uncertain; inspect exact listing IDs before any retry'});
  throw error;
 }
}
