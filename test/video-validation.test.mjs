import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePromoMp4,MAX_PROMO_VIDEO_BYTES} from '../public/video-validation.mjs';

function chosen(bytes,name='47927.mp4'){
 const blob=new Blob([bytes],{type:'application/octet-stream'});
 blob.name=name;
 return blob;
}
function fakeMp4(){
 const payload=new Uint8Array(1040);
 // MP4 container marker; browser need not decode media codecs to read these bytes.
 payload.set([0,0,0,24,102,116,121,112,105,115,111,109]);
 return payload;
}
test('MP4 byte inspection accepts supported container even where Android video metadata preview fails',async()=>{
 const file=chosen(fakeMp4());
 const response=await validatePromoMp4(file);
 assert.equal(response.bytes,file.size);
});
test('rejects other file formats and invalid container bytes before creating a private upload',async()=>{
 await assert.rejects(validatePromoMp4(chosen(new Uint8Array(1300),'image.png')),/Choose an MP4/);
 await assert.rejects(validatePromoMp4(chosen(new Uint8Array(1300))),/not a recognised MP4/);
});
test('rejects files too large or too small without upload',async()=>{
 await assert.rejects(validatePromoMp4(chosen(new Uint8Array(100))),/Choose an MP4/);
 const tooLarge={name:'large.mp4',size:MAX_PROMO_VIDEO_BYTES+1,slice:()=>{throw Error('should not read')}};
 await assert.rejects(validatePromoMp4(tooLarge),/Choose an MP4/);
});
test('mobile file-provider byte read failures give an actionable error, not a false codec diagnosis',async()=>{
 const unreadable={name:'47927.mp4',size:10_000,slice:()=>({arrayBuffer:async()=>{throw Error('storage denied')}})};
 await assert.rejects(validatePromoMp4(unreadable),/Save the MP4 to Downloads/);
});
