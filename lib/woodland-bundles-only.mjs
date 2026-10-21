// One-off Woodland setup: match SIX existing physical Etsy+PrintShrimp products
// to six privately prepared full-resolution masters, then reserve ONLY TWO
// distinct bundle draft reviews. No new component listings or products.
import {assetKey,hashBytes} from './uploaded-poster.mjs';
import {newId,recordRevision} from './product-records.mjs';
import {monthlyUploadStatus,reserveMonthlyUpload} from './monthly-upload-limit.mjs';
import {makeEightListingPlan,parseTrioDetails} from '../public/collection-trios.mjs';
import {deriveTrioSku} from './collection-bundle-sku.mjs';
import {SHRIMP_API} from './printshrimp-api.mjs';
const fail=reason=>{throw Error(reason);};
const ID=/^[A-Za-z0-9_-]{32}$/,SKU=/^[A-Za-z0-9_-]{1,100}$/;
export const WOODLAND_ONLY=['fox','robin','hedgehog','badger','red-squirrel','roe-deer'];
const animalName={fox:/\bfox\b/i,robin:/\brobin\b/i,hedgehog:/\bhedgehog\b/i,badger:/\bbadger\b/i,'red-squirrel':/\bred[ -]squirrel\b/i,'roe-deer':/\broe[ -]deer\b/i};
function leaf(v){return String(v||'').split('/').at(-1);}
export function exactWoodlandSix(items){
 return Array.isArray(items)&&items.length===6&&new Set(items.map(x=>leaf(x.folder))).size===6&&
  WOODLAND_ONLY.every(slug=>items.some(x=>leaf(x.folder)===slug));
}
function parseTrio(b,index){
 return parseTrioDetails(['Title: '+b.title,'Listing title: '+b.listingTitle,
  'Section: '+b.sectionTitle,'Size: '+b.size,'Members: '+b.members?.join(', '),
  'Tags: '+b.tags?.join(', '),'','Description:',b.description].join('\n'),{filename:'bundle-'+index+'.md'});
}
export async function woodlandExistingCandidates({client}){
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints')fail('Connect the intended SapiverPrints shop');
 const listings=[];
 for(let offset=0;offset<10000;offset+=100){
  const page=await client.api('/shops/'+seller.shop_id+'/listings?'+new URLSearchParams({state:'active',limit:'100',offset:String(offset)}));
  if(!Number.isSafeInteger(page?.count)||page.count>10000||!Array.isArray(page?.results)||page.results.some(x=>x.shop_id!==seller.shop_id))
   fail('Existing Etsy listings could not be verified');
  listings.push(...page.results.filter(x=>x.state==='active'&&x.listing_type==='physical'&&Number.isSafeInteger(x.listing_id)&&typeof x.title==='string'));
  if(offset+page.results.length>=page.count)break;
  if(page.results.length!==100)fail('Incomplete Etsy catalogue; cannot link products');
 }
 return {shopName:seller.shop_name,
  candidates:WOODLAND_ONLY.map(slug=>({slug,choices:listings.filter(x=>animalName[slug].test(x.title)).map(x=>({listingId:x.listing_id,title:x.title})).slice(0,20)})),
  note:'Choose six existing listings and confirm each matches its original artwork. The match is checked against live Etsy inventory and PrintShrimp; no new singles are created.'};
}
function unframedSKU(inventory){
 const found=[];
 for(const p of inventory?.products||[]){
  if(p.is_deleted||!SKU.test(p.sku||''))continue;
  const props=p.property_values||[];
  const a4=props.some(v=>v.values?.some(w=>String(w).trim().toUpperCase()==='A4'));
  const frame=props.find(v=>/frame|finish|format/i.test(v.property_name||''));
  const plain=!frame||frame.values?.some(v=>/print only|unframed|no frame/i.test(v));
  if(a4&&plain&&p.offerings?.some(x=>x.is_enabled&&!x.is_deleted))found.push(p.sku);
 }
 if(found.length!==1)fail('Exactly one existing unframed A4 supplier SKU is required per poster');
 return found[0];
}
export async function verifyWoodlandExisting({incoming,uploads,client,env,request=fetch}){
 if(!exactWoodlandSix(incoming?.items)||!Array.isArray(incoming?.etsyListingIds)||incoming.etsyListingIds.length!==6||
  incoming.etsyListingIds.some(x=>!Number.isSafeInteger(x)||x<=0)||new Set(incoming.etsyListingIds).size!==6)fail('Six distinct existing Etsy listing IDs required');
 if(!Array.isArray(incoming.trios)||incoming.trios.length!==2||!Array.isArray(incoming.inputs)||incoming.inputs.length!==2)
  fail('Two distinct original trio descriptions and discounts required');
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints')fail('Wrong Etsy seller');
 const key=env('SHRIMP_APIKEY');
 if(!key)fail('PrintShrimp API connection unavailable');
 const sources=await Promise.all(incoming.items.map(async (item,i)=>{
  if(!ID.test(item.id||'')||!/^[a-f0-9]{64}$/.test(item.sha256||''))fail('Invalid saved artwork identity');
  const a=await uploads.get(assetKey(item.id),{type:'json',consistency:'strong'});
  if(a?.phase!=='ready_for_approval'||a.type!=='physical'||!a.masterKey||
   a.image?.sha256!==item.sha256||a.metadata?.etsyTitle!==item.listingTitle||
   a.metadata?.sectionTitle!==item.sectionTitle||JSON.stringify(a.metadata?.printSizes)!==JSON.stringify(item.printSizes))
    fail('Artwork '+leaf(item.folder)+' is not the original prepared, unchanged review');
  const slug=leaf(item.folder);
  if(!animalName[slug])fail('Only original six Woodland verses qualify for bundles-only');
  const listing=await client.api('/listings/'+incoming.etsyListingIds[i]);
  if(listing?.listing_id!==incoming.etsyListingIds[i]||listing.shop_id!==seller.shop_id||
   listing.state!=='active'||listing.listing_type!=='physical'||!animalName[slug].test(listing.title||''))
   fail('Existing '+slug+' Etsy listing is absent, inactive or a different subject');
  const inventory=await client.api('/listings/'+listing.listing_id+'/inventory');
  const sku=unframedSKU(inventory);
  const pRes=await request(SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku}),{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),
   headers:{'x-api-key':key,Accept:'application/json'}});
  if(!pRes.ok)fail('No existing PrintShrimp A4 product for '+slug+'; bundles-only is on HOLD');
  const doc=await pRes.json(),p=doc?.product;
  if(doc?.success!==true||p?.sku!==sku||typeof p.product_id!=='string'||!p.product_id||
   !p.variants?.some(v=>v.size==='A4'&&typeof v.image_url==='string'&&v.image_url.startsWith('https://')))
   fail('Incomplete existing PrintShrimp A4 product for '+slug);
  // The author must confirm the matching artwork visually on the review screen.
  // Never claim pixel-by-pixel comparison of existing supplier imagery without it.
  return {id:item.id,slug,folder:item.folder,src:a,listingId:listing.listing_id,listingTitle:listing.title,
   supplierProductId:p.product_id,sku,sha256:a.image.sha256};
 }));
 if(new Set(sources.map(x=>x.sku.toLowerCase())).size!==6||
   new Set(sources.map(x=>x.supplierProductId)).size!==6)fail('Existing singles reuse duplicate supplier identity; cannot safely create two sets');
 const parsed=incoming.trios.map((b,i)=>parseTrio(b,i+1));
 const planInputs=incoming.inputs.map((value,i)=>{
  const parts=parsed[i].members.map(name=>{
   const row=sources.find(x=>x.slug===name);
   if(!row)fail('Original set has missing component '+name);
   return {sku:row.sku,sha256:row.sha256};
  });
  return {title:value?.title,discount:value?.discount,sku:deriveTrioSku({members:parts,size:parsed[i].size})};
 });
 const validItems=sources.map(x=>({folder:x.folder,listingTitle:x.src.metadata.etsyTitle,
  sectionTitle:x.src.metadata.sectionTitle,printSizes:x.src.metadata.printSizes}));
 const plan=makeEightListingPlan({items:validItems,trios:parsed,inputs:planInputs});
 const imageHashes=sources.map(x=>x.sha256);
 return {sources,parsed,plan,imageHashes,seller};
}
export async function reserveWoodlandBundlesOnly({incoming,uploads,client,env,request=fetch,clock=()=>Date.now(),dispatch}){
 if(incoming?.existingOnly!==true||incoming?.confirmed!==true)fail('Explicit bundles-only matching approval required');
 const checked=await verifyWoodlandExisting({incoming,uploads,client,env,request});
 const {sources,parsed,plan,seller}=checked;
 const signature=hashBytes(JSON.stringify({version:1,mode:'woodland_existing_six_to_two',
  items:sources.map(x=>({slug:x.slug,sha256:x.sha256,sku:x.sku,productId:x.supplierProductId,listing:x.listingId})),bundles:plan.bundleListings}));
 const storeKey='collections/woodland-two/'+signature;
 const saved=await uploads.get(storeKey,{type:'json',consistency:'strong'});
 if(saved)return {phase:saved.phase,ids:saved.ids||[],skus:saved.skus||[],totalListings:2,existingSingles:6,reused:true};
 const quota=await monthlyUploadStatus({uploads,clock});
 if(quota.remaining<2)fail('Two monthly slots needed for two bundle listings; none reserved');
 const claimed=await uploads.setJSON(storeKey,{phase:'reserving',ids:[],skus:plan.bundleListings.map(x=>x.sku),signature,at:clock()},{onlyIfNew:true});
 if(!claimed?.modified)fail('A bundles-only reservation already exists. Inspect saved products');
 const refs=new Map(),ids=[];
 try{
  for(const source of sources){
   const id=newId(),a=source.src;
   const snapshot={...a,phase:'published',stage:'existing_supplier_link_verified',type:'physical',
    source:'existing_etsy_supplier_reuse',storeOnly:true,productId:id,createdAt:clock(),
    listingId:source.listingId,supplierProductId:source.supplierProductId,
    plan:{...a.plan,identity:{...a.plan.identity,sku:source.sku}}};
   if(!snapshot.plan?.body?.shipping_profile_id||!snapshot.plan.body.readiness_state_id||
    !snapshot.plan.body.production_partner_ids)fail('Existing source has no compatible production template');
   const savedRef=await uploads.setJSON(assetKey(id),snapshot,{onlyIfNew:true});
   if(!savedRef?.modified)fail('Concurrent member reference collision');
   refs.set(source.slug,{id,sha256:source.sha256,sku:source.sku,listingId:source.listingId});
  }
  for(const bundle of plan.bundleListings){
   const memberRefs=bundle.memberFolders.map(x=>refs.get(x));
   if(memberRefs.some(x=>!x))fail('Incomplete existing member references');
   const id=newId(),reservation=await reserveMonthlyUpload({uploads,productId:id,clock});
   if(!reservation.accepted)fail('Two bundle listing slots unavailable');
   const a={type:'physical_bundle',phase:'preparing',stage:'waiting_for_review',productId:id,
    createdAt:clock(),publicationSlotAt:clock(),filename:'bundle-'+bundle.number+'.md',bytes:0,chunks:0,
    metadata:{name:parsed[bundle.number-1].title,etsyTitle:bundle.listingTitle,sectionTitle:bundle.sectionTitle,kind:'artwork'},
    trio:parsed[bundle.number-1],discount:bundle.discount,sku:bundle.sku,listingTitle:bundle.listingTitle,
    memberIds:memberRefs.map(x=>x.id),memberRefs,bundlesOnly:true};
   await uploads.setJSON(assetKey(id),a,{onlyIfNew:true});await recordRevision(uploads,id);ids.push(id);
   await uploads.setJSON(storeKey,{phase:'reserving',ids,skus:plan.bundleListings.map(x=>x.sku),signature,at:clock()});
  }
  await uploads.setJSON(storeKey,{phase:'ready',ids,skus:plan.bundleListings.map(x=>x.sku),signature,at:clock()});
  for(const id of ids)await dispatch(id,'prepare');
  return {phase:'preparing',ids,skus:plan.bundleListings.map(x=>x.sku),totalListings:2,existingSingles:6,createdSingles:0};
 }catch(error){
  await uploads.setJSON(storeKey,{phase:'needs_investigation',ids,skus:plan.bundleListings.map(x=>x.sku),signature,at:clock(),reason:String(error.message).slice(0,145)});
  throw Error('Bundles-only preparation requires investigation; '+ids.length+' bundle references retained. Do not retry. '+String(error.message).slice(0,80));
 }
}
