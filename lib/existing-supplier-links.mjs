// Only existing bulk-uploaded educational prints, not new Sapiver uploader products.
// This is a catalogue reference, NOT an Etsy or PrintShrimp order-fulfilment change.
export const BULK_ETS_IDS=Object.freeze([4589703441,4589703919,4589703929,4589715100,4589715114]);
const allowed=new Set(BULK_ETS_IDS);
const validSupplierId=s=>typeof s==='string'&&s.length>0&&s.length<=128&&/^[A-Za-z0-9_-]+$/.test(s);
const validSku=s=>typeof s==='string'&&/^[A-Z0-9_-]{1,50}$/.test(s);
export const externalRecordKey=id=>'catalogue/external/'+id;
export async function linkExistingBulkProducts({uploads,audit,ids,clock=()=>Date.now()}){
 if(!audit||!Number.isSafeInteger(audit.shopId)||audit.shopId<=0||!Number.isFinite(audit.checkedAt)||audit.checkedAt>clock()+30000||clock()-audit.checkedAt>900000)throw Error('Fresh authenticated Etsy and PrintShrimp audit required');
 if(!Array.isArray(ids)||ids.length<1||ids.length>5||new Set(ids).size!==ids.length||ids.some(id=>!allowed.has(id)))throw Error('Only the five known bulk-uploaded listings may be linked');
 const chosen=ids.map(id=>audit.listings?.find(x=>x.id===id));
 if(chosen.some(x=>!x||x.state!=='active'||x.supplierMapping!=='not_verified'||x.supplierCheck!=='product_found'||!validSupplierId(x.supplierProductId)||!Array.isArray(x.sku)||x.sku.length!==1||!validSku(x.sku[0])))throw Error('Supplier evidence incomplete; do not guess an existing product mapping');
 // Validate all proposed links before storing any. Never infer an ID from a listing title.
 for(const row of chosen){
  const existing=await uploads.get(externalRecordKey(row.id),{type:'json',consistency:'strong'});
  if(existing&&(existing.shopId!==audit.shopId||existing.sku!==row.sku[0]||existing.supplierProductId!==row.supplierProductId))throw Error('Conflicting existing supplier reference; no records changed');
 }
 const linked=[];
 for(const row of chosen){
  const key=externalRecordKey(row.id);
  const record={shopId:audit.shopId,etsyListingId:row.id,sku:row.sku[0],supplierProductId:row.supplierProductId,source:'printshrimp_bulk',verifiedAt:audit.checkedAt,linkedAt:clock(),ordersVerified:false};
  const existing=await uploads.get(key,{type:'json',consistency:'strong'});
  if(!existing){
   const saved=await uploads.setJSON(key,record,{onlyIfNew:true});
   if(saved?.modified!==true)throw Error('Supplier reference was modified concurrently; review before repeating');
  }
  const read=await uploads.get(key,{type:'json',consistency:'strong'});
  if(read?.shopId!==record.shopId||read?.etsyListingId!==record.etsyListingId||read?.sku!==record.sku||read?.supplierProductId!==record.supplierProductId)throw Error('Supplier reference read-back failed; investigate before retry');
  linked.push({id:row.id,sku:record.sku,phase:existing?'already_linked':'linked'});
 }
 return {linked,ordersVerified:false};
}
