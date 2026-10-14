import {downloadVideo} from './processed-listing-video.mjs';
import {createHash} from 'node:crypto';
import {makeListingVideo,inspectVideoPlayback} from './listing-video.mjs';
import {recordKey,recordRevision,validId} from './product-records.mjs';
import {TEMPLATE_VERSION} from './poster-template.mjs';
const TARGETS={'SP-COAST-TO-COAST':{listingId:4594997083,oldVideoId:847691128,name:'coast-to-coast'},'SP-THIS-SEATS-TAKEN':{listingId:4595028274,oldVideoId:847714063,name:'this-seats-taken'}};
const hash=b=>createHash('sha256').update(b instanceof ArrayBuffer?Buffer.from(b):b).digest('hex');
const read=(s,k)=>s.get(k,{type:'json',consistency:'strong'});
const retain=l=>JSON.stringify(Object.fromEntries(['listing_id','shop_id','state','listing_type','title','description','price','quantity','tags','should_auto_renew','shipping_profile_id','readiness_state_id','return_policy_id','taxonomy_id','shop_section_id'].map(k=>[k,l[k]])));
export async function repairListingVideo({sku,client,uploads,etsyStore,videoMaker=makeListingVideo,inspect=inspectVideoPlayback,request=fetch}){
 const target=TARGETS[sku];if(!target)throw Error('Video repair target not authorised');const {listingId,oldVideoId,name}=target,id=createHash('sha256').update(sku+':clean-cut-video-v1').digest('hex').slice(0,32);
 const completed=await read(uploads,'uploads/'+id+'/state');if(completed?.videoRepair?.phase==='verified')return {phase:'verified',listingId,videoId:completed.videoRepair.videoId,changed:false};
 const seller=await client.session();if(seller.shop_name!=='SapiverPrints')throw Error('Wrong seller');
 const mapping=await read(etsyStore,'draft/'+sku);if(mapping?.listingId!==listingId||!validId(mapping.uploadId))throw Error('Wrong Poster mapping');
 const source=await read(uploads,'uploads/'+mapping.uploadId+'/state'),product=await read(uploads,recordKey(source?.productId||mapping.uploadId));
 if(source?.phase!=='published'||source.plan?.identity?.sku!==sku||product?.currentRevision!==mapping.uploadId||product.pendingRevision||product.etsyListingId!==listingId||!product.supplierProductId)throw Error('Poster revision changed');
 const base='/listings/'+listingId,before=await client.api(base),inventory=await client.api(base+'/inventory'),images=await client.api(base+'/images'),videos=await client.api(base+'/videos');
 if(before.shop_id!==seller.shop_id||before.state!=='active'||before.listing_type!=='physical'||inventory.products.some(p=>!p.is_deleted&&p.sku!==sku))throw Error('Poster identity changed');
 const active=videos.results?.filter(v=>v.video_state==='active');if(active?.length!==1||active[0].video_id!==oldVideoId)throw Error('Poster video changed');
 let oldPlayback;try{oldPlayback=await inspect(await downloadVideo(active[0],request));}catch{oldPlayback={decoded:false};}
 const pictures=[];for(let i=0;i<4;i++){const b=await uploads.get('uploads/'+mapping.uploadId+'/mockups/'+i+'.jpg',{type:'arrayBuffer',consistency:'strong'});if(!b||hash(b)!==source.plan.identity.previewHashes[i])throw Error('Approved Poster photo changed');pictures.push(Buffer.from(b));}
 const video=await videoMaker(pictures),localPlayback=await inspect(video);
 const claim=await uploads.setJSON('claims/'+id+'/publish',{purpose:'listing-video-playback-repair',oldVideoId,listingId},{onlyIfNew:true});if(claim?.modified!==true)throw Error('Video repair already claimed');
 let state={...source,productId:source.productId||mapping.uploadId,updateProductId:source.productId||mapping.uploadId,phase:'publishing',stage:'repairing_video',videoRepair:{phase:'uploading',oldVideoId,oldPlayback,localPlayback},approvedAt:Date.now()};
 await uploads.setJSON('uploads/'+id+'/state',state);await uploads.set('uploads/'+id+'/delivery/0',video);for(let i=0;i<4;i++)await uploads.set('uploads/'+id+'/mockups/'+i+'.jpg',pictures[i]);
 try{
  const form=new FormData();form.set('name',name+'-clean-scenes.mp4');form.set('video',new Blob([video],{type:'video/mp4'}),name+'-clean-scenes.mp4');
  const v=await client.api('/shops/'+seller.shop_id+'/listings/'+listingId+'/videos?is_multi_video=true',{method:'POST',body:form});if(!Number.isSafeInteger(v.video_id))throw Error('New video response invalid');state.videoRepair.videoId=v.video_id;await uploads.setJSON('uploads/'+id+'/state',state);
  let processed;for(let n=0;n<15;n++){const list=await client.api(base+'/videos');processed=list.results?.find(x=>x.video_id===v.video_id&&x.video_state==='active');if(processed)break;await new Promise(resolve=>setTimeout(resolve,2000));}if(!processed)throw Error('New video not active');
  const processedPlayback=await inspect(await downloadVideo(processed,request));
  if(retain(await client.api(base))!==retain(before)||JSON.stringify(await client.api(base+'/inventory'))!==JSON.stringify(inventory)||JSON.stringify(await client.api(base+'/images'))!==JSON.stringify(images))throw Error('Listing changed during video repair');
  // Retire only the old video after the new Etsy-processed file fully decodes.
  await client.api('/shops/'+seller.shop_id+'/listings/'+listingId+'/videos/'+oldVideoId,{method:'DELETE'});
  const final=await client.api(base+'/videos');if(final.results?.filter(x=>x.video_state==='active').length!==1||!final.results.some(x=>x.video_id===v.video_id&&x.video_state==='active'))throw Error('Final video association mismatch');
  const plan=structuredClone(source.plan);plan.identity.videoHash=hash(video);plan.hash=hash(JSON.stringify({version:plan.version,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
  state={...state,plan,approvalHash:hash(source.image.sha256+':'+plan.hash+':'+TEMPLATE_VERSION),phase:'published',stage:'complete',publishedAt:Date.now(),presentationRefresh:{...source.presentationRefresh,videoId:v.video_id},videoRepair:{...state.videoRepair,phase:'verified',processedPlayback}};
  await uploads.setJSON('uploads/'+id+'/state',state);await recordRevision(uploads,id);await etsyStore.setJSON('draft/'+sku,{...mapping,uploadId:id});
  return {phase:'verified',listingId,videoId:v.video_id,changed:true,oldPlayback,processedPlayback};
 }catch(error){await uploads.setJSON('uploads/'+id+'/state',{...state,phase:'needs_investigation',videoRepair:{...state.videoRepair,phase:'needs_investigation'}});throw error;}
}
