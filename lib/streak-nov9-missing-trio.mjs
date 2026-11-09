// One-off recovery of the 2026-11-09 Streak upload. Exactly three already
// published singles -> one NEW, separate owner-reviewable bundle asset.
// No new individual Etsy listings, no Etsy or supplier merchant writes.
import {listProducts,recordRevision,newId,validId} from './product-records.mjs';
import {assetKey,hashBytes} from './uploaded-poster.mjs';
import {reserveMonthlyUpload,monthlyUploadStatus} from './monthly-upload-limit.mjs';
import {parseTrioDetails,makeFourListingPlan} from '../public/collection-trios.mjs';
import {deriveTrioSku} from './collection-bundle-sku.mjs';
import {prepareCollectionBundle} from './collection-bundle-publication.mjs';
import {getSupplierBundle} from './three-print-bundle.mjs';
import {verifiedTrioSectionId} from './streak-section-api.mjs';
import {exactHtmlEntityChanges} from './poster-template.mjs';

const SHOP=50893070;
const SOURCES=Object.freeze([
 {folder:'01_Huggles_Six_Minutes',sha256:'edd8901dc2467323e18e60ef2632b9146c7be52fb385922b290bf9e6c897708d',
  listingTitle:'Funny Hedgehog Wall Art Print - Six Minutes to Say Okay - Sarcastic Quote'},
 {folder:'02_Insomnia_On_Strike',sha256:'9ae4053892781cecec8794e1f1ec28d19cb8fce98127145db9f12568d71e6904',
  listingTitle:"Funny Sloth Wall Art Print - I'm Not Napping I'm on Strike - Office Humour"},
 {folder:'03_Edge_So_Many_Opinions',sha256:'edf8e746437d7cb86e5976aa35900d8dc37738ce7f8502136e66e064b020e619',
  listingTitle:'Sarcastic Hedgehog Wall Art Print - So Many Opinions Funny Newspaper Quote'}
]);
const BUNDLE_TEXT=String.raw`Title: Streak - Dry Humour Trio
Listing title: Funny Sarcastic Animal Wall Art Set of 3 A4 Prints - Hedgehog and Sloth
Section: Streak
Size: A4
Members: 01_Huggles_Six_Minutes, 02_Insomnia_On_Strike, 03_Edge_So_Many_Opinions
Tags: funny animal prints, sarcastic wall art, set of three prints, funny wall art set, hedgehog wall art, sloth wall art, dry humour decor, office wall art, funny quote prints, animal trio prints, home office decor, adult humour gift, streak characters
Finishes: Print Only, Black Frame, White Frame, Oak Frame

Description:
Three separate A4 physical Streak art prints featuring dry, grown-up animal humour, supplied together as one coordinated set. Huggles the Hedgehog delivers “Six minutes to say 'okay'. Impressive.” Insomnia the Sloth announces “I'm not napping. I'm on strike.” And Edge the Hedgehog observes “So many opinions. So little reading.” All three artworks are A4 portrait prints, ideal for a study, home office or humour-filled gallery wall. Choose Print Only for three unframed A4 prints or matching Black Frame, White Frame or Oak Frame for all three prints if offered at checkout. These are three separate prints, not a single combined image. Illustrations were produced with the aid of AI-assisted creative tools and curated and reviewed by Sapiver Prints.`;
const fail=message=>{throw Error(message);};
const validName=x=>typeof x==='string'&&x.length>0;
const read=x=>({type:'json',consistency:'strong'});
const root='collections/four/';
function sameTitle(a,b){
 return typeof a==='string'&&typeof b==='string'&&
  (a===b||exactHtmlEntityChanges(a,b).exact===true);
}
async function exactPublishedSources({uploads,client,records}){
 const seller=await client.session();
 if(seller?.shop_id!==SHOP||seller.shop_name!=='SapiverPrints')
  fail('Wrong authenticated Etsy seller; no Streak trio reserved');
 const items=[],members=[];
 for(const spec of SOURCES){
  const found=[];
  for(const p of records){
   if(p?.type!=='physical'||p.phase!=='published'||!validId(p.currentRevision))continue;
   const a=await uploads.get(assetKey(p.currentRevision),read());
   if(a?.image?.sha256===spec.sha256)found.push({p,a});
  }
  if(found.length!==1)fail('Exactly one previously published '+spec.folder+' artwork must match the uploaded ZIP. Found '+found.length);
  const {p,a}=found[0];
  if(p.currentRevision!==a.productId&&a.productId&&p.productId!==a.productId)
   fail('Streak product revision identity mismatch');
  if(a.phase!=='published'||a.type!=='physical'||!a.listingId||a.listingId!==p.etsyListingId||
   !validName(a.supplierProductId)||a.supplierProductId!==p.supplierProductId||
   a.metadata?.sectionTitle!=='Streak'||p.metadata?.sectionTitle!=='Streak'||
   a.metadata?.etsyTitle!==spec.listingTitle||
   JSON.stringify(a.metadata?.printSizes)!==JSON.stringify(['A5','A4'])||
   !validName(a.plan?.identity?.sku)||!a.masterKey)
   fail('Streak '+spec.folder+' is not the verified original active single with a supplier link');
  const live=await client.api('/listings/'+a.listingId);
  if(live?.listing_id!==a.listingId||live.shop_id!==SHOP||live.state!=='active'||
   live.listing_type!=='physical'||!sameTitle(a.plan?.body?.title,live.title))
   fail('Streak '+spec.folder+' Etsy listing is not the verified active original');
  items.push({folder:spec.folder,listingTitle:spec.listingTitle,sectionTitle:'Streak',
   printSizes:['A5','A4']});
  members.push({id:p.currentRevision,hash:spec.sha256,sha256:spec.sha256,
   folder:spec.folder,sku:a.plan.identity.sku,listingId:a.listingId});
 }
 if(new Set(members.map(x=>x.id)).size!==3||
  new Set(members.map(x=>x.sku.toLowerCase())).size!==3)
  fail('Streak trio sources repeat one Etsy product');
 return {items,members};
}
async function safeDuplicateCheck({uploads,records,client,sku,trio}){
 const matches=[];
 for(const p of records){
  if(p?.type!=='physical_bundle')continue;
  const id=p.pendingRevision||p.currentRevision;
  if(!validId(id))fail('Existing bundle has an unresolved upload record');
  const a=await uploads.get(assetKey(id),read());
  if(a?.sku===sku||a?.trio?.listingTitle===trio.listingTitle||
    a?.metadata?.name===trio.title)matches.push({id,phase:a?.phase,sku:a?.sku,listingId:a?.listingId});
 }
 if(matches.length>1)fail('More than one saved Streak trio bundle candidate; investigate existing products');
 if(matches.length===1)return {phase:'existing',id:matches[0].id,
  savedPhase:matches[0].phase,listingId:matches[0].listingId||null};
 // Check active and unpublished Etsy listings without guessing any external IDs.
 for(const state of ['active','draft','inactive']){
  for(let offset=0;offset<=1000;offset+=100){
   const res=await client.api('/shops/'+SHOP+'/listings?'+new URLSearchParams({state,limit:'100',offset:String(offset)}));
   if(!Array.isArray(res?.results)||res.results.length>100)
    fail('Etsy catalogue could not be checked for duplicate Streak trio listings');
   if(res.results.some(p=>p.shop_id===SHOP&&
    (sameTitle(trio.listingTitle,p.title)||p.skus?.includes?.(sku))))
    fail('An Etsy Streak trio listing may already exist. No duplicate bundle will be reserved.');
   if(res.results.length<100)break;
   if(offset===1000)fail('Etsy catalogue extends beyond the safe search range');
  }
 }
 return null;
}
export async function prepareMissingStreakNov9Trio({
 uploads,client,env,request=fetch,clock=()=>Date.now(),prepareBundle=prepareCollectionBundle
}){
 if(!uploads?.get||!uploads?.setJSON||!uploads?.list||!client?.session)
  fail('Authenticated existing product records required');
 const trio=parseTrioDetails(BUNDLE_TEXT,{filename:'bundle-1.md'});
 const records=await listProducts(uploads);
 const {items,members}=await exactPublishedSources({uploads,client,records});
 const sku=deriveTrioSku({members:members.map(x=>({sku:x.sku,sha256:x.sha256})),size:'A4'});
 const existing=await safeDuplicateCheck({uploads,records,client,sku,trio});
 if(existing)return existing;
 const sectionId=verifiedTrioSectionId(await client.api('/shops/'+SHOP+'/sections'));
 const input={sku,title:trio.listingTitle,discount:15};
 const plan=makeFourListingPlan({items,trios:[trio],inputs:[input]});
 const source=members.map(x=>({id:x.id,hash:x.hash,folder:x.folder}));
 const signature=hashBytes(JSON.stringify({source,bundles:plan.bundleListings}));
 const key=root+signature;
 const old=await uploads.get(key,read());
 if(old?.ids?.length)return {phase:'existing',id:old.ids[0],
  savedPhase:old.phase,sectionId};
 if(old)fail('Existing four-listing reservation is unfinished. Do not create another.');
 const status=await monthlyUploadStatus({uploads,clock});
 if(status.remaining<1)fail('No monthly slot for the fourth Streak trio listing; existing singles retained');
 // Idempotency includes the derived SKU, seller section, original PNG hashes
 // and current verified live member listings. No merchant operation below.
 const other=await getSupplierBundle({request,apiKey:env('SHRIMP_APIKEY'),sku});
 if(other)fail('PrintShrimp already has this trio SKU; reconcile before reserving another');
 const id=newId();
 const claim=await uploads.setJSON(key,{phase:'reserving',ids:[],skus:[sku],
  signature,at:clock(),source}, {onlyIfNew:true});
 if(claim?.modified!==true)fail('A trio recovery was already claimed; inspect the saved product list');
 let stage='monthly_slot';
 try{
  const capacity=await reserveMonthlyUpload({uploads,productId:id,clock});
  if(!capacity.accepted)fail('Monthly listing slot became unavailable');
  stage='save_original_bundle';
  const asset={type:'physical_bundle',phase:'preparing',stage:'waiting_for_review',
   productId:id,createdAt:clock(),publicationSlotAt:clock(),
   filename:'bundle-1.md',bytes:0,chunks:0,
   metadata:{name:trio.title,etsyTitle:input.title,sectionTitle:'Trio Collection',kind:'artwork'},
   targetShopSectionTitle:'Trio Collection',
   trio,discount:15,sku,listingTitle:input.title,
   memberIds:members.map(x=>x.id),
   memberRefs:members.map(x=>({id:x.id,sha256:x.sha256,sku:x.sku,listingId:x.listingId}))};
  const saved=await uploads.setJSON(assetKey(id),asset,{onlyIfNew:true});
  if(saved?.modified!==true)fail('Bundle upload record already exists');
  await recordRevision(uploads,id);
  await uploads.setJSON(key,{phase:'reserving',ids:[id],skus:[sku],signature,at:clock(),source});
  stage='review_preparation';
  const prep=await prepareBundle({id,uploads,client,env,request,clock});
  if(prep.phase!=='ready_for_approval')fail('Trio review was not prepared');
  await uploads.setJSON(key,{phase:'ready',ids:[id],skus:[sku],signature,at:clock(),source});
  return {phase:'ready_for_approval',id,listingId:null,sectionId,sku,sourceCount:3,
   newIndividualListings:0,createdEtsyListing:false,createdSupplierBundle:false,
   reviewUrl:'/poster/upload?id='+id};
 }catch(error){
  await uploads.setJSON(key,{phase:'needs_investigation',ids:[id],skus:[sku],
   signature,at:clock(),stage,source});
  const asset=await uploads.get(assetKey(id),read());
  if(asset?.phase==='preparing'){
   await uploads.setJSON(assetKey(id),{...asset,phase:'needs_investigation',
    stage, failureCode:'One-off Streak trio review preparation stopped safely',updatedAt:clock()});
   await recordRevision(uploads,id);
  }
  throw Error('Streak trio recovery stopped at '+stage+'; saved record retained, no duplicate allowed');
 }
}
