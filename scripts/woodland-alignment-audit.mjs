import {createHash} from 'node:crypto';
export async function auditAlignment({uploads,client,apiKey}){
 const base='https://api.printshrimp.com/functions/v1';
 async function get(path){const r=await fetch(base+path,{method:'GET',headers:{'x-api-key':apiKey,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Supplier GET HTTP '+r.status);return r.json();}
 const skus=['SP-WOOD-BADGER-3EBC29B76F','SP-BADGER-73C91495','SP-WOOD-RED-SQUIRREL-0F27360216','SP-RED-SQUIRREL-649E8590','SP-WOOD-ROE-DEER-17790EA57D','SP-ROE-DEER-08061999'];
 for(const sku of skus){
  const {product:p}=await get('/api-get-product?'+new URLSearchParams({sku}));const variants=[];
  for(const v of p.variants||[]){
   const u=new URL(v.image_url);const safe=u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname.endsWith('.supabase.co')||u.hostname==='api.printshrimp.com');
   let info={host:u.hostname,checked:false};
   if(safe){const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(30000)});info={host:u.hostname,status:r.status};if(r.ok){const b=Buffer.from(await r.arrayBuffer());if(b.length>50_000_000)throw Error('Image exceeds bound');info.bytes=b.length;info.sha256=createHash('sha256').update(b).digest('hex');}}
   variants.push({size:v.size,...info});
  }
  console.log('ARTWORK '+JSON.stringify({sku,id:p.product_id,variants}));
 }
 const seller=await client.session();
 for(const state of ['active','draft','inactive','sold_out','expired']){
  for(let offset=0;offset<1000;offset+=100){
   const data=await client.api('/shops/'+seller.shop_id+'/listings?'+new URLSearchParams({state,limit:'100',offset:String(offset)}));
   if(!Array.isArray(data.results))throw Error('Listing collection unavailable');
   for(const l of data.results.filter(l=>/woodland|badger|squirrel|roe deer|hedgehog|robin|fox/i.test(l.title||''))){
    const inv=await client.api('/listings/'+l.listing_id+'/inventory');
    console.log('ETSY '+JSON.stringify({id:l.listing_id,title:l.title,state:l.state,tags:l.tags,skus:inv.products?.filter(p=>!p.is_deleted).map(p=>({sku:p.sku,properties:p.property_values,offerings:p.offerings})),description:l.description}));
   }
   if(offset+data.results.length>=data.count||data.results.length<100)break;
   if(offset===900)throw Error('Listing audit bound exceeded');
  }
 }
 for await(const page of uploads.list({prefix:'products/',paginate:true})){
  for(const {key} of page.blobs){
   const r=await uploads.get(key,{type:'json'});
   if(!/woodland|badger|squirrel|roe deer|hedgehog|robin|fox/i.test(JSON.stringify(r?.metadata||{})))continue;
   const id=r.pendingRevision||r.currentRevision||r.previewId;
   const a=id?await uploads.get('uploads/'+id+'/state',{type:'json'}):null;
   console.log('STUDIO '+JSON.stringify({key,id,phase:a?.phase,listingId:a?.listingId,name:r.metadata?.name,sku:a?.sku||a?.plan?.identity?.sku,supplierProductId:a?.supplierProductId,members:a?.members,planKeys:Object.keys(a?.plan||{}),supplier:a?.supplier,componentRefs:a?.componentRefs}));
  }
 }
 console.log('ALIGNMENT_AUDIT_COMPLETE');
}
