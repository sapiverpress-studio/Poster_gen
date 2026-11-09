// Two separately reviewed three-print Etsy listings from six already-published poster masters.
// Invariant: only owner-approved bundle writes, no print order or artwork re-upload to supplier.
import sharp from 'sharp';
import {hashBytes,assetKey} from './uploaded-poster.mjs';
import {recordRevision,recordKey} from './product-records.mjs';
import {expectedTrioItems,getSupplierBundle,verifySupplierBundle,computeUKBundleQuote,quoteSupplierGB,createOrVerifyTrio} from './three-print-bundle.mjs';
import {verifiedFramedPrices,quoteFramedTrio,framedTrioInventory,framedTrioDescription} from './framed-trio-options.mjs';
import {normalizeFrame,normalizeSize,exactHtmlEntityChanges} from './poster-template.mjs';
import {discoverPhysicalSetup} from './physical-shop-setup.mjs';
import {verifiedTrioSectionId,TRIO_COLLECTION_SECTION_TITLE} from './streak-section-api.mjs';
import {verifyPhysicalDeliveryProfile,readCompleteDeliveryProfile,requiredPhysicalDeliveryMode,verifyRequiredPhysicalProfile} from './international-delivery.mjs';
const BAD=reason=>{throw Error(reason);},ID=/^[A-Za-z0-9_-]{32}$/;
const exactNumber=n=>Number.isFinite(n)&&n>0;
const quoteRead=p=>p?.price?.currency_code==='GBP'&&exactNumber(p.price.amount)&&exactNumber(p.price.divisor)?p.price.amount/p.price.divisor:Number.isFinite(p?.price)&&p.price>0?p.price:null;
function unframedUnitPrice(inventory,size,sku){
 const hits=[];
 for(const p of inventory?.products||[]){
  if(p.is_deleted||p.sku!==sku)continue;
  const properties=p.property_values||[];
  const sizeMatched=properties.some(prop=>prop.values?.some(v=>String(v).trim().toUpperCase()===size));
  const frame=properties.find(prop=>/frame|finish|format/i.test(prop.property_name||''));
  const unframed=!frame||frame.values?.some(v=>/print only|unframed|no frame/i.test(v));
  if(!sizeMatched||!unframed)continue;
  const offerings=(p.offerings||[]).filter(x=>x.is_enabled===true&&!x.is_deleted);
  if(offerings.length!==1)BAD('Member listing contains ambiguous unframed pricing');
  const price=quoteRead(offerings[0]);
  if(!price)BAD('No verified GBP price for unframed '+size+' poster');
  hits.push(price);
 }
 if(hits.length!==1)BAD('Cannot identify one unframed '+size+' Etsy offering for '+sku);
 return hits[0];
}
async function ownerMembers(asset,{uploads,client,requireShop=true}){
 if(!Array.isArray(asset.memberIds)||asset.memberIds.length!==3||new Set(asset.memberIds).size!==3||
  asset.memberIds.some(id=>!ID.test(id)))BAD('Exactly three independent uploaded poster references required');
 const out=[],seller=await client.session();
 if(requireShop&&seller.shop_name!=='SapiverPrints')BAD('Wrong Etsy shop');
 for(let n=0;n<3;n++){
  const id=asset.memberIds[n],member=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
  if(member?.phase!=='published'||(!asset.bundlesOnly&&!member?.listingId)||!member.supplierProductId||
   !member.plan?.identity?.sku||!member.image?.sha256||!member.masterKey)BAD('All three poster products must be published and supplier-verified first');
  const ref=asset.memberRefs?.[n];
  if(ref?.id!==id||ref.sha256!==member.image.sha256||ref.sku!==member.plan.identity.sku||
   ref.listingId!==member.listingId)BAD('Poster identity changed since ZIP review');
  if(!member.metadata?.printSizes?.includes(asset.trio.size))BAD('Poster not approved for selected trio size');
  let listing=null,price=null,finishPrices=null;
  if(member.listingId){
   listing=await client.api('/listings/'+member.listingId);
   if(listing?.shop_id!==seller.shop_id||listing.state!=='active'||listing.listing_type!=='physical')BAD('Existing source Etsy listing unavailable');
   const inventory=await client.api('/listings/'+member.listingId+'/inventory');
   price=unframedUnitPrice(inventory,asset.trio.size,ref.sku);
   if(asset.trio.framed===true)finishPrices=verifiedFramedPrices(inventory,{size:asset.trio.size,sku:ref.sku});
  }else if(!asset.bundlesOnly||member.source!=='woodland_two_bundles_only')
   BAD('Unapproved supplier-only source');
  out.push({id,member,listing,sku:ref.sku,sizes:member.metadata.printSizes,price,finishPrices});
 }
 return {seller,members:out};
}
async function getQuote(asset,{uploads,client,env,request}){
 const context=await ownerMembers(asset,{uploads,client}),items=expectedTrioItems({members:context.members,size:asset.trio.size});
 if(!asset.trio?.listingTitle||asset.trio?.members?.length!==3||asset.memberIds.length!==3)BAD('Trio metadata unavailable');
 const pricing=await quoteSupplierGB({request,apiKey:env('SHRIMP_APIKEY')});
 let unitPrices=context.members.map(m=>m.price),priceBasis='three_live_individuals';
 if(asset.bundlesOnly&&unitPrices.some(x=>x===null)){
  if(asset.referenceMemberIds?.length!==3)BAD('Missing three live benchmark references');
  const benchmarks=[],frameBenchmarks=[];
  for(const memberId of asset.referenceMemberIds){
   const reference=await uploads.get(assetKey(memberId),{type:'json',consistency:'strong'});
   if(reference?.source!=='woodland_two_bundles_only'||!reference.listingId)BAD('Invalid benchmark source');
   const listing=await client.api('/listings/'+reference.listingId);
   if(listing?.shop_id!==context.seller.shop_id||listing.state!=='active')BAD('Benchmark listing unavailable');
   const inventory=await client.api('/listings/'+reference.listingId+'/inventory');
   benchmarks.push(unframedUnitPrice(inventory,asset.trio.size,reference.plan.identity.sku));
   if(asset.trio.framed===true)frameBenchmarks.push(verifiedFramedPrices(inventory,{size:asset.trio.size,sku:reference.plan.identity.sku}));
  }
  unitPrices=Array(3).fill(Math.min(...benchmarks));priceBasis='lowest_verified_live_A4_reference';
  if(asset.trio.framed===true){
   // These Woodland originals have no separate Etsy singles. Price each
   // framed bundle against already-active matching PrintShrimp singles.
   const byFinish=Object.fromEntries(['Print Only','Black Frame','White Frame','Oak Frame'].map(f=>[f,Math.min(...frameBenchmarks.map(b=>b[f]))]));
   context.members.forEach(m=>{m.finishPrices=byFinish;});
  }
 }
 let quote=computeUKBundleQuote({pricing,size:asset.trio.size,unitPrices,discount:asset.discount});
 if(asset.trio.framed===true){
  if(context.members.some(m=>!m.finishPrices||!m.member.plan?.inventory?.products))
   BAD('Framed trio requires three verified framed Etsy singles; no framed bundle created');
  quote={...quote,...quoteFramedTrio({pricing,size:asset.trio.size,
   memberPrices:context.members.map(m=>m.finishPrices),discount:asset.discount,basePrintQuote:quote})};
 }
 return {...context,items,quote:asset.bundlesOnly?{...quote,priceBasis}:quote};
}
function originalProductIds(members){return new Map(members.map(m=>[m.sku.toLowerCase(),m.member.supplierProductId]));}
async function supplierMembers({request,apiKey,items,members}){
 for(const x of items){
  const res=await request('https://api.printshrimp.com/functions/v1/api-get-product?'+new URLSearchParams({sku:x.sku}),{
   headers:{'x-api-key':apiKey,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!res.ok)BAD('Cannot verify existing PrintShrimp product '+x.sku);
  const data=await res.json(),p=data?.product;
  if(data.success!==true||p?.sku!==x.sku||!p.product_id||
   !p.variants?.some(v=>v.size===x.size&&typeof v.image_url==='string'&&v.image_url.startsWith('https://')))BAD('PrintShrimp has no confirmed print artwork at '+x.size+' for '+x.sku);
  if(p.product_id!==originalProductIds(members).get(x.sku.toLowerCase()))BAD('Supplier product identity changed for original poster SKU '+x.sku);
 }
}
function bundleBody(source,asset,quote){
 const p=source.member.plan.body;
 const desc=asset.trio.framed===true?framedTrioDescription(asset.trio.description,asset.trio.size):asset.trio.description;
 const accuratelyFinished=desc.trim()+'\n\nLISTING DETAILS\nThis is a set of three separate physical '+asset.trio.size+' portraits. Room scenes and props are illustrative, not included.'+
  (asset.trio.framed===true?' Frame mockups are illustrative; the supplied frames match the selected Black, White or Oak finish.':' The listed product is Print Only: no frames, mounts or hanging accessories are included.');
 return {...p,title:asset.listingTitle,description:accuratelyFinished,
  tags:asset.trio.tags.join(','),price:quote.grossGbp,quantity:10,should_auto_renew:true};
}
async function makeBundleImages(uploads,members){
 const thumbs=[];
 for(const m of members){
  const source=await uploads.get(m.member.masterKey,{type:'arrayBuffer',consistency:'strong'});
  if(!source||hashBytes(source)!==m.member.image.sha256)BAD('One of the three approved PNG masters changed');
  thumbs.push(await sharp(Buffer.from(source)).resize(420,590,{fit:'contain',background:'#fffaf3'}).jpeg({quality:85}).toBuffer());
 }
 const cover=await sharp({create:{width:1440,height:770,channels:3,background:'#faf6ee'}})
 .composite(thumbs.map((input,i)=>({input,left:60+i*460,top:82}))).jpeg({quality:88}).toBuffer();
 return [cover,...thumbs];
}
export async function prepareCollectionBundle({id,uploads,client,env,request=fetch,clock=()=>Date.now()}){
 if(!ID.test(id))BAD('Invalid bundle upload');
 let asset=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 if(asset?.type!=='physical_bundle'||asset.phase!=='preparing')BAD('Trio not queued for preparation');
 const deliveryMode=requiredPhysicalDeliveryMode(env); // Enforce before supplier-only component creation.
 if(asset.bundlesOnly){
  const {ensureWoodlandSupplierOnly}=await import('./woodland-supplier-only.mjs');
  for(const memberId of asset.memberIds){
   const source=await uploads.get(assetKey(memberId),{type:'json',consistency:'strong'});
   if(source?.phase==='supplier_pending')await ensureWoodlandSupplierOnly({memberId,uploads,env,request,clock});
  }
 }
 const {seller,members,items,quote}=await getQuote(asset,{uploads,client,env,request});
 await supplierMembers({request,apiKey:env('SHRIMP_APIKEY'),items,members});
 const remote=await getSupplierBundle({request,apiKey:env('SHRIMP_APIKEY'),sku:asset.sku});
 if(remote)verifySupplierBundle(remote,{sku:asset.sku,items,productIds:originalProductIds(members)});
 const images=await makeBundleImages(uploads,members);
 const hashes=images.map(hashBytes);
 const body=bundleBody(members[0],asset,quote);
 if(asset.targetShopSectionTitle){
  if(asset.targetShopSectionTitle!==TRIO_COLLECTION_SECTION_TITLE)BAD('Unexpected trio target section');
  body.shop_section_id=verifiedTrioSectionId(await client.api('/shops/'+seller.shop_id+'/sections'));
 }
 if(members.some(x=>x.member.plan.body.production_partner_ids!==body.production_partner_ids||
   x.member.plan.body.shipping_profile_id!==body.shipping_profile_id||
   x.member.plan.body.readiness_state_id!==body.readiness_state_id))BAD('Trio has incompatible Etsy postage or production settings');
 if(deliveryMode==='international'){
  const setup=await discoverPhysicalSetup({client,shippingMode:'international'});
  if(setup.phase!=='ready')BAD('International shipping profile not verified for trio');
  body.shipping_profile_id=setup.selection.shippingProfileId;
 }
 verifyRequiredPhysicalProfile({env,deliveryMode,shippingProfileId:body.shipping_profile_id});
 const inventory=asset.trio.framed===true?framedTrioInventory({
  size:asset.trio.size,sku:asset.sku,referencePlan:members[0].member.plan,
  options:quote,readinessStateId:body.readiness_state_id
 }):{
  products:[{sku:asset.sku,property_values:[],offerings:[{
   price:quote.grossGbp,quantity:10,is_enabled:true,readiness_state_id:body.readiness_state_id
  }]}],price_on_property:[],quantity_on_property:[],sku_on_property:[],readiness_state_on_property:[]
 };
 const plan={version:asset.trio.framed===true?2:1,deliveryMode,sku:asset.sku,trio:asset.trio,memberRefs:asset.memberRefs,sourceItems:items,
  quote,body,inventory,previewHashes:hashes,shopId:seller.shop_id,existingBundleId:remote?.bundle?.bundle_id||null};
 plan.hash=hashBytes(JSON.stringify(plan));
 for(let n=0;n<images.length;n++)await uploads.set('uploads/'+id+'/mockups/'+n+'.jpg',images[n]);
 asset={...asset,phase:'ready_for_approval',stage:'ready_for_approval',plan,
  approvalHash:hashBytes(plan.hash+':'+id),updatedAt:clock()};
 await uploads.setJSON(assetKey(id),asset);await recordRevision(uploads,id);
 return {phase:'ready_for_approval',quote};
}
async function auditEtsySku(client,shopId,sku){
 for(const state of ['active','draft','inactive','sold_out','expired','removed']){
  for(let offset=0;offset<10000;offset+=100){
   const page=await client.api('/shops/'+shopId+'/listings?'+new URLSearchParams({state,limit:'100',offset:String(offset)}));
   if(!Array.isArray(page?.results)||!Number.isSafeInteger(page.count)||page.count>10000)BAD('Cannot audit Etsy bundle SKU across listing states');
   if(page.results.some(l=>l.shop_id!==shopId||!Array.isArray(l.skus)))BAD('Incomplete seller SKU audit');
   if(page.results.some(l=>l.skus.includes(sku)))BAD('Etsy bundle SKU already exists; use the current listing rather than creating another');
   if(offset+page.results.length>=page.count)break;
   if(page.results.length!==100)BAD('Ambiguous Etsy pagination');
  }
 }
}
export async function publishCollectionBundle({id,approvalHash,uploads,etsyStore,client,env,request=fetch,clock=()=>Date.now()}){
 if(env('POSTER_PUBLICATION_ENABLED')!=='true'||!ID.test(id))BAD('Owner-approved publication not available');
 let asset=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 if(asset?.type!=='physical_bundle'||asset.phase!=='publishing'||asset.approvalHash!==approvalHash||
  !asset.plan||asset.plan.hash!==hashBytes(JSON.stringify(Object.fromEntries(Object.entries(asset.plan).filter(([k])=>k!=='hash')))))BAD('Trio approval invalid or outdated');
 if(hashBytes(asset.plan.hash+':'+id)!==approvalHash)BAD('Trio approval mismatch');
 // A changed or missing release flag must not create a UK-only trio.
 requiredPhysicalDeliveryMode(env);
 verifyRequiredPhysicalProfile({env,deliveryMode:asset.plan.deliveryMode,shippingProfileId:asset.plan.body.shipping_profile_id});
 if(asset.plan.deliveryMode==='international'){
  if(env('POSTER_INTERNATIONAL_SHIPPING_ENABLED')!=='true')BAD('International shipping release switch is disabled');
  const body=asset.plan.body;
  verifyPhysicalDeliveryProfile({
   shipping:await readCompleteDeliveryProfile({client,shopId:asset.plan.shopId,profileId:body.shipping_profile_id}),
   processing:await client.api('/shops/'+asset.plan.shopId+'/readiness-state-definitions/'+body.readiness_state_id),
   returns:await client.api('/shops/'+asset.plan.shopId+'/policies/return/'+body.return_policy_id),
   shopId:asset.plan.shopId,mode:'international'
  });
 }
 const {seller,members,items,quote}=await getQuote(asset,{uploads,client,env,request});
 if(JSON.stringify(quote)!==JSON.stringify(asset.plan.quote)||
   JSON.stringify(items)!==JSON.stringify(asset.plan.sourceItems))BAD('Trio price, membership or supplier cost changed; re-review required');
 for(let i=0;i<4;i++){
  const picture=await uploads.get('uploads/'+id+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'});
  if(!picture||hashBytes(picture)!==asset.plan.previewHashes[i])BAD('Trio preview artwork changed');
 }
 if(asset.targetShopSectionTitle){
  if(asset.targetShopSectionTitle!==TRIO_COLLECTION_SECTION_TITLE)BAD('Unexpected trio target section');
  const currentSectionId=verifiedTrioSectionId(await client.api('/shops/'+seller.shop_id+'/sections'));
  if(currentSectionId!==asset.plan.body.shop_section_id)BAD('Trio Collection section changed since owner approval');
 }
 await auditEtsySku(client,seller.shop_id,asset.sku);
 const lock=await etsyStore.setJSON('draft/'+asset.sku,{phase:'creating',kind:'trio',uploadId:id,at:clock()},{onlyIfNew:true});
 if(lock?.modified!==true)BAD('Trio Etsy creation already claimed; inspect before retry');
 const update=async fields=>{asset={...asset,...fields,updatedAt:clock()};await uploads.setJSON(assetKey(id),asset);await recordRevision(uploads,id);};
 // Confirm product costs and sources against supplier before any new bundle is saved.
 await supplierMembers({request,apiKey:env('SHRIMP_APIKEY'),items,members});
 const bundle=await createOrVerifyTrio({store:uploads,key:'supplier-bundles/'+asset.sku,
  request,apiKey:env('SHRIMP_APIKEY'),sku:asset.sku,name:asset.trio.title,items,productIds:originalProductIds(members),clock});
 await update({stage:'supplier_bundle_verified',supplierProductId:bundle.verified.bundleId});
 const body=asset.plan.body;
 const created=await client.api('/shops/'+seller.shop_id+'/listings',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams(Object.entries(body).map(([k,v])=>[k,String(v)])).toString()
 });
 if(created.shop_id!==seller.shop_id||created.state!=='draft'||!Number.isSafeInteger(created.listing_id))BAD('Unverified Etsy bundle draft');
 const listingId=created.listing_id;
 await update({listingId,stage:'etsy_draft'});
 await etsyStore.setJSON('draft/'+asset.sku,{phase:'inventory_pending',listingId,uploadId:id});
 // Existing owner-reviewed unframed trio plans predate the inventory field.
 // Preserve their exact original single-option Etsy write rather than forcing
 // a new review or losing the already-created supplier bundle.
 const legacy=asset.plan.version===1&&asset.trio.framed!==true&&!asset.plan.inventory;
 const inventoryPlan=legacy?{
  products:[{sku:asset.sku,property_values:[],offerings:[{
   price:quote.grossGbp,quantity:10,is_enabled:true,readiness_state_id:body.readiness_state_id
  }]}],price_on_property:[],quantity_on_property:[],sku_on_property:[],readiness_state_on_property:[]
 }:asset.plan.inventory;
 if(!inventoryPlan||inventoryPlan.products?.length!==(asset.trio.framed===true?4:1))
  BAD('Trio inventory plan was not verified');
 await client.api('/listings/'+listingId+'/inventory',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(inventoryPlan)});
 for(let i=0;i<4;i++){
  const bytes=await uploads.get('uploads/'+id+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'});
  const form=new FormData();form.set('image',new Blob([bytes],{type:'image/jpeg'}),asset.sku+'-'+i+'.jpg');form.set('rank',String(i+1));
  await client.api('/shops/'+seller.shop_id+'/listings/'+listingId+'/images',{method:'POST',body:form});
 }
 const check=await client.api('/listings/'+listingId+'?includes=Images');
 const inventory=await client.api('/listings/'+listingId+'/inventory');
 const saleProducts=inventory?.products?.filter(x=>!x.is_deleted)||[];
 const expectedInventory=inventoryPlan.products;
 const pricesMatch=expectedInventory.length===saleProducts.length&&expectedInventory.every(expected=>{
  const sameProps=(found)=>{
   if(asset.trio.framed!==true)return !found.property_values?.length;
   if(found.property_values?.length!==2||expected.property_values?.length!==2)return false;
   const properties=p=>p.property_values||[];
   const value=prop=>String(prop?.values?.[0]||'');
   const keys=p=>properties(p).map(prop=>{
    const size=normalizeSize(value(prop)),frame=normalizeFrame(value(prop));
    if(!Number.isSafeInteger(prop.property_id)||prop.property_id<=0)return null;
    return String(prop.property_id)+':'+(size||frame||'?');
   }).sort();
   return keys(found).every(x=>x&&!x.endsWith(':?'))&&
    JSON.stringify(keys(found))===JSON.stringify(keys(expected));
  };
  const matches=saleProducts.filter(p=>p.sku===asset.sku&&sameProps(p));
  if(matches.length!==1)return false;
  const active=(matches[0].offerings||[]).filter(x=>!x.is_deleted&&x.is_enabled);
  return active.length===1&&active[0].quantity===10&&
   Math.abs((quoteRead(active[0])||0)-expected.offerings[0].price)<=0.005;
 });
 const expectedTags=body.tags.split(',').map(x=>x.trim().toLowerCase()).sort();
 const foundTags=Array.isArray(check.tags)?check.tags.map(x=>String(x).trim().toLowerCase()).sort():[];
 if(check.shop_id!==seller.shop_id||check.state!=='draft'||check.listing_type!=='physical'||
  (check.title!==body.title&&!exactHtmlEntityChanges(body.title,check.title).exact)||
  (check.description!==body.description&&!exactHtmlEntityChanges(body.description,check.description).exact)||
  (env('POSTER_REQUIRED_SHIPPING_PROFILE_ID')&&check.shipping_profile_id!==body.shipping_profile_id)||
  expectedTags.join('|')!==foundTags.join('|')||
  (asset.targetShopSectionTitle&&check.shop_section_id!==body.shop_section_id)||
  !Array.isArray(check.images)||check.images.length<4||
  !pricesMatch||expectedInventory.length!==(asset.trio.framed===true?4:1))
  BAD('Etsy draft identity, description, price, tags, or exact three-print SKU failed verification');
 await update({stage:'etsy_draft_verified'});
 await etsyStore.setJSON('draft/'+asset.sku,{phase:'verified',listingId,uploadId:id});
 // Keep the first real integration run as an UNLISTED Etsy draft; activating
 // it requires a separate production-release setting after supplier fulfilment is proven.
 if(env('POSTER_BUNDLE_ACTIVATION_ENABLED')!=='true'){
  await update({phase:'draft_verified'});
  return {phase:'draft_verified',listingId,sku:asset.sku,ordersEnabled:false};
 }
 await client.api('/shops/'+seller.shop_id+'/listings/'+listingId,{method:'PATCH',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'state=active'});
 const active=await client.api('/listings/'+listingId);
 if(active.shop_id!==seller.shop_id||active.state!=='active'||
    (active.title!==body.title&&!exactHtmlEntityChanges(body.title,active.title).exact)||
    (asset.targetShopSectionTitle&&active.shop_section_id!==body.shop_section_id)||
    (env('POSTER_REQUIRED_SHIPPING_PROFILE_ID')&&active.shipping_profile_id!==body.shipping_profile_id))
  BAD('Etsy bundle publication or delivery profile not confirmed');
 await update({phase:'published',stage:'complete',etsyUrl:active.url,publishedAt:clock()});
 await etsyStore.setJSON('draft/'+asset.sku,{phase:'published',listingId,uploadId:id});
 return {phase:'published',listingId,sku:asset.sku,ordersEnabled:'not_verified'};
}


// Upgrade an EXISTING exact trio listing in place. Never calls create-bundle,
// create-product or create-listing. Two owner-approved operations: read-only
// prepare on the seller worker, then separately approved in-place update.
// Uncertain Etsy writes remain locked pending seller inspection.
const FRAME_UPGRADE_PREFIX='trio-frames/';
const propValue=x=>String(x?.values?.[0]||'');
const frameIdentity=p=>{
 const vals=p?.property_values||[];
 if(vals.length!==2)return null;
 const size=vals.map(x=>normalizeSize(propValue(x))).find(Boolean);
 const frame=vals.map(x=>normalizeFrame(propValue(x))).find(Boolean);
 return size&&frame?size+'|'+frame:null;
};
const liveProducts=x=>(x?.products||[]).filter(p=>!p.is_deleted);
const livePrice=p=>{
 const offer=(p?.offerings||[]).filter(x=>!x.is_deleted&&x.is_enabled);
 return offer.length===1?quoteRead(offer[0]):null;
};
async function upgradeReadback({asset,client,uploads,env,request}){
 if(!ID.test(asset?.productId||'')||asset.type!=='physical_bundle'||
    !['published','draft_verified'].includes(asset.phase)||
    !Number.isSafeInteger(asset.listingId)||asset.listingId<=0||
    !asset.plan?.quote||!asset.plan?.body||!asset.sku||!asset.supplierProductId||
    asset.trio?.size!=='A4'||asset.trio.framed===true)
   BAD('Only an existing, unframed, owner-approved A4 trio can be upgraded');
 const seller=await client.session();
 if(seller?.shop_name!=='SapiverPrints'||!Number.isSafeInteger(seller.shop_id))
  BAD('Etsy seller identity cannot be verified');
 const actual=await client.api('/listings/'+asset.listingId);
 if(actual.shop_id!==seller.shop_id||!['active','draft'].includes(actual.state)||
    actual.listing_type!=='physical'||actual.title!==asset.plan.body.title||
    actual.description!==asset.plan.body.description)
  BAD('Existing trio title, seller, description or status differs from approved saved listing; do not overwrite edits');
 const existing=await client.api('/listings/'+asset.listingId+'/inventory');
 const products=liveProducts(existing);
 if(products.length!==1||products[0].sku!==asset.sku||
    products[0].property_values?.length||
    Math.abs((livePrice(products[0])||0)-asset.plan.quote.grossGbp)>0.005)
  BAD('Existing Etsy trio SKU, unframed inventory or price changed; no update permitted');
 const staged={...asset,trio:{...asset.trio,framed:true}};
 const {members,items,quote}=await getQuote(staged,{uploads,client,env,request});
 await supplierMembers({request,apiKey:env('SHRIMP_APIKEY'),items,members});
 const remote=await getSupplierBundle({request,apiKey:env('SHRIMP_APIKEY'),sku:asset.sku});
 if(!remote)BAD('PrintShrimp has no current bundle for this Etsy trio SKU');
 verifySupplierBundle(remote,{sku:asset.sku,items,productIds:originalProductIds(members)});
 if(remote.bundle.bundle_id!==asset.supplierProductId)
  BAD('PrintShrimp bundle ID differs from original approved Etsy trio');
 const inventory=framedTrioInventory({size:'A4',sku:asset.sku,
  referencePlan:members[0].member.plan,options:quote,
  readinessStateId:asset.plan.body.readiness_state_id});
 const body=bundleBody(members[0],staged,quote);
 if(!body.description.includes('three individually framed')||
    /\b(?:frames? are not supplied|frames? are not included)\b/i.test(body.description))
  BAD('Framed description needs manual review');
 return {listingId:asset.listingId,sku:asset.sku,bundleId:remote.bundle.bundle_id,
  currentFingerprint:hashBytes(JSON.stringify({
   description:actual.description,title:actual.title,products,
   state:actual.state,listingId:asset.listingId,sku:asset.sku
  })),
  priorState:actual.state,quote,inventory,description:body.description};
}
// Read-only diagnostic: distinguish *audit* failures from Etsy update
// failures. This never reserves a claim, clears a failure or modifies a seller.
const classifyTrioAuditFailure=error=>{
 const reason=String(error?.message||'');
 const known=[
  [/Only an existing, unframed/, 'saved_bundle_state_invalid'],
  [/Etsy seller identity cannot/, 'seller_identity_unverified'],
  [/Existing trio title, seller, description or status/, 'etsy_listing_or_description_drift'],
  [/Existing Etsy trio SKU, unframed inventory or price changed/, 'etsy_inventory_drift'],
  [/Exactly three independent/, 'source_member_count_mismatch'],
  [/All three poster products must/, 'member_publication_or_supplier_unverified'],
  [/Poster identity changed/, 'source_artwork_reference_changed'],
  [/Poster not approved/, 'source_artwork_size_mismatch'],
  [/Existing source Etsy listing unavailable/, 'source_single_listing_unavailable'],
  [/Cannot identify one unframed/, 'source_unframed_price_missing'],
  [/Trio source has no unambiguous/, 'source_frame_variation_missing'],
  [/Trio source has ambiguous/, 'source_frame_offering_ambiguous'],
  [/Trio source .* price unverified/, 'source_frame_price_unverified'],
  [/Unapproved supplier-only source/, 'supplier_only_member_invalid'],
  [/Missing three live benchmark references/, 'woodland_benchmark_missing'],
  [/Invalid benchmark source/, 'woodland_benchmark_invalid'],
  [/Benchmark listing unavailable/, 'woodland_benchmark_not_active'],
  [/Framed trio requires three verified framed Etsy singles/, 'supplier_only_component_frame_template_missing'],
  [/PrintShrimp does not quote framed/, 'supplier_frame_quote_unavailable'],
  [/Supplier UK frame prices unavailable/, 'supplier_pricing_unavailable'],
  [/.*margin below/, 'framed_price_margin_guard'],
  [/Cannot verify existing PrintShrimp product/, 'supplier_member_lookup_failed'],
  [/Supplier product identity changed/, 'supplier_member_mapping_drift'],
  [/PrintShrimp bundle identity or print count differs/, 'supplier_bundle_identity_drift'],
  [/PrintShrimp bundle contains different artwork/, 'supplier_bundle_members_drift'],
  [/PrintShrimp bundle includes missing product/, 'supplier_bundle_artwork_missing'],
  [/PrintShrimp bundle artwork product IDs changed/, 'supplier_bundle_member_id_drift'],
  [/PrintShrimp bundle ID differs/, 'supplier_bundle_id_drift'],
  [/PrintShrimp has no current bundle/, 'supplier_bundle_missing'],
  [/Missing approved template/, 'etsy_frame_property_template_missing'],
  [/Reference frame variation properties unavailable/, 'etsy_frame_property_template_missing'],
  [/Framed description needs manual review/, 'framed_description_conflict'],
  [/Trio description explicitly excludes frames/, 'framed_description_conflict']
 ];
 for(const [pattern,code] of known)if(pattern.test(reason))return code;
 if(error?.name==='TimeoutError'||error?.name==='AbortError'||/timeout|timed out|aborted/i.test(reason))return 'provider_read_timeout';
 return 'provider_readback_failure_unclassified';
};
export async function diagnoseExistingTrioFrameReadback({id,uploads,client,env,request=fetch}){
 if(!ID.test(id||''))return {phase:'blocked',reason:'invalid_saved_trio_id'};
 const asset=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 if(!asset||asset.type!=='physical_bundle')return {phase:'blocked',reason:'missing_original_trio_record'};
 try{
  const plan=await upgradeReadback({asset,client,uploads,env,request});
  return {phase:'ready',reason:'all_saved_etsy_supplier_and_price_checks_passed',
   listingId:plan.listingId,variationCount:plan.inventory.products.length};
 }catch(error){return {phase:'blocked',reason:classifyTrioAuditFailure(error)};}
}

export async function prepareExistingTrioFrames({id,uploads,client,env,request=fetch,clock=()=>Date.now()}){
 if(!ID.test(id||''))BAD('Invalid existing bundle reference');
 const key=FRAME_UPGRADE_PREFIX+id,previous=await uploads.get(key,{type:'json',consistency:'strong'});
 if(previous?.phase==='complete')return {phase:'complete',listingId:previous.listingId};
 if(previous&&previous.phase!=='queued')BAD('A previous upgrade review exists; inspect it before another attempt');
 const asset=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 const plan=await upgradeReadback({asset,client,uploads,env,request});
 const approvalHash=hashBytes(JSON.stringify({id,listingId:plan.listingId,
  sku:plan.sku,old:plan.currentFingerprint,inventory:plan.inventory,description:plan.description}));
 await uploads.setJSON(key,{phase:'ready',id,listingId:plan.listingId,
  preparedAt:clock(),approvalHash,plan});
 return {phase:'ready',id,listingId:plan.listingId,approvalHash,quote:plan.quote};
}
export async function applyExistingTrioFrames({id,uploads,client,env,request=fetch,clock=()=>Date.now()}){
 if(!ID.test(id||''))BAD('Invalid existing bundle reference');
 const key=FRAME_UPGRADE_PREFIX+id;
 const saved=await uploads.get(key,{type:'json',consistency:'strong'});
 if(saved?.phase!=='applying'||!saved.plan||!saved.approvalHash||
    hashBytes(JSON.stringify({id,listingId:saved.plan.listingId,
     sku:saved.plan.sku,old:saved.plan.currentFingerprint,
     inventory:saved.plan.inventory,description:saved.plan.description}))!==saved.approvalHash)
  BAD('Owner-approved frame upgrade plan was altered or is not claimed');
 const asset=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 const latest=await upgradeReadback({asset,client,uploads,env,request});
 if(JSON.stringify(latest)!==JSON.stringify(saved.plan))
  BAD('Etsy or supplier state/price changed after approval; no live write performed');
 const etsyListing=saved.plan.listingId;
 // From this point either Etsy call can succeed while the second fails.
 // DO NOT automatically replay an ambiguous request.
 await client.api('/listings/'+etsyListing+'/inventory',{method:'PUT',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify(saved.plan.inventory)});
 await uploads.setJSON(key,{...saved,phase:'inventory_written',updatedAt:clock()});
 await client.api('/shops/'+(await client.session()).shop_id+'/listings/'+etsyListing,{method:'PATCH',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({description:saved.plan.description}).toString()});
 const finalListing=await client.api('/listings/'+etsyListing);
 const result=await client.api('/listings/'+etsyListing+'/inventory');
 const plans=saved.plan.inventory.products;
 const found=liveProducts(result);
 const same=found.length===4&&plans.every(p=>{
  const target=frameIdentity(p);
  const matched=found.filter(q=>q.sku===saved.plan.sku&&frameIdentity(q)===target);
  return matched.length===1&&Math.abs((livePrice(matched[0])||0)-p.offerings[0].price)<0.005;
 });
 if(finalListing.listing_id!==etsyListing||finalListing.description!==saved.plan.description||
    finalListing.state!==saved.plan.priorState||!same)
  BAD('Existing Etsy trio frame variation read-back differs; needs manual investigation');
 await uploads.setJSON(key,{...saved,phase:'complete',updatedAt:clock(),
  verifiedAt:clock(),listingId:etsyListing});
 return {phase:'complete',listingId:etsyListing,frameOptions:4};
}
export const existingTrioFrameKey=id=>FRAME_UPGRADE_PREFIX+id;
