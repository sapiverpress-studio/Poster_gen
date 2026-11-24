import test from 'node:test';
import assert from 'node:assert/strict';
import {targets,textFields,textSame,protectedFields,imageSignature} from './bicep-colour-reconcile.mjs';

test('only the two known, distinct Bicep Heart Etsy listing IDs are in scope',()=>{
 assert.deepEqual(targets.map(x=>x.id),[4623842263,4623850842]);
 assert.deepEqual(targets.map(x=>x.index),[0,2]);
 assert.notEqual(targets[0].hash,targets[1].hash);
 assert.ok(targets.every(x=>x.hash.length===64&&x.hero.length===10));
});
test('metadata swap changes only customer-facing title/description/tags',()=>{
 const a={title:'Terracotta',description:'A terracotta edition',tags:['gym wall art','terracotta art']};
 const b={title:'Plum',description:'A plum edition',tags:['strong woman','plum art']};
 assert.equal(textSame(a,b),false);
 const swapped=[textFields(b),textFields(a)];
 assert.ok(textSame(swapped[0],b)&&textSame(swapped[1],a));
 assert.equal(textSame(swapped[0],a),false);
});
test('protected identity prevents unintentional stock, SKU or image edits',()=>{
 const a={listing_id:4623842263,shop_id:123,state:'active',listing_type:'physical',quantity:10,
  price:{amount:1000,divisor:100,currency_code:'GBP'},taxonomy_id:10,shop_section_id:3,
  shipping_profile_id:4,return_policy_id:2,readiness_state_id:1,has_variations:true,
  when_made:'2020_2026',who_made:'i_did',
  title:'Terracotta',description:'Different text',tags:['test']};
 const b={...a,title:'Plum',description:'New text',tags:['new']};
 assert.equal(protectedFields(a),protectedFields(b));
 assert.notEqual(protectedFields(a),protectedFields({...b,shipping_profile_id:999}));
 assert.notEqual(protectedFields(a),protectedFields({...b,listing_id:1}));
 const photos=[{listing_image_id:1,rank:1,url_fullxfull:'x',alt_text:'one'},
  {listing_image_id:2,rank:2,url_fullxfull:'y',alt_text:'two'}];
 assert.equal(imageSignature(photos),imageSignature(photos.toReversed()));
 assert.notEqual(imageSignature(photos),imageSignature([{...photos[0],alt_text:'wrong'},photos[1]]));
});
