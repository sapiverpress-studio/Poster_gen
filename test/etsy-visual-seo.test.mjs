import test from 'node:test';
import assert from 'node:assert/strict';
import {validPosterRequest,validatePosterSeo,suggestPosterSeo} from '../lib/etsy-visual-seo.mjs';
const imageDataUrl='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
const tags=['hedgehog wall art','woodland hedgehog','animal nursery art','forest animal print','hedgehog gift','nature wall print','black ink drawing','woodland bedroom','hedgehog poster','quirky animal art','hedgehog decor','british wildlife','nature lover gift'];
const sample={title:'Hedgehog Woodland Wall Art Print',tags,description:'A physical art print featuring a woodland hedgehog. Available in A4 and A5, framed or unframed. No digital file is supplied.'};

test('physical Etsy preview input never accepts full-size images or arbitrary data URLs',()=>{
 assert.equal(validPosterRequest({imageDataUrl,kind:'educational'}).kind,'educational');
 assert.equal(validPosterRequest({imageDataUrl,kind:'other'}).kind,'artwork');
 assert.throws(()=>validPosterRequest({imageDataUrl:'data:text/html;base64,QQ=='}),/reduced JPEG/);
 assert.throws(()=>validPosterRequest({imageDataUrl:'data:image/jpeg;base64,'+'A'.repeat(900000)}),/reduced JPEG/);
});
test('poster listing generator enforces Etsy 13 tags and physical fulfilment',()=>{
 const valid=validatePosterSeo(sample);
 assert.equal(valid.tags.length,13);assert.equal(valid.reviewRequired,true);assert.equal(valid.live_search_volume,false);
 assert.throws(()=>validatePosterSeo({...sample,tags:tags.slice(0,12)}),/13 distinct/);
 assert.throws(()=>validatePosterSeo({...sample,tags:[...tags.slice(0,12),tags[0]]}),/13 distinct/);
 assert.throws(()=>validatePosterSeo({...sample,tags:[...tags.slice(0,12),'a tag that is too long']}),/13 distinct/);
 assert.throws(()=>validatePosterSeo({...sample,title:'Hedgehog Digital File'}),/physical poster/);
 assert.throws(()=>validatePosterSeo({...sample,description:'Instant download of hedgehog art. No physical product.'}),/downloadable/);
});
test('poster image analysis uses just one small image and never claims Etsy demand',async()=>{
 let body;const request=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');body=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(sample)}}]})}};
 const result=await suggestPosterSeo({imageDataUrl,name:'The Hedgehog',subject:'Hedgehog',kind:'artwork'},{apiKey:'test-only',request});
 assert.equal(result.title,sample.title);
 assert.equal(result.tags.length,13);
 assert.equal(body.model,'gpt-4o-mini');
 assert.equal(body.messages[1].content[1].image_url.url,imageDataUrl);
 assert.match(body.messages[0].content,/PHYSICAL poster/);
 assert.equal(result.live_search_volume,false);
});
test('no configured AI provider fails before any paid request',async()=>{
 await assert.rejects(suggestPosterSeo({imageDataUrl},{apiKey:''}),/not configured/);
});
