import {randomBytes} from 'node:crypto';
import {preparePrintShrimpHandoff,PRINT_PRODUCT} from './printshrimp-product.mjs';
import {inspectPNG} from './print-check.mjs';
export const SHRIMP_API='https://api.printshrimp.com/functions/v1';
export const MAX_SUPPLIER_BYTES=50_000_000; // Supplier says 50 MB, not 50 MiB.
export const TRANSFER_TTL=15*60*1000;
export function supplierPayload(name,sku,imageUrl) {
 if(typeof name!=='string'||!name||name.length>200)throw Error('Invalid product name');
 if(typeof sku!=='string'||!/^[A-Za-z0-9_-]{1,50}$/.test(sku))throw Error('Invalid SKU');
 const url=new URL(imageUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid master URL');
 return {name,sku,variants:['A5','A4','A3'].map(size=>({size,image_url:imageUrl}))};
}
function verifiedProduct(data,sku,sourceUrl) {
 const p=data?.product;if(data?.success!==true||!p||p.sku!==sku||typeof p.product_id!=='string')throw Error('Supplier response mismatch');
 const sizes=(p.variants||[]).map(v=>v.size).sort();
 if(sizes.join('|')!=='A3|A4|A5'||p.variants.some(v=>{try {const u=new URL(v.image_url);return u.protocol!=='https:'||u.origin===new URL(sourceUrl).origin;}catch{return true;}}))throw Error('Supplier variants not ready');
 return {productId:p.product_id,sku:p.sku,sizes:['A5','A4','A3']};
}
// Runs server-side after an Etsy draft and visual QA. Reads existing bytes; never exports Canva.
// Reserving one SKU before POST deliberately blocks retries after ambiguous provider responses.
export async function transferOneMaster({store,report,readMaster,verifyEtsyDraft,draftListingId,visualApproved,apiKey,origin,request=fetch,clock=()=>Date.now()}) {
 if(!visualApproved)throw Error('Visual master approval required');
 if(!Number.isSafeInteger(draftListingId)||draftListingId<=0)throw Error('Etsy draft required first');
 const draft=await verifyEtsyDraft(draftListingId);
 if(draft?.shop_name!=='SapiverPrints'||draft.state!=='draft'||draft.sharedSku!==PRINT_PRODUCT.sku||draft.sizes?.join('|')!=='A5|A4|A3')throw Error('Etsy draft mapping mismatch');
 const spec=preparePrintShrimpHandoff(report);
 const bytes=Buffer.from(await readMaster(spec.one_master.key));const actual=inspectPNG(bytes);
 if(actual.sha256!==spec.one_master.sha256||actual.bytes!==spec.one_master.bytes||actual.width!==3508||actual.height!==4961||actual.bytes>MAX_SUPPLIER_BYTES)throw Error('Master checksum, dimensions or supplier size limit failed');
 const site=new URL(origin);if(site.protocol!=='https:'||site.origin!==origin)throw Error('Invalid site origin');
 if(typeof apiKey!=='string'||!apiKey.trim())throw Error('Missing supplier key');
 const headers={'x-api-key':apiKey,Accept:'application/json'};
 const lookupUrl=SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku:PRINT_PRODUCT.sku});
 const lookup=await request(lookupUrl,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers});
 if(lookup.ok)throw Error('SKU already exists; inspect before changing it');
 if(lookup.status!==404)throw Error('Supplier lookup failed');
 const stateKey='supplier/'+PRINT_PRODUCT.sku;
 const reservation=await store.setJSON(stateKey,{phase:'reserved',draftListingId,sha256:actual.sha256,createdAt:clock()},{onlyIfNew:true});
 if(reservation?.modified!==true)throw Error('Transfer already reserved; investigate before retrying');
 const ticket=randomBytes(32).toString('base64url'),ticketKey='transfers/'+ticket;
 await store.setJSON(ticketKey,{fileKey:spec.one_master.key,bytes:actual.bytes,sha256:actual.sha256,expiresAt:clock()+TRANSFER_TTL});
 const imageUrl=origin+'/print/master.png?'+new URLSearchParams({ticket});
 let phase='uncertain';
 try {
  const payload=supplierPayload(PRINT_PRODUCT.title,PRINT_PRODUCT.sku,imageUrl);
  const created=await request(SHRIMP_API+'/api-create-product',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!created.ok)throw Error('Supplier create failed');
  const result=await request(lookupUrl,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers});
  if(!result.ok)throw Error('Supplier read-back failed');
  const verified=verifiedProduct(await result.json(),PRINT_PRODUCT.sku,imageUrl);phase='verified';
  await store.setJSON(stateKey,{phase,...verified,draftListingId,sha256:actual.sha256,verifiedAt:clock(),ordersEnabled:false});return {...verified,ordersEnabled:false};
 }catch {
  await store.setJSON(stateKey,{phase,draftListingId,sha256:actual.sha256,checkedAt:clock(),ordersEnabled:false});throw Error('Supplier outcome needs investigation; no automatic retry');
 }finally {
  // Revoke capability on both success and ambiguity; no lasting public artwork URL.
  await store.setJSON(ticketKey,{revoked:true,expiresAt:0});
 }
}
