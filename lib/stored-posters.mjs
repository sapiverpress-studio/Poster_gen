import {assetKey,CHUNK_BYTES} from './uploaded-poster.mjs';
import {inspectPNG} from './print-check.mjs';
import {recordRevision,recordKey,validId} from './product-records.mjs';
import {monthlyUploadStatus,reserveMonthlyUpload,ukUploadMonth} from './monthly-upload-limit.mjs';

// Storage is local/private until the owner separately reviews and approves Etsy publication.
export async function finishStoredPoster({uploads,id,clock=()=>Date.now()}){
 if(!validId(id))throw Error('Invalid stored product');
 const a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 if(a?.type!=='physical'||a.phase!=='uploading'||a.storeOnly!==true)throw Error('Poster is not waiting for private storage');
 const claim=await uploads.setJSON('claims/'+id+'/store',{at:clock()},{onlyIfNew:true});
 if(claim?.modified!==true)throw Error('This poster was already submitted for private storage');
 const chunks=[];
 for(let i=0;i<a.chunks;i++){
  const part=await uploads.get('uploads/'+id+'/chunks/'+i,{type:'arrayBuffer',consistency:'strong'});
  const expected=Math.min(CHUNK_BYTES,a.bytes-i*CHUNK_BYTES);
  if(!part||part.byteLength!==expected)throw Error('Stored artwork is incomplete; inspect its upload before retrying');
  chunks.push(Buffer.from(part));
 }
 const bytes=Buffer.concat(chunks);
 if(bytes.length!==a.bytes||bytes.length>50_000_000)throw Error('Stored artwork is incomplete');
 const image=inspectPNG(bytes);
 if(image.width/(297/25.4)<270||image.height/(420/25.4)<270||image.width*image.height>100_000_000||Math.abs(image.height/image.width-Math.SQRT2)/Math.SQRT2>0.02)throw Error('PNG must match A-series and meet at least 270 PPI at A3');
 const masterKey='uploads/'+id+'/master.png';
 await uploads.set(masterKey,bytes,{onlyIfNew:true});
 const stored={...a,phase:'stored',stage:'stored_privately',masterKey,image:{width:image.width,height:image.height},updatedAt:clock()};
 await uploads.setJSON(assetKey(id),stored);
 await recordRevision(uploads,id);
 // The master is safely written and the stored product record updated before cleanup.
 for(let i=0;i<a.chunks;i++)try{await uploads.delete('uploads/'+id+'/chunks/'+i);}catch{}
 return {id,phase:'stored',storeOnly:true};
}
export async function prepareStoredPoster({uploads,id,dispatch,clock=()=>Date.now()}){
 if(!validId(id))throw Error('Invalid poster');
 const a=await uploads.get(assetKey(id),{type:'json',consistency:'strong'});
 const p=await uploads.get(recordKey(id),{type:'json',consistency:'strong'});
 if(a?.phase!=='stored'||a.type!=='physical'||a.productId!==id||a.storeOnly!==true||p?.etsyListingId||p?.phase!=='stored'||p.pendingRevision!==id||!a.masterKey||a.masterKey!=='uploads/'+id+'/master.png')throw Error('Only privately stored, never-listed posters can be prepared');
 const monthly=await monthlyUploadStatus({uploads,clock});
 if(monthly.blocked)return {phase:'stored',reason:'monthly_limit',remaining:0,month:monthly.month,limit:monthly.limit};
 const month=ukUploadMonth(clock());
 const claimed=await uploads.setJSON('claims/'+id+'/activate/'+month,{at:clock()},{onlyIfNew:true});
 if(claimed?.modified!==true)throw Error('Preparation was already requested. Review the existing record, not a second listing');
 const capacity=await reserveMonthlyUpload({uploads,productId:id,clock});
 if(!capacity.accepted)return {phase:'stored',reason:'monthly_limit',remaining:0,month:capacity.status.month,limit:capacity.status.limit};
 const next={...a,phase:'preparing',stage:'queued',publicationSlotAt:clock(),storeOnly:false,updatedAt:clock(),reuseMasterKey:a.masterKey,chunks:0};
 await uploads.setJSON(assetKey(id),next);await recordRevision(uploads,id);
 try{await dispatch(id,'prepare');}
 catch{
  await uploads.setJSON(assetKey(id),{...next,phase:'needs_investigation',stage:'dispatch_failed',failureCode:'Preparation dispatch uncertain; check the saved record before retrying.'});
  await recordRevision(uploads,id);
  throw Error('Could not confirm preparation. The monthly slot and saved artwork are retained; inspect status before retrying.');
 }
 return {id,phase:'preparing',remaining:capacity.status.remaining,month:capacity.status.month};
}
