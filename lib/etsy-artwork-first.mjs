// Seller-authorised artwork-first image migration. Existing image IDs, descriptions,
// prices, files, variation inventory and fulfilment details are never written.
import {listProducts} from './product-records.mjs';
import {inspectDigitalUpload} from './seller-kit.mjs';
import {cleanPosterFront,cleanDigitalFront,cleanTrioFront,imageHash} from './clean-listing-image.mjs';

export const LEAD_STATE='catalogue/artwork-first/state';
const SOURCE_PREFIX='catalogue/artwork-first/images/';
const positive=n=>Number.isSafeInteger(n)&&n>0;
const hash=v=>imageHash(Buffer.from(JSON.stringify(v)));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const idList=photos=>photos.slice().sort((a,b)=>a.rank-b.rank).map(x=>x.listing_image_id);
const read=(store,key)=>store.get(key,{type:'json',consistency:'strong'});

async function activeListings(client,shopId){
 const all=[];
 for(let offset=0;offset<1000;offset+=100){
  const page=await client.api('/shops/'+shopId+'/listings/active?'+new URLSearchParams({limit:'100',offset:String(offset)}));
  if(!Array.isArray(page.results)||page.results.length>100)throw Error('Active Etsy catalogue unavailable');
  for(const item of page.results){
   if(item.shop_id!==shopId||item.state!=='active'||!positive(item.listing_id)||all.some(x=>x.listing_id===item.listing_id))throw Error('Etsy catalogue changed during audit');
   all.push(item);
  }
  if(page.results.length<100)break;
  if(offset===900)throw Error('Etsy catalogue exceeds safe limit');
 }
 return all;
}
function photoSnapshot(result,listingId){
 const arr=result?.results;
 if(!Array.isArray(arr)||!arr.length||arr.length>20||arr.some(p=>p.listing_id!==listingId||!positive(p.listing_image_id)||!positive(p.rank))||new Set(arr.map(p=>p.listing_image_id)).size!==arr.length||new Set(arr.map(p=>p.rank)).size!==arr.length)throw Error('Listing photo ranks require review');
 return arr.slice().sort((a,b)=>a.rank-b.rank);
}
async function createFront(uploads,record){
 if(!record||record.pendingRevision||!record.currentRevision||!/^[A-Za-z0-9_-]{32}$/.test(record.currentRevision))throw Error('Original image not linked to a completed product');
 const asset=await read(uploads,'uploads/'+record.currentRevision+'/state');
 if(asset?.phase!=='published'||asset.listingId!==record.etsyListingId||asset.productId&&asset.productId!==record.productId)throw Error('Saved artwork does not match this Etsy product');
 if(asset.type==='physical_bundle')return cleanTrioFront(uploads,asset.memberIds);
 if((asset.type||'physical')==='physical'){
  if(!asset.masterKey||!asset.image?.sha256)throw Error('Original poster unavailable');
  const data=await uploads.get(asset.masterKey,{type:'arrayBuffer',consistency:'strong'});
  if(!data||imageHash(Buffer.from(data))!==asset.image.sha256)throw Error('Original poster checksum mismatch');
  return cleanPosterFront(data);
 }
 if(asset.type==='digital'){
  if(!asset.archiveKey||!asset.sourceHash)throw Error('Original digital seller ZIP unavailable');
  const data=await uploads.get(asset.archiveKey,{type:'arrayBuffer',consistency:'strong'});
  if(!data||imageHash(Buffer.from(data))!==asset.sourceHash)throw Error('Digital seller ZIP checksum mismatch');
  const imported=await inspectDigitalUpload(Buffer.from(data));
  const front=await cleanDigitalFront(imported.inspection.files);
  if(!front)throw Error('No verified buyer artwork image in the original ZIP');
  return front;
 }
 throw Error('Unsupported Etsy product artwork');
}
export async function prepareArtworkFirstAudit({client,uploads,id,clock=()=>Date.now()}){
 if(!/^[A-Za-z0-9_-]{32}$/.test(id))throw Error('Invalid audit ID');
 const seller=await client.session();
 if(seller.shop_name!=='SapiverPrints'||!positive(seller.shop_id))throw Error('Wrong seller');
 const listings=await activeListings(client,seller.shop_id),products=await listProducts(uploads),byListing=new Map();
 for(const product of products){
  if(positive(product.etsyListingId)){
   if(byListing.has(product.etsyListingId)){byListing.set(product.etsyListingId,null);continue;}
   byListing.set(product.etsyListingId,product);
  }
 }
 const rows=[];
 for(const listing of listings){
  const row={id:listing.listing_id,title:String(listing.title||'').slice(0,140),type:listing.listing_type||listing.type||'unknown',status:'skipped'};
  try{
   if(!['physical','download'].includes(row.type))throw Error('Not a physical print or digital download');
   const photos=photoSnapshot(await client.api('/listings/'+row.id+'/images'),row.id);
   row.oldImageIds=idList(photos);
   const before=photos[0]?.url_570xN||photos[0]?.url_fullxfull;
   if(typeof before==='string'&&/^https:\/\/i\.etsystatic\.com\/[A-Za-z0-9_./%-]+(?:\?[A-Za-z0-9_=&%-]+)?$/.test(before))row.beforeUrl=before;
   const detail=await client.api('/listings/'+row.id);
   if(detail.shop_id!==seller.shop_id||detail.state!=='active'||detail.title!==listing.title||detail.listing_type!==row.type)throw Error('Listing changed during review');
   const currentLeadAlt=String(photos[0].alt_text||'');
   const previouslyPrepared=currentLeadAlt.startsWith('Sapiver artwork-first:');
   const record=byListing.get(row.id);
   // A v1 horizontal trio cover is cropped by Etsy's square shop thumbnails.
   // Only that verified old cover may be replaced in place, never a seller's photo.
   if(previouslyPrepared&&(!record||record.type!=='physical_bundle'||
     currentLeadAlt.startsWith('Sapiver artwork-first: trio-square-v2'))){
    row.status='already';rows.push(row);continue;
   }
   if(record?.etsyListingId!==row.id||record.type==='digital'&&row.type!=='download'||record.type!=='digital'&&row.type!=='physical')throw Error('No unambiguous original artwork in private storage');
   if(previouslyPrepared)row.replaceLeadId=photos[0].listing_image_id;
   if(photos.length>=20&&!row.replaceLeadId)throw Error('All twenty listing image positions are occupied');
   const front=await createFront(uploads,record);
   if(front.byteLength>10_000_000)throw Error('Preview image exceeds safe upload size');
   const key=SOURCE_PREFIX+id+'/'+row.id+'.jpg';
   await uploads.set(key,front);
   row.hash=imageHash(front);row.status='ready';row.sourceKey=key;
  }catch(error){row.reason=String(error?.message||'Artwork unavailable').slice(0,115);}
  rows.push(row);
 }
 const state={version:1,id,shopId:seller.shop_id,phase:'ready',createdAt:clock(),rows,activeIds:listings.map(x=>x.listing_id).sort((a,b)=>a-b)};
 state.approvalHash=hash({version:state.version,id:state.id,shopId:state.shopId,activeIds:state.activeIds,rows:state.rows});
 await uploads.setJSON(LEAD_STATE,state);
 return {phase:'ready',total:rows.length,ready:rows.filter(x=>x.status==='ready').length,skipped:rows.filter(x=>x.status==='skipped').length,already:rows.filter(x=>x.status==='already').length};
}

export async function applyArtworkFirstAudit({client,uploads,id,clock=()=>Date.now(),pause=wait}){
 const seller=await client.session(),state=await read(uploads,LEAD_STATE);
 if(seller.shop_name!=='SapiverPrints'||!positive(seller.shop_id)||state?.version!==1||state.shopId!==seller.shop_id||
   state.phase!=='apply_queued'||state.applyId!==id||!positive(state.createdAt)||clock()-state.createdAt>24*3600000)
  throw Error('Fresh owner-approved artwork-first audit required');
 const approvalHash=hash({version:state.version,id:state.id,shopId:state.shopId,activeIds:state.activeIds,rows:state.rows});
 if(state.approvalHash!==approvalHash)throw Error('Artwork preview manifest changed');
 const now=(await activeListings(client,seller.shop_id)).map(x=>x.listing_id).sort((a,b)=>a-b);
 if(JSON.stringify(now)!==JSON.stringify(state.activeIds))throw Error('Live Etsy inventory changed; review a fresh audit');
 const outcomes=[];
 const persist=async phase=>uploads.setJSON(LEAD_STATE,{...state,phase,results:outcomes.slice(),updatedAt:clock()});
 await persist('running');
 for(const row of state.rows){
  if(row.status!=='ready')continue;
  const progress={id:row.id,status:'needs_investigation'};
  outcomes.push(progress);
  try{
   const listing=await client.api('/listings/'+row.id);
   if(listing.shop_id!==seller.shop_id||listing.state!=='active'||listing.listing_type!==row.type||listing.title!==row.title)throw Error('Listing details changed');
   const old=photoSnapshot(await client.api('/listings/'+row.id+'/images'),row.id);
   if(JSON.stringify(idList(old))!==JSON.stringify(row.oldImageIds))throw Error('Image order changed since preview');
   if(row.replaceLeadId&&old[0]?.listing_image_id!==row.replaceLeadId)throw Error('Trio cover changed since approval');
   if(old.length>=20&&!row.replaceLeadId)throw Error('Photo gallery is already full');
   const jpeg=await uploads.get(row.sourceKey,{type:'arrayBuffer',consistency:'strong'});
   if(!jpeg||imageHash(Buffer.from(jpeg))!==row.hash)throw Error('Preview image checksum mismatch');
   const form=new FormData();
   form.set('image',new Blob([jpeg],{type:'image/jpeg'}),'sapiver-artwork-front-'+row.id+'.jpg');
   form.set('rank','1');
   form.set('overwrite',row.replaceLeadId?'true':'false');
   const altText=row.replaceLeadId?
    'Sapiver artwork-first: trio-square-v2 '+row.title+'. Three separate unframed prints, fully visible.':
    'Sapiver artwork-first: '+row.title+'. Full front view of '+(row.type==='download'?'the digital artwork':'the printed artwork')+' without frame, props or room scene.';
   form.set('alt_text',altText);
   const uploaded=await client.api('/shops/'+seller.shop_id+'/listings/'+row.id+'/images',{method:'POST',body:form});
   if(uploaded.listing_id!==row.id||!positive(uploaded.listing_image_id))throw Error('Etsy image upload response uncertain');
   progress.newImageId=uploaded.listing_image_id;
   await persist('running'); // Save the write receipt before any further Etsy call.
   for(let attempt=0;attempt<12;attempt++){
    const current=photoSnapshot(await client.api('/listings/'+row.id+'/images'),row.id);
    const replaced=row.replaceLeadId?
     current.length===old.length&&current[0].listing_image_id===uploaded.listing_image_id&&
      current[0].alt_text===altText&&
      old.slice(1).every(photo=>current.some(p=>p.listing_image_id===photo.listing_image_id)):
     current.length===old.length+1&&current[0].listing_image_id===uploaded.listing_image_id&&
      old.every(photo=>current.some(p=>p.listing_image_id===photo.listing_image_id));
    if(replaced){
     const after=await client.api('/listings/'+row.id);
     if(after.shop_id!==seller.shop_id||after.state!=='active'||after.listing_type!==row.type)throw Error('Listing state changed');
     progress.status='verified';break;
    }
    await pause(1250);
   }
   if(progress.status!=='verified')progress.reason='Etsy rank has not settled; inspect before any retry';
   if(row.replaceLeadId&&progress.status!=='verified')break; // Never repeat uncertain Etsy overwrites.
  }catch(error){
   progress.reason=String(error?.message||'Etsy image update uncertain').slice(0,110);
   await persist('running');
   if(row.replaceLeadId||[429,503].includes(Number(error?.etsyStatus)))break; // Stop after any uncertain replacement or rate limit.
  }
  await persist('running');
 }
 const ready=state.rows.filter(x=>x.status==='ready').length,verified=outcomes.filter(x=>x.status==='verified').length;
 const phase=verified===ready?'complete':'needs_investigation';
 await persist(phase);
 return {phase,total:state.rows.length,eligible:ready,verified,pending:ready-verified};
}
