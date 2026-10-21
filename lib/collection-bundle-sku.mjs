// Stable internal SKU allocation. A new PrintShrimp bundle requires an explicit
// SKU; the studio derives one using supplier-verified components and original PNG hashes.
// Never trust client-supplied bundle SKUs or reuse individual product SKUs.
import {createHash} from 'node:crypto';
const SKU=/^[A-Za-z0-9_-]{1,100}$/;
export function deriveTrioSku({members,size}={}){
 if(!['A4','A5','A3'].includes(size)||!Array.isArray(members)||members.length!==3)throw Error('Exactly three verified print components required for bundle SKU');
 const pairs=members.map(x=>{
  if(!SKU.test(x?.sku||'')||!/^[a-f0-9]{64}$/.test(x?.sha256||''))throw Error('Verified component identity required for bundle SKU');
  return [x.sku.toUpperCase(),x.sha256];
 });
 if(new Set(pairs.map(x=>x[0])).size!==3||new Set(pairs.map(x=>x[1])).size!==3)throw Error('Three separate artwork products required for bundle SKU');
 pairs.sort((a,b)=>a[0].localeCompare(b[0]));
 const hex=createHash('sha256').update(JSON.stringify({version:1,size,components:pairs})).digest('hex').slice(0,24).toUpperCase();
 const sku='SP-TRIO-'+hex;
 if(pairs.some(x=>x[0]===sku))throw Error('Bundle SKU conflicts with an existing print');
 return sku;
}
