
import test from 'node:test';
import assert from 'node:assert/strict';
import {createResumableChunkFetcher} from '../public/woodland-six-resume.mjs';
const img={slug:'roe-deer',bytes:3000001,sha256:'a'.repeat(64)};
const images=[img,...['fox','robin','hedgehog','badger','red-squirrel'].map(slug=>({slug,bytes:50,sha256:slug.padEnd(64,'b')}))];
const manifest={phase:'ready',chunkSize:3000000,images};
function fakeCache(){
 const map=new Map();
 return {map,get:async key=>map.get(key)||null,put:async(key,v)=>map.set(key,v),clear:async()=>map.clear()};
}
test('retries a dropped mobile chunk and preserves its complete original bytes',async()=>{
 const cached=fakeCache();let requests=0;
 const request=async()=>{requests++;if(requests===1)throw new TypeError('Failed to fetch');return new Response(new Uint8Array(1).fill(42));};
 const r=await createResumableChunkFetcher({manifest,cache:cached,request,wait:async()=>{}});
 const part=await r.getPart(img,1);
 assert.equal(requests,2);assert.deepEqual([...part],[42]);assert.equal(cached.map.size,1);
});
test('reopening the page resumes saved original chunks without network requests',async()=>{
 const cache=fakeCache(),original=new Uint8Array(1).fill(27);let online=true,requests=0;
 const get=async()=>{requests++;if(!online)throw Error('should reuse cached chunk');return new Response(original);};
 const first=await createResumableChunkFetcher({manifest,cache,request:get});
 assert.deepEqual([...await first.getPart(img,1)],[27]);
 online=false;
 const second=await createResumableChunkFetcher({manifest,cache,request:get});
 assert.deepEqual([...await second.getPart(img,1)],[27]);assert.equal(requests,1);
});
test('changed original SHA invalidates prior cached artwork and forces safe refetch',async()=>{
 const cache=fakeCache(),request=async()=>new Response(new Uint8Array(1).fill(10));
 const first=await createResumableChunkFetcher({manifest,cache,request});
 await first.getPart(img,1);
 const revised={...img,sha256:'c'.repeat(64)},changed={...manifest,images:[revised,...images.slice(1)]};
 let count=0;const second=await createResumableChunkFetcher({manifest:changed,cache,request:async()=>{count++;return new Response(new Uint8Array(1).fill(11))}});
 assert.deepEqual([...await second.getPart(revised,1)],[11]);assert.equal(count,1);
});
test('repeated network failures produce a resumable user-facing error rather than an invalid zip',async()=>{
 const cache=fakeCache(),r=await createResumableChunkFetcher({manifest,cache,request:async()=>{throw new TypeError('Failed to fetch')},wait:async()=>{},maxAttempts:3});
 await assert.rejects(r.getPart(img,1),/after 3 tries/);
 assert.equal(cache.map.size,0);
});
