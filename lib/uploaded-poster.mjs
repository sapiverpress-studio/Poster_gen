import {createHash,randomBytes} from 'node:crypto';
import {inspectPNG} from './print-check.mjs';
import {templateDraftPlan,verifyTemplateProfiles,verifyTemplateInventory,verifyTemplateCarrier,verifyTemplateListing,SIZES,TEMPLATE_VERSION} from './poster-template.mjs';
import {makePosterMockups} from './poster-mockups.mjs';
import {SHRIMP_API,MAX_SUPPLIER_BYTES,TRANSFER_TTL,supplierPayload} from './printshrimp-api.mjs';
export const UPLOAD_STORE='sapiver-poster-uploads';
export const CHUNK_BYTES=2_000_000;
export const assetKey=id=>'uploads/'+id+'/state';
export const hashBytes=bytes=>createHash('sha256').update(bytes instanceof ArrayBuffer?Buffer.from(bytes):bytes).digest('hex');
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{32}$/.test(id);
export async function prepareUploadedPoster({id,uploads,client,mockups=makePosterMockups}) {
 if(!validId(id))throw Error('Invalid upload');
 const asset=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 if(asset?.phase!=='preparing')throw Error('Upload is not ready for validation');
 const buffers=[];
 for(let i=0;i<asset.chunks;i++) {const data=await uploads.get('uploads/'+id+'/chunks/'+i,{type:'arrayBuffer',consistency:'strong'});if(!data)throw Error('Missing upload chunk');const b=Buffer.from(data),expected=Math.min(CHUNK_BYTES,asset.bytes-i*CHUNK_BYTES);if(b.length!==expected)throw Error('Upload chunk size mismatch');buffers.push(b);}
 const bytes=Buffer.concat(buffers);if(bytes.length!==asset.bytes||bytes.length>MAX_SUPPLIER_BYTES)throw Error('Upload length mismatch');
 const image=inspectPNG(bytes);if(image.width<3508||image.height<4961||image.width*image.height>100_000_000||Math.abs(image.height/image.width-Math.SQRT2)/Math.SQRT2>0.02)throw Error('PNG must match A-series and meet 300 PPI at A3');
 const seller=await client.session(),reference=await client.api('/listings/'+asset.referenceListingId),inventory=await client.api('/listings/'+asset.referenceListingId+'/inventory');
 const plan=templateDraftPlan({filename:asset.filename,reference,inventory,shopId:seller.shop_id});
 const shipping=await client.api('/shops/'+seller.shop_id+'/shipping-profiles/'+plan.body.shipping_profile_id),processing=await client.api('/shops/'+seller.shop_id+'/readiness-state-definitions/'+plan.body.readiness_state_id),returns=await client.api('/shops/'+seller.shop_id+'/policies/return/'+plan.body.return_policy_id);
 verifyTemplateProfiles(shipping,processing,returns,seller.shop_id);
 verifyTemplateCarrier(shipping,await client.api('/shipping-carriers?origin_country_iso=GB'));
 const partners=await client.api('/shops/'+seller.shop_id+'/production-partners');
 const partner=partners.results?.filter(p=>/^print\s*shrimp$/i.test(p.partner_name||'')&&/Romford/i.test(p.location||''));if(partner?.length!==1||!Number.isSafeInteger(partner[0].production_partner_id))throw Error('Verified Romford PrintShrimp production partner required');
 // Partner is part of the immutable listing preview and therefore approval hash.
 plan.body.production_partner_ids=String(partner[0].production_partner_id);plan.hash=hashBytes(JSON.stringify({version:plan.version,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 const pictures=await mockups(bytes);if(pictures.length!==3)throw Error('Three listing mockups required');
 const masterKey='uploads/'+id+'/master.png';await uploads.set(masterKey,bytes);
 for(let i=0;i<3;i++)await uploads.set('uploads/'+id+'/mockups/'+i+'.jpg',pictures[i]);
 const ready={...asset,phase:'ready_for_approval',image,masterKey,plan,approvalHash:hashBytes(image.sha256+':'+plan.hash+':'+TEMPLATE_VERSION)};
 await uploads.setJSON(assetKey(id),ready);
 for(let i=0;i<asset.chunks;i++){try{await uploads.delete('uploads/'+id+'/chunks/'+i);}catch{/* Temporary chunk cleanup may be retried separately; retain the validated master. */}}
 return {phase:ready.phase};
}
async function auditSku(client,seller,sku) {
 for(const state of ['active','inactive','sold_out','draft','removed','expired']){let offset=0;while(true){const page=await client.api('/shops/'+seller.shop_id+'/listings?'+new URLSearchParams({state,limit:'100',offset:String(offset)}));if(!Array.isArray(page.results)||!Number.isSafeInteger(page.count)||page.count<0||page.count>10000)throw Error('SKU audit incomplete');for(const l of page.results){if(l.shop_id!==seller.shop_id||!Array.isArray(l.skus))throw Error('SKU audit incomplete');if(l.skus.includes(sku))throw Error('Filename SKU is already used');}offset+=page.results.length;if(offset>=page.count)break;if(!page.results.length)throw Error('SKU audit incomplete');}}
}
export async function publishUploadedPoster({id,approvalHash,uploads,etsyStore,client,env,request=fetch,clock=()=>Date.now()}) {
 if(env('POSTER_PUBLICATION_ENABLED')!=='true')throw Error('Live publication is not enabled');
 if(!validId(id))throw Error('Invalid upload');
 let asset=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 if(asset?.phase!=='publishing'||asset.approvalHash!==approvalHash||asset.plan?.version!==TEMPLATE_VERSION)throw Error('Approval does not match uploaded artwork and template');
 const plan=asset.plan,sku=plan.identity.sku;
 const planHash=hashBytes(JSON.stringify({version:plan.version,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 if(planHash!==plan.hash||hashBytes(asset.image.sha256+':'+planHash+':'+TEMPLATE_VERSION)!==approvalHash)throw Error('Listing preview changed since approval');
 const bytes=Buffer.from(await uploads.get(asset.masterKey,{type:'arrayBuffer',consistency:'strong'}));
 if(hashBytes(bytes)!==asset.image.sha256)throw Error('Approved master changed');
 const seller=await client.session();
 // Re-read profiles immediately before merchant writes; never accept drift from review.
 verifyTemplateProfiles(await client.api('/shops/'+seller.shop_id+'/shipping-profiles/'+plan.body.shipping_profile_id),await client.api('/shops/'+seller.shop_id+'/readiness-state-definitions/'+plan.body.readiness_state_id),await client.api('/shops/'+seller.shop_id+'/policies/return/'+plan.body.return_policy_id),seller.shop_id);
 verifyTemplateCarrier(await client.api('/shops/'+seller.shop_id+'/shipping-profiles/'+plan.body.shipping_profile_id),await client.api('/shipping-carriers?origin_country_iso=GB'));
 await auditSku(client,seller,sku);
 const locked=await etsyStore.setJSON('draft/'+sku,{phase:'creating',uploadId:id,approvalHash,at:clock()},{onlyIfNew:true});if(locked?.modified!==true)throw Error('Product creation already reserved; inspect before retry');
 const save=async patch=>{asset={...asset,...patch};await uploads.setJSON(assetKey(id),asset);};
 const origin=env('CANVA_SITE_ORIGIN'),key=env('SHRIMP_APIKEY');if(!key)throw Error('Supplier key missing');
 const supplierHeaders={'x-api-key':key,Accept:'application/json'};
 const lookup=SHRIMP_API+'/api-get-product?'+new URLSearchParams({sku});
 const existing=await request(lookup,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:supplierHeaders});if(existing.status!==404)throw Error('Supplier SKU collision or lookup unavailable');
 const created=await client.api('/shops/'+seller.shop_id+'/listings',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(Object.entries(plan.body).map(([k,v])=>[k,String(v)])).toString()});
 if(created.shop_id!==seller.shop_id||created.state!=='draft'||!Number.isSafeInteger(created.listing_id)||created.listing_id<=0)throw Error('Draft response mismatch');
 const listingId=created.listing_id;await save({listingId,stage:'etsy_draft'});await etsyStore.setJSON('draft/'+sku,{phase:'inventory_pending',listingId,uploadId:id});
 await client.api('/listings/'+listingId+'/inventory',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan.inventory)});
 for(let i=0;i<3;i++){const image=await uploads.get('uploads/'+id+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'});if(!image)throw Error('Mockup missing');const form=new FormData();form.set('image',new Blob([image],{type:'image/jpeg'}),sku+'-mockup-'+(i+1)+'.jpg');form.set('rank',String(i+1));await client.api('/shops/'+seller.shop_id+'/listings/'+listingId+'/images',{method:'POST',body:form});}
 const draft=await client.api('/listings/'+listingId+'?includes=Images');if(draft.shop_id!==seller.shop_id||draft.state!=='draft'||draft.listing_type!=='physical'||draft.images?.length!==3)throw Error('Draft images or seller mismatch');verifyTemplateListing(draft,plan,{shopId:seller.shop_id,state:'draft'});verifyTemplateInventory(await client.api('/listings/'+listingId+'/inventory'),plan);
 const reserved=await uploads.setJSON('supplier/'+sku,{phase:'reserved',listingId,uploadId:id},{onlyIfNew:true});if(reserved?.modified!==true)throw Error('Supplier upload already reserved');
 const ticket=randomBytes(32).toString('base64url'),grantKey='transfers/'+ticket;
 await uploads.setJSON(grantKey,{fileKey:asset.masterKey,bytes:asset.image.bytes,sha256:asset.image.sha256,expiresAt:clock()+TRANSFER_TTL});
 const sourceUrl=origin+'/poster/artwork.png?'+new URLSearchParams({ticket});
 try{
  const r=await request(SHRIMP_API+'/api-create-product',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{...supplierHeaders,'Content-Type':'application/json'},body:JSON.stringify(supplierPayload(plan.identity.name,sku,sourceUrl))});if(!r.ok)throw Error('Supplier create unavailable');
  const lookupResult=await request(lookup,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:supplierHeaders});if(!lookupResult.ok)throw Error('Supplier read-back unavailable');const data=await lookupResult.json(),p=data.product;
  if(data.success!==true||p?.sku!==sku||typeof p.product_id!=='string'||p.variants?.map(v=>v.size).sort().join('|')!=='A3|A4|A5'||p.variants.some(v=>{try{const u=new URL(v.image_url);return u.protocol!=='https:'||u.origin===new URL(origin).origin;}catch{return true;}}))throw Error('Supplier did not persist three print sizes');
  await uploads.setJSON('supplier/'+sku,{phase:'verified',listingId,productId:p.product_id,uploadId:id,ordersEnabled:false});await save({stage:'supplier_verified',supplierProductId:p.product_id});
 }finally{await uploads.setJSON(grantKey,{revoked:true,expiresAt:0});}
 // The actual uploaded-file approval authorises this single state transition.
 const current=await client.api('/listings/'+listingId);if(current.state!=='draft'||current.shop_id!==seller.shop_id)throw Error('Draft changed before publication');verifyTemplateListing(current,plan,{shopId:seller.shop_id,state:'draft'});verifyTemplateInventory(await client.api('/listings/'+listingId+'/inventory'),plan);
 await save({stage:'publishing_etsy'});
 await client.api('/shops/'+seller.shop_id+'/listings/'+listingId,{method:'PATCH',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'state=active'});
 const active=await client.api('/listings/'+listingId);verifyTemplateListing(active,plan,{shopId:seller.shop_id,state:'active'});
 await save({phase:'published',stage:'complete',publishedAt:clock()});await etsyStore.setJSON('draft/'+sku,{phase:'published',listingId,uploadId:id});return {listingId,sku,phase:'published',ordersEnabled:false};
}
