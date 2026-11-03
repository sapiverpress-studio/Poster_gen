import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findPublishedStreakTrioSources,STREAK_APPROVED_UPLOAD_IDS} from '../lib/streak-trio-recovery.mjs';
import {validateTwoTrios} from '../public/collection-trios.mjs';

const originalNames=['The Blame','Democracy','The Experts','Another Meeting','Comment Section','Historic Disaster'];
const originalTitles=[
 'Sarcastic Hedgehog Newspaper Print | The Blame | Black and White A4 A5 Wall Art',
 'Democracy Hedgehog Newspaper Print | British Sarcastic Black White Wall Art A4 A5',
 'The Experts Hedgehog Print | Sarcastic News Wall Art | Black White A4 A5',
 'Another Meeting Hedgehog Print | Dry British Humour Black White A4 A5 Wall Art',
 'Comment Section Hedgehog Print | Sarcastic British Wall Art A4 A5 Black White',
 'Historic Disaster Hedgehog Print | Sarcastic Black White News Wall Art A4 A5'
];
const hashes=[
 '86030936d3352c50e708ba813c4b88cc95f232759f858d9fb193e41ae06aea30',
 '441da4f7c097cf6327ff3a1385e0ca47dac96a74d14c5bb993c0c1e170377209',
 'bf21c1a1993ae9e9e69cc633d1ba8fab4e15a9bd50402251561af2a9aa89b5b7',
 'bfcba4da7375f44b70a8946e52b166b6bff93cd0acbf9abd0bb0d391a2d12d2a',
 '231dc2c3afe060b7f1f9ca3b5e5dcc2383d24c7629402dd403f9709af307e4de',
 '9ea92184517be92c661942869f26399c872cba156118611e6cdb97f9697049ba'
];
function fixture({shopId=50893070,missingIndex=-1,missingSupplier=-1,updatedIndex=-1,wrongTitle=-1,wrongSection=-1,shaDifference=-1,duplicateSha=-1}={}){
 const map=new Map(),reads=[];
 STREAK_APPROVED_UPLOAD_IDS.forEach((id,i)=>{
  if(i===missingIndex)return;
  const productId=id;
  const metadata={name:wrongTitle===i?'A DIFFERENT PRINT':originalNames[i],etsyTitle:wrongTitle===i?'Something unrelated':originalTitles[i],sectionTitle:wrongSection===i?'Wall Art':'Streak',printSizes:['A5','A4']};
  const supplierProductId=missingSupplier===i?null:'PS-'+i;
  const sha=duplicateSha===i?hashes[0]:shaDifference===i?'f'.repeat(64):hashes[i];
  map.set('uploads/'+id+'/state',{phase:'published',type:'physical',productId,metadata,listingId:5000+i,supplierProductId,
   masterKey:'uploads/'+id+'/master.png',plan:{identity:{sku:'SP-STREAK-'+i}},image:{sha256:sha}});
  map.set('products/'+id+'/record',{phase:'published',type:'physical',metadata,productId,currentRevision:updatedIndex===i?'x'.repeat(32):id,
   pendingRevision:null,etsyListingId:5000+i,supplierProductId});
 });
 return {
  uploads:{get:async key=>{reads.push(key);return map.get(key)||null;},setJSON:async()=>{throw Error('Read-only recovery wrote to storage');}},
  client:{session:async()=>({shop_id:shopId})},
  reads
 };
}
test('real six original approval IDs map to two valid A4 Streak trios without any write',async()=>{
 assert.equal(STREAK_APPROVED_UPLOAD_IDS.length,6);
 assert.equal(new Set(STREAK_APPROVED_UPLOAD_IDS).size,6);
 const f=fixture(),result=await findPublishedStreakTrioSources(f);
 assert.equal(result.phase,'recovered');
 assert.equal(result.sourceCount,6);
 assert.equal(result.bundleCount,2);
 assert.deepEqual(result.items.map(x=>x.id),STREAK_APPROVED_UPLOAD_IDS);
 assert.deepEqual(result.items.map(x=>x.sha256),hashes);
 assert.equal(result.sourceDifferences.length,0);
 assert.deepEqual(result.trios.map(x=>x.members),[['01-Blame','02-Democracy','03-Experts'],['04-Meetings','05-Comments','06-History']]);
 assert.equal(validateTwoTrios(result.items,result.trios).length,2);
 assert.ok(result.trios.every(x=>x.size==='A4'&&x.sectionTitle==='Streak'&&x.tags.length===13));
 assert.ok(f.reads.every(x=>x.startsWith('uploads/')||x.startsWith('products/')));
});
test('published artwork checksum can be different; the exact approved receipt remains authoritative and is flagged',async()=>{
 const result=await findPublishedStreakTrioSources(fixture({shaDifference:0}));
 assert.deepEqual(result.sourceDifferences,['The Blame']);
 assert.equal(result.items[0].sha256,'f'.repeat(64));
});
test('fail closed on missing original receipt, missing supplier, wrong title/section, stale revision, or duplicate image',async()=>{
 for(const [opts,match] of [
  [{missingIndex:0},/original approved upload record not found/],
  [{missingSupplier:0},/PrintShrimp product mapping is not verified/],
  [{wrongTitle:2},/title does not match/],
  [{wrongSection:2},/physical print or shop section differs/],
  [{updatedIndex:3},/uploader state is/],
  [{duplicateSha:1},/published sources are not distinct/]
 ]){
  await assert.rejects(findPublishedStreakTrioSources(fixture(opts)),match);
 }
});
test('rejects unexpected Etsy seller identity',async()=>{
 await assert.rejects(findPublishedStreakTrioSources(fixture({shopId:111})),/SapiverPrints/);
});
test('the owner control never reuploads six PNGs and uses the existing bundle-reservation API',()=>{
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
