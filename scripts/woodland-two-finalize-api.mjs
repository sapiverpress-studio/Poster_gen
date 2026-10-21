// One-off SapiverPrints Woodland reconciliation via GitHub's existing encrypted
// Etsy credentials and PrintShrimp API key. No Netlify deployment, no orders,
// no singles. Exact listing/SKU allowlist. Execute audit before any writes.
import {SHRIMP_API} from '../lib/printshrimp-api.mjs';
import {quoteSupplierGB,computeUKBundleQuote} from '../lib/three-print-bundle.mjs';
import {createHash} from 'node:crypto';
const assetKey=id=>'uploads/'+id+'/state';
const hashBytes=x=>createHash('sha256').update(x).digest('hex');
const fail=x=>{throw Error(x);};
const groups=[
 {name:'Forest Friends',listingId:4600180569,sku:'SP-TRIO-D1B581C8843C136EF3744B3D',
  items:['SP-FOX-PRINT-WI-05689631','SP-THE-ROBIN','SP-THE-HEDGEHOG'],id:'iAYzKSdFwyt892qFAPqkXIdnO0K5kUYT'},
 {name:'Hidden Paths',listingId:4600182933,sku:'SP-TRIO-7AD9AD4192AB53D36FCE3CC6',
  items:['SP-BADGER-73C91495','SP-RED-SQUIRREL-649E8590','SP-ROE-DEER-08061999'],id:'4ZNZ8-zhwgsRgJknNJsX3a8FnJmtdP9T'}
];
const BASE=SHRIMP_API;
const format=objects=>objects.map(i=>i.sku+'|'+i.size+'|'+(i.quantity??1)).sort().join(',');
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const expected=g=>g.items.map(sku=>({sku,quantity:1,size:'A4'}));
const toPrice=o=>o?.price?.currency_code==='GBP'?o.price.amount/o.price.divisor:NaN;
async function callSupplier(apiKey,path,{method='GET',body}={}){
 const r=await fetch(BASE+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{'x-api-key':apiKey,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)fail('Supplier '+method+' '+path.split('?')[0]+' returned HTTP '+r.status);
 const d=await r.json();if(d?.success!==true)fail('Supplier response incomplete');
 return d;
}
function onlyUnframedA4(inv,sku){
 const found=[];
 for(const p of inv?.products||[]){
  if(p.is_deleted||p.sku!==sku)continue;
  const vals=(p.property_values||[]);
  if(!vals.some(x=>x.values?.some(v=>String(v).toUpperCase()==='A4')))continue;
  const frame=vals.find(x=>/frame/i.test(x.property_name||''))?.values||['Print Only'];
  if(!frame.some(x=>/print only|unframed/i.test(x)))continue;
  const offerings=(p.offerings||[]).filter(x=>x.is_enabled&&!x.is_deleted);
  if(offerings.length===1)found.push(toPrice(offerings[0]));
 }
 if(found.length!==1||!Number.isFinite(found[0]))fail('Original unframed Etsy source '+sku+' cannot be priced');
 return found[0];
}
function cleanText(original,g){
 const base=String(original||'').split(/\n\s*FINISH OPTIONS\b/i)[0].trim();
 if(!base.includes('three')||!base.toLowerCase().includes('a4')||!base.toLowerCase().includes('unframed'))
  fail('Unexpected trio description; refuse to replace owner copy');
 const end='\n\nPRINT DETAILS\nThis listing includes THREE separate unframed A4 paper prints (210 × 297 mm each). It is not a single collage, a framed item or a digital download. Frames, mounts and accessories are not included. Choose the quantity of complete three-print sets at checkout. Colours may vary slightly between screens and printed paper.';
 if(g.name==='Hidden Paths'&&!/badger/i.test(base))fail('Hidden Paths description contains wrong subject');
 if(g.name==='Forest Friends'&&!/hedgehog/i.test(base))fail('Forest Friends description contains wrong subject');
 return base+end;
}
export async function runWoodlandFinal({client,uploads,apiKey,mode}){
 if(!['audit','apply'].includes(mode)||!apiKey)fail('Unapproved Woodland finalisation');
 console.log('WOODLAND_STAGE seller_session');
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||!Number.isSafeInteger(seller.shop_id))fail('Wrong Etsy shop');
 console.log('WOODLAND_STAGE pricing');
 const pricing=await quoteSupplierGB({apiKey});
 const stocks=[];
 for(const [i,g] of groups.entries()){
  console.log('WOODLAND_STAGE etsy_draft_'+g.listingId);
  const original=await client.api('/listings/'+g.listingId+'?includes=Images');
  console.log('WOODLAND_STAGE inventory_'+g.listingId);
  const inv=await client.api('/listings/'+g.listingId+'/inventory');
  console.log('WOODLAND_STAGE supplier_bundle_'+g.sku);
  const supplier=await callSupplier(apiKey,'/api-get-bundle?'+new URLSearchParams({sku:g.sku}));
  const bundle=supplier.bundle;
  if(original.shop_id!==seller.shop_id||original.listing_id!==g.listingId||original.state!=='draft'||
   original.listing_type!=='physical'||!original.title.includes('Woodland')||
   !Array.isArray(original.tags)||original.tags.length!==13||!Array.isArray(original.images)||original.images.length<4||
   !bundle?.bundle_id||bundle.sku!==g.sku||bundle.total_prints!==3||
   !Array.isArray(bundle.items)||bundle.items.length!==3)fail(g.name+' Etsy or PrintShrimp identity changed');
  const prod=(inv?.products||[]).filter(p=>!p.is_deleted);
  if(prod.length!==1||prod[0].sku!==g.sku||prod[0].offerings?.filter(p=>p.is_enabled&&!p.is_deleted).length!==1)
   fail(g.name+' Etsy SKU inventory mismatched');
  const offering=prod[0].offerings.find(x=>x.is_enabled&&!x.is_deleted);
  if(Math.abs(toPrice(offering)-40.77)>0.005||offering.quantity!==10)fail(g.name+' price or quantity changed');
  const target=expected(g);
  const ids=new Map();
  for(const sku of g.items){
   console.log('WOODLAND_STAGE supplier_product_'+sku);
   const {product:p}=await callSupplier(apiKey,'/api-get-product?'+new URLSearchParams({sku}));
   if(p?.sku!==sku||!p.product_id)fail('Supplier product missing '+sku);
   const variant=p.variants?.find(v=>v.size==='A4');
   if(!variant||!/^https:\/\//.test(variant.image_url||''))fail('Original A4 artwork missing '+sku);
   ids.set(sku,p.product_id);
  }
  for(const member of bundle.items)if(!member.product_id)fail('Supplier bundle has a deleted component');
  const current= format(bundle.items),want=format(target);
  const correct=current===want&&bundle.items.every(m=>ids.get(m.sku)===m.product_id);
  if(i===0&&!correct)fail('Forest Friends supplier bundle changed; no automated replacement permitted');
  console.log('WOODLAND_STAGE source_prices_'+g.name.replace(' ','_'));
  const originalPrices=[];
  for(const sku of g.items){
   const match= sku==='SP-FOX-PRINT-WI-05689631'?4595277551:
    sku==='SP-THE-ROBIN'?4595921846:sku==='SP-THE-HEDGEHOG'?4595944801:
    sku==='SP-BADGER-73C91495'?4599437738:sku==='SP-RED-SQUIRREL-649E8590'?4599399281:4599438228;
   const live=await client.api('/listings/'+match);
   if(live.shop_id!==seller.shop_id||live.state!=='active')fail('Original single listing inactive '+sku);
   originalPrices.push(onlyUnframedA4(await client.api('/listings/'+match+'/inventory'),sku));
  }
  console.log('WOODLAND_STAGE compute_quote_'+g.name.replace(' ','_'));
  const quote=computeUKBundleQuote({pricing,size:'A4',unitPrices:originalPrices,discount:15});
  if(Math.abs(quote.grossGbp-40.77)>0.005||quote.contributionGbp<6)fail('Bundle economic preflight failed '+g.name);
  stocks.push({g,original,inv,bundle,correct,target,ids,quote,newDescription:cleanText(original.description,g)});
 }
 console.log('WOODLAND_STAGE supplier_paid_orders');
 let paidOrderCount=0,referenced=0;
 for(let page=1;page<=20;page++){
  const orders=await callSupplier(apiKey,'/api-get-order?'+new URLSearchParams({page:String(page)}));
  if(!Array.isArray(orders.orders)||!Number.isSafeInteger(orders.total_orders))fail('Paid-order audit incomplete');
  paidOrderCount=orders.total_orders;
  for(const order of orders.orders){
   if((order.items||[]).some(x=>groups.some(g=>g.sku===x.sku)))referenced++;
  }
  if(page*25>=orders.total_orders)break;
  if(page===20)fail('Too many supplier orders to audit');
 }
 if(referenced)fail('Paid PrintShrimp orders use the bundle SKUs; supplier recreation blocked');
 console.log('WOODLAND_PREFLIGHT '+JSON.stringify({mode,paidOrders:paidOrderCount,
  groups:stocks.map(x=>({name:x.g.name,listingId:x.g.listingId,sku:x.g.sku,correctSupplier:x.correct,
  memberSkus:x.bundle.items.map(m=>m.sku),fixedSizes:x.bundle.items.map(m=>m.size),sourceA4Verified:true,
  price:x.quote.grossGbp,contribution:x.quote.contributionGbp,descriptionNeedsFix:x.original.description!==x.newDescription}))}));
 if(mode==='audit')return {audited:true,needSupplierCorrection:!stocks[1].correct};
 // Never recreate Forest Friends; only one existing Hidden Paths SKU is eligible.
 const hidden=stocks[1];
 if(!hidden.correct){
  // There is no update-bundle API. Remove and recreate ONLY the draft's
  // existing SKU, preserving all three original full-resolution sources.
  // No product or Etsy listing is deleted.
  const deleted=await callSupplier(apiKey,'/api-delete-bundle?'+new URLSearchParams({bundle_id:hidden.bundle.bundle_id}),{method:'DELETE'});
  if(deleted.deleted?.bundle_id!==hidden.bundle.bundle_id||deleted.deleted.sku!==hidden.g.sku)
   fail('Supplier deletion not acknowledged. HOLD; do not retry');
  const created=await callSupplier(apiKey,'/api-create-bundle',{method:'POST',
   body:{name:'Woodland Verse - Hidden Paths',sku:hidden.g.sku,items:hidden.target}});
  if(created.bundle?.sku!==hidden.g.sku||format(created.bundle.items||[])!==format(hidden.target))
   fail('Supplier recreation uncertain. HOLD; do not retry');
  const read=await callSupplier(apiKey,'/api-get-bundle?'+new URLSearchParams({sku:hidden.g.sku}));
  if(read.bundle?.bundle_id!==created.bundle.bundle_id||
   format(read.bundle.items||[])!==format(hidden.target)||
   !read.bundle.items.every(x=>hidden.ids.get(x.sku)===x.product_id))
   fail('Supplier readback mismatched. HOLD; do not retry');
  console.log('WOODLAND_SUPPLIER_RELINKED '+JSON.stringify({sku:hidden.g.sku,newId:read.bundle.bundle_id,fixedSize:'A4',members:hidden.target.map(x=>x.sku)}));
  const state=await uploads.get(assetKey(hidden.g.id),{type:'json',consistency:'strong'});
  if(state?.listingId!==hidden.g.listingId||state.sku!==hidden.g.sku||state.phase!=='draft_verified')
   fail('Supplier fixed, but saved studio ID changed; check original draft before activation');
  const plan={...state.plan,existingBundleId:read.bundle.bundle_id};
  delete plan.hash;plan.hash=hashBytes(JSON.stringify(plan));
  await uploads.setJSON(assetKey(hidden.g.id),{...state,supplierProductId:read.bundle.bundle_id,plan,
   approvalHash:hashBytes(plan.hash+':'+hidden.g.id),stage:'supplier_bundle_relinked',updatedAt:Date.now()});
 }
 // Recheck BOTH supplier bundles before changing any customer-facing draft.
 for(const x of stocks){
  const {bundle:b}=await callSupplier(apiKey,'/api-get-bundle?'+new URLSearchParams({sku:x.g.sku}));
  if(format(b?.items||[])!==format(x.target)||!b.items.every(z=>x.ids.get(z.sku)===z.product_id))
   fail('Supplier bundle does not match 3 original A4 sources; no Etsy changes');
 }
 for(const x of stocks){
  if(x.original.description!==x.newDescription){
   await client.api('/shops/'+seller.shop_id+'/listings/'+x.g.listingId,{method:'PATCH',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({description:x.newDescription}).toString()});
  }
  const check=await client.api('/listings/'+x.g.listingId);
  if(check.state!=='draft'||check.description!==x.newDescription||check.shop_id!==seller.shop_id)
   fail('Etsy corrected description not verified, do not publish');
  console.log('WOODLAND_DRAFT_FIXED '+JSON.stringify({listingId:x.g.listingId,sku:x.g.sku}));
 }
 // The owner explicitly requested these TWO listings published. Do not touch
 // six active individual listings or historical supplier set.
 for(const x of stocks){
  await client.api('/shops/'+seller.shop_id+'/listings/'+x.g.listingId,{method:'PATCH',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'state=active'});
  const live=await client.api('/listings/'+x.g.listingId);
  const inventory=await client.api('/listings/'+x.g.listingId+'/inventory');
  if(live.state!=='active'||live.shop_id!==seller.shop_id||live.description!==x.newDescription||
   (inventory.products||[]).filter(p=>!p.is_deleted)[0]?.sku!==x.g.sku)
   fail('Etsy activation readback failed for '+x.g.sku);
  const state=await uploads.get(assetKey(x.g.id),{type:'json',consistency:'strong'});
  if(state?.listingId===x.g.listingId&&state.sku===x.g.sku){
   await uploads.setJSON(assetKey(x.g.id),{...state,phase:'published',stage:'complete',etsyUrl:live.url,publishedAt:Date.now()});
  }
  console.log('WOODLAND_PUBLISHED '+JSON.stringify({id:x.g.listingId,sku:x.g.sku,price:40.77}));
 }
 return {published:stocks.map(x=>x.g.listingId)};
}
