import {randomBytes} from 'node:crypto';
import {seal} from './oauth.mjs';
import {SHRIMP_API} from './printshrimp-api.mjs';
const validId=id=>/^[A-Za-z0-9_-]{32}$/.test(id||'');
// Owner-authorised restart of the named unpublished attempt. Never deletes art,
// alters merchant records, approves a product, or purchases a print order.
export async function checkAndRestartProduct({origin,secret,apiKey,uploads,etsyStore,client,request=fetch,clock=()=>Date.now()}){
 try{
  const target=new URL(origin);if(target.protocol!=='https:'||target.origin!==origin||!apiKey)throw Error();
  const sku='SP-COAST-TO-COAST';
  const response=await request(SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku}),{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'x-api-key':apiKey,Accept:'application/json'}});
  if(response.status===401||response.status===403)return {phase:'supplier_key_rejected',archived:false};
  if(response.status===200)return {phase:'supplier_sku_exists',archived:false};
  if(response.status!==404)return {phase:'supplier_lookup_unavailable',archived:false};
  const owner=seal({csrf:randomBytes(18).toString('base64url'),expiry:clock()+60000},secret,'poster-owner');
  const page=await request(origin+'/poster/products',{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Cookie:'__Host-poster_owner='+owner,'Cache-Control':'no-store'}});
  if(page.status!==200)return {phase:'studio_unavailable',archived:false};
  const html=await page.text(),candidates=[];
  for(const article of html.match(/<article>[\s\S]*?<\/article>/g)||[]){
   const id=/href="\/poster\/upload\?id=([A-Za-z0-9_-]{32})"/.exec(article)?.[1];
   if(!validId(id))continue;
   const asset=await uploads.get('uploads/'+id+'/state',{type:'json',consistency:'strong'});
   if(asset?.type==='physical'&&(asset.plan?.identity?.sku||asset.metadata?.sku)===sku)candidates.push({id,asset});
  }
  candidates.sort((a,b)=>Number(b.asset.createdAt||0)-Number(a.asset.createdAt||0));
  if(!candidates.length)return {phase:'no_saved_attempt',supplierLookup:'not_found',archived:false};
  const {id,asset}=candidates[0],productId=asset.productId||id;
  if(!validId(productId)||asset.phase!=='ready_for_approval')return {phase:'attempt_not_idle',archived:false};
  const record=await uploads.get('products/'+productId+'/record',{type:'json',consistency:'strong'});
  if(asset.listingId||asset.supplierProductId||record?.etsyListingId||record?.supplierProductId||record?.currentRevision||record?.pendingRevision!==id||await etsyStore.get('draft/'+sku,{type:'json',consistency:'strong'})||await uploads.get('supplier/'+sku,{type:'json',consistency:'strong'}))return {phase:'retained_identifiers_require_review',archived:false};
  // Audit seller inventory before treating a restart as a fresh merchant product.
  const seller=await client.session();
  for(const state of ['active','inactive','sold_out','draft','removed','expired']){
   let offset=0;
   while(true){
    const page=await client.api('/shops/'+seller.shop_id+'/listings?'+new URLSearchParams({state,limit:'100',offset:String(offset)}));
    if(!Array.isArray(page.results)||!Number.isSafeInteger(page.count)||page.count<0||page.count>10000)throw Error();
    for(const listing of page.results){if(listing.shop_id!==seller.shop_id||!Array.isArray(listing.skus))throw Error();if(listing.skus.includes(sku))return {phase:'etsy_sku_exists',archived:false};}
    offset+=page.results.length;if(offset>=page.count)break;if(!page.results.length)throw Error();
   }
  }
  await uploads.setJSON('uploads/'+id+'/state',{...asset,phase:'cancelled',cancelledAt:clock(),updatedAt:clock(),cancelReason:'Owner requested a fresh upload; original retained'});
  await uploads.setJSON('products/'+productId+'/record',{...record,phase:'cancelled',pendingRevision:null,pendingPhase:null,lastError:null,updatedAt:clock()});
  await uploads.setJSON('products/'+productId+'/revisions/'+id,{id,phase:'cancelled',at:clock(),listingId:null});
  return {phase:'ready',supplierLookup:'not_found',archived:true,originalRetained:true};
 }catch{return {phase:'needs_investigation',archived:false};}
}
