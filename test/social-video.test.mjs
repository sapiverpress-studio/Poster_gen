import test from 'node:test';
import assert from 'node:assert/strict';
import {socialCopy,socialShots,preferredVideoType} from '../public/social-video.mjs';
import {mockupDownloadControls,bulkCollectionBody} from '../lib/product-web.mjs';

const id='a'.repeat(32),id2='b'.repeat(32),id3='c'.repeat(32),id4='d'.repeat(32);
const poster=[{id,name:'Edge the Hedgehog',type:'poster'}];
const trio=[{id,name:'Three Quiet Animals',type:'trio'}];
test('social video selection uses all four original mock-ups for one physical poster',()=>{
 const shots=socialShots(poster);
 assert.equal(shots.length,4);
 assert.deepEqual(shots.map(s=>s.index),[0,1,2,3]);
 assert.ok(shots.every(s=>s.id===id));
});
test('a full collection selects one representative image for every distinct listing',()=>{
 const collection=[...poster,{id:id2,name:'Waver',type:'poster'},
  {id:id3,name:'Insomnia',type:'poster'},{id:id4,name:'The Animal Trio',type:'trio'}];
 assert.deepEqual(socialShots(collection).map(s=>s.index),[1,1,1,0]);
 assert.deepEqual(socialShots(collection).map(s=>s.id),collection.map(s=>s.id));
 assert.throws(()=>socialShots([poster[0],poster[0]]),/repeated/);
 assert.throws(()=>socialShots([{id:'bad',name:'Bad'}]),/Invalid/);
});
test('TikTok and Shorts descriptions and hashtags are generated safely and never make sales claims',()=>{
 const copy=socialCopy(poster);
 assert.match(copy.tiktok,/Edge the Hedgehog/);
 assert.match(copy.tiktok,/#HedgehogArt/);
 assert.match(copy.tiktok,/#SapiverPrints/);
 assert.match(copy.tiktok,/etsy\.com\/shop\/SapiverPrints/);
 assert.match(copy.youtubeTitle,/#Shorts/);
 assert.ok(copy.youtubeTitle.length<=100);
 assert.match(copy.youtube,/Which frame would you choose/);
 assert.doesNotMatch(copy.tiktok,/bestseller|limited stock|free shipping/i);
 const set=socialCopy(trio);
 assert.match(set.tiktok,/Three prints\. One matching set/);
 const collection=socialCopy([poster[0],{id:id2,name:'Botanical Study',type:'poster'}]);
 assert.match(collection.tiktok,/2-listing collection/);
 assert.match(collection.youtubeTitle,/Collection/);
});
test('recording format prefers MP4 but uses upload-compatible WebM when MP4 is unavailable',()=>{
 assert.equal(preferredVideoType(x=>x==='video/mp4'),'video/mp4');
 assert.equal(preferredVideoType(x=>x==='video/webm;codecs=vp8'),'video/webm;codecs=vp8');
 assert.equal(preferredVideoType(()=>false),null);
});
test('original poster and collection controls are retained with separate social actions',()=>{
 const html=mockupDownloadControls(id,'Quotes " & <b>','poster');
 assert.match(html,/Download all 4 mock-ups/);
 assert.match(html,/Create TikTok \/ YouTube Short \+ captions/);
 assert.match(html,/data-social-results/);
 assert.doesNotMatch(html,/onerror=/);
 assert.doesNotMatch(html,/<b>/);
 const bulk=bulkCollectionBody({monthly:{}});
 assert.match(bulk,/bulk-download-all-mockups/);
 assert.match(bulk,/bulk-social-create/);
 assert.match(bulk,/data-social-results/);
});
