// Queue only an explicitly approved original activity book. The receiving worker
// requires the exact matching claim and a verified published Etsy revision before exposure.
const REV=/^[A-Za-z0-9_-]{32}$/, HASH=/^[a-f0-9]{64}$/;
export function companionRequested(asset,fields){return asset.type==='digital'&&asset.sourceKind==='activity-book'&&asset.metadata?.kind==='activity-book'&&fields.get('publicCompanionApproved')==='yes';}
export async function queueCompanionRequest({uploads,id,asset,clock=Date.now}){
 if(!REV.test(id)||!HASH.test(asset.approvalHash||'')||!HASH.test(asset.sourceHash||'')||asset.plan?.sourceHash!==asset.sourceHash||asset.archiveKey!=='uploads/'+id+'/original.zip')throw Error('Exact book archive approval unavailable');
 const key='companion-requests/'+id,request={revision:id,approvalHash:asset.approvalHash,sourceHash:asset.sourceHash,requestedAt:clock()};
 await uploads.setJSON(key,request,{onlyIfNew:true});
 const prior=await uploads.get(key,{type:'json',consistency:'strong'});
 if(prior?.revision!==id||prior.approvalHash!==request.approvalHash||prior.sourceHash!==request.sourceHash)throw Error('Companion request differs from exact approval');
 return true;
}
