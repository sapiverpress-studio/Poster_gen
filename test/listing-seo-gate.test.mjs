import test from 'node:test';
import assert from 'node:assert/strict';
import {physicalSeoIssues,assertSpecificPhysicalMetadata} from '../lib/listing-seo-gate.mjs';
const tags=['hedgehog art print','hedgehog wall art','british wildlife art','woodland animal art','botanical wall art','nature poetry print','wildlife poetry','cottagecore decor','country cottage art','hedgehog artwork','nature lover gift','autumn woodland','english countryside'];
test('generic short title and generic fallbacks are rejected',()=>{
 const issues=physicalSeoIssues({name:'The Hedgehog',title:'The Hedgehog Wall Art Print',tags:['framed print','printed wall art','wall art']});
 assert.ok(issues.some(x=>/distinguishing detail/.test(x)));
 assert.ok(issues.some(x=>/exactly 13/.test(x)));
 assert.ok(issues.some(x=>/generic standalone tags/.test(x)));
 assert.throws(()=>assertSpecificPhysicalMetadata({name:'The Hedgehog',title:'The Hedgehog Wall Art Print',tags}),/needs correction/);
});
test('specific accurate 13-tag metadata is accepted',()=>{
 assert.deepEqual(physicalSeoIssues({name:'The Hedgehog',title:'Hedgehog Botanical Wildlife Poetry Print',tags}),[]);
 assert.doesNotThrow(()=>assertSpecificPhysicalMetadata({name:'The Hedgehog',title:'Hedgehog Botanical Wildlife Poetry Print',tags}));
});
test('descriptive titles cannot hide bad single-word tags or length errors',()=>{
 const titles=['The Robin Wall Art Print','The Puddle Wall Art Print','Butterfly Wall Art Print'];
 for(const title of titles) assert.ok(physicalSeoIssues({title,tags}).length>0);
 const bad=tags.map((tag,i)=>i===0?'hedgehog art print hedgehog art print':i>8?'hedgehog':tag);
 assert.ok(physicalSeoIssues({title:'Hedgehog Botanical Wildlife Poetry Print',tags:bad}).length>0);
});
