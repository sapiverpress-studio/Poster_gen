import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {recoverFoxPublication} from '../lib/fox-publication-recovery.mjs';
import {classifyEtsyRejection} from '../lib/etsy-rejection.mjs';
import {templateDraftPlan,TEMPLATE_VERSION,etsyCompatibleSku,identityFromFilename} from '../lib/poster-template.mjs';
import {reference,inventory,shipping,processing,returns,carriers} from './fixtures/poster-template.mjs';
const SKU='SP-FOX-PRINT-WITH-ORIGINAL-WOODLAND-VERSE',L=4595277551,S=50893070,id='f'.repeat(32),stateKey='uploads/'+id+'/state';
const hash=b=>createHash('sha256').update(b).digest('hex');
function memory(){const map=new Map();return {map,get:async k=>map.get(k),setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&map.has(k))return {modified:false};map.set(k,structuredClone(v));return {modified:true};}};}
async function fixture(){
 const uploads=memory(),etsyStore=memory(),calls=[];let state='draft',mapped=null,photos=[],supplier=null;
 const plan=templateDraftPlan({filename:SKU+'.png',reference,inventory,shopId:456});
 // Emulate the actual approved legacy 41-character SKU; do not reapprove artwork.
 plan.identity.sku=SKU;plan.inventory.products=plan.inventory.products.map(p=>({...p,sku:SKU}));
 plan.identity.sectionTitle='Nature';plan.body.production_partner_ids='55';
 const previews=['one','two','three','four'].map(s=>Buffer.from(s));plan.identity.previewHashes=previews.map(hash);
 plan.hash=hash(JSON.stringify({version:plan.version,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 const master=Buffer.from('unchanged-master'),approvalHash=hash(hash(master)+':'+plan.hash+':'+TEMPLATE_VERSION);
 const previous='owner-authorised-fox-recovery-20261014-v1';
 const diagnostic={reason:'etsy_request_failed',httpStatus:400,validationReason:'sku_length_rejected'};
 const asset={productId:id,phase:'needs_investigation',stage:'etsy_draft',listingId:L,plan,approvedAt:1,approvalHash,image:{sha256:hash(master),bytes:master.length},masterKey:'uploads/'+id+'/master.png',recovery:{version:previous,step:'inventory',diagnostic}};
 await uploads.setJSON(stateKey,asset);uploads.map.set(asset.masterKey,master);previews.forEach((b,i)=>uploads.map.set('uploads/'+id+'/mockups/'+i+'.jpg',b));
 await uploads.setJSON('claims/'+id+'/publish',{approvalHash});await uploads.setJSON('products/'+id+'/record',{etsyListingId:L,pendingRevision:id});await etsyStore.setJSON('draft/'+SKU,{listingId:L,uploadId:id,phase:'inventory_pending'});
 await etsyStore.setJSON('products/'+id+'/revision/'+hash(previous).slice(0,32),{phase:'needs_investigation',listingId:L,step:'inventory',diagnostic});
 const client={session:async()=>({shop_id:S,shop_name:'SapiverPrints'}),api:async(path,o={})=>{
  calls.push([path,o.method||'GET']);
  if(path.endsWith('/sections'))return {results:[{title:'Nature',shop_section_id:55}]};
  if(path===`/listings/${L}?includes=Images`)return {...plan.body,listing_id:L,shop_id:S,listing_type:'physical',state,is_personalizable:false,tags:plan.body.tags.split(','),shop_section_id:55,images:photos,url:'https://www.etsy.com/listing/'+L};
  if(path===`/listings/${L}/inventory`){if(o.method==='PUT')mapped=JSON.parse(o.body);return mapped?{products:mapped.products.map(p=>({...p,offerings:p.offerings.map(v=>({...v,price:{amount:Math.round(v.price*100),divisor:100,currency_code:'GBP'}}))}))}:{products:[{sku:'',property_values:[]}]};}
  if(path.startsWith('/shops/'+S+'/listings?'))return {results:[{shop_id:S,listing_id:L,skus:['']}],count:1};
  if(path.includes('/shipping-profiles/'))return shipping;if(path.includes('/readiness-state-definitions/'))return {...processing,shop_id:S};if(path.includes('/policies/return/'))return {...returns,shop_id:S};if(path.startsWith('/shipping-carriers'))return carriers;
  if(path.endsWith('/production-partners'))return {results:[{partner_name:'PrintShrimp',location:'Romford',production_partner_id:55}]};
  if(path.endsWith('/images')&&o.method==='POST'){assert.equal(hash(Buffer.from(await o.body.get('image').arrayBuffer())),plan.identity.previewHashes[photos.length]);const image={listing_image_id:photos.length+1};photos.push(image);return image;}
  if(path===`/shops/${S}/listings/${L}`&&o.method==='PATCH'){assert.equal(photos.length,4);assert.ok(supplier);state='active';return {};}
  throw Error('Unexpected endpoint');
 }};
 const request=async(url,o)=>{calls.push(['supplier',o.method]);if(o.method==='POST'){assert.equal(state,'draft');assert.equal(photos.length,4);supplier={sku:etsyCompatibleSku(SKU),product_id:'supplier-one',variants:['A5','A4','A3'].map(size=>({size,image_url:'https://supplier.example.test/'+size}))};return Response.json({success:true});}return supplier?Response.json({success:true,product:supplier}):new Response(null,{status:404});};
 return {uploads,etsyStore,client,request,calls,env:n=>({POSTER_PUBLICATION_ENABLED:'true',SHRIMP_APIKEY:'test',CANVA_SITE_ORIGIN:'https://poster.example.test'}[n])};
}
test('recovery completes SAME draft through inventory photos supplier and activation; second call makes no writes',async()=>{
 const f=await fixture();const result=await recoverFoxPublication(f);assert.equal(result.phase,'published');assert.equal(result.listingId,L);
 assert.equal(f.calls.filter(([p,m])=>p==='supplier'&&m==='POST').length,1);
 assert.equal(f.calls.filter(([p,m])=>p.endsWith('/listings')&&m==='POST').length,0);
 const asset=await f.uploads.get(stateKey);assert.equal(asset.phase,'published');assert.equal(asset.supplierProductId,'supplier-one');
 assert.equal(asset.plan.identity.sku,SKU);assert.equal(asset.fulfilmentSku,etsyCompatibleSku(SKU));assert.ok(asset.fulfilmentSku.length<=32);
 assert.equal((await f.uploads.get('supplier/'+asset.fulfilmentSku)).productId,'supplier-one');
 assert.equal((await f.etsyStore.get('draft/'+asset.fulfilmentSku)).listingId,L);assert.ok([...f.uploads.map.values()].some(v=>v.revoked));
 f.calls.length=0;assert.equal((await recoverFoxPublication(f)).changed,false);assert.ok(f.calls.every(([,m])=>m==='GET'));
});
test('approval/master/shop/progress drift blocks all recovery writes',async()=>{
 for(const variant of ['approval','master','shop','images']){const f=await fixture();
  if(variant==='approval')await f.uploads.setJSON('claims/'+id+'/publish',{approvalHash:'bad'});
  if(variant==='master')f.uploads.map.set('uploads/'+id+'/master.png',Buffer.from('bad'));
  if(variant==='shop')f.client.session=async()=>({shop_id:999,shop_name:'SapiverPrints'});
  if(variant==='images'){const api=f.client.api;f.client.api=async(p,o)=>{const v=await api(p,o);return p.endsWith('?includes=Images')?{...v,images:[{listing_image_id:1}]}:v;};}
  await assert.rejects(recoverFoxPublication(f));assert.ok(f.calls.every(([,m])=>m==='GET'));
 }
});
test('inventory rejection stops supplier/photos, persists safe reason and cannot replay automatically',async()=>{
 const f=await fixture(),api=f.client.api;let attempts=0;
 f.client.api=async(p,o)=>{if(o?.method==='PUT'){attempts++;throw Object.assign(Error('Etsy request failed'),{etsyStatus:400,etsyOperation:'inventory',...classifyEtsyRejection('SKU must not exceed 32 characters. secret-token')});}return api(p,o);};
 const result=await recoverFoxPublication(f);assert.equal(result.step,'inventory');assert.equal(result.validationReason,'sku_length_rejected');assert.equal(attempts,1);
 assert.ok(f.calls.every(([,m])=>m==='GET'));assert.doesNotMatch(JSON.stringify([...f.uploads.map.values()]),/secret-token/);
 await assert.rejects(recoverFoxPublication(f),/failure evidence mismatch|already attempted/);assert.equal(attempts,1);
});
test('supplier timeout revokes master grant and cannot activate or replay',async()=>{
 const f=await fixture(),request=f.request;f.request=async(u,o)=>{if(o.method==='POST')throw Error('private-token');return request(u,o);};
 const result=await recoverFoxPublication(f);assert.equal(result.phase,'needs_investigation');assert.equal(result.step,'supplier');assert.ok([...f.uploads.map.values()].some(v=>v.revoked));assert.ok(f.calls.every(([,m])=>m!=='PATCH'));
 await assert.rejects(recoverFoxPublication(f),/failure evidence mismatch|progress requires inspection|already changed/);
});

test('long new poster filenames produce stable mapped SKUs; existing short codes unchanged',()=>{
 const legacy=identityFromFilename('SP-FOX-PRINT-WITH-ORIGINAL-WOODLAND-VERSE.png');
 assert.equal(legacy.sku,etsyCompatibleSku(SKU));assert.equal(legacy.sku.length,24);
 assert.equal(identityFromFilename('SP-COAST-TO-COAST.png').sku,'SP-COAST-TO-COAST');
 assert.notEqual(identityFromFilename('SP-FOX-PRINT-WITH-ORIGINAL-WOODLAND-VERSES.png').sku,legacy.sku);
});
test('v2 rescue is blocked without precise first-attempt failure proof or for mapped SKU collision',async()=>{
 for(const kind of ['missing_previous','wrong_reason','mapped_reserved']){
  const f=await fixture();
  if(kind==='missing_previous')f.etsyStore.map.delete('products/'+id+'/revision/'+hash('owner-authorised-fox-recovery-20261014-v1').slice(0,32));
  if(kind==='wrong_reason'){const asset=await f.uploads.get(stateKey);asset.recovery.diagnostic.validationReason='price_rejected';await f.uploads.setJSON(stateKey,asset);}
  if(kind==='mapped_reserved')await f.etsyStore.setJSON('draft/'+etsyCompatibleSku(SKU),{phase:'published'});
  await assert.rejects(recoverFoxPublication(f));assert.ok(f.calls.every(([,m])=>m==='GET'));
 }
});

test('future generic publication worker never executes completed fox one-off recovery',()=>{
 const source=readFileSync(new URL('../scripts/github-publication.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/await\s+recoverFoxPublication\s*\(/);
 assert.doesNotMatch(source,/await\s+auditFoxDraft\s*\(/);
});
