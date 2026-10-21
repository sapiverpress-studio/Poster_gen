// Two separately reviewed three-print Etsy listings from six already-published poster masters.
// Invariant: only owner-approved bundle writes, no print order or artwork re-upload to supplier.
import sharp from 'sharp';
import {hashBytes,assetKey} from './uploaded-poster.mjs';
import {recordRevision,recordKey} from './product-records.mjs';
import {physicalDescription} from './physical-description.mjs';
import {expectedTrioItems,getSupplierBundle,verifySupplierBundle,computeUKBundleQuote,quoteSupplierGB,createOrVerifyTrio} from './three-print-bundle.mjs';
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
  let listing=null,price=null;
  if(member.listingId){
   listing=await client.api('/listings/'+member.listingId);
   if(listing?.shop_id!==seller.shop_id||listing.state!=='active'||listing.listing_type!=='physical')BAD('Existing source Etsy listing unavailable');
   price=unframedUnitPrice(await client.api('/listings/'+member.listingId+'/inventory'),asset.trio.size,ref.sku);
  }else if(!asset.bundlesOnly||member.source!=='woodland_two_bundles_only')
   BAD('Unapproved supplier-only source');
  out.push({id,member,listing,sku:ref.sku,sizes:member.metadata.printSizes,price});
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
  const benchmarks=[];
  for(const memberId of asset.referenceMemberIds){
   const reference=await uploads.get(assetKey(memberId),{type:'json',consistency:'strong'});
   if(reference?.source!=='woodland_two_bundles_only'||!reference.listingId)BAD('Invalid benchmark source');
   const listing=await client.api('/listings/'+reference.listingId);
   if(listing?.shop_id!==context.seller.shop_id||listing.state!=='active')BAD('Benchmark listing unavailable');
   benchmarks.push(unframedUnitPrice(await client.api('/listings/'+reference.listingId+'/inventory'),asset.trio.size,reference.plan.identity.sku));
  }
  unitPrices=Array(3).fill(Math.min(...benchmarks));priceBasis='lowest_verified_live_A4_reference';
 }
 const quote=computeUKBundleQuote({pricing,size:asset.trio.size,unitPrices,discount:asset.discount});
 return {...context,items,quote:{...quote,priceBasis}};
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
 return {...p,title:asset.listingTitle,description:physicalDescription(asset.trio.description),
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
 if(members.some(x=>x.member.plan.body.production_partner_ids!==body.production_partner_ids||
   x.member.plan.body.shipping_profile_id!==body.shipping_profile_id||
   x.member.plan.body.readiness_state_id!==body.readiness_state_id))BAD('Trio has incompatible Etsy postage or production settings');
 const plan={version:1,sku:asset.sku,trio:asset.trio,memberRefs:asset.memberRefs,sourceItems:items,
  quote,body,previewHashes:hashes,shopId:seller.shop_id,existingBundleId:remote?.bundle?.bundle_id||null};
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
 const {seller,members,items,quote}=await getQuote(asset,{uploads,client,env,request});
 if(JSON.stringify(quote)!==JSON.stringify(asset.plan.quote)||
   JSON.stringify(items)!==JSON.stringify(asset.plan.sourceItems))BAD('Trio price, membership or supplier cost changed; re-review required');
 for(let i=0;i<4;i++){
  const picture=await uploads.get('uploads/'+id+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'});
  if(!picture||hashBytes(picture)!==asset.plan.previewHashes[i])BAD('Trio preview artwork changed');
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
 await client.api('/listings/'+listingId+'/inventory',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
  products:[{sku:asset.sku,property_values:[],offerings:[{price:quote.grossGbp,quantity:10,is_enabled:true,readiness_state_id:body.readiness_state_id}]}],
  price_on_property:[],quantity_on_property:[],sku_on_property:[],readiness_state_on_property:[]
 })});
 for(let i=0;i<4;i++){
  const bytes=await uploads.get('uploads/'+id+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'});
  const form=new FormData();form.set('image',new Blob([bytes],{type:'image/jpeg'}),asset.sku+'-'+i+'.jpg');form.set('rank',String(i+1));
  await client.api('/shops/'+seller.shop_id+'/listings/'+listingId+'/images',{method:'POST',body:form});
 }
 const check=await client.api('/listings/'+listingId+'?includes=Images');
 const inventory=await client.api('/listings/'+listingId+'/inventory');
 const saleProducts=inventory?.products?.filter(x=>!x.is_deleted)||[];
 const saleOffering=saleProducts[0]?.offerings?.filter(x=>!x.is_deleted&&x.is_enabled)||[];
 const expectedTags=body.tags.split(',').map(x=>x.trim().toLowerCase()).sort();
 const foundTags=Array.isArray(check.tags)?check.tags.map(x=>String(x).trim().toLowerCase()).sort():[];
 if(check.shop_id!==seller.shop_id||check.state!=='draft'||check.listing_type!=='physical'||
  check.title!==body.title||check.description!==body.description||
  expectedTags.join('|')!==foundTags.join('|')||
  !Array.isArray(check.images)||check.images.length<4||
  saleProducts.length!==1||saleProducts[0].sku!==asset.sku||saleOffering.length!==1||
  saleOffering[0].quantity!==10||Math.abs((quoteRead(saleOffering[0])||0)-quote.grossGbp)>0.005)
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
 if(active.shop_id!==seller.shop_id||active.state!=='active'||active.title!==body.title)BAD('Etsy bundle publication not confirmed');
 await update({phase:'published',stage:'complete',etsyUrl:active.url,publishedAt:clock()});
 await etsyStore.setJSON('draft/'+asset.sku,{phase:'published',listingId,uploadId:id});
 return {phase:'published',listingId,sku:asset.sku,ordersEnabled:'not_verified'};
}
