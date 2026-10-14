import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAndRestartProduct} from '../lib/publication-activation-check.mjs';
import {unseal} from '../lib/oauth.mjs';
const id='a'.repeat(32),origin='https://poster.example.test',secret='fixture-owner-secret-long-enough',sku='SP-COAST-TO-COAST';
function fixture({supplierStatus=404,phase='ready_for_approval',merchantId=null,etsyCollision=false}={}){
 const data=new Map([['uploads/'+id+'/state',{type:'physical',phase,productId:id,createdAt:100,masterKey:'uploads/'+id+'/master.png',plan:{identity:{sku}},listingId:merchantId}],['products/'+id+'/record',{productId:id,pendingRevision:id,currentRevision:null}],['uploads/'+id+'/master.png',Buffer.from('private original')]]),writes=[],calls=[];
 const uploads={get:async k=>data.get(k),setJSON:async(k,v)=>{writes.push(k);data.set(k,v);}};
 const client={session:async()=>({shop_id:456}),api:async path=>{calls.push(path);return {count:etsyCollision?1:0,results:etsyCollision?[{shop_id:456,skus:[sku]}]:[]};}};
 const request=async(url,o)=>{calls.push(url);assert.equal(o.method,'GET');assert.equal(o.redirect,'error');if(url.startsWith('https://api.printshrimp.com/')){assert.equal(o.headers['x-api-key'],'private-supplier-key');return new Response('',{status:supplierStatus});}assert.equal(url,origin+'/poster/products');const owner=unseal(o.headers.Cookie.split('=')[1],secret,'poster-owner');assert.ok(owner.csrf);return new Response('<article><a href="/poster/upload?id='+id+'">Review</a></article>');};
 return {data,writes,calls,args:{origin,secret,apiKey:'private-supplier-key',uploads,etsyStore:{get:async()=>null},client,request,clock:()=>100000}};
}
test('approved restart checks merchant collisions, archives only idle unpublished attempt and retains original bytes',async()=>{
 const f=fixture();const result=await checkAndRestartProduct(f.args);assert.deepEqual(result,{phase:'ready',supplierLookup:'not_found',archived:true,originalRetained:true});
 assert.equal(f.data.get('uploads/'+id+'/state').phase,'cancelled');assert.equal(f.data.get('products/'+id+'/record').pendingRevision,null);assert.deepEqual(f.data.get('uploads/'+id+'/master.png'),Buffer.from('private original'));
 assert.equal(f.calls.filter(x=>x.startsWith('/shops/')).length,6);assert.equal(f.writes.length,3);assert.doesNotMatch(JSON.stringify(result),/private|master|token|Cookie/);
});
test('supplier rejection, an existing supplier SKU, Etsy collision, active job or retained IDs prevent reset',async()=>{
 for(const [options,expected] of [[{supplierStatus:401},'supplier_key_rejected'],[{supplierStatus:403},'supplier_key_rejected'],[{supplierStatus:200},'supplier_sku_exists'],[{supplierStatus:503},'supplier_lookup_unavailable'],[{merchantId:123},'retained_identifiers_require_review'],[{phase:'preparing'},'attempt_not_idle'],[{etsyCollision:true},'etsy_sku_exists']]){
  const f=fixture(options);assert.equal((await checkAndRestartProduct(f.args)).phase,expected);assert.equal(f.writes.length,0);assert.equal(f.data.get('products/'+id+'/record').pendingRevision,id);
 }
});
test('provider failures and invalid origins expose no secrets and change nothing',async()=>{
 const f=fixture();f.args.request=async()=>{throw Error(secret);};assert.deepEqual(await checkAndRestartProduct(f.args),{phase:'needs_investigation',archived:false});assert.equal(f.writes.length,0);
 f.args.origin='http://poster.example.test';assert.equal((await checkAndRestartProduct(f.args)).phase,'needs_investigation');assert.equal(f.writes.length,0);
});
