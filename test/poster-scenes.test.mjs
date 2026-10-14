import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {POSTER_SCENES} from '../lib/poster-scenes.mjs';
import {makePosterMockups} from '../lib/poster-mockups.mjs';
import {physicalDescription,FRAME_NOTE} from '../lib/physical-description.mjs';
test('physical description reconciles finishes and retains bespoke disclosures without duplicate notes',()=>{
 const original='One physical, unframed paper poster in your selected size.\nA frame, mount and hanging accessories are not included.\nCreated using generative AI. PrintShrimp.';
 const result=physicalDescription(original);
 assert.match(result,/selected size and finish/);assert.match(result,/Print Only does not include/);assert.match(result,/Black Frame, White Frame or Oak Frame/);assert.ok(result.includes(FRAME_NOTE));assert.match(result,/Created using generative AI\. PrintShrimp\./);assert.equal(physicalDescription(result),result);
});
test('reusable apertures contain no previous artwork and accept a different asymmetric print without cropping',async()=>{
 const bytes=await sharp({create:{width:707,height:1000,channels:3,background:'#ff0000'}}).composite([{input:await sharp({create:{width:100,height:100,channels:3,background:'#0000ff'}}).png().toBuffer(),left:0,top:0},{input:await sharp({create:{width:100,height:100,channels:3,background:'#00ff00'}}).png().toBuffer(),left:607,top:900}]).png().toBuffer();
 const outputs=await makePosterMockups(bytes);
 for(const [i,scene] of POSTER_SCENES.entries()){
  const template=await readFile(new URL('../lib/assets/poster-scenes/'+scene.name+'.webp',import.meta.url));
  const blank=await sharp(template).extract({left:scene.left+10,top:scene.top+10,width:scene.width-20,height:scene.height-20}).raw().toBuffer();assert.ok(blank.every(v=>v>=245));
  const {data,info}=await sharp(outputs[i]).raw().toBuffer({resolveWithObject:true});
  const pixel=(x,y)=>Array.from(data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3));
  const first=pixel(scene.left+20,scene.top+20),last=pixel(scene.left+scene.width-20,scene.top+scene.height-20);
  assert.ok(first[2]>240&&first[0]<20);assert.ok(last[1]>240&&last[0]<20);
 }
});
