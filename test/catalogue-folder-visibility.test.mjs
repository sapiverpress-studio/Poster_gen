import test from 'node:test';
import assert from 'node:assert/strict';
import {approveVisibilityPlan,executeVisibilityPlan,visibilityKey} from '../lib/catalogue-visibility.mjs';
import {folderCatalogue,studioHome} from '../lib/catalogue-folders.mjs';
const now=1800000000000,shopId=456;
const listings=[
 {id:111,title:'Robin',section:'Nature',sectionId:11,state:'active',sku:['SP-ROBIN'],deliveryMatches:true},
 {id:112,title:'Hedgehog',section:'Nature',sectionId:11,state:'inactive',sku:['SP-HEDGEHOG'],deliveryMatches:true},
 {id:113,title:'Fox',section:'Nature',sectionId:11,state:'draft',sku:['SP-FOX'],deliveryMatches:false},
 {id:114,title:'Sunflower',section:'Wall Art',sectionId:12,state:'active',sku:['SP-SUNFLOWER'],deliveryMatches:true},
 {id:115,title:'Winter Owl',section:'Nature',sectionId:11,state:'expired',sku:['SP-OWL'],deliveryMatches:true}
];
const snapshot=()=>({version:1,shopId,checkedAt:now-1000,sections:[{id:11,title:'Nature'},{id:12,title:'Wall Art'},{id:13,title:'Christmas'}],summary:{physicalTotal:5,activePhysical:2,activeCorrectDelivery:2,activeOtherDelivery:0,unverifiedSupplier:0},listings:listings.map(x=>({...x}))});
function fixture(){
 const values=new Map(),rows=new Map(listings.map(x=>[x.id,{listing_id:x.id,shop_id:shopId,listing_type:'physical',title:x.title,shop_section_id:x.sectionId,state:x.state,skus:x.sku}]));
 let requests=[],ambiguous=false;
 const client={session:async()=>({shop_id:shopId,shop_name:'SapiverPrints'}),api:async(path,opts)=>{
  requests.push({path,opts});
  const id=Number(/\/listings\/(\d+)$/.exec(path)?.[1]);
  if(!rows.has(id))throw Error('missing listing');
  const row=rows.get(id);
  if(opts){assert.equal(opts.method,'PATCH');assert.deepEqual([...new URLSearchParams(opts.body)],[['state',new URLSearchParams(opts.body).get('state')]]);if(ambiguous)throw Error('network unclear');row.state=new URLSearchParams(opts.body).get('state');}
  return {...row};
 }};
 const uploads={get:async key=>values.get(key)||null,setJSON:async(key,value)=>{values.set(key,value);return {modified:true};}};
 return {client,uploads,values,rows,requests,ambiguous:()=>{ambiguous=true}};
}
test('folders show only small cards, real state and gated Etsy switches',()=>{
 const audit=snapshot();
 const html=folderCatalogue({audit,status:{phase:'available'},labels:{111:['All year'],112:['Winter']},clock:()=>now});
 assert.match(html,/href="\/poster\/catalogue\?section=Nature"/);
 assert.match(html,/href="\/poster\/catalogue\?section=Christmas"/);
 assert.match(html,/href="\/poster\/catalogue\?season=Winter"/);
 assert.doesNotMatch(html,/poster-toggle/);
 const folder=folderCatalogue({audit,status:{phase:'available'},section:'Nature',clock:()=>now});
 assert.match(folder,/role="switch"/);
 assert.match(folder,/On Etsy/);assert.match(folder,/Off Etsy/);
 assert.match(folder,/View only/);
 assert.doesNotMatch(folder,/Data from Etsy\w+ private/);
 assert.match(studioHome({catalogue:audit}),/Six-poster pack/);
 const stale=folderCatalogue({audit,status:{phase:'available'},section:'Nature',clock:()=>now+3600001});
 assert.match(stale,/disabled/);assert.match(stale,/over one hour old/);
});
test('owner selection allows only active/inactive listing IDs with fresh matching shop audit',()=>{
 const audit=snapshot();
 const plan=approveVisibilityPlan({audit,shopId,target:'inactive',ids:[111,114],clock:()=>now});
 assert.deepEqual(plan.items.map(x=>x.id),[111,114]);
 for(const ids of [[113],[115],[111,111],[111,999],[]])assert.throws(()=>approveVisibilityPlan({audit,shopId,target:'inactive',ids,clock:()=>now}));
 assert.throws(()=>approveVisibilityPlan({audit,shopId:999,target:'inactive',ids:[111],clock:()=>now}),/Refresh/);
 assert.throws(()=>approveVisibilityPlan({audit,shopId,target:'inactive',ids:[111],clock:()=>now+3600001}),/Refresh/);
 assert.throws(()=>approveVisibilityPlan({audit,shopId,target:'active',ids:[111],clock:()=>now}),/eligible/);
});
test('worker only PATCHes existing physical state after preflight; persists readback and cannot replay',async()=>{
 const f=fixture(),id='a'.repeat(32),audit=snapshot(),plan=approveVisibilityPlan({audit,shopId,target:'inactive',ids:[111,114],clock:()=>now});
 await f.uploads.setJSON('catalogue/audit',audit);await f.uploads.setJSON(visibilityKey(id),{phase:'queued',plan,createdAt:now});
 const done=await executeVisibilityPlan({client:f.client,uploads:f.uploads,plan,id,clock:()=>now});
 assert.equal(done.phase,'complete');assert.equal(done.results.length,2);
 assert.equal(f.requests.filter(x=>x.opts).length,2);
 assert.equal(f.requests.filter(x=>x.opts).every(x=>new URLSearchParams(x.opts.body).toString()==='state=inactive'),true);
 assert.equal((await f.uploads.get('catalogue/audit')).summary.activePhysical,0);
 await assert.rejects(executeVisibilityPlan({client:f.client,uploads:f.uploads,plan,id,clock:()=>now}),/expired or already processed/);
 assert.equal(f.requests.filter(x=>x.opts).length,2);
});
test('worker halts before any write when one selected Etsy listing has drifted',async()=>{
 const f=fixture(),id='b'.repeat(32),plan=approveVisibilityPlan({audit:snapshot(),shopId,target:'inactive',ids:[111,114],clock:()=>now});
 f.rows.get(114).title='Changed listing title';
 await f.uploads.setJSON(visibilityKey(id),{phase:'queued',plan,createdAt:now});
 await assert.rejects(executeVisibilityPlan({client:f.client,uploads:f.uploads,plan,id,clock:()=>now}),/changed since approval/);
 assert.equal(f.requests.filter(x=>x.opts).length,0);
});
test('uncertain Etsy network result halts permanently without replaying PATCH',async()=>{
 const f=fixture(),id='c'.repeat(32),plan=approveVisibilityPlan({audit:snapshot(),shopId,target:'inactive',ids:[111],clock:()=>now});
 await f.uploads.setJSON(visibilityKey(id),{phase:'queued',plan,createdAt:now});f.ambiguous();
 const x=await executeVisibilityPlan({client:f.client,uploads:f.uploads,plan,id,clock:()=>now});
 assert.equal(x.phase,'needs_investigation');
 assert.equal((await f.uploads.get(visibilityKey(id))).attemptingId,111);
 assert.equal(f.requests.filter(x=>x.opts).length,1);
 await assert.rejects(executeVisibilityPlan({client:f.client,uploads:f.uploads,plan,id,clock:()=>now}));
 assert.equal(f.requests.filter(x=>x.opts).length,1);
});
