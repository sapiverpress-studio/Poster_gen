// One-off, exact-ID, name-only PrintShrimp repair for Bicep Heart.
// Existing Etsy SKU mappings, print files, variants and bundle are immutable.
const TRIO_ID='smUUJvn3WAOdVkttbMGQTu4OHUVcVNLi';
const BASE='https://api.printshrimp.com/functions/v1';
const EXPECTED=[
  {index:0,hash:'b6f1454447bee2fc6349d79d8a3da58d84f38f8c261bd6d95430e474088736ab',skuPrefix:'SP-BICEP-HEART-TERRAC-',before:'Bicep Heart — Terracotta',after:'Bicep Heart — Plum'},
  {index:2,hash:'92482ba100a6f4fbcce78b0dff9bdec8b215ffef3e4005e59a8d560d5fbf51f3',skuPrefix:'SP-BICEP-HEART-PLUM-',before:'Bicep Heart — Plum',after:'Bicep Heart — Terracotta'}
];
function assert(ok,msg){if(!ok)throw Error(msg)}
function skuFrom(source){return source.skuPrefix+source.hash.slice(0,8).toUpperCase()}
function compare(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function variants(product){
 assert(Array.isArray(product?.variants)&&product.variants.length>=2,'Supplier variant inventory missing');
 const v=product.variants.map(x=>({
  id:x.variant_id||x.id,sku:x.sku,size:x.size,type:x.type,image_url:x.image_url
 })).sort((x,y)=>String(x.sku).localeCompare(String(y.sku)));
 assert(v.some(x=>x.size==='A4'&&/^https:\/\//.test(x.image_url||''))&&
        v.some(x=>x.size==='A5'&&/^https:\/\//.test(x.image_url||'')),'A4/A5 artwork unavailable');
 assert(v.every(x=>x.id&&x.sku&&x.size),'Supplier variant identity unavailable');
 return v;
}
async function vendor(request,apiKey,method,path,payload){
 assert(['GET','PUT'].includes(method)&&path.startsWith('/api-'),'Unexpected supplier operation');
 const url=BASE+path;
 const options={method,headers:{'x-api-key':apiKey,Accept:'application/json'},
  signal:AbortSignal.timeout(30000),redirect:'error'};
 if(payload){
  assert(method==='PUT'&&path==='/api-update-product'&&Object.keys(payload).sort().join(',')==='name,sku',
    'Only PrintShrimp product names may be updated');
  options.headers['Content-Type']='application/json';
  options.body=JSON.stringify(payload);
 }
 const response=await request(url,options);
 assert(response?.ok,'Supplier '+method+' read/update returned HTTP '+(response?.status||'unknown'));
 const x=await response.json();
 assert(x?.success===true,'Supplier '+method+' did not confirm success');
 return x;
}
function bundleShape(bundle){
 assert(bundle?.sku&&bundle?.bundle_id&&Array.isArray(bundle?.items),'Supplier bundle unavailable');
 return {id:bundle.bundle_id,sku:bundle.sku,total:bundle.total_prints,
  items:bundle.items.map(x=>({product_id:x.product_id,sku:x.sku,quantity:x.quantity||1,size:x.size||null}))
    .sort((a,b)=>a.sku.localeCompare(b.sku))};
}
export async function reconcileBicepPrintShrimpNames({uploads,apiKey,request=fetch,mode='audit',log=()=>{}}){
 assert(['audit','apply'].includes(mode),'Invalid mode');
 assert(typeof apiKey==='string'&&apiKey.length>8,'Supplier API key unavailable');
 const saved=await uploads.get('uploads/'+TRIO_ID+'/state',{type:'json',consistency:'strong'});
 assert(saved?.type==='physical_bundle'&&Array.isArray(saved.memberIds)&&
  saved.memberIds.length===3&&new Set(saved.memberIds).size===3&&
  Array.isArray(saved.memberRefs)&&saved.memberRefs.length===3&&
  typeof saved.sku==='string'&&saved.sku.startsWith('SP-TRIO-'),
  'Original Bicep Heart trio record changed');
 const sources=[];
 for(let i=0;i<3;i++){
  const ref=saved.memberRefs[i],member=await uploads.get('uploads/'+ref.id+'/state',{type:'json',consistency:'strong'});
  assert(saved.memberIds[i]===ref.id&&member?.type==='physical'&&
   member.phase==='published'&&member.supplierProductId&&member.plan?.identity?.sku===ref.sku&&
   member.image?.sha256===ref.sha256&&member.listingId===ref.listingId,
   'Original source artwork, SKU or supplier mapping changed');
  sources.push({ref,member});
 }
 const bundleResponse=await vendor(request,apiKey,'GET','/api-get-bundle?'+new URLSearchParams({sku:saved.sku}));
 const beforeBundle=bundleShape(bundleResponse.bundle);
 assert(beforeBundle.sku===saved.sku&&beforeBundle.total===3&&
  (!saved.supplierProductId||beforeBundle.id===saved.supplierProductId)&&beforeBundle.items.length===3&&
  sources.every(x=>beforeBundle.items.some(y=>y.sku===x.ref.sku&&
    y.product_id===x.member.supplierProductId&&y.quantity===1&&y.size==='A4')),
  'Original three-print bundle/SKUs/fixed sizes differ');
 const ready=[];
 for(const expected of EXPECTED){
  const {ref,member}=sources[expected.index],sku=skuFrom(expected);
  assert(ref.sha256===expected.hash&&ref.sku===sku,
    'Verified original art hash and immutable SKU mismatch');
  const res=await vendor(request,apiKey,'GET','/api-get-product?'+new URLSearchParams({sku}));
  const product=res.product;
  assert(product?.sku===sku&&product.product_id===member.supplierProductId,
    'Supplier product ID or SKU changed');
  assert([expected.before,expected.after].includes(product.name),
    'Unexpected supplier product name');
  ready.push({expected,sku,id:product.product_id,original:product.name,
   variantSignature:variants(product)});
 }
 log('BICEP_SUPPLIER_AUDIT '+JSON.stringify({
  skuAndArtworkVerified:true,bundleUnchanged:true,eligibleCount:ready.length,
  productNames:ready.map(x=>({colour:x.expected.after,currentlyCorrect:x.original===x.expected.after})),
  writes:0
 }));
 if(mode==='audit')return {status:'audited',updated:0,allCorrect:ready.every(x=>x.original===x.expected.after)};
 let updated=0;
 for(const x of ready){
  if(x.original!==x.expected.after){
   const res=await vendor(request,apiKey,'PUT','/api-update-product',
     {sku:x.sku,name:x.expected.after});
   assert(res.sku_updated===false&&res.product?.sku===x.sku&&
    res.product?.product_id===x.id&&res.product?.name===x.expected.after&&
    compare(variants(res.product),x.variantSignature),
    'Supplier rename response altered identity or variants');
   updated++;
  }
  const check=await vendor(request,apiKey,'GET','/api-get-product?'+new URLSearchParams({sku:x.sku}));
  assert(check.product?.product_id===x.id&&check.product?.sku===x.sku&&
    check.product?.name===x.expected.after&&compare(variants(check.product),x.variantSignature),
    'Supplier readback did not preserve product files/variants');
  log('BICEP_SUPPLIER_NAME_CONFIRMED '+JSON.stringify({newName:x.expected.after,skuPreserved:true,artworkPreserved:true}));
 }
 const afterBundle=bundleShape((await vendor(request,apiKey,'GET',
  '/api-get-bundle?'+new URLSearchParams({sku:saved.sku}))).bundle);
 assert(compare(afterBundle,beforeBundle),'Supplier trio bundle identity or components changed');
 log('BICEP_SUPPLIER_RENAME_COMPLETE '+JSON.stringify({updated,verified:2,skuWrites:0,variantWrites:0,bundleWrites:0}));
 return {status:'renamed',updated,allCorrect:true};
}
