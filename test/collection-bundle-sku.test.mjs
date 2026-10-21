import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveTrioSku} from '../lib/collection-bundle-sku.mjs';
const x=['FOX_EXISTING','ROBIN_EXISTING','HEDGEHOG_EXISTING'].map((sku,i)=>({sku,sha256:String(i+1).repeat(64)}));
test('trio SKU generated automatically and predictably from supplier identities',()=>{
 const a=deriveTrioSku({members:x,size:'A4'});
 assert.match(a,/^SP-TRIO-[A-F0-9]{24}$/);
 assert.equal(deriveTrioSku({members:[x[2],x[0],x[1]],size:'A4'}),a);
 assert.notEqual(deriveTrioSku({members:x,size:'A5'}),a);
 assert.notEqual(deriveTrioSku({members:x.map((z,i)=>i?z:{...z,sha256:'a'.repeat(64)}),size:'A4'}),a);
});
test('bundle SKU never reuses component SKU and rejects duplicate products',()=>{
 const sku=deriveTrioSku({members:x,size:'A4'});
 assert.ok(!x.some(y=>y.sku===sku));
 assert.throws(()=>deriveTrioSku({members:[x[0],x[0],x[2]],size:'A4'}),/Three separate/);
 assert.throws(()=>deriveTrioSku({members:x.map((y,i)=>({...y,sha256:i===2?x[1].sha256:y.sha256})),size:'A4'}),/Three separate/);
 assert.throws(()=>deriveTrioSku({members:x,size:'A2'}),/Exactly three/);
});
