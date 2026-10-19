import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {finishStoredPoster,prepareStoredPoster} from '../lib/stored-posters.mjs';
import {monthlyUploadStatus,reserveMonthlyUpload} from '../lib/monthly-upload-limit.mjs';
import {folderCatalogue} from '../lib/catalogue-folders.mjs';
import {assetKey} from '../lib/uploaded-poster.mjs';

const october=Date.parse('2026-10-18T13:00:00Z');
const november=Date.parse('2026-11-03T13:00:00Z');
const id='s'.repeat(32);
function memory(){
 const db=new Map();
 return {
  db,
  get:async key=>db.get(key)??null,
  set:async(key,data,opts)=>{if(opts?.onlyIfNew&&db.has(key))return {modified:false};db.set(key,data);return {modified:true};},
  setJSON:async(key,data,opts)=>{if(opts?.onlyIfNew&&db.has(key))return {modified:false};db.set(key,data);return {modified:true};},
  delete:async key=>{db.delete(key);},
  list:async function*({prefix=''}){yield {blobs:[...db.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}
 };
}
async function storedFixture(){
 const uploads=memory();
 // A-series portrait, >=270 PPI at A3.
 const png=await sharp({create:{width:3508,height:4961,channels:3,background:'#ecdec5'}}).png().toBuffer();
 await uploads.setJSON(assetKey(id),{
  phase:'uploading',type:'physical',storeOnly:true,productId:id,createdAt:october,
  bytes:png.length,chunks:1,filename:'Stored Owl.png',
  metadata:{name:'Stored Owl',kind:'artwork',sectionTitle:'Nature',websiteFolder:'Christmas Woodland'}
 });
 await uploads.set('uploads/'+id+'/chunks/0',png);
 return {uploads,png};
}
test('private PNG validation saves a master and small preview but cannot create Etsy or spend a monthly slot',async()=>{
 const {uploads,png}=await storedFixture();
 const result=await finishStoredPoster({uploads,id,clock:()=>october});
 assert.equal(result.phase,'stored');
 assert.equal((await uploads.get(assetKey(id))).phase,'stored');
 assert.deepEqual(Buffer.from(await uploads.get('uploads/'+id+'/master.png')),png);
 const preview=await uploads.get('uploads/'+id+'/mockups/0.jpg');
 assert.ok(preview&&preview.byteLength>100);
 assert.equal(await uploads.get('uploads/'+id+'/chunks/0'),null);
 assert.equal((await uploads.get('products/'+id+'/record')).etsyListingId,null);
 assert.equal((await uploads.get('products/'+id+'/record')).storeOnly,true);
 assert.equal((await monthlyUploadStatus({uploads,clock:()=>october})).used,0);
 await assert.rejects(finishStoredPoster({uploads,id,clock:()=>october}),/not waiting/);
});
test('first ON cannot use a 53rd slot; next UK calendar month consumes exactly one then queues review only',async()=>{
 const {uploads}=await storedFixture();
 await finishStoredPoster({uploads,id,clock:()=>october});
 for(let i=0;i<52;i++){
  const productId=('q'+String(i).padStart(31,'0'));
  assert.equal((await reserveMonthlyUpload({uploads,productId,clock:()=>october})).accepted,true);
 }
 const dispatches=[];
 const dispatch=async(id,action)=>{dispatches.push({id,action});return 'queued'};
 const blocked=await prepareStoredPoster({uploads,id,dispatch,clock:()=>october});
 assert.equal(blocked.phase,'stored');assert.equal(blocked.reason,'monthly_limit');
 assert.equal((await uploads.get(assetKey(id))).phase,'stored');assert.equal(dispatches.length,0);
 const success=await prepareStoredPoster({uploads,id,dispatch,clock:()=>november});
 assert.equal(success.phase,'preparing');
 assert.equal((await monthlyUploadStatus({uploads,clock:()=>october})).used,52);
 assert.equal((await monthlyUploadStatus({uploads,clock:()=>november})).used,1);
 assert.deepEqual(dispatches,[{id,action:'prepare'}]);
 const updated=await uploads.get(assetKey(id);
 assert.equal(updated.phase,'preparing');assert.equal(updated.reuseMasterKey,'uploads/'+id+'/master.png');
 assert.equal(updated.storeOnly,false);assert.ok(Number.isFinite(updated.publicationSlotAt));
 assert.equal((await uploads.get('products/'+id+'/record')).etsyListingId,null);
 await assert.rejects(prepareStoredPoster({uploads,id,dispatch,clock:()=>november}),/privately stored/);
 assert.equal(dispatches.length,1);
});
test('private website folders show only unlisted local posters, not unrelated Etsy listings',()=>{
 const stored=[{productId:id,phase:'stored',storeOnly:true,metadata:{name:'Stored Owl',websiteFolder:'Christmas Woodland',sectionTitle:'Nature'}}];
 const audit={version:1,shopId:456,checkedAt:october,sections:[{id:1,title:'Nature'}],summary:{activePhysical:1},listings:[{id:123,title:'Listed Robin',state:'active',section:'Nature',sectionId:1}]};
 const base={audit,status:{phase:'available'},stored,folders:['Christmas Woodland'],clock:()=>october};
 const home=folderCatalogue(base);
 assert.match(home,/Stored posters · 1/);
 assert.match(home,/Christmas Woodland/);
 const folder=folderCatalogue({...base,folder:'Christmas Woodland'});
 assert.match(folder,/Stored Owl/);
 assert.match(folder,/First ON → Review/);
 assert.doesNotMatch(folder,/Listed Robin/);
 const etsy=folderCatalogue({...base,section:'Nature'});
 assert.match(etsy,/Listed Robin/);
 assert.match(etsy,/Stored Owl/);
});
