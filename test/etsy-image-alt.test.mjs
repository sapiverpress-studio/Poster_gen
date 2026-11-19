import test from 'node:test';
import assert from 'node:assert/strict';
import {listingImageAltTexts,ALT_TEXT_MAX} from '../lib/etsy-image-alt.mjs';

test('new physical listing has a close-up first and correctly labelled black, white and oak room mockups',()=>{
 const alt=listingImageAltTexts({type:'physical',subject:'Blue electric guitar with orange paint strokes',count:4});
 assert.equal(alt.length,4);
 assert.match(alt[0],/unframed front view/i);
 assert.match(alt[1],/black frame/i);
 assert.match(alt[2],/white frame/i);
 assert.match(alt[3],/oak frame/i);
 assert.equal(new Set(alt).size,4);
});

test('trio cover and three individual member artworks receive different, appropriate descriptions',()=>{
 const alt=listingImageAltTexts({type:'trio',title:'Woodland Trio',subject:'Woodland animals',size:'A4',memberNames:['Fox','Robin','Hedgehog'],count:4});
 assert.match(alt[0],/three separate A4 art prints/);
 assert.match(alt[1],/Fox/);
 assert.match(alt[2],/Robin/);
 assert.match(alt[3],/Hedgehog/);
 assert.equal(new Set(alt).size,4);
});

test('digital previews work with and without a verified clean lead and do not claim physical shipping',()=>{
 const clean=listingImageAltTexts({type:'digital',subject:'Crochet star motif',kind:'pattern',count:3,cleanLead:true});
 const fallback=listingImageAltTexts({type:'digital',subject:'Crochet star motif',kind:'pattern',count:3,cleanLead:false});
 assert.match(clean[0],/Full front view/);
 assert.match(fallback[0],/Listing preview 1 of 3/);
 assert.match(fallback[2],/Listing preview 3 of 3/);
 assert.equal(new Set(clean).size,3);
 assert.ok(clean.every(s=>!/(shipped|framed|printed product)/i.test(s)));
});

test('alt text remains concise, safe and consistently bounded',()=>{
 const alt=listingImageAltTexts({type:'physical',subject:'Very long colourful guitar '.repeat(20)+'<bad>',count:4});
 assert.ok(alt.every(s=>s.length<=ALT_TEXT_MAX&&s.length>20&&!s.includes('<')&&!s.includes('\n')));
 assert.throws(()=>listingImageAltTexts({type:'physical',subject:'',count:4}),/subject/);
 assert.throws(()=>listingImageAltTexts({type:'digital',subject:'X',count:11}),/count/);
});
