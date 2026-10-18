import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {finishStoredPoster,prepareStoredPoster} from '../lib/stored-posters.mjs';
import {recordRevision} from '../lib/product-records.mjs';
import {monthlyUploadStatus} from '../lib/monthly-upload-limit.mjs';
import {folderCatalogue} from '../lib/catalogue-folders.mjs';
import {uploadBody,bulkCollectionBody} from '../lib/product-web.mjs';

const clock=()=>Date.UTC(2026,9,18,10,0,0);
function mock(){
 const map=new Map();
 return {map,get:async(key,opts)=>map.get(key)??null,set:async(key,data,opt)=>{if(opt?.onlyIfNew&&map.has(key))return {modified:false};map.set(key,data);return {modified:true};},setJSON:async(key,data,opt)=>{if(opt?.onlyIfNew&&map.has(key))return {modified:false};map.set(key,data);return {modified:true};},delete:async key=>map.delete(key),list:async function*({prefix=''}){yield {blobs:[...map.keys()].filter(x=>x.startsWith(prefix)).map(key=>({key}))};}};
}
const id='t'.repeat(32);
function asset(bytes){return {phase:'uploading',type:'physical',storeOnly:true,productId:id,metadata:{name:'Winter Robin',sectionTitle:'Nature',websiteFolder:'Christmas Wildlife',kind:'artwork',subject:'Robin',tags:[]},filename:'Winter Robin.png',sourceFilename:'Winter Robin.png',bytes:bytes.length,chunks:1,createdAt:clock()};}
test('private storage validates original, stores a thumbnail and consumes no monthly slots',async()=>{
 const uploads=mock();
 const png=await sharp({create:{width:3508,height:4961,channels:3,background:'#dfded0'}}).png().toBuffer();
 await uploads.setJSON('uploads/'+id+'/state',asset(png));
 await uploads.set('uploads/'+id+'/chunks/0',png);
 const result=await finishStoredPoster({uploads,id,clock});
 assert.equal(result.phase,'stored');
 const stored=await uploads.get('uploads/'+id+'/state');
 assert.equal(stored.phase,'stored');assert.equal(stored.storeOnly,true);
 assert.deepEqual(Buffer.from(await uploads.get('uploads/'+id+'/master.png')),png);
 assert.equal((await uploads.get('uploads/'+id+'/mockups/0.jpg'))?.[0],0xff);
 assert.equal((await monthlyUploadStatus({uploads,clock})).used,0);
 assert.equal((await uploads.get('products/'+id+'/record')).metadata.websiteFolder,'Christmas Wildlife');
 let dispatches=0;
 const promoted=await prepareStoredPoster({uploads,id,clock,dispatch:async()=>{dispatches++;}});
 assert.equal(promoted.phase,'preparing');assert.equal(dispatches,1);
 assert.equal((await monthlyUploadStatus({uploads,clock})).used,1);
 assert.equal((await uploads.get('uploads/'+id+'/state')).reuseMasterKey,'uploads/'+id+'/master.png');
 await assert.rejects(prepareStoredPoster({uploads,id,clock,dispatch:async()=>{dispatches++;}}));
 assert.equal(dispatches,1);
});
test('when 52 monthly slots are occupied, first ON leaves artwork privately stored',async()=>{
 const uploads=mock();
 const png=await sharp({create:{width:3508,height:4961,channels:3,background:'#ffffff'}}).png().toBuffer();
 await uploads.setJSON('uploads/'+id+'/state',asset(png));await uploads.set('uploads/'+id+'/chunks/0',png);
 await finishStoredPoster({uploads,id,clock});
 for(let i=1;i<=52;i++)await uploads.setJSON('limits/monthly-uploads/2026-10/slot/'+String(i).padStart(2,'0'),{productId:('x'+i).padEnd(32,'_'),month:'2026-10'});
 let dispatched=0;
 const result=await prepareStoredPoster({uploads,id,clock,dispatch:async()=>{dispatched++;}});
 assert.equal(result.phase,'stored');assert.equal(result.reason,'monthly_limit');assert.equal(dispatched,0);
 assert.equal((await uploads.get('uploads/'+id+'/state')).phase,'stored');
 assert.equal((await monthlyUploadStatus({uploads,clock})).used,52);
});
test('catalogue shows custom website category, thumbnails and first-ON review while Etsy status stays separate',()=>{
 const stored=[{productId:id,phase:'stored',storeOnly:true,metadata:{name:'Winter Robin',sectionTitle:'Nature',websiteFolder:'Christmas Wildlife'}}];
 const audit={version:1,shopId:345,checkedAt:clock(),summary:{physicalTotal:1,activePhysical:1},sections:[{id:11,title:'Nature'}],listings:[{id:55,title:'Bee',section:'Nature',state:'active'}]};
 const root=folderCatalogue({audit,status:{phase:'available'},stored,folders:['Christmas Wildlife','Spring'],clock});
 assert.match(root,/Stored posters · 1/);
 assert.match(root,/href="\/poster\/catalogue\?folder=Christmas%20Wildlife"/);
 assert.match(root,/Create a private website category/);
 const html=folderCatalogue({audit,status:{phase:'available'},stored,folders:['Christmas Wildlife'],folder:'Christmas Wildlife',clock});
 assert.match(html,/First ON → Review/);
 assert.match(html,/Stored privately · never listed/);
 assert.match(html,new RegExp('/poster/uploads/'+id+'/mockups/0'));
 assert.doesNotMatch(html,/View only/);
 const form=uploadBody({defaults:{},catalog:{listings:[]},taxonomy:[],monthly:{used:52,limit:52,remaining:0,label:'October 2026',blocked:true},websiteFolders:['Christmas Wildlife']});
 assert.match(form,/Store privately for later/);
 assert.match(form,/name="storeOnly" checked/);
 assert.doesNotMatch(form,/type="submit" disabled/);
 const bulk=bulkCollectionBody({monthly:{used:50,limit:52,remaining:2,label:'October 2026'},sectionInfo:{sections:[{id:11,title:'Nature'}]}});
 assert.match(bulk,/name="storeOnly" type="checkbox" checked/);
});
