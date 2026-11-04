// Read-only, original-receipt publication audit for the missing Streak "The Blame".
// NO Etsy or PrintShrimp merchant writes, no retry or lock clearing.
// Seller and supplier API readbacks are authoritative, not the stored "publishing" phase.
import {STREAK_APPROVED_UPLOAD_IDS,STREAK_RECOVERY_SHOP_ID} from './streak-trio-recovery.mjs';
import {assetKey} from './uploaded-poster.mjs';
import {recordKey} from './product-records.mjs';
import {SHRIMP_API} from './printshrimp-api.mjs';

export const STREAK_AUDIT_KEY='streak-publishing/status';
const STATES=['active','inactive','sold_out','draft','removed','expired'];
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{32}$/.test(v);
const validPositive=v=>Number.isSafeInteger(v)&&v>0;

async function findEtsySkuMatches({client,seller,sku}){
 const matches=[];
 for(const state of STATES){
  let offset=0;
  for(let page=0;page<10;page++){
   const query=new URLSearchParams({state,limit:'100',offset:String(offset)});
   const result=await client.api('/shops/'+seller.shop_id+'/listings?'+query.toString());
   if(!Array.isArray(result?.results)||!Number.isSafeInteger(result.count)||
      result.count<0||result.count>1000)throw Error('Etsy listing state audit incomplete');
   for(const item of result.results){
    if(item?.shop_id!==seller.shop_id||!validPositive(item.listing_id)||
       !Array.isArray(item.skus)||typeof item.state!=='string')
     throw Error('Etsy listing state audit malformed');
    if(item.skus.includes(sku)){
     if(item.state!==state)throw Error('Etsy listing state changed during audit');
     matches.push({listingId:item.listing_id,state:item.state,title:String(item.title||'').slice(0,140)});
    }
   }
   offset+=result.results.length;
   if(offset>=result.count)break;
   if(result.results.length===0)throw Error('Etsy listing state pagination incomplete');
   if(page===9)throw Error('Etsy listing state pages exceed audit limit');
  }
 }
 if(new Set(matches.map(x=>x.listingId)).size!==matches.length)
  throw Error('Duplicate Etsy SKU matching states; investigate manually');
 return matches;
}

async function supplierLookup({request,env,sku}){
 const key=env('SHRIMP_APIKEY');
 if(!key)throw Error('PrintShrimp seller API key unavailable');
 const res=await request(SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku}),{
  method:'GET',headers:{'x-api-key':key,Accept:'application/json'},
  redirect:'error',signal:AbortSignal.timeout(20000)
 });
 if(res.status===404)return {phase:'not_found',productId:null};
 if(!res.ok)throw Error('PrintShrimp read-back unavailable; result not treated as missing');
 const response=await res.json();
 if(response?.success!==true||response.product?.sku!==sku||
    typeof response.product?.product_id!=='string'||!response.product.product_id.trim())
  throw Error('PrintShrimp product response is inconsistent');
 return {phase:'found',productId:response.product.product_id};
}

export async function inspectOriginalBlamePublication({
 uploads,etsyStore,client,request=fetch,env,lookupSupplier=supplierLookup
}){
 if(!uploads?.get||!etsyStore?.get||!client?.session||!client?.api||typeof env!=='function')
  throw Error('Authenticated seller and saved records required');
 const seller=await client.session();
 if(seller?.shop_id!==STREAK_RECOVERY_SHOP_ID||seller?.shop_name!=='SapiverPrints')
  throw Error('Unexpected Etsy seller identity; nothing changed');
 const id=STREAK_APPROVED_UPLOAD_IDS[0];
 if(!validId(id))throw Error('Invalid original Streak receipt ID');
 const asset=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 if(!asset||asset.type!=='physical'||asset.metadata?.sectionTitle!=='Streak')
  throw Error('Original The Blame upload record unavailable; no changes made');
 const productId=asset.productId||id;
 if(!validId(productId))throw Error('Original product mapping invalid');
 const product=await uploads.get(recordKey(productId),{type:'json',consistency:'strong'});
 if(!product||product.type!=='physical'||product.productId!==productId)
  throw Error('Saved The Blame product record missing or mismatched');
 const sku=asset.plan?.identity?.sku;
 if(typeof sku!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(sku))
  throw Error('Original approved SKU unavailable; no changes made');
 if(!asset.plan?.body?.title||asset.metadata?.etsyTitle!==asset.plan.body.title)
  throw Error('The Blame listing identity differs from approved review');
 if(!String(asset.plan.body.title).toLowerCase().includes('blame'))
  throw Error('Expected original The Blame title not found');
 const storedListingId=validPositive(asset.listingId)?asset.listingId:null;
 const matches=await findEtsySkuMatches({client,seller,sku});
 let directListing=null;
 if(storedListingId&&!matches.some(x=>x.listingId===storedListingId)){
  try{
   const result=await client.api('/listings/'+storedListingId);
   if(result?.shop_id!==seller.shop_id||result?.listing_id!==storedListingId)
    throw Error('Saved Etsy listing identity differs');
   directListing={listingId:result.listing_id,state:result.state||'unknown'};
  }catch(error){
   if(error?.etsyStatus!==404)throw Error('Saved Etsy listing ID cannot be verified; do not reupload');
  }
 }
 const supplier=await lookupSupplier({request,env,sku});
 const supplierRecord=await uploads.get('supplier/'+sku,{type:'json',consistency:'strong'});
 const draftLock=await etsyStore.get('draft/'+sku,{type:'json',consistency:'strong'});
 const missingEtsy=matches.length===0&&!directListing;
 const missingSupplier=supplier.phase==='not_found';
 const classification=!missingEtsy?'etsy_listing_exists':!missingSupplier?'supplier_only':
  'no_etsy_or_supplier_product_found';
 return {
  phase:'available',
  name:'The Blame',
  originalUploadId:id,
  originalSku:sku,
  local:{phase:asset.phase||null,stage:asset.stage||null,
   productPhase:product.phase||null,listingId:storedListingId,
   storedSupplierId:asset.supplierProductId||product.supplierProductId||null,
   pendingRevision:product.pendingRevision||null},
  etsy:{matches,directListing},
  supplier:{phase:supplier.phase,productId:supplier.productId},
  locks:{draftPhase:draftLock?.phase||'absent',supplierPhase:supplierRecord?.phase||'absent'},
  classification,
  notice:classification==='etsy_listing_exists'?
   'An Etsy listing with this original SKU exists in at least one state. Reconcile its existing ID; never create a duplicate.':
   classification==='supplier_only'?
    'PrintShrimp contains the original SKU but Etsy listing was not found. Do not create another supplier product.':
    'No Etsy listing or PrintShrimp product with this SKU was found across searched states. Preserve the original record and locks until a one-off, owner-approved single-poster recovery is designed.'
 };
}
