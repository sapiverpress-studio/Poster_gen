// Read-only discovery of the supplier endpoint shown in the owner's API docs.
// Never invoke bulk-list: it may publish listings and incur subscription usage.
export async function inspectSupplierTemplates({apiKey,request=fetch}){
 if(!apiKey)throw Error('Missing supplier key');
 const response=await request('https://api.printshrimp.com/functions/v1/api-get-templates',{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'x-api-key':apiKey,Accept:'application/json'}});
 if(!response.ok)return {phase:'unavailable',httpStatus:response.status};
 const data=await response.json();
 // Schema only: no provider strings, private URLs, account data or artwork.
 function shape(value,depth=0){
  if(depth>6)return 'depth_limit';
  if(value===null)return 'null';
  if(Array.isArray(value))return {type:'array',count:value.length,examples:value.slice(0,2).map(v=>shape(v,depth+1))};
  if(typeof value==='object')return Object.fromEntries(Object.keys(value).slice(0,60).map(k=>[k,shape(value[k],depth+1)]));
  return typeof value;
 }
 const templates=(Array.isArray(data.templates)?data.templates:[]).map(t=>({aSeries:t.ratio==='A',sizes:(t.sizes||[]).filter(v=>['A5','A4','A3'].includes(v)),scenes:Number(t.mockups?.scenes)||0,photos:Number(t.mockups?.photos)||0}));
 const draftsResponse=await request('https://api.printshrimp.com/functions/v1/api-bulk-list',{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'x-api-key':apiKey,Accept:'application/json'}});
 const draftSchema=draftsResponse.ok?shape(await draftsResponse.json()):null;
 return {phase:'available',httpStatus:response.status,schema:shape(data),templates,draftHttpStatus:draftsResponse.status,draftSchema};
}
