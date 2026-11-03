import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findPublishedStreakTrioSources} from '../lib/streak-trio-recovery.mjs';
import {validateTwoTrios} from '../public/collection-trios.mjs';

const originals=[
 ['The Blame','Sarcastic Hedgehog Newspaper Print | The Blame | Black and White A4 A5 Wall Art','86030936d3352c50e708ba813c4b88cc95f232759f858d9fb193e41ae06aea30'],
 ['Democracy','Democracy Hedgehog Newspaper Print | British Sarcastic Black White Wall Art A4 A5','441da4f7c097cf6327ff3a1385e0ca47dac96a74d14c5bb993c0c1e170377209'],
 ['The Experts','The Experts Hedgehog Print | Sarcastic News Wall Art | Black White A4 A5','bf21c1a1993ae9e9e69cc633d1ba8fab4e15a9bd50402251561af2a9aa89b5b7'],
 ['Another Meeting','Another Meeting Hedgehog Print | Dry British Humour Black White A4 A5 Wall Art','bfcba4da7375f44b70a8946e52b166b6bff93cd0acbf9abd0bb0d391a2d12d2a'],
 ['Comment Section','Comment Section Hedgehog Print | Sarcastic British Wall Art A4 A5 Black White','231dc2c3afe060b7f1f9ca3b5e5dcc2383d24c7629402dd403f9709af307e4de'],
 ['Historic Disaster','Historic Disaster Hedgehog Print | Sarcastic Black White News Wall Art A4 A5','9ea92184517be92c661942869f26399c872cba156118611e6cdb97f9697049ba']
];
function fixture({shopId=50893070,missingIndex=-1,missingSupplier=-1,duplicateIndex=-1}={}){
 const store=new Map(),calls=[],n=originals.length;
 for(let i=0;i<n;i++){
  if(i===missingIndex)continue;
  const id='s'.repeat(31)+String(i),p='products/'+id+'/record',a='uploads/'+id+'/state';
  const [name,title,sha256]=originals[i],sku='SP-STREAK-'+i,listingId=5000+i,supplierProductId=i===missingSupplier?null:'PS-'+i;
  store.set(p,{productId:id,type:'physical',phase:'published',currentRevision:id,pendingRevision:null,metadata:{sectionTitle:'Streak',name},etsyListingId:listingId,supplierProductId});
  store.set(a,{phase:'published',type:'physical',image:{sha256},listingId,supplierProductId,masterKey:'uploads/'+id+'/master.png',plan:{identity:{sku}},metadata:{etsyTitle:title,sectionTitle:'Streak',printSizes:['A5','A4']}});
 }
 if(duplicateIndex>=0){
  const [name,title,sha256]=originals[duplicateIndex],id='z'.repeat(32),listingId=9100;
  store.set('products/'+id+'/record',{productId:id,type:'physical',phase:'published',currentRevision:id,metadata:{sectionTitle:'Streak',name},etsyListingId:listingId,supplierProductId:'PS-dup'});
  store.set('uploads/'+id+'/state',{phase:'published',type:'physical',image:{sha256},listingId,supplierProductId:'PS-dup',masterKey:'uploads/'+id+'/master.png',plan:{identity:{sku:'SP-dup'}},metadata:{etsyTitle:title,sectionTitle:'Streak',printSizes:['A5','A4']}});
 }
 const uploads={
  list:async function*({prefix}){assert.equal(prefix,'products/');yield {blobs:[...store.keys()].filter(k=>k.startsWith('products/')).map(key=>({key}))};},
  get:async (key)=>{calls.push({op:'get',key});return store.get(key)||null;},
  setJSON:async()=>{throw Error('Read-only recovery attempted a write');}
 };
 const client={session:async()=>({shop_id:shopId})};
 return {uploads,client,calls};
}
test('recovers six original published Streak records without creating singles or modifying any record',async()=>{
 const f=fixture(),recovered=await findPublishedStreakTrioSources(f);
 assert.equal(recovered.phase,'recovered');
 assert.equal(recovered.sourceCount,6);
 assert.equal(recovered.bundleCount,2);
 assert.equal(recovered.items.length,6);
 assert.equal(recovered.trios.length,2);
 assert.deepEqual(recovered.items.map(x=>x.id),Array.from({length:6},(_,i)=>'s'.repeat(31)+i));
 assert.deepEqual(recovered.trios.map(x=>x.members),[['01-Blame','02-Democracy','03-Experts'],['04-Meetings','05-Comments','06-History']]);
 assert.ok(recovered.trios.every(x=>x.size==='A4'&&x.sectionTitle==='Streak'&&x.tags.length===13));
 assert.equal(recovered.inputs[0].discount,15);
 assert.equal(validateTwoTrios(recovered.items,recovered.trios).length,2);
 assert.equal(f.calls.some(x=>x.op!=='get'),false);
});
test('missing original, missing supplier mapping, duplicate image and wrong Etsy shop refuse recovery',async()=>{
 for(const [opts,message] of [
  [{missingIndex:2},/Missing fully published/],
  [{missingSupplier:0},/Missing fully published/],
  [{duplicateIndex:3},/More than one published/],
  [{shopId:123456},/SapiverPrints shop/]
 ]){
  const f=fixture(opts);
  await assert.rejects(findPublishedStreakTrioSources(f),message);
 }
});
test('the recovery control is deliberate and the existing protected bundle route remains the writer',()=>{
 const web=readFileSync(new URL('../lib/product-web.mjs',import.meta.url),'utf8');
 const script=readFileSync(new URL('../public/bulk-upload.mjs',import.meta.url),'utf8');
 const handler=readFileSync(new URL('../lib/poster-upload-web.mjs',import.meta.url),'utf8');
 assert.match(web,/id="streak-recover-two-trios"/);
 assert.match(script,/\/poster\/bulk\/streak-trios\/recover/);
 assert.match(script,/\/poster\/bulk\/trios/);
 assert.match(script,/state=recoveredState/);
 assert.match(handler,/path==='\/poster\/bulk\/streak-trios\/recover'&&req.method==='POST'/);
 assert.match(handler,/findPublishedStreakTrioSources/);
});
