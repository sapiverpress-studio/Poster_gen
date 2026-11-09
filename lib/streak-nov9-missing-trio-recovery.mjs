// One-off, owner-approved recovery of the exact 2026-11-09 Streak trio.
// Creates ONE reviewable bundle record from THREE existing published products.
// No individual upload, new individual Etsy listing, supplier order or automatic
// trio approval is performed by this module.
import {hashBytes,assetKey} from './uploaded-poster.mjs';
import {listProducts,recordKey,recordRevision,newId,validId} from './product-records.mjs';
import {monthlyUploadStatus,reserveMonthlyUpload} from './monthly-upload-limit.mjs';
import {parseTrioDetails,makeFourListingPlan} from '../public/collection-trios.mjs';
import {deriveTrioSku} from './collection-bundle-sku.mjs';
import {verifiedTrioSectionId} from './streak-section-api.mjs';

export const STREAK_NOV9_SHOP_ID=50893070;
export const STREAK_NOV9_SOURCE=Object.freeze([
 {folder:'01_Huggles_Six_Minutes',name:'Huggles - Six Minutes',
  title:'Funny Hedgehog Wall Art Print - Six Minutes to Say Okay - Sarcastic Quote',
  sha256:'edd8901dc2467323e18e60ef2632b9146c7be52fb385922b290bf9e6c897708d'},
 {folder:'02_Insomnia_On_Strike',name:'Insomnia - On Strike',
  title:"Funny Sloth Wall Art Print - I'm Not Napping I'm on Strike - Office Humour",
  sha256:'9ae4053892781cecec8794e1f1ec28d19cb8fce98127145db9f12568d71e6904'},
 {folder:'03_Edge_So_Many_Opinions',name:'Edge - So Many Opinions',
  title:'Sarcastic Hedgehog Wall Art Print - So Many Opinions Funny Newspaper Quote',
  sha256:'edf8e746437d7cb86e5976aa35900d8dc37738ce7f8502136e66e064b020e619'}
]);
export const STREAK_NOV9_MANIFEST=`Title: Streak - Dry Humour Trio
Listing title: Funny Sarcastic Animal Wall Art Set of 3 A4 Prints - Hedgehog and Sloth
Section: Streak
Size: A4
Members: 01_Huggles_Six_Minutes, 02_Insomnia_On_Strike, 03_Edge_So_Many_Opinions
Tags: funny animal prints, sarcastic wall art, set of three prints, funny wall art set, hedgehog wall art, sloth wall art, dry humour decor, office wall art, funny quote prints, animal trio prints, home office decor, adult humour gift, streak characters
Finishes: Print Only, Black Frame, White Frame, Oak Frame

Description:
Three separate A4 physical Streak art prints featuring dry, grown-up animal humour, supplied together as one coordinated set. Huggles the Hedgehog delivers “Six minutes to say 'okay'. Impressive.” Insomnia the Sloth announces “I'm not napping. I'm on strike.” And Edge the Hedgehog observes “So many opinions. So little reading.” All three artworks are A4 portrait prints, ideal for a study, home office or humour-filled gallery wall. Choose Print Only for three unframed A4 prints or matching Black Frame, White Frame or Oak Frame for all three prints if offered at checkout. These are three separate prints, not a single combined image. Illustrations were produced with the aid of AI-assisted creative tools and curated and reviewed by Sapiver Prints.`;
const keyOptions={type:'json',consistency:'strong'};
const fail=message=>{throw Error(message);};
const memberKey=x=>Array.isArray(x)?[...x].sort().join('|'):'';
export function streakNov9Manifest(){return parseTrioDetails(STREAK_NOV9_MANIFEST,{filename:'Streak-2026-11-09/bundle-1.md'});}

// A full, no-write identity audit must succeed before the first reservation.
// The ZIP hashes and full listing titles are literal original owner inputs,
// not guesses based on similar published Streak listings.
export async function inspectStreakNov9Sources({uploads,client}){
 const seller=await client.session();
 if(seller?.shop_id!==STREAK_NOV9_SHOP_ID||seller?.shop_name!=='SapiverPrints')
  fail('Incorrect Etsy seller; no trio prepared');
 const records=await listProducts(uploads),sources=[];
 for(const spec of STREAK_NOV9_SOURCE){
  const candidates=[];
  for(const record of records){
   if(record?.type!=='physical'||record.phase!=='published'||record.pendingRevision||!validId(record.currentRevision))
    continue;
   const a=await uploads.get(assetKey(record.currentRevision),keyOptions);
   if(a?.image?.sha256!==spec.sha256)continue;
   if(a.phase!=='published'||a.type!=='physical'||a.productId!==record.productId||
      a.listingId!==record.etsyListingId||a.supplierProductId!==record.supplierProductId||
      !a.supplierProductId||!Number.isSafeInteger(a.listingId)||!a.plan?.identity?.sku||
      a.metadata?.name!==spec.name||a.metadata?.etsyTitle!==spec.title||
      a.metadata?.sectionTitle!=='Streak'||JSON.stringify(a.metadata?.printSizes)!=='["A5","A4"]')
    fail('Streak source artwork matches an inconsistent saved product record');
   candidates.push({id:record.currentRevision,asset:a,record,spec});
  }
  if(candidates.length!==1)fail('Expected exactly one published saved product for '+spec.name+'; found '+candidates.length);
  const c=candidates[0],l=await client.api('/listings/'+c.asset.listingId);
  if(l?.shop_id!==STREAK_NOV9_SHOP_ID||l?.state!=='active'||l?.listing_type!=='physical')
   fail('Streak source Etsy listing is not active: '+spec.name);
  sources.push({folder:spec.folder,id:c.id,sha256:spec.sha256,
   title:spec.name,listingTitle:spec.title,sectionTitle:'Streak',printSizes:['A5','A4'],
   sku:c.asset.plan.identity.sku,listingId:c.asset.listingId});
 }
 if(new Set(sources.map(x=>x.id)).size!==3||new Set(sources.map(x=>x.sku.toLowerCase())).size!==3)
  fail('Trio source posters are not three distinct verified products');
 const trio=streakNov9Manifest();
 const members=trio.members.map(folder=>sources.find(x=>x.folder===folder));
 if(members.some(x=>!x))fail('ZIP trio membership differs from the saved poster identities');
 const sku=deriveTrioSku({members:members.map(x=>({sku:x.sku,sha256:x.sha256})),size:trio.size});
 const inputs=[{title:trio.listingTitle,discount:15,sku}];
 const plan=makeFourListingPlan({items:sources,trios:[trio],inputs});
 // Never invent a second product when the original bundle may already have a
 // saved review, reserved supplier SKU or an uncertain Etsy listing.
 const keys=memberKey(sources.map(x=>x.id));
 for(const record of records){
  if(record?.type!=='physical_bundle')continue;
  const rev=record.currentRevision||record.pendingRevision;
  if(!validId(rev))fail('Unresolved saved trio record; inspect before reserving');
  const saved=await uploads.get(assetKey(rev),keyOptions);
  if(saved?.sku===sku||memberKey(saved?.memberIds)===keys||
     saved?.listingTitle===trio.listingTitle)
   fail('This Streak trio already has a saved bundle product; inspect its existing product ID');
 }
 const shopSections=await client.api('/shops/'+STREAK_NOV9_SHOP_ID+'/sections');
 const sectionId=verifiedTrioSectionId(shopSections);
 const source=sources.map(x=>({id:x.id,hash:x.sha256,folder:x.folder}));
 const signature=hashBytes(JSON.stringify({source,bundles:plan.bundleListings}));
 const collectionKey='collections/four/'+signature;
 const existing=await uploads.get(collectionKey,keyOptions);
 if(existing)fail('A matching Streak trio reservation already exists; inspect its retained bundle ID');
 return {sellerShopId:STREAK_NOV9_SHOP_ID,items:sources,trio,sku,inputs,plan,sectionId,
  signature,collectionKey,priorBundleCount:0};
}

export async function recoverStreakNov9Trio({
 uploads,client,clock=()=>Date.now(),
 prepare=async args=>(await import('./collection-bundle-publication.mjs')).prepareCollectionBundle(args),
 env,request=fetch
}){
 if(env?.('POSTER_PUBLICATION_ENABLED')!=='true')fail('Poster publication disabled; no recovery');
 const audit=await inspectStreakNov9Sources({uploads,client});
 const remaining=await monthlyUploadStatus({uploads,clock});
 if(remaining.remaining<1)fail('No monthly slot for the ONE missing Streak trio');
 const {trio,sku,plan,signature,collectionKey,items}=audit;
 const claimed=await uploads.setJSON(collectionKey,{
  phase:'reserving',ids:[],skus:[sku],signature,
  ownerApproved:'streak-2026-11-09-single-trio',at:clock()
 },{onlyIfNew:true});
 if(claimed?.modified!==true)fail('Streak trio reservation already claimed; never retry it');
 let id=null,asset=null;
 try{
  id=newId();
  const capacity=await reserveMonthlyUpload({uploads,productId:id,clock});
  if(!capacity.accepted)fail('Monthly slot unavailable after one-time claim');
  const refs=plan.bundleListings[0].memberFolders.map(folder=>{
   const x=items.find(m=>m.folder===folder);
   if(!x)fail('Cannot resolve verified member reference');
   return {id:x.id,sha256:x.sha256,sku:x.sku,listingId:x.listingId};
  });
  asset={type:'physical_bundle',phase:'preparing',stage:'waiting_for_review',
   productId:id,createdAt:clock(),publicationSlotAt:clock(),
   filename:'bundle-1.md',bytes:0,chunks:0,
   metadata:{name:trio.title,etsyTitle:trio.listingTitle,sectionTitle:'Trio Collection',kind:'artwork'},
   targetShopSectionTitle:'Trio Collection',trio:{...trio,number:1},
   discount:15,sku,listingTitle:trio.listingTitle,
   memberIds:refs.map(x=>x.id),memberRefs:refs,
   recoverySource:'streak-2026-11-09-missing-trio'};
  const saved=await uploads.setJSON(assetKey(id),asset,{onlyIfNew:true});
  if(saved?.modified!==true)fail('Bundle asset already exists; no duplicate creation');
  await recordRevision(uploads,id);
  await uploads.setJSON(collectionKey,{phase:'reserving',ids:[id],skus:[sku],signature,at:clock()});
  const prepared=await prepare({id,uploads,client,env,request,clock});
  if(prepared?.phase!=='ready_for_approval')fail('Bundle did not reach owner review');
  await uploads.setJSON(collectionKey,{phase:'ready',ids:[id],skus:[sku],signature,at:clock()});
  return {phase:'ready_for_approval',id,sku,existingIndividuals:3,newIndividuals:0,
   bundleListings:1,etsyListingsCreated:0,ordersCreated:0,reviewUrl:'/poster/upload?id='+id};
 }catch(error){
  await uploads.setJSON(collectionKey,{phase:'needs_investigation',ids:id?[id]:[],skus:[sku],signature,
   at:clock(),notice:'Retained Streak trio reservation requires inspection; never rerun blindly'});
  if(id&&asset){
   const old=await uploads.get(assetKey(id),keyOptions);
   if(old&&old.phase!=='ready_for_approval'){
    await uploads.setJSON(assetKey(id),{...old,phase:'needs_investigation',stage:'recovery_hold',
     failureCode:'Streak November trio preparation interrupted; inspect saved bundle'});
    await recordRevision(uploads,id);
   }
  }
  throw error;
 }
}
