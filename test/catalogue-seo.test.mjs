import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSeoAudit,applySeoUpdate,validateSeoProposals,latestSeoAudit} from '../lib/catalogue-seo.mjs';
const tags=Array.from({length:13},(_,i)=>'nature print '+i);
const proposal=(id,title)=>({listing_id:id,existing_title:title,suggested_title:'Garden Robin Art Print '+id,suggested_tags:[...tags],review_note:''});
const manifest={shop:'SapiverPrints',data:[proposal(111,'The Robin Wall Art Print'),proposal(112,'The Fox Wall Art Print')]};
function fixture(){
 const saved=new Map(),records=new Map(),writes=[];
 for(const row of manifest.data)records.set(row.listing_id,{listing_id:row.listing_id,shop_id:13,state:'active',listing_type:'physical',title:row.existing_title,tags:[...tags],taxonomy_id:2078,skus:['PROTECTED-SKU']});
 const uploads={async get(k){return saved.get(k)||null},async setJSON(k,v,opts={}){if(opts.onlyIfNew&&saved.has(k))return {modified:false};saved.set(k,structuredClone(v));return {modified:true}}};
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:13}),api:async(path,opts={})=>{
  if(path.startsWith('/shops/13/listings?'))return {count:records.size,results:[...records.values()]};
  if(path.startsWith('/listings/'))return structuredClone(records.get(Number(path.split('/')[2])));
  if(path.startsWith('/shops/13/listings/')&&opts.method==='PATCH'){
   const id=Number(path.split('/')[4]),values=new URLSearchParams(opts.body),keys=[...values.keys()];
   assert.deepEqual(keys,['title','tags'],'Only exact metadata fields may be changed');
   const rec=records.get(id);rec.title=values.get('title');rec.tags=values.get('tags').split(',');writes.push(id);return structuredClone(rec);
  }
  throw Error('Unexpected request '+path);
 }};
 return {uploads,client,records,writes,saved};
}
test('complete catalogue is read without writes; all records have snapshot and tag comparisons',async()=>{
 const f=fixture(),r=await prepareSeoAudit({...f,manifest,clock:()=>100});
 assert.equal(r.rows.length,2);assert.equal(r.rows.every(x=>x.state==='ready'),true);
 assert.deepEqual(f.writes,[]);assert.equal(r.rows[0].before.tags.length,13);
});
test('guarded update changes title and tags only, reads back same existing listing id, backs up original',async()=>{
 const f=fixture(),r=await prepareSeoAudit({...f,manifest,clock:()=>100});
 const result=await applySeoUpdate({...f,batch:r.batch,id:111,clock:()=>101});
 assert.equal(result.state,'updated');assert.deepEqual(f.writes,[111]);
 assert.deepEqual(f.records.get(111).skus,['PROTECTED-SKU']);
 assert.equal(f.records.get(111).taxonomy_id,2078);
 assert.equal(f.saved.get('seo/backup/'+r.batch+'/111').before.title,'The Robin Wall Art Print');
 assert.equal((await applySeoUpdate({...f,batch:r.batch,id:111,clock:()=>102})).state,'already_current');
});
test('changing tags after read-only audit blocks patch before any Etsy write',async()=>{
 const f=fixture(),r=await prepareSeoAudit({...f,manifest,clock:()=>100});
 f.records.get(112).tags=['changed',...tags.slice(1)];
 await assert.rejects(applySeoUpdate({...f,batch:r.batch,id:112,clock:()=>200}),/changed after audit/);
 assert.deepEqual(f.writes,[]);
});
test('incomplete proposal file cannot silently exclude active seller listings',async()=>{
 const f=fixture();
 await assert.rejects(prepareSeoAudit({...f,manifest:{...manifest,data:manifest.data.slice(0,1)}}),/catalogue differs/);
 assert.deepEqual(f.writes,[]);
});
test('mismatched snapshot titles are blocked for updates, not rewritten blindly',async()=>{
 const f=fixture(),m={...manifest,data:manifest.data.map(x=>({...x}))};m.data[1].existing_title='Different title';
 const r=await prepareSeoAudit({...f,manifest:m,clock:()=>100});
 assert.equal(r.rows[1].state,'changed_since_snapshot');
 await assert.rejects(applySeoUpdate({...f,batch:r.batch,id:112,clock:()=>200}),/changed since public snapshot/);
});
test('proposals reject duplicate listing IDs and short one-word tags',()=>{
 assert.throws(()=>validateSeoProposals({...manifest,data:[manifest.data[0],manifest.data[0]]}),/invalid/);
 assert.throws(()=>validateSeoProposals({...manifest,data:[{...manifest.data[0],suggested_tags:['fox']}] }),/invalid/);
});

test('bundled catalogue contains all twenty verified IDs and valid Etsy title/tag proposals',async()=>{
 const {seoProposals}=await import('../lib/seo-proposals.mjs');
 const rows=validateSeoProposals(seoProposals);
 assert.equal(rows.length,20);
 assert.equal(new Set(rows.map(r=>r.id)).size,20);
 assert.ok(rows.some(r=>r.id===4596569132));
 assert.ok(rows.some(r=>r.id===4589715100));
 assert.ok(rows.every(r=>r.tags.length===13&&r.tags.every(t=>t.length<=20)));
});

test('latest full-catalogue audit restores safely and expires after 24 hours',async()=>{
 const f=fixture(),r=await prepareSeoAudit({...f,manifest,clock:()=>100});
 const recent=await latestSeoAudit({uploads:f.uploads,clock:()=>101});
 assert.equal(recent.batch,r.batch);assert.equal(recent.rows.length,2);
 assert.equal(await latestSeoAudit({uploads:f.uploads,clock:()=>86400200}),null);
});
test('resume skips completed listings yet preserves untouched listing identities',async()=>{
 const f=fixture(),r=await prepareSeoAudit({...f,manifest,clock:()=>100});
 await applySeoUpdate({...f,batch:r.batch,id:111,clock:()=>110});
 const recent=await latestSeoAudit({uploads:f.uploads,clock:()=>120});
 assert.equal(recent.rows[0].attempted,'complete');
 assert.equal((await applySeoUpdate({...f,batch:r.batch,id:111,clock:()=>130})).state,'already_current');
 assert.equal((await applySeoUpdate({...f,batch:r.batch,id:112,clock:()=>140})).state,'updated');
 assert.deepEqual(f.writes,[111,112]);
});
