// Reconciles only the six previously approved Streak *local* publication
// receipts. There are NO Etsy POST/PATCH/PUT requests and NO PrintShrimp
// create/update/order requests. Never repeat an interrupted publish job.
import {STREAK_APPROVED_UPLOAD_IDS,STREAK_RECOVERY_SHOP_ID} from './streak-trio-recovery.mjs';
import {assetKey} from './uploaded-poster.mjs';
import {recordKey,recordRevision} from './product-records.mjs';
import {verifyTemplateListing,verifyTemplateInventory} from './poster-template.mjs';
import {SHRIMP_API} from './printshrimp-api.mjs';

export const STREAK_RECONCILE_KEY='streak-publishing/status';
const labels=['The Blame','Democracy','The Experts','Another Meeting','Comment Section','Historic Disaster'];
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{32}$/.test(v);
const validNumber=v=>Number.isSafeInteger(v)&&v>0;
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const validHttps=u=>{try{return new URL(u).protocol==='https:';}catch{return false;}};

async function lookupSupplier({sku,request,env}){
 const apiKey=env('SHRIMP_APIKEY');
 if(!apiKey)throw Error('PrintShrimp API key unavailable');
 const r=await request(SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku}),{
  method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),
  headers:{'x-api-key':apiKey,Accept:'application/json'}});
 if(!r.ok)throw Error(r.status===404?'Supplier SKU not found':'Supplier read-back unavailable');
 const result=await r.json(),p=result?.product;
 if(result?.success!==true||p?.sku!==sku||typeof p?.product_id!=='string'||!p.product_id.trim()||
   !Array.isArray(p.variants)||p.variants.map(x=>x.size).sort().join('|')!=='A4|A5'||
   p.variants.some(x=>!validHttps(x.image_url)))
  throw Error('PrintShrimp product identity, sizes or artwork URLs mismatch');
 return p.product_id;
}

export async function inspectOriginalStreakPublications({
 uploads,client,request=fetch,env,
 verifyListing=verifyTemplateListing,verifyInventory=verifyTemplateInventory,
 supplierLookup=lookupSupplier
}){
 if(!uploads?.get||!client?.session||typeof env!=='function')throw Error('Seller audit dependencies unavailable');
 const seller=await client.session();
 if(seller?.shop_id!==STREAK_RECOVERY_SHOP_ID||seller?.shop_name!=='SapiverPrints')
  throw Error('Wrong Etsy shop; no products were changed');
 const rows=[];
 for(let i=0;i<STREAK_APPROVED_UPLOAD_IDS.length;i++){
  const id=STREAK_APPROVED_UPLOAD_IDS[i],name=labels[i];
  let a=null,p=null;
  try{
   if(!validId(id))throw Error('Original upload ID invalid');
   a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
   if(!a||a.type!=='physical'||a.metadata?.sectionTitle!=='Streak')
    throw Error('Original Streak physical upload record unavailable');
   const productId=a.productId||id;
   if(!validId(productId))throw Error('Saved product ID invalid');
   p=await uploads.get(recordKey(productId),{type:'json',consistency:'strong'});
   if(!p||p.type!=='physical'||p.metadata?.sectionTitle!=='Streak')
    throw Error('Original saved product record unavailable');
   if(p.productId!==productId||p.currentRevision&&p.currentRevision!==id||
      p.pendingRevision&&p.pendingRevision!==id)
    throw Error('A different product revision is active; do not reconcile');
   if(!['publishing','published','needs_investigation'].includes(a.phase)||
      !['publishing','published','needs_investigation'].includes(p.phase))
    throw Error('Unexpected saved publication phase; do not reconcile');
   if(a.phase==='needs_investigation'&&a.failureAction&&a.failureAction!=='publish')
    throw Error('An unrelated failed action needs separate inspection');
   if(!validNumber(a.listingId)||p.etsyListingId&&p.etsyListingId!==a.listingId)
    throw Error('Exact original Etsy listing ID is missing or disagrees with saved product');
   if(!a.plan?.identity?.sku||!a.masterKey||a.masterKey!=='uploads/'+id+'/master.png'||!hex(a.image?.sha256))
    throw Error('Approved master, image hash or SKU not available');
   if(a.metadata?.etsyTitle!==a.plan?.body?.title||
      JSON.stringify(a.metadata?.printSizes)!==JSON.stringify(['A5','A4']))
    throw Error('Original Streak title or print sizes differ from approved plan');
   const listing=await client.api('/listings/'+a.listingId);
   if(listing?.shop_id!==seller.shop_id||listing?.state!=='active'||listing?.listing_type!=='physical'||
      listing?.shop_section_id!==61261270)
    throw Error('Exact original Etsy listing is not active in the Streak section');
   verifyListing(listing,a.plan,{shopId:seller.shop_id,state:'active'});
   const inventory=await client.api('/listings/'+a.listingId+'/inventory');
   verifyInventory(inventory,a.plan);
   const supplierId=await supplierLookup({sku:a.plan.identity.sku,request,env});
   if(a.supplierProductId&&a.supplierProductId!==supplierId||
      p.supplierProductId&&p.supplierProductId!==supplierId)
    throw Error('PrintShrimp ID conflicts with original saved product');
   rows.push({id,name,verified:true,phase:a.phase,listingId:a.listingId,supplierId,
    productId,asset:a,record:p});
  }catch(e){
   rows.push({id,name,verified:false,phase:a?.phase||'unknown',
    listingId:validNumber(a?.listingId)?a.listingId:null,
    reason:String(e?.message||'Read-back failed').slice(0,160)});
  }
 }
 return {phase:rows.every(x=>x.verified)?'verified':'needs_investigation',
  rows,verified:rows.filter(x=>x.verified).length,total:6};
}

// Seller AND supplier read-backs for all six must pass before the first
// locally saved record changes. The second half never sends a merchant write.
export async function reconcileOriginalStreakPublications(args){
 const audit=await inspectOriginalStreakPublications(args);
 const publicRows=audit.rows.map(({id,name,verified,phase,listingId,reason})=>
  ({id,name,verified,phase,listingId:listingId||null,...(reason?{reason}:{})}));
 if(audit.phase!=='verified')return {phase:'needs_investigation',verified:audit.verified,total:6,rows:publicRows,
  notice:'At least one original Etsy or supplier read-back failed. No local publication statuses changed; do not recreate products.'};
 const {uploads,clock=()=>Date.now()}=args;
 for(const r of audit.rows){
  const updated={...r.asset,phase:'published',stage:'complete',supplierProductId:r.supplierId,
   publishedAt:r.asset.publishedAt||clock(),updatedAt:clock(),reconciledAt:clock()};
  // Preserve exact old listing ID, SKU, image hash and all approval data.
  await uploads.setJSON(assetKey(r.id),updated);
  await recordRevision(uploads,r.id);
 }
 return {phase:'complete',verified:6,total:6,
  rows:publicRows.map(x=>({...x,phase:'published'})),
  notice:'All six originals verified active in Etsy and linked to existing PrintShrimp products. Only uploader status records were reconciled. No new Etsy, supplier or order writes.'};
}
