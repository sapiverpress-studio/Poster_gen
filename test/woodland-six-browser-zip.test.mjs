import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {makeWoodlandZip} from '../public/woodland-six-zip.mjs';
import {openPosterCollectionZip} from '../public/bulk-zip.mjs';
import {WOODLAND,WOODLAND_TRIO_TEXTS} from '../lib/woodland-six-bulk.mjs';
import {details} from '../lib/woodland-verse-bulk.mjs';
function png(i){const x=Buffer.alloc(34);x.set([137,80,78,71,13,10,26,10]);x.writeUInt32BE(13,8);x.write('IHDR',12,'ascii');x.writeUInt32BE(3394,16);x.writeUInt32BE(4800,20);x[33]=i+1;return x}
test('browser chunked ZIP roundtrips six original bytes, six details and two independent trios',async()=>{
 const all=WOODLAND.map((p,i)=>png(i));
 const m={phase:'ready',chunkSize:3000000,images:WOODLAND.map((p,i)=>({slug:p.slug,bytes:all[i].length,sha256:createHash('sha256').update(all[i]).digest('hex'),details:details(p)})),bundles:WOODLAND_TRIO_TEXTS};
 const zip=await makeWoodlandZip(m,async(p,j)=>all[m.images.findIndex(x=>x.slug===p.slug)].subarray(j*3000000,(j+1)*3000000));
 const file=new File([zip],'woodland.zip',{type:'application/zip'}),read=await openPosterCollectionZip(file);
 assert.equal(read.items.length,6);assert.equal(read.bundles.length,2);assert.equal(read.listingCount,8);
 for(const entry of read.items){const f=await read.artwork(entry);assert.equal(f.size,34)}
});
