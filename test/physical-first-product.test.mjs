import test from 'node:test';
import assert from 'node:assert/strict';
import {physicalCategory} from '../lib/physical-first-product.mjs';
test('physical printed artwork can use the Etsy Digital Prints production category while listing type remains physical',()=>{
 const nodes=[{id:1,name:'Art & Collectibles',children:[{id:2,name:'Prints',children:[{id:3,name:'Digital Prints',children:[]}]}]}];
 assert.equal(physicalCategory({},nodes).id,3);assert.equal(physicalCategory({taxonomyId:3},nodes).id,3);
 assert.throws(()=>physicalCategory({taxonomyId:999},nodes));
});
test('unrelated or ambiguous physical categories require a real owner selection',()=>{
 assert.throws(()=>physicalCategory({},[{id:1,name:'Music',children:[]}]));
 const nodes=[{id:1,name:'Wall Decor',children:[{id:2,name:'Posters',children:[]},{id:3,name:'Posters',children:[]}]}];
 assert.throws(()=>physicalCategory({},nodes));assert.equal(physicalCategory({taxonomyId:2},nodes).id,2);
});
