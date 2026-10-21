// Register an existing approved Woodland original at PrintShrimp without creating an Etsy single.
// A deterministic SKU and create-once claim prevent duplicate supplier registrations.
// Original lossless PNG remains untouched; bounded, same-resolution print JPEG is short-lived.
import sharp from 'sharp';
import {randomBytes,createHash} from 'node:crypto';
import {assetKey,hashBytes} from './uploaded-poster.mjs';
import {inspectPNG} from './print-check.mjs';
import {SHRIMP_API} from './printshrimp-api.mjs';
const BAD=s=>{throw Error(s);};
const ID=/^[A-Za-z0-9_-]{32}$/,SKU=/^[A-Za-z0-9_-]{1,100}$/;
const MAX_PUBLIC_BYTES=17_500_000,TTL=15*60_000;
export async function ensureWoodlandSupplierOnly({memberId,uploads,env,request=fetch,clock=()=>Date.now()}){
 if(!ID.test(memberId||''))BAD('Invalid Woodland supplier-only member');
 let member=await uploads.get(assetKey(memberId),{type:'json',consistency:'strong'});
 if(member?.source!=='woodland_two_bundles_only'||member.phase!=='supplier_pending'||
  member.listingId!==null||member.supplierProductId!==null||!SKU.test(member.plan?.identity?.sku||'')||
  !member.masterKey||!member.image?.sha256)BAD('No approved supplier-only Woodland master');
 const sku=member.plan.identity.sku,key='supplier-only/'+sku,apiKey=env('SHRIMP_APIKEY');
 if(!apiKey)BAD('PrintShrimp key unavailable');
 const lookup=async()=>{
  const r=await request(SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku}),{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),
   headers:{'x-api-key':apiKey,Accept:'application/json'}});
  if(r.status===404)return null;
  if(!r.ok)BAD('Supplier read-back unavailable');
  const value=await r.json(),p=value?.product;
  if(value?.success!==true||p?.sku!==sku||!p.product_id||
   !p.variants?.some(x=>x.size==='A4'&&typeof x.image_url==='string'&&x.image_url.startsWith('https://')))
   BAD('Supplier A4 product incomplete');
  return p;
 };
 const prior=await uploads.get(key,{type:'json',consistency:'strong'});
 if(prior){
  if(prior.phase!=='verified'||prior.sha256!==member.image.sha256||!prior.productId)
   BAD('Supplier-only SKU previously reserved; outcome needs investigation');
  const p=await lookup();
  if(!p||p.product_id!==prior.productId)BAD('Verified supplier-only product changed');
  member={...member,phase:'published',stage:'supplier_only_verified',supplierProductId:p.product_id};
  await uploads.setJSON(assetKey(memberId),member);
  return {sku,productId:p.product_id,reused:true};
 }
 if(await lookup())BAD('Supplier-only SKU collides with an existing untracked PrintShrimp product');
 const buffer=Buffer.from(await uploads.get(member.masterKey,{type:'arrayBuffer',consistency:'strong'}));
 if(buffer.length>50_000_000||hashBytes(buffer)!==member.image.sha256)BAD('Original Woodland PNG master has changed');
 const meta=inspectPNG(buffer);
 if(meta.width!==3394||meta.height!==4800||meta.sha256!==member.image.sha256)
  BAD('Only verified 3394×4800 original Woodland PNG is approved');
 let image=null;
 for(const quality of [98,96,94]){
  const b=await sharp(buffer).flatten({background:'#ffffff'}).jpeg({quality,mozjpeg:true}).toBuffer();
  const info=await sharp(b).metadata();
  if(info.width!==meta.width||info.height!==meta.height)BAD('Print master dimensions changed');
  if(b.length<=MAX_PUBLIC_BYTES){image=b;break;}
 }
 if(!image)BAD('Print master cannot be transferred safely within hosted response limit');
 const claimed=await uploads.setJSON(key,{phase:'creating',sha256:meta.sha256,memberId,at:clock()},{onlyIfNew:true});
 if(!claimed?.modified)BAD('Supplier registration already reserved; inspect before retry');
 const outKey='uploads/'+memberId+'/supplier-master.jpg';
 const token=randomBytes(32).toString('base64url'),ticket='transfers/'+token;
 const sha256=hashBytes(image);
 let posted=false;
 try{
  await uploads.set(outKey,image);
  await uploads.setJSON(ticket,{fileKey:outKey,sha256,bytes:image.length,expiresAt:clock()+TTL,revoked:false});
  const origin=env('CANVA_SITE_ORIGIN');
  if(new URL(origin).origin!==origin||!origin.startsWith('https://'))BAD('Supplier transfer origin unavailable');
  const url=origin+'/poster/supplier-artwork.jpg?'+new URLSearchParams({ticket:token});
  const result=await request(SHRIMP_API+'/api-create-product',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),
   headers:{'x-api-key':apiKey,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({name:member.metadata.name,sku,
    variants:[{size:'A4',image_url:url},{size:'A5',image_url:url}]})});
  posted=true;
  if(!result.ok)BAD('PrintShrimp product create not confirmed');
  const p=await lookup();
  if(!p)BAD('PrintShrimp product was not returned after creation');
  // Supplier must INGEST the artwork, not retain an expiring private file URL.
  const ownHost=new URL(origin).host;
  if(p.variants.filter(v=>v.size==='A4'||v.size==='A5').some(v=>{
   try{return new URL(v.image_url).host===ownHost;}catch{return true;}
  }))BAD('PrintShrimp artwork ingestion unverified; private URL expires safely');
  await uploads.setJSON(key,{phase:'verified',sku,productId:p.product_id,sha256:meta.sha256,
   supplierMasterSha256:sha256,memberId,createdAt:clock(),ordersVerified:false});
  member={...member,phase:'published',stage:'supplier_only_verified',supplierProductId:p.product_id};
  await uploads.setJSON(assetKey(memberId),member);
  return {sku,productId:p.product_id,reused:false};
 }catch{
  await uploads.setJSON(key,{phase:posted?'needs_investigation':'needs_investigation',
   sku,sha256:meta.sha256,memberId,checkedAt:clock()});
  throw Error('Supplier-only registration for '+member.metadata.name+' requires investigation; never auto-retry or create a second supplier SKU');
 }finally{
  // A supplier may fetch a signed source asynchronously after its POST
  // response. Keep it accessible for at most 15 minutes if the POST reached
  // PrintShrimp; the endpoint enforces expiry, owner authentication is never
  // exposed, and no retry of supplier creation is permitted.
  if(!posted)try{await uploads.setJSON(ticket,{revoked:true,expiresAt:0});}catch{}
 }
}
