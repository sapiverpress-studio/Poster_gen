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
 assert.throws(()=>validatePosterSeo({...sample,tags:[...tags.slice(0,12),'digital download']}),/must not promise a digital download/);
 assert.throws(()=>validatePosterSeo({...sample,description:'No physical item is shipped.'}),/printed product is delivered/);
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

test('Netlify AI Gateway base URL is used instead of bypassing gateway',async()=>{
 let seen='';
 const request=async(url)=>{seen=url;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(sample)}}]})}};
 const result=await suggestPosterSeo({imageDataUrl,name:'The Hedgehog'},{apiKey:'injected-gateway-token',baseUrl:'https://gateway.example.test/openai/v1/',request});
 assert.equal(seen,'https://gateway.example.test/openai/v1/chat/completions');
 assert.equal(result.tags.length,13);
 await assert.rejects(suggestPosterSeo({imageDataUrl},{apiKey:'test',baseUrl:'http://unsafe.example',request}),/Unsafe AI Gateway/);
});

test('one physical trio analysis includes three separate image previews and fixed print size',async()=>{
 const input=validPosterRequest({imageDataUrls:[imageDataUrl,imageDataUrl,imageDataUrl],name:'Woodland Trio',subject:'Fox, Hedgehog, Owl',kind:'trio',size:'A4'});
 assert.equal(input.imageDataUrls.length,3);
 assert.equal(input.size,'A4');
 assert.throws(()=>validPosterRequest({imageDataUrls:[imageDataUrl],kind:'trio'}),/three reduced JPEG/);
 const trio={title:'Woodland Animal Trio Set of 3 Prints',tags,description:'A physical matching set of three separate woodland animal art prints, all A4. Select framed or unframed at checkout.'};
 let sent;
 const request=async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(trio)}}]})}};
 const result=await suggestPosterSeo({imageDataUrls:input.imageDataUrls,name:input.name,subject:input.subject,kind:'trio',size:'A4'},{apiKey:'test',request});
 assert.equal(result.title,trio.title);
 assert.equal(sent.messages[1].content.filter(x=>x.type==='image_url').length,3);
 assert.match(sent.messages[0].content,/THREE supplied images/);
 assert.throws(()=>validatePosterSeo({...trio,title:'Woodland Print'}, {kind:'trio',size:'A4'}),/Trio listing/);
 assert.throws(()=>validatePosterSeo({...trio,description:'Three physical print artworks at A5.'},{kind:'trio',size:'A4'}),/Trio listing/);
});
