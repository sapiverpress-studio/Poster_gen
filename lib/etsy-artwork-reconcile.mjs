// Read-only recovery of an interrupted Etsy artwork-first image batch.
// Never upload, delete, reorder or replace Etsy photos in this module.
import {LEAD_STATE} from './etsy-artwork-first.mjs';

const goodId=n=>Number.isSafeInteger(n)&&n>0;
const read=(store,key)=>store.get(key,{type:'json',consistency:'strong'});
const ids=images=>images.map(x=>x.listing_image_id);
function snapshot(result,listingId){
 const rows=result?.results;
 if(!Array.isArray(rows)||!rows.length||rows.length>20||
  rows.some(p=>p.listing_id!==listingId||!goodId(p.listing_image_id)||!goodId(p.rank))||
  new Set(rows.map(p=>p.listing_image_id)).size!==rows.length||
  new Set(rows.map(p=>p.rank)).size!==rows.length)throw Error('Etsy image order is incomplete or ambiguous');
 return [...rows].sort((a,b)=>a.rank-b.rank);
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function classify(row,photos,receipt){
 const before=row.oldImageIds,now=ids(photos),lead=photos[0],alt=String(lead.alt_text||'');
 if(!Array.isArray(before)||!before.length||before.some(x=>!goodId(x))||
    new Set(before).size!==before.length)throw Error('Original image identifiers unavailable');
 if(row.replaceLeadId&&before[0]!==row.replaceLeadId)throw Error('Original trio cover identifier inconsistent');
 const oldOther=row.replaceLeadId?before.slice(1):before;
 const expected=String(row.replaceLeadId?'Sapiver artwork-first: trio-square-v2 '+row.title:
  'Sapiver artwork-first: '+row.title);
 const changed=now[0]!==before[0]&&
    now.length===before.length+(row.replaceLeadId?0:1)&&
    oldOther.every(id=>now.includes(id))&&
    (!row.replaceLeadId||!now.includes(before[0]))&&
    now.filter(id=>!oldOther.includes(id)).length===1;
 if(changed&&alt.startsWith(expected)&&(!receipt?.newImageId||receipt.newImageId===now[0])){
  return {id:row.id,status:'confirmed',method:receipt?.newImageId?'receipt_and_gallery':'gallery_signature',newImageId:now[0]};
 }
 if(same(now,before)&&!receipt?.newImageId)return {id:row.id,status:'unchanged'};
 if(receipt?.newImageId&&now.includes(receipt.newImageId))
  throw Error('Uploaded image found but Etsy image order needs review');
 if(receipt?.newImageId)throw Error('Etsy upload receipt exists but image cannot be verified');
 throw Error('Etsy image gallery differs from the approved snapshot');
}
export async function reconcileArtworkFirstAudit({client,uploads,id,clock=()=>Date.now()}){
 if(!/^[A-Za-z0-9_-]{32}$/.test(id))throw Error('Invalid read-only reconciliation ID');
 const state=await read(uploads,LEAD_STATE);
 if(state?.phase!=='reconcile_queued'||state.reconcileId!==id||state.version!==1||
  !goodId(state.shopId)||!state.applyId||!Array.isArray(state.rows)||
  !Array.isArray(state.results)||!Number.isFinite(state.updatedAt)||
  clock()-state.updatedAt<60000)throw Error('Previous Etsy operation is not ready for reconciliation');
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||seller.shop_id!==state.shopId)throw Error('Wrong Etsy seller');
 const receipts=new Map();
 for(const receipt of state.results){
  if(!goodId(receipt?.id)||receipts.has(receipt.id))throw Error('Duplicate or invalid saved Etsy image receipts');
  receipts.set(receipt.id,receipt);
 }
 const eligible=state.rows.filter(row=>row.status==='ready');
 if(new Set(eligible.map(r=>r.id)).size!==eligible.length)throw Error('Duplicate listing ID in original audit');
 const reconciliation={phase:'running',checked:0,eligible:eligible.length,confirmed:0,unchanged:0,uncertain:0,results:[],startedAt:clock()};
 const persist=async()=>uploads.setJSON(LEAD_STATE,{...state,phase:'reconciling',reconciliation,updatedAt:clock()});
 await persist();
 for(const row of eligible){
  let outcome;
  try{
   const listing=await client.api('/listings/'+row.id);
   if(listing.shop_id!==seller.shop_id||listing.state!=='active'||listing.title!==row.title||
      listing.listing_type!==row.type)throw Error('Etsy listing identity changed');
   outcome=classify(row,snapshot(await client.api('/listings/'+row.id+'/images'),row.id),receipts.get(row.id));
  }catch(error){outcome={id:row.id,status:'uncertain',reason:String(error?.message||'Etsy state unclear').slice(0,115)};}
  reconciliation.results.push(outcome);
  reconciliation.checked++;
  if(outcome.status==='confirmed')reconciliation.confirmed++;
  else if(outcome.status==='unchanged')reconciliation.unchanged++;
  else reconciliation.uncertain++;
  // Record progress in the private owner state after each Etsy listing.
  await persist();
 }
 reconciliation.phase=reconciliation.uncertain?'needs_investigation':'reconciled';
 reconciliation.finishedAt=clock();
 await uploads.setJSON(LEAD_STATE,{...state,phase:reconciliation.phase,reconciliation,updatedAt:clock(),
  notice:reconciliation.uncertain?
    'Some Etsy photo galleries remain uncertain. They were not changed; inspect the reconciliation report before retrying.':
    'Previous batch reconciled against Etsy. You can now start a fresh, read-only trio image audit.'});
 return {phase:reconciliation.phase,confirmed:reconciliation.confirmed,unchanged:reconciliation.unchanged,uncertain:reconciliation.uncertain};
}
