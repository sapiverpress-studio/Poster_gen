import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileBicepPrintShrimpNames} from '../lib/bicep-printshrimp-name-fix.mjs';
const trioId='smUUJvn3WAOdVkttbMGQTu4OHUVcVNLi';
const ids=['A','B','C'].map(c=>c.repeat(32));
const hashes=['b6f1454447bee2fc6349d79d8a3da58d84f38f8c261bd6d95430e474088736ab',
 '3d4e00b4'.padEnd(64,'0'),
 '92482ba100a6f4fbcce78b0dff9bdec8b215ffef3e4005e59a8d560d5fbf51f3'];
const skus=['SP-BICEP-HEART-TERRAC-B6F14544','SP-BICEP-HEART-TEAL-3D4E00B4','SP-BICEP-HEART-PLUM-92482BA1'];
const names=['Bicep Heart — Terracotta','Bicep Heart — Teal','Bicep Heart — Plum'];
const wanted=['Bicep Heart — Plum','Bicep Heart — Teal','Bicep Heart — Terracotta'];
function fixture({wrongHash=false,wrongProductId=false,wrongFile=false}={}){
 const blobs=new Map(),products=new Map(),requests=[],bundleSku='SP-TRIO-EXISTING';
 const refs=ids.map((id,i)=>({id,sku:skus[i],sha256:hashes[i],listingId:500+i}));
 blobs.set('uploads/'+trioId+'/state',{type:'physical_bundle',sku:bundleSku,memberIds:ids,memberRefs:refs,supplierProductId:'bundle-stable'});
 for(let i=0;i<3;i++){
  blobs.set('uploads/'+ids[i]+'/state',{type:'physical',phase:'published',listingId:500+i,
   supplierProductId:'supplier-'+i,plan:{identity:{sku:skus[i]}},image:{sha256:hashes[i]}});
  products.set(skus[i],{product_id:'supplier-'+i,sku:skus[i],name:names[i],
   variants:['A4','A5'].map(sz=>({variant_id:'v-'+i+'-'+sz,sku:skus[i]+'-'+sz,size:sz,
    type:'Print',image_url:'https://api.printshrimp.com/storage/'+i+'/'+sz+'.png'}))});
 }
 if(wrongHash)blobs.get('uploads/'+ids[0]+'/state').image.sha256='x'.repeat(64);
 if(wrongProductId)products.get(skus[0]).product_id='different';
 if(wrongFile)products.get(skus[0]).variants[0].image_url='';
 const bundle={bundle_id:'bundle-stable',sku:bundleSku,total_prints:3,
  items:skus.map((sku,i)=>({product_id:'supplier-'+i,sku,name:names[i],quantity:1,size:'A4'}))};
 async function request(url,opts){
  requests.push({method:opts.method,url,body:opts.body});
  if(url.endsWith('api-update-product')&&opts.method==='PUT'){
   const b=JSON.parse(opts.body);
   const p=products.get(b.sku);
   if(!p)return Response.json({error:'no product'},{status:404});
   if(Object.keys(b).sort().join(',')!=='name,sku')throw Error('Unexpected supplier fields');
   p.name=b.name;
   return Response.json({success:true,sku_updated:false,updated_variants:0,created_variants:0,product:structuredClone(p)});
  }
  const x=new URL(url);
  if(x.pathname.endsWith('api-get-product')){
   const p=products.get(x.searchParams.get('sku'));
   return p?Response.json({success:true,product:structuredClone(p)}):Response.json({error:'missing'},{status:404});
  }
  if(x.pathname.endsWith('api-get-bundle')){
   return Response.json({success:true,bundle:structuredClone(bundle)});
  }
  throw Error('Unexpected PrintShrimp endpoint');
 }
 return {blobs,products,bundle,requests,request,
  uploads:{get:async key=>blobs.get(key)||null}};
}
test('audits supplier original SKUs and saved A4/A5 without writing',async()=>{
 const f=fixture();const x=await reconcileBicepPrintShrimpNames({uploads:f.uploads,request:f.request,apiKey:'123456789',mode:'audit'});
 assert.equal(x.status,'audited');assert.equal(x.updated,0);
 assert.ok(f.requests.every(x=>x.method==='GET'));
 assert.deepEqual([...f.products.values()].map(p=>p.name),names);
});
test('renames only two products and leaves original SKU, artwork, variants and bundle untouched',async()=>{
 const f=fixture(),before=structuredClone([...f.products.values()]),bundle=structuredClone(f.bundle);
 const x=await reconcileBicepPrintShrimpNames({uploads:f.uploads,request:f.request,apiKey:'123456789',mode:'apply'});
 assert.deepEqual(x,{status:'renamed',updated:2,allCorrect:true});
 assert.deepEqual([...f.products.values()].map(p=>p.name),wanted);
 assert.deepEqual([...f.products.values()].map(p=>p.sku),before.map(p=>p.sku));
 for(let i=0;i<3;i++)assert.deepEqual([...f.products.values()][i].variants,before[i].variants);
 assert.deepEqual(f.bundle,bundle);
 assert.equal(f.requests.filter(x=>x.method==='PUT').length,2);
 assert.ok(f.requests.every(x=>['GET','PUT'].includes(x.method)));
 const repeat=await reconcileBicepPrintShrimpNames({uploads:f.uploads,request:f.request,apiKey:'123456789',mode:'apply'});
 assert.equal(repeat.updated,0);assert.equal(f.requests.filter(x=>x.method==='PUT').length,2);
});
test('fails closed before any write when source hash, supplier ID or artwork changed',async()=>{
 for(const opts of [{wrongHash:true},{wrongProductId:true},{wrongFile:true}]){
  const f=fixture(opts);
  await assert.rejects(reconcileBicepPrintShrimpNames({uploads:f.uploads,request:f.request,apiKey:'123456789',mode:'apply'}));
  assert.ok(f.requests.every(x=>x.method==='GET'));
 }
});
test('protects entire bundle if its SKU or components drift',async()=>{
 const f=fixture();f.bundle.items[0].size='A3';
 await assert.rejects(reconcileBicepPrintShrimpNames({uploads:f.uploads,request:f.request,apiKey:'123456789',mode:'apply'}),/Original three-print bundle/);
 assert.ok(f.requests.every(x=>x.method==='GET'));
});
