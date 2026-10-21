// One-off Woodland setup: match SIX existing physical Etsy+PrintShrimp products
// to six privately prepared full-resolution masters, then reserve ONLY TWO
// distinct bundle draft reviews. No new component listings or products.
import {assetKey,hashBytes} from './uploaded-poster.mjs';
import {newId,recordRevision,listProducts} from './product-records.mjs';
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

/**
 * Restore a previously verified six-artwork review after a Chrome tab was
 * re-created. Only server-side records whose SHA matches the six original
 * full-resolution Canva exports are eligible; no upload, seller write, or
 * supplier write is performed.
 */
export async function recoverWoodlandPrepared({uploads}){
 const original=await uploads.get('woodland-six-20261021/state',{type:'json',consistency:'strong'});
 if(original?.phase!=='ready'||original.pages?.length!==6||
  !WOODLAND_ONLY.every(slug=>original.pages.some(page=>page.slug===slug&&/^[a-f0-9]{64}$/.test(page.sha256||''))))
  return {phase:'not_ready',found:0,missing:[...WOODLAND_ONLY],
   message:'The verified six-page original Canva export is unavailable. Your existing product records remain untouched.'};
 const records=await listProducts(uploads),candidates=[];
 for(const record of records){
  if(!ID.test(record?.pendingRevision||''))continue;
  const asset=await uploads.get(assetKey(record.pendingRevision),{type:'json',consistency:'strong'});
  if(asset?.phase!=='ready_for_approval'||asset.type!=='physical'||
   !asset.masterKey||asset.listingId||!asset.image?.sha256||!asset.metadata||
   !Array.isArray(asset.metadata.printSizes)||!asset.metadata.printSizes.includes('A4'))continue;
  const page=original.pages.find(x=>x.sha256===asset.image.sha256);
  if(!page||!WOODLAND_ONLY.includes(page.slug))continue;
  if(!asset.metadata.etsyTitle||!asset.metadata.sectionTitle||
   !Array.isArray(asset.metadata.tags)&&typeof asset.metadata.tags!=='string')continue;
  candidates.push({slug:page.slug,id:record.pendingRevision,asset});
 }
 const missing=WOODLAND_ONLY.filter(slug=>!candidates.some(x=>x.slug===slug));
 const repeated=WOODLAND_ONLY.filter(slug=>candidates.filter(x=>x.slug===slug).length>1);
 if(missing.length||repeated.length)return {phase:'incomplete',found:6-missing.length,
  missing,repeated,message:repeated.length?'Multiple saved reviews match original '+repeated.join(', ')+'. Inspect saved products; the system will not guess which review to use.':
  'No prepared original poster review found for '+missing.join(', ')+'. Do not create another upload.'};
 const items=WOODLAND_ONLY.map(slug=>{
  const c=candidates.find(x=>x.slug===slug),m=c.asset.metadata;
  const tags=Array.isArray(m.tags)?m.tags:String(m.tags).split(',').map(v=>v.trim());
  return {id:c.id,filename:c.asset.filename||slug+'.png',folder:slug,
   title:m.name||slug,listingTitle:m.etsyTitle,sectionTitle:m.sectionTitle,
   description:m.description||'',tags,printSizes:[...m.printSizes],
   sha256:c.asset.image.sha256,uploadFilename:c.asset.filename||slug+'.png'};
 });
 const {WOODLAND_TRIO_TEXTS}=await import('./woodland-six-bulk.mjs');
 const trios=WOODLAND_TRIO_TEXTS.map((source,index)=>parseTrioDetails(source,{filename:'bundle-'+(index+1)+'.md'}));
 return {phase:'recovered',originalsVerified:true,existingOnly:true,
  state:{version:3,bundlesOnly:true,kind:'artwork',storeOnly:false,
   signature:'woodland-saved-'+hashBytes(JSON.stringify(original.pages.map(p=>[p.slug,p.sha256]))),
   selectedShopSection:'',websiteFolder:'',trioIds:[],
   bundles:trios.map((t,i)=>({...t,input:{sku:'SP-PENDING-TRIO-'+(i+1),title:t.listingTitle,discount:15}})),items}};
}


export async function discoverExistingWoodlandEtsy({client}){
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints')fail('Wrong seller; SapiverPrints required');
 const listings=[];
 for(let offset=0;offset<10000;offset+=100){
  const r=await client.api('/shops/'+seller.shop_id+'/listings/active?'+new URLSearchParams({limit:'100',offset:String(offset)}));
  if(!Array.isArray(r?.results)||r.results.length>100||r.results.some(x=>x.shop_id!==seller.shop_id))
   fail('Authenticated Etsy catalogue is incomplete');
  listings.push(...r.results.filter(x=>x.state==='active'&&
   (x.listing_type==='physical'||x.type==='physical')&&
   Number.isSafeInteger(x.listing_id)&&x.listing_id>0));
  if(r.results.length<100)break;
  if(offset===9900)fail('Existing catalogue larger than verified bound');
 }
 const ids=[];
 for(const slug of WOODLAND_ONLY.slice(0,3)){
  const candidates=listings.filter(x=>animalName[slug].test(String(x.title||'')));
  const specific=candidates.filter(x=>/woodland/i.test(x.title||'')&&/verse|poem|poetry/i.test(x.title||''));
  const matches=specific.length?specific:candidates;
  if(matches.length!==1)fail('Cannot uniquely identify existing '+slug+' listing; found '+matches.length+'. No new products created');
  ids.push(matches[0].listing_id);
 }
 if(new Set(ids).size!==3)fail('Existing trio reuses Etsy listing ID');
 return [...ids,0,0,0];
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

const EXISTING=WOODLAND_ONLY.slice(0,3), NEW=WOODLAND_ONLY.slice(3);
const getJson=async({request,key,sku})=>{
 const r=await request(SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku}),{
  method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),
  headers:{'x-api-key':key,Accept:'application/json'}});
 if(r.status===404)return null;
 if(!r.ok)fail('PrintShrimp supplier lookup unavailable for '+sku+' (HTTP '+r.status+')');
 const data=await r.json(),p=data?.product;
 if(data.success!==true||p?.sku!==sku||!p.product_id||
  !p.variants?.some(v=>v.size==='A4'&&typeof v.image_url==='string'&&v.image_url.startsWith('https://')))
  fail('PrintShrimp A4 product is incomplete for '+sku);
 return {sku,productId:p.product_id};
};
const missingSku=(slug,sha256)=>'SP-WOOD-'+slug.toUpperCase()+'-'+sha256.slice(0,10).toUpperCase();
export async function verifyWoodlandExisting({incoming,uploads,client,env,request=fetch}){
 if(!exactWoodlandSix(incoming?.items)||!Array.isArray(incoming.etsyListingIds)||incoming.etsyListingIds.length!==6||
  incoming.etsyListingIds.slice(0,3).some(x=>!Number.isSafeInteger(x)||x<=0)||
  new Set(incoming.etsyListingIds.slice(0,3)).size!==3||
  incoming.etsyListingIds.slice(3).some(x=>x!==0))
  fail('Only Fox, Robin and Hedgehog require their THREE existing Etsy listing IDs; the other three are supplier-only');
 if(!Array.isArray(incoming.trios)||incoming.trios.length!==2||!Array.isArray(incoming.inputs)||incoming.inputs.length!==2)
  fail('Two original separate trio descriptions required');
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints')fail('Wrong Etsy seller');
 const key=env('SHRIMP_APIKEY');
 if(!key)fail('PrintShrimp connection unavailable');
 const original=await uploads.get('woodland-six-20261021/state',{type:'json',consistency:'strong'});
 if(original?.phase!=='ready'||original.pages?.length!==6)fail('Six verified original Canva masters not found');
 const sources=[];
 for(let i=0;i<6;i++){
  const item=incoming.items[i],slug=leaf(item.folder);
  if(!WOODLAND_ONLY.includes(slug)||!ID.test(item.id)||!/^[a-f0-9]{64}$/.test(item.sha256||''))fail('Unknown Woodland artwork reference');
  const a=await uploads.get(assetKey(item.id),{type:'json',consistency:'strong'});
  if(a?.phase!=='ready_for_approval'||a.type!=='physical'||!a.masterKey||
   a.image?.sha256!==item.sha256||
   a.metadata?.etsyTitle!==item.listingTitle||
   a.metadata?.sectionTitle!==item.sectionTitle||
   JSON.stringify(a.metadata?.printSizes)!==JSON.stringify(item.printSizes)||
   !original.pages.some(p=>p.slug===slug&&p.sha256===item.sha256))
   fail('Original approved '+slug+' artwork cannot be verified against saved Canva PNG hash');
  if(!a.metadata.printSizes?.includes('A4')||!a.plan?.body?.shipping_profile_id||!a.plan?.body?.readiness_state_id||
   !a.plan?.body?.production_partner_ids)fail('Approved A4 printing and production settings unavailable');
  let sku,listingId=null,productId=null;
  if(i<3){
   const listing=await client.api('/listings/'+incoming.etsyListingIds[i]);
   if(listing?.listing_id!==incoming.etsyListingIds[i]||listing.shop_id!==seller.shop_id||
    listing.state!=='active'||listing.listing_type!=='physical'||!animalName[slug].test(listing.title||''))
    fail('Existing '+slug+' Etsy listing is absent or not the correct active print');
   const inventory=await client.api('/listings/'+listing.listing_id+'/inventory');
   sku=unframedSKU(inventory);
   const verified=await getJson({request,key,sku});
   if(!verified)fail('Existing '+slug+' PrintShrimp A4 SKU not found: '+sku+'. No replacements made');
   productId=verified.productId;listingId=listing.listing_id;
  }else{
   sku=missingSku(slug,item.sha256);
   const previous=await uploads.get('supplier-only/'+sku,{type:'json',consistency:'strong'});
   if(previous&&previous.phase!=='verified')fail('Supplier-only '+slug+' has uncertain previous creation. Inspect before retry');
   const found=await getJson({request,key,sku});
   if(found&&(!previous||previous.productId!==found.productId||previous.sha256!==item.sha256))
    fail('Supplier SKU collision for '+slug+'. No unsafe replacement or second creation');
   if(previous&&!found)fail('Previously verified supplier artwork for '+slug+' is unavailable');
   productId=found?.productId||null;
  }
  sources.push({id:item.id,slug,folder:item.folder,src:a,listingId,sku,productId,sha256:item.sha256});
 }
 if(new Set(sources.map(x=>x.sku.toLowerCase())).size!==6||
  new Set(sources.filter(x=>x.productId).map(x=>x.productId)).size!==sources.filter(x=>x.productId).length)
  fail('Existing supplier IDs are duplicated across different artworks');
 const parsed=incoming.trios.map((b,i)=>parseTrio(b,i+1));
 const planInputs=incoming.inputs.map((value,i)=>({
  title:value?.title,discount:value?.discount,
  sku:deriveTrioSku({members:parsed[i].members.map(slug=>{
   const source=sources.find(x=>x.slug===slug);
   if(!source)fail('Unrecognised trio member '+slug);
   return {sku:source.sku,sha256:source.sha256};
  }),size:parsed[i].size})
 }));
 const validItems=sources.map(x=>({folder:x.folder,listingTitle:x.src.metadata.etsyTitle,
  sectionTitle:x.src.metadata.sectionTitle,printSizes:x.src.metadata.printSizes}));
 const plan=makeEightListingPlan({items:validItems,trios:parsed,inputs:planInputs});
 return {sources,parsed,plan,seller,pendingSupplier:sources.filter(x=>!x.productId).map(x=>x.slug)};
}
export async function reserveWoodlandBundlesOnly({incoming,uploads,client,env,request=fetch,clock=()=>Date.now(),dispatch}){
 if(incoming?.existingOnly!==true||incoming?.confirmed!==true)fail('Owner confirmation of two-bundles-only required');
 const {sources,parsed,plan,pendingSupplier}=await verifyWoodlandExisting({incoming,uploads,client,env,request});
 const signature=hashBytes(JSON.stringify({version:2,kind:'two_bundles_with_supplier_only_components',
  sources:sources.map(x=>({slug:x.slug,hash:x.sha256,sku:x.sku,listingId:x.listingId})),
  bundles:plan.bundleListings}));
 const key='collections/woodland-two-v2/'+signature;
 const old=await uploads.get(key,{type:'json',consistency:'strong'});
 if(old)return {phase:old.phase,ids:old.ids||[],skus:old.skus||[],totalListings:2,reused:true,pendingSupplier:old.pendingSupplier||[]};
 const quota=await monthlyUploadStatus({uploads,clock});
 if(quota.remaining<2)fail('Two bundle slots required; six original artwork uploads are already saved');
 const claim=await uploads.setJSON(key,{phase:'reserving',ids:[],skus:plan.bundleListings.map(b=>b.sku),pendingSupplier,at:clock()},{onlyIfNew:true});
 if(!claim?.modified)fail('Collection preparation already reserved. Inspect saved products');
 const refs=new Map(),ids=[];
 try{
  const templateSource=sources[0].src;
  for(const source of sources){
   const id=newId(),a=source.src;
   const snap={...a,phase:source.productId?'published':'supplier_pending',
    stage:source.productId?'existing_supplier_reused':'supplier_only_waiting',
    type:'physical',source:'woodland_two_bundles_only',storeOnly:true,productId:id,createdAt:clock(),
    listingId:source.listingId,supplierProductId:source.productId,
    plan:{...a.plan,body:{...templateSource.plan.body},
     identity:{...a.plan.identity,sku:source.sku}},
    metadata:{...a.metadata,printSizes:['A5','A4']}};
   if(!(await uploads.setJSON(assetKey(id),snap,{onlyIfNew:true})).modified)fail('Member reference changed while reserving');
   refs.set(source.slug,{id,sha256:source.sha256,sku:source.sku,listingId:source.listingId});
  }
  const referenceMemberIds=sources.slice(0,3).map(x=>refs.get(x.slug).id);
  for(const b of plan.bundleListings){
   const memberRefs=b.memberFolders.map(x=>refs.get(x));
   if(memberRefs.some(x=>!x))fail('Missing exact trio artwork reference');
   const id=newId(),slot=await reserveMonthlyUpload({uploads,productId:id,clock});
   if(!slot.accepted)fail('Two new bundle slots unavailable');
   const a={type:'physical_bundle',phase:'preparing',stage:'waiting_for_review',productId:id,
    createdAt:clock(),publicationSlotAt:clock(),filename:'bundle-'+b.number+'.md',bytes:0,chunks:0,
    metadata:{name:parsed[b.number-1].title,etsyTitle:b.listingTitle,sectionTitle:b.sectionTitle,kind:'artwork'},
    trio:parsed[b.number-1],discount:b.discount,sku:b.sku,listingTitle:b.listingTitle,
    memberIds:memberRefs.map(x=>x.id),memberRefs,referenceMemberIds,bundlesOnly:true};
   await uploads.setJSON(assetKey(id),a,{onlyIfNew:true});await recordRevision(uploads,id);
   ids.push(id);await uploads.setJSON(key,{phase:'reserving',ids,skus:plan.bundleListings.map(x=>x.sku),pendingSupplier,at:clock()});
  }
  await uploads.setJSON(key,{phase:'ready',ids,skus:plan.bundleListings.map(x=>x.sku),pendingSupplier,at:clock()});
  // The worker handles supplier-only production registration, with one
  // irreversible SKU reservation per artwork and no individual Etsy writes.
  for(const id of ids)await dispatch(id,'prepare');
  return {phase:'preparing',ids,skus:plan.bundleListings.map(x=>x.sku),totalListings:2,
   existingSingles:3,newSingles:0,pendingSupplier};
 }catch(error){
  await uploads.setJSON(key,{phase:'needs_investigation',ids,skus:plan.bundleListings.map(x=>x.sku),pendingSupplier,at:clock()});
  throw Error('Two-bundle preparation needs investigation. Do not retry this reservation: '+String(error.message).slice(0,100));
 }
}
