import test from 'node:test';import assert from 'node:assert/strict';
import sharp from 'sharp';import {createHash} from 'node:crypto';
import {ensureWoodlandSupplierOnly} from '../lib/woodland-supplier-only.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const ID='a'.repeat(32),MASTER='uploads/'+ID+'/master.png';
async function fixture({ingested=true,postStatus=201}={}){
 const png=await sharp({create:{width:3394,height:4800,channels:3,background:'#ddccbb'}}).png({compressionLevel:1}).toBuffer();
 const original=sha(png),sku='SP-WOOD-BADGER-'+original.slice(0,10).toUpperCase(),m=new Map();
 m.set(MASTER,png);m.set('uploads/'+ID+'/state',{source:'woodland_two_bundles_only',phase:'supplier_pending',
  listingId:null,supplierProductId:null,masterKey:MASTER,image:{sha256:original},
  plan:{identity:{sku}},metadata:{name:'Badger'}});
 let created=false,posts=0;
 const uploads={get:async key=>m.get(key)??null,
  set:async(key,v)=>{m.set(key,v);return {modified:true}},
  setJSON:async(key,v,o={})=>{if(o.onlyIfNew&&m.has(key))return {modified:false};m.set(key,v);return{modified:true}}};
 const request=async(url,opts={})=>{
  if(String(url).includes('api-get-product')){
   if(!created)return new Response(null,{status:404});
   return Response.json({success:true,product:{sku,product_id:'supplier-id-badger',
    variants:[{size:'A4',image_url:ingested?'https://cdn.printshrimp.com/images/badger.png':('https://'+'sapiver-poster-gen-auth'+'.netlify.app/poster/supplier-artwork.jpg?ticket=foo')},
     {size:'A5',image_url:'https://cdn.printshrimp.com/images/badger-a5.png'}]}});
  }
  if(String(url).includes('api-create-product')){
   posts++;assert.equal(opts.method,'POST');
   const payload=JSON.parse(opts.body);
   assert.equal(payload.sku,sku);assert.deepEqual(payload.variants.map(x=>x.size),['A4','A5']);
   assert.ok(payload.variants[0].image_url.includes('/poster/supplier-artwork.jpg?ticket='));
   created=true;return new Response('',{status:postStatus});
  }
  throw Error('Unexpected supplier URL');
 };
 const env=n=>({SHRIMP_APIKEY:'fixture-key',CANVA_SITE_ORIGIN:'https://'+'sapiver-poster-gen-auth'+'.netlify.app'})[n];
 return {m,uploads,request,env,sku,original,getPosts:()=>posts};
}
test('supplier-only workflow creates ONE A4/A5 product, preserves original PNG, and retains bounded source ticket',async()=>{
 const x=await fixture();const result=await ensureWoodlandSupplierOnly({memberId:ID,uploads:x.uploads,request:x.request,env:x.env,clock:()=>1000000});
 assert.equal(result.reused,false);assert.equal(result.sku,x.sku);assert.equal(x.getPosts(),1);
 assert.equal(x.m.get('uploads/'+ID+'/state').phase,'published');
 assert.equal(sha(x.m.get(MASTER)),x.original);
 const tickets=[...x.m.entries()].filter(([key])=>key.startsWith('transfers/'));assert.equal(tickets.length,1);
 assert.equal(tickets[0][1].revoked,false);assert.equal(tickets[0][1].expiresAt,1000000+900000);
 const jpeg=x.m.get('uploads/'+ID+'/supplier-master.jpg');const dimensions=await sharp(jpeg).metadata();
 assert.equal(dimensions.width,3394);assert.equal(dimensions.height,4800);
 await assert.rejects(ensureWoodlandSupplierOnly({memberId:ID,uploads:x.uploads,request:x.request,env:x.env}),/No approved supplier-only/);
 assert.equal(x.getPosts(),1);
});
test('supplier that retains an expiring website artwork URL is NOT considered verified; no duplicate API request',async()=>{
 const x=await fixture({ingested:false});
 await assert.rejects(ensureWoodlandSupplierOnly({memberId:ID,uploads:x.uploads,request:x.request,env:x.env}),/requires investigation/);
 assert.equal(x.getPosts(),1);
 assert.equal(x.m.get('supplier-only/'+x.sku).phase,'needs_investigation');
 assert.equal([...x.m.values()].filter(v=>v?.revoked===false).length,1);
 await assert.rejects(ensureWoodlandSupplierOnly({memberId:ID,uploads:x.uploads,request:x.request,env:x.env}),/needs investigation/);
 assert.equal(x.getPosts(),1);
});
