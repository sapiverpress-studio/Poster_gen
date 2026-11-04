import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectOriginalBlamePublication,STREAK_AUDIT_KEY} from '../lib/streak-publishing-reconcile.mjs';
import {STREAK_APPROVED_UPLOAD_IDS} from '../lib/streak-trio-recovery.mjs';

function fixture({shopId=50893070,shopName='SapiverPrints',etsyState=null,
 supplierPhase='not_found',listingId=null,invalidPages=false,savedLock='creating'}={}){
 const id=STREAK_APPROVED_UPLOAD_IDS[0],sku='SP-STREAK-BLAME-TEST',title='Sarcastic Hedgehog Newspaper Print | The Blame';
 const map=new Map([
  ['uploads/'+id+'/state',{
   productId:id,phase:'publishing',stage:'queued',type:'physical',
   metadata:{sectionTitle:'Streak',etsyTitle:title,printSizes:['A5','A4']},
   listingId,
   plan:{identity:{sku},body:{title}},
  }],
  ['products/'+id+'/record',{productId:id,phase:'publishing',type:'physical'}],
  ['supplier/'+sku,{phase:'reserved'}]
 ]);
 const calls=[],sellerCalls=[],requests=[];
 const uploads={
  get:async key=>{calls.push({action:'GET',key});return map.get(key)||null;},
  setJSON:async()=>{throw Error('Unexpected upload mutation');}
 };
 const client={
  session:async()=>({shop_id:shopId,shop_name:shopName}),
  api:async path=>{
   sellerCalls.push(path);
   if(path.startsWith('/shops/')){
    if(invalidPages)return {count:1,results:[]};
    const state=new URL('https://example.invalid'+path).searchParams.get('state');
    const matches=etsyState===state?[{
     shop_id:shopId,listing_id:12345,skus:[sku],state,title
    }]:[];
    return {count:matches.length,results:matches};
   }
   if(path.startsWith('/listings/'))return {shop_id:shopId,listing_id:listingId,state:'active'};
   throw Error('Unexpected Etsy API path');
  }
 };
 const etsyStore={
  get:async key=>{calls.push({action:'GET',key});return savedLock?{phase:savedLock}:null;},
  setJSON:async()=>{throw Error('Unexpected private seller mutation');}
 };
 const env=()=> 'not-used-by-injected-lookup';
 const lookupSupplier=async ({sku:check})=>{
  requests.push(check);
  assert.equal(check,sku);
  return supplierPhase==='found'?{phase:'found',productId:'PS-123'}:
   {phase:'not_found',productId:null};
 };
 return {uploads,etsyStore,client,env,lookupSupplier,calls,sellerCalls,requests};
}
test('reports absent The Blame in all six Etsy states and absent supplier without any writes',async()=>{
 const f=fixture();
 const report=await inspectOriginalBlamePublication(f);
 assert.equal(report.phase,'available');
 assert.equal(report.classification,'no_etsy_or_supplier_product_found');
 assert.equal(report.local.phase,'publishing');
 assert.equal(report.locks.draftPhase,'creating');
 assert.equal(report.etsy.matches.length,0);
 assert.equal(report.supplier.phase,'not_found');
 assert.equal(f.sellerCalls.length,6);
 assert.ok(f.sellerCalls.every(x=>x.includes('?state=')));
 assert.ok(f.calls.every(x=>x.action==='GET'));
 assert.equal(f.requests.length,1);
 assert.equal(STREAK_AUDIT_KEY,'streak-publishing/status');
});
test('finds exact Etsy draft even though original uploader is still publishing',async()=>{
 const f=fixture({etsyState:'draft'});
 const r=await inspectOriginalBlamePublication(f);
 assert.equal(r.classification,'etsy_listing_exists');
 assert.deepEqual(r.etsy.matches.map(x=>({listingId:x.listingId,state:x.state})),[{listingId:12345,state:'draft'}]);
});
test('active Etsy listing cannot be mistaken for missing product',async()=>{
 const f=fixture({etsyState:'active',listingId:12345,supplierPhase:'found'});
 const r=await inspectOriginalBlamePublication(f);
 assert.equal(r.classification,'etsy_listing_exists');
 assert.equal(r.supplier.productId,'PS-123');
});
test('existing PrintShrimp product prevents naive duplicate supplier create',async()=>{
 const r=await inspectOriginalBlamePublication(fixture({supplierPhase:'found'}));
 assert.equal(r.classification,'supplier_only');
});
test('wrong authenticated shop, incomplete Etsy state scan, or unknown direct listing refuse classification',async()=>{
 await assert.rejects(inspectOriginalBlamePublication(fixture({shopId:12})),/seller identity/);
 await assert.rejects(inspectOriginalBlamePublication(fixture({invalidPages:true})),/pagination incomplete/);
 const f=fixture({listingId:70000});
 f.client.api=async path=>{
  if(path.startsWith('/shops/'))return {count:0,results:[]};
  throw Error('Etsy gateway timeout');
 };
 await assert.rejects(inspectOriginalBlamePublication(f),/cannot be verified/);
});
test('mobile diagnostic is a separate owner click and worker route, never a listing submission',()=>{
 const ui=readFileSync(new URL('../lib/product-web.mjs',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/streak-publication-audit.mjs',import.meta.url),'utf8');
 const handler=readFileSync(new URL('../lib/poster-upload-web.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../lib/github-publication.mjs',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../lib/github-bridge.mjs',import.meta.url),'utf8');
 assert.match(ui,/id="streak-check-original-blame"/);
 assert.match(app,/\/poster\/bulk\/streak-publication/);
 assert.match(handler,/dispatch\(id,'streak_audit'\)/);
 assert.match(worker,/inspectOriginalBlamePublication/);
 assert.match(bridge,/streak-publishing\\\/status/);
 assert.doesNotMatch(app,/\/poster\/uploads\/.*\/approve/);
});
