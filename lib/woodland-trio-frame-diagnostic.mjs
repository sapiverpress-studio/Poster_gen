// Two exact existing Woodland three-print listings. This is read-only.
// No Etsy, PrintShrimp, uploader, draft lock or order mutation is allowed.
import {listProducts} from './product-records.mjs';
import {assetKey} from './uploaded-poster.mjs';
import {getSupplierBundle} from './three-print-bundle.mjs';
import {normalizeFrame,normalizeSize} from './poster-template.mjs';
import {diagnoseExistingTrioFrameReadback} from './collection-bundle-publication.mjs';

export const WOODLAND_TRIO_LISTING_IDS=Object.freeze([4600182933,4600180569]);
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{32}$/.test(id);
const safeSku=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value)?value:'invalid_sku';
const simplify=value=>String(value||'').replace(/\r\n?/g,'\n').replace(/\s+/g,' ').trim();
const safeMode=x=>['draft','active','inactive','sold_out','expired','removed'].includes(x)?x:'unverified';
const oneFrame=p=>{
 const props=p?.property_values||[];
 const size=props.some(prop=>prop.values?.some(v=>normalizeSize(v)==='A4'));
 return size?props.flatMap(prop=>prop.values||[]).map(normalizeFrame).find(Boolean)||null:null;
};
export async function auditWoodlandTrioFrames({
 uploads,client,env,request=fetch,
 bundleLookup=getSupplierBundle,
 diagnose=diagnoseExistingTrioFrameReadback
}){
 if(!uploads?.get||!uploads?.list||!client?.api||!client?.session||typeof env!=='function')
  throw Error('Authenticated read-only diagnostic is unavailable');
 const seller=await client.session();
 if(seller?.shop_name!=='SapiverPrints'||!Number.isSafeInteger(seller.shop_id))
  throw Error('Expected seller is not authenticated');
 const records=await listProducts(uploads);
 const results=[];
 for(const listingId of WOODLAND_TRIO_LISTING_IDS){
  const entry={listingId,saved:'unavailable',upgrade:'unavailable',
   etsy:{state:'unverified',found:false,originalTitleMatches:null,originalDescriptionMatches:null,
    productCount:null,originalUnframedSkuMatches:null,frameOptionsPresent:[]},
   supplier:{bundleFound:null,bundleIdMatches:null,memberSkuMatches:null,
    expectedMemberSkus:[],actualMemberSkus:[],memberProductIdMatches:null},
   sources:{count:0,etsySingles:0,supplierOnly:0,templateFrameMembers:0},
   preflight:{phase:'not_run',reason:'readback_not_completed'},
   preflightWithLiveDescription:{phase:'not_run',reason:'live_description_not_checked'}};
  const matches=records.filter(p=>p?.type==='physical_bundle'&&p.etsyListingId===listingId);
  if(matches.length!==1){entry.saved=matches.length?'ambiguous_saved_bundle_records':'missing_saved_bundle_record';results.push(entry);continue;}
  const p=matches[0],id=p.currentRevision||p.pendingRevision;
  if(!validId(id)){entry.saved='invalid_revision';results.push(entry);continue;}
  const asset=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
  if(!asset||asset.listingId!==listingId||asset.type!=='physical_bundle'){
   entry.saved='listing_revision_mismatch';results.push(entry);continue;
  }
  entry.saved=asset.phase||'unknown';
  const status=await uploads.get('trio-frames/'+id,{type:'json',consistency:'strong'});
  entry.upgrade=status?.phase||'not_started';
  entry.sources.count=Array.isArray(asset.memberIds)?asset.memberIds.length:0;
  const sourceProductIds=new Map();
  for(const memberId of asset.memberIds||[]){
   if(!validId(memberId))continue;
   const member=await uploads.get(assetKey(memberId),{type:'json',consistency:'strong'});
   if(!member)continue;
   if(member.plan?.identity?.sku&&member.supplierProductId)
    sourceProductIds.set(member.plan.identity.sku.toLowerCase(),member.supplierProductId);
   if(member.listingId)entry.sources.etsySingles++;
   else entry.sources.supplierOnly++;
   const options=(member.plan?.inventory?.products||[]).filter(prod=>!prod.is_deleted).map(oneFrame);
   if(['Print Only','Black Frame','White Frame','Oak Frame'].every(f=>options.includes(f)))
    entry.sources.templateFrameMembers++;
  }
  let liveDescription=null;
  try{
   const listing=await client.api('/listings/'+listingId);
   if(listing?.listing_id===listingId&&listing.shop_id===seller.shop_id){
    entry.etsy.found=true;entry.etsy.state=safeMode(listing.state);
    entry.etsy.originalTitleMatches=listing.title===asset.plan?.body?.title;
    entry.etsy.originalDescriptionMatches=listing.description===asset.plan?.body?.description;
    liveDescription=listing.description;
    const original=String(asset.plan?.body?.description||''),live=String(listing.description||'');
    entry.etsy.descriptionComparison={
     normalizedWhitespaceEquivalent:simplify(original)===simplify(live),
     liveContainsSaved:original.length>0&&live.includes(original),
     savedContainsLive:live.length>0&&original.includes(live),
     characterCountDifference:live.length-original.length,
     liveContainsUnframedOnlyClaim:/\b(?:unframed only|print only|prints only|no frames|no frame|frames? (?:are|is) not (?:supplied|included))\b/i.test(live),
     savedContainsUnframedOnlyClaim:/\b(?:unframed only|print only|prints only|no frames|no frame|frames? (?:are|is) not (?:supplied|included))\b/i.test(original)
    };
   }
   const inventory=await client.api('/listings/'+listingId+'/inventory');
   const products=(inventory?.products||[]).filter(x=>!x.is_deleted);
   entry.etsy.productCount=products.length;
   entry.etsy.originalUnframedSkuMatches=products.some(x=>x.sku===asset.sku&&
    (!x.property_values||x.property_values.length===0));
   entry.etsy.frameOptionsPresent=[...new Set(products.filter(x=>x.sku===asset.sku).map(oneFrame).filter(Boolean))];
  }catch{entry.etsy.error='etsy_read_unavailable';}
  try{
   const bundle=await bundleLookup({request,apiKey:env('SHRIMP_APIKEY'),sku:asset.sku});
   entry.supplier.bundleFound=Boolean(bundle?.bundle);
   entry.supplier.bundleIdMatches=bundle?.bundle?.bundle_id===asset.supplierProductId;
   const expected=(asset.memberRefs||[]).map(x=>String(x.sku||'').toLowerCase()).sort();
   const actual=(bundle?.bundle?.items||[]).map(x=>String(x.sku||'').toLowerCase()).sort();
   entry.supplier.memberSkuMatches=expected.length===3&&actual.length===3&&
    JSON.stringify(expected)===JSON.stringify(actual);
   entry.supplier.expectedMemberSkus=expected.map(safeSku);
   entry.supplier.actualMemberSkus=actual.map(safeSku);
   entry.supplier.memberProductIdMatches=Array.isArray(bundle?.bundle?.items)&&bundle.bundle.items.length===3&&
    bundle.bundle.items.every(x=>sourceProductIds.get(String(x.sku||'').toLowerCase())===x.product_id);
  }catch{entry.supplier.error='supplier_read_unavailable';}
  entry.preflight=await diagnose({id,uploads,client,env,request});
  // In-memory ONLY: substitute Etsy's CURRENT description while retaining all
  // other immutable saved master, supplier, member and price references.
  // This proves whether text drift is the sole preflight blocker without
  // changing the actual saved plan or authorising any Etsy update.
  if(typeof liveDescription==='string'&&liveDescription!==asset.plan?.body?.description){
   const proxy={
    ...uploads,
    get:async (key,options)=>key===assetKey(id)?
     {...asset,plan:{...asset.plan,body:{...asset.plan.body,description:liveDescription}}}:
     uploads.get(key,options),
    setJSON:()=>{throw Error('Read-only diagnostic attempted a write');},
    set:()=>{throw Error('Read-only diagnostic attempted a write');}
   };
   entry.preflightWithLiveDescription=await diagnose({id,uploads:proxy,client,env,request});
  }
  results.push(entry);
 }
 return {phase:'read_only_complete',shopVerified:true,count:results.length,
  writesAttempted:0,results};
}
