import {SHRIMP_API} from './printshrimp-api.mjs';
// Read-only supplier reconciliation. Never create products or enable customer orders.
const safeSku=s=>typeof s==='string'&&/^[A-Z0-9_-]{1,50}$/.test(s);
export async function checkLegacySupplier({listings,apiKey,request=fetch}){
 if(!Array.isArray(listings)||!apiKey||typeof apiKey!=='string')throw Error('Supplier audit unavailable');
 const missing=listings.filter(x=>x.supplierMapping==='not_verified'&&x.state==='active');
 if(missing.length>100)throw Error('Supplier audit exceeds safe limit');
 const result=[];
 for(let offset=0;offset<missing.length;offset+=3){
  const batch=missing.slice(offset,offset+3);
  const rows=await Promise.all(batch.map(async row=>{
   if(!Array.isArray(row.sku)||row.sku.length!==1||!safeSku(row.sku[0]))return {id:row.id,status:'sku_ambiguous'};
   const sku=row.sku[0];
   try{
    const res=await request(SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku}),{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'x-api-key':apiKey,Accept:'application/json'}});
    if(res.status===404)return {id:row.id,status:'not_found'};
    if(!res.ok)return {id:row.id,status:'lookup_unavailable'};
    const body=await res.json(),p=body?.product;
    if(body?.success!==true||p?.sku!==sku||typeof p.product_id!=='string'||!p.product_id||!Array.isArray(p.variants))return {id:row.id,status:'response_mismatch'};
    const sizes=p.variants.map(v=>v?.size).sort().join('|');
    if(sizes!=='A3|A4|A5'||p.variants.some(v=>{try{const u=new URL(v.image_url);return u.protocol!=='https:'||Boolean(u.username)||Boolean(u.password);}catch{return true;}}))return {id:row.id,status:'supplier_incomplete'};
    return {id:row.id,status:'product_found',supplierProductId:p.product_id,sku};
   }catch{return {id:row.id,status:'lookup_unavailable'};}
  }));
  result.push(...rows);
 }
 return listings.map(row=>{
  const match=result.find(x=>x.id===row.id);
  return match?{...row,supplierCheck:match.status,...(match.status==='product_found'?{supplierProductId:match.supplierProductId}:{})}:row;
 });
}
