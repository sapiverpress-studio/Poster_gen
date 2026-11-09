// Safe in-place verification of the exact Streak trio Etsy draft created
// 2026-11-09. Never creates an Etsy listing, supplier bundle or an order.
import {createHash} from 'node:crypto';
import {inspectStreakTrioOriginalDraft} from './streak-trio-original-draft-audit.mjs';
import {getSupplierBundle,verifySupplierBundle} from './three-print-bundle.mjs';
import {recordRevision,recordKey} from './product-records.mjs';
const SHOP=50893070,LISTING=4613186929,ID='hzKirH1Ca7OCWmgxKxiAbB1OGeV-auFw';
const SKU='SP-TRIO-9661EA52B86E24784FC9A50D';
const digest=x=>createHash('sha256').update(x).digest('hex');
const fail=x=>{throw Error(x)};
const get={type:'json',consistency:'strong'};
const onceKey='products/'+ID+'/revision/'+digest('verify-existing-streak-20261109-trio').slice(0,32);
export function compatiblePartnerIds(approved,actual){
 // Etsy listing GET may omit this writable field. Never infer an ID; rely
 // on a separately verified exact shop production-partner registration.
 const x=String(approved??'').split(',').map(s=>s.trim()).filter(Boolean);
 if(x.length!==1||!/^\d+$/.test(x[0]))return false;
 if(actual===undefined||actual===null)return true;
 if(Array.isArray(actual))return actual.length===1&&String(actual[0])===x[0];
 return String(actual)===x[0];
}
export async function verifyExistingStreakTrio({
 uploads,etsyStore,client,env,request=fetch,clock=()=>Date.now()
}){
 if(env('POSTER_PUBLICATION_ENABLED')!=='true')fail('Poster publication disabled');
 const report=await inspectStreakTrioOriginalDraft({
  uploads,etsyStore,client,apiKey:env('SHRIMP_APIKEY'),request
 });
 if(report.listingId!==LISTING||report.etsyState!=='draft'||!report.planApproved||
    !report.imagesVerified||!report.sectionVerified||report.inventory.status!=='verified'||
    !report.supplierIdMatch||report.supplier!=='exists'||report.savedSupplierPhase!=='verified')
  fail('Original Streak trio supplier, inventory, section or images not verified');
 const differences=report.mismatches;
 if(differences.length!==2||
    !differences.some(x=>x.field==='description'&&x.result==='exact_html_entities')||
    !differences.some(x=>x.field==='production_partner_ids'&&x.result==='type_changed'))
  fail('Unexpected original Streak trio mismatch; no in-place verification');
 const a=await uploads.get('uploads/'+ID+'/state',get);
 const lock=await etsyStore.get('draft/'+SKU,get);
 const approval=await uploads.get('claims/'+ID+'/publish',get);
 const record=await uploads.get(recordKey(ID),get);
 if(a?.phase!=='needs_investigation'||a.stage!=='etsy_draft'||a.type!=='physical_bundle'||
    a.productId!==ID||a.listingId!==LISTING||a.sku!==SKU||a.plan?.sku!==SKU||
    lock?.listingId!==LISTING||lock.uploadId!==ID||
    !Number.isFinite(a.approvedAt)||approval?.approvalHash!==a.approvalHash||
    record?.pendingRevision!==ID||record?.etsyListingId!==LISTING||
    !Array.isArray(a.memberRefs)||a.memberRefs.length!==3||a.memberIds?.length!==3)
  fail('Original trio approval, lock, member IDs or saved product changed');
 const shop=await client.session();
 if(shop?.shop_id!==SHOP||shop.shop_name!=='SapiverPrints'||a.plan?.shopId!==SHOP)
  fail('Etsy seller identity changed');
 const p=await client.api('/listings/'+LISTING+'?includes=Images');
 if(p?.listing_id!==LISTING||p.shop_id!==SHOP||p.state!=='draft'||p.listing_type!=='physical'||
    !compatiblePartnerIds(a.plan.body.production_partner_ids,p.production_partner_ids))
  fail('Original Etsy listing or production partner differs');
 const partners=await client.api('/shops/'+SHOP+'/production-partners');
 const approvedPartner=String(a.plan.body.production_partner_ids);
 const partner=partners.results?.filter(x=>String(x.production_partner_id)===approvedPartner&&
  /^print\s*shrimp$/i.test(x.partner_name||'')&&/Romford/i.test(x.location||''));
 if(partner?.length!==1)fail('Approved PrintShrimp partner not verified for the shop');
 const ids=new Set(),skus=new Map();
 for(let i=0;i<a.memberRefs.length;i++){
  const ref=a.memberRefs[i];
  if(a.memberIds[i]!==ref.id||!/^[A-Za-z0-9_-]{32}$/.test(ref.id||'')||ids.has(ref.id))
   fail('Original trio member reference changed');
  ids.add(ref.id);
  const member=await uploads.get('uploads/'+ref.id+'/state',get);
  if(member?.phase!=='published'||member.plan?.identity?.sku!==ref.sku||
     member.image?.sha256!==ref.sha256||member.listingId!==ref.listingId||
     !member.supplierProductId||!member.metadata?.printSizes?.includes('A4'))
   fail('A source artwork, SKU or supplier product changed');
  const live=await client.api('/listings/'+ref.listingId);
  if(live.shop_id!==SHOP||live.state!=='active'||live.listing_type!=='physical')
   fail('A source individual Etsy listing is not active');
  skus.set(String(ref.sku).toLowerCase(),member.supplierProductId);
 }
 const bundle=await getSupplierBundle({request,apiKey:env('SHRIMP_APIKEY'),sku:SKU});
 if(!bundle)fail('Original PrintShrimp trio bundle missing');
 const verified=verifySupplierBundle(bundle,{
  sku:SKU,items:a.plan.sourceItems,productIds:skus
 });
 if(verified.bundleId!==a.supplierProductId)fail('Original PrintShrimp bundle ID differs');
 for(let i=0;i<4;i++){
  const bytes=await uploads.get('uploads/'+ID+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'});
  if(!bytes||digest(Buffer.from(bytes))!==a.plan.previewHashes?.[i])
   fail('Approved trio preview image has changed');
 }
 // No seller-side write is necessary: Etsy draft contents are verified as
 // equivalent to the exact owner-approved content. Claim prevents retries.
 const claim=await etsyStore.setJSON(onceKey,{
  phase:'reconciling',listingId:LISTING,sku:SKU,at:clock(),approvalHash:a.approvalHash
 },{onlyIfNew:true});
 if(claim?.modified!==true)fail('Trio verification already claimed; inspect saved record');
 try{
  await uploads.setJSON('uploads/'+ID+'/state',{
   ...a,phase:'draft_verified',stage:'etsy_draft_verified',failureAction:null,
   failureCode:null,updatedAt:clock(),verifiedAt:clock(),
   recovery:{reason:'exact_html_entity_description',listingId:LISTING,at:clock()}
  });
  await recordRevision(uploads,ID);
  await etsyStore.setJSON('draft/'+SKU,{phase:'verified',listingId:LISTING,uploadId:ID});
  await etsyStore.setJSON(onceKey,{phase:'complete',listingId:LISTING,at:clock()});
  return {phase:'draft_verified',listingId:LISTING,originalDraft:true,
   supplierBundleVerified:true,memberCount:3,imageCount:4,variants:4,
   newEtsyListings:0,ordersCreated:0,ordersEnabled:false,
   activated:false};
 }catch(error){
  await etsyStore.setJSON(onceKey,{phase:'needs_investigation',listingId:LISTING,at:clock()});
  throw error;
 }
}
