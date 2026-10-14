import {createHash} from 'node:crypto';
import {PRINT_SECTIONS} from './print-sections.mjs';
import {ensureSection,recordKey,validId} from './product-records.mjs';
const ORIGINAL_SECTION=60904173,SHOP_ID=50893070;
const TARGETS=[
 [4595028274,'This seats taken Wall Art Print','Wall Art','SP-THIS-SEATS-TAKEN'],
 [4594997083,'Coast to coast Wall Art Print','Wall Art','SP-COAST-TO-COAST'],
 [4589703919,'Dinosaur Colours Educational Poster for Kids | Nursery Colour Learning Wall Art','Kids'],
 [4589715114,'Counting 1–9 Educational Poster | Kids Number Wall Art | Nursery Learning Print','Early Learning'],
 [4589703441,'Solar System Educational Poster for Kids | Space Nursery Wall Art | Planets Print','Kids'],
 [4589703929,'Shapes Educational Poster for Kids | Nursery Learning Wall Art | Preschool Room Decor','Early Learning'],
 [4589715100,'Animal Alphabet World Map Poster for Kids | ABC Nursery Wall Art | Educational Print','Early Learning']
];
const digest=v=>createHash('sha256').update(v).digest('hex');
const retained=l=>JSON.stringify(Object.fromEntries(['listing_id','shop_id','state','listing_type','title','description','price','quantity','tags','should_auto_renew','shipping_profile_id','readiness_state_id','return_policy_id','taxonomy_id','who_made','when_made','production_partner_ids','is_personalizable'].map(k=>[k,l[k]])));
export async function organiseShopSections({client,uploads,etsyStore}){
 const settings=await uploads.get('template/settings',{type:'json',consistency:'strong'});if(settings?.shopSectionOrganisation?.phase==='verified')return {...settings.shopSectionOrganisation,changed:false};
 const seller=await client.session();if(seller.shop_id!==SHOP_ID||seller.shop_name!=='SapiverPrints')throw Error('Wrong section seller');
 const shop=await client.api('/shops/'+SHOP_ID),sections=await client.api('/shops/'+SHOP_ID+'/sections');
 const original=sections.results?.find(s=>s.shop_section_id===ORIGINAL_SECTION);
 if(!original||!['Printed Artwork','Wall Art'].includes(original.title)||sections.results.some(s=>s.title==='Wall Art'&&s.shop_section_id!==ORIGINAL_SECTION))throw Error('Original section changed');
 const snapshots=[];
 for(const [id,title,sectionTitle,sku] of TARGETS){const base='/listings/'+id,l=await client.api(base);if(l.listing_id!==id||l.shop_id!==SHOP_ID||l.state!=='active'||l.listing_type!=='physical'||l.title!==title)throw Error('Section listing identity changed');snapshots.push({id,title,sectionTitle,sku,listing:l,inventory:await client.api(base+'/inventory'),images:await client.api(base+'/images'),videos:await client.api(base+'/videos')});}
 // Rename the existing section: its ID and existing assignments stay intact.
 if(original.title!=='Wall Art'){
  const key='sections/'+digest('rename:'+ORIGINAL_SECTION+':Wall Art');const claim=await etsyStore.setJSON(key,{phase:'renaming',id:ORIGINAL_SECTION,previousTitle:original.title},{onlyIfNew:true});if(claim?.modified!==true)throw Error('Section rename already claimed');
  await client.api('/shops/'+SHOP_ID+'/sections/'+ORIGINAL_SECTION,{method:'PUT',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({title:'Wall Art'}).toString()});
  const check=await client.api('/shops/'+SHOP_ID+'/sections');if(!check.results?.some(s=>s.shop_section_id===ORIGINAL_SECTION&&s.title==='Wall Art'))throw Error('Section rename read-back mismatch');await etsyStore.setJSON(key,{phase:'verified',id:ORIGINAL_SECTION,title:'Wall Art',previousTitle:original.title});
 }
 const ids={};for(const title of PRINT_SECTIONS)ids[title]=await ensureSection({client,shopId:SHOP_ID,title,store:etsyStore});
 const assignments=[];
 for(const snapshot of snapshots){const {id,sectionTitle,sku}=snapshot,sectionId=ids[sectionTitle],base='/listings/'+id;
  if(snapshot.listing.shop_section_id!==sectionId){
   const current=await client.api(base);if(retained(current)!==retained(snapshot.listing)||current.shop_section_id!==snapshot.listing.shop_section_id)throw Error('Listing changed before section assignment');
   const key='sections/'+digest('assign:'+id+':'+sectionId);const claim=await etsyStore.setJSON(key,{phase:'assigning',listingId:id,sectionId,previousSectionId:current.shop_section_id,retained:retained(current)},{onlyIfNew:true});if(claim?.modified!==true)throw Error('Section assignment already claimed');
   await client.api('/shops/'+SHOP_ID+'/listings/'+id,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({shop_section_id:String(sectionId)}).toString()});
   await etsyStore.setJSON(key,{phase:'assigned',listingId:id,sectionId,previousSectionId:current.shop_section_id});
  }
  const after=await client.api(base);if(after.shop_section_id!==sectionId||retained(after)!==retained(snapshot.listing)||JSON.stringify(await client.api(base+'/inventory'))!==JSON.stringify(snapshot.inventory)||JSON.stringify(await client.api(base+'/images'))!==JSON.stringify(snapshot.images)||JSON.stringify(await client.api(base+'/videos'))!==JSON.stringify(snapshot.videos))throw Error('Section retained-field read-back mismatch');
  // Update dashboard metadata only; retain the exact historical approved plan/hash.
  if(sku){const mapping=await etsyStore.get('draft/'+sku,{type:'json',consistency:'strong'});if(mapping?.listingId!==id||!validId(mapping.uploadId))throw Error('Section product mapping mismatch');const state=await uploads.get('uploads/'+mapping.uploadId+'/state',{type:'json',consistency:'strong'}),key=recordKey(state?.productId||mapping.uploadId),product=await uploads.get(key,{type:'json',consistency:'strong'});if(product?.etsyListingId!==id||product.currentRevision!==mapping.uploadId||product.pendingRevision)throw Error('Section product revision changed');await uploads.setJSON(key,{...product,metadata:{...product.metadata,sectionTitle},sectionAssignment:{sectionId,sectionTitle,previousSectionId:snapshot.listing.shop_section_id,checkedAt:Date.now()},updatedAt:Date.now()});}
  assignments.push({listingId:id,title:snapshot.title,sectionTitle,sectionId});
 }
 const final=await client.api('/shops/'+SHOP_ID+'/sections');if(PRINT_SECTIONS.some(title=>final.results?.filter(s=>s.title===title&&s.shop_section_id===ids[title]).length!==1)||(await client.api('/shops/'+SHOP_ID)).title!==shop.title)throw Error('Final shop sections mismatch');
 return {phase:'verified',changed:true,shopTitleUnchanged:true,sections:PRINT_SECTIONS.map(title=>({title,id:ids[title]})),assignments};
}
