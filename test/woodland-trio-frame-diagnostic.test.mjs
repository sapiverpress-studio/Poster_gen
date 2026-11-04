import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditWoodlandTrioFrames,WOODLAND_TRIO_LISTING_IDS} from '../lib/woodland-trio-frame-diagnostic.mjs';

function fixture({descriptionChanged=false,missingSecond=false,wrongSupplier=false}={}){
 const store=new Map(),writes=[];
 const frames=['Print Only','Black Frame','White Frame','Oak Frame'];
 WOODLAND_TRIO_LISTING_IDS.forEach((listingId,i)=>{
  if(i===1&&missingSecond)return;
  const id=String(i+1).repeat(32),memberIds=Array.from({length:3},(_,n)=>String(i+3+n).repeat(32));
  const sku='SP-WOOD-TRIO-'+i,body={title:'Woodland Nature Trio '+i,description:'Three separate unframed A4 woodland prints.'};
  store.set('products/'+id+'/record',{type:'physical_bundle',productId:id,etsyListingId:listingId,currentRevision:id});
  store.set('uploads/'+id+'/state',{type:'physical_bundle',phase:'published',productId:id,listingId,sku,
   supplierProductId:'BUNDLE-'+i,plan:{body,quote:{grossGbp:42}},memberIds,
   memberRefs:memberIds.map((m,n)=>({id:m,sku:'MEMBER-'+i+'-'+n})),
   trio:{title:body.title,size:'A4',members:['a','b','c']}});
  store.set('trio-frames/'+id,{phase:'needs_investigation'});
  memberIds.forEach((memberId,n)=>{
   store.set('uploads/'+memberId+'/state',{type:'physical',phase:'published',listingId:n?null:8000+i,
    plan:{inventory:{products:frames.map(frame=>({property_values:[
      {property_id:513,values:['A4']},{property_id:514,values:[frame]}],
     offerings:[{price:20,is_enabled:true}]}))}}});
  });
 });
 const uploads={
  get:async key=>store.get(key)||null,
  list:async function*({prefix,paginate}){
   assert.equal(prefix,'products/');assert.equal(paginate,true);
   yield {blobs:[...store.keys()].filter(key=>key.startsWith('products/')).map(key=>({key}))};
  },
  setJSON:async()=>{writes.push('setJSON');throw Error('Diagnostic attempted a write');},
  set:async()=>{writes.push('set');throw Error('Diagnostic attempted a write');}
 };
 const etsyRequests=[];
 const client={
  session:async()=>({shop_name:'SapiverPrints',shop_id:50893070}),
  api:async path=>{
   etsyRequests.push(path);
   const match=path.match(/^\/listings\/(\d+)(\/inventory)?$/);
   if(!match)throw Error('Unexpected seller API '+path);
   const id=Number(match[1]),i=WOODLAND_TRIO_LISTING_IDS.indexOf(id);
   if(i<0)throw Error('Unknown Etsy ID');
   if(match[2])return {products:[{sku:'SP-WOOD-TRIO-'+i,property_values:[],
    offerings:[{price:42,is_enabled:true}]}]};
   const body=store.get('uploads/'+String(i+1).repeat(32)+'/state')?.plan.body;
   return {shop_id:50893070,listing_id:id,state:'active',title:body.title,
    description:descriptionChanged&&i===0?body.description+' edited':body.description};
  }
 };
 const lookupCalls=[],bundleLookup=async({sku})=>{
  lookupCalls.push(sku);const i=Number(sku.at(-1));
  return {success:true,bundle:{bundle_id:wrongSupplier?'OTHER':'BUNDLE-'+i,
   sku,items:[0,1,2].map(n=>({sku:'MEMBER-'+i+'-'+n,quantity:1,size:'A4'}))}};
 };
 const diagnoseCalls=[],diagnose=async({id})=>{
  diagnoseCalls.push(id);
  return {phase:'blocked',reason:'etsy_listing_or_description_drift'};
 };
 return {uploads,client,bundleLookup,diagnose,env:()=> 'SECRET_NOT_LOGGED',
  writes,etsyRequests,lookupCalls,diagnoseCalls};
}
test('two exact published Woodland listing and supplier records are inspected without writes',async()=>{
 const f=fixture(),result=await auditWoodlandTrioFrames(f);
 assert.equal(result.phase,'read_only_complete');assert.equal(result.count,2);
 assert.equal(result.writesAttempted,0);assert.equal(f.writes.length,0);
 assert.deepEqual(result.results.map(x=>x.listingId),WOODLAND_TRIO_LISTING_IDS);
 assert.deepEqual(result.results.map(x=>x.etsy.originalDescriptionMatches),[true,true]);
 assert.deepEqual(result.results.map(x=>x.supplier.bundleIdMatches),[true,true]);
 assert.deepEqual(result.results.map(x=>x.sources.templateFrameMembers),[3,3]);
 assert.deepEqual(result.results.map(x=>x.sources.etsySingles),[1,1]);
 assert.ok(f.etsyRequests.every(s=>/^\/listings\/(?:4600182933|4600180569)(?:\/inventory)?$/.test(s)));
 assert.equal(f.lookupCalls.length,2);
 assert.equal(f.diagnoseCalls.length,2);
 assert.equal(result.results[0].upgrade,'needs_investigation');
});
test('edited Etsy descriptions and changed supplier IDs remain visible, not silently repaired',async()=>{
 const r=await auditWoodlandTrioFrames(fixture({descriptionChanged:true,wrongSupplier:true}));
 assert.equal(r.results[0].etsy.originalDescriptionMatches,false);
 assert.equal(r.results[0].supplier.bundleIdMatches,false);
 assert.equal(r.results[0].preflight.phase,'blocked');
});
test('absent second saved trio refuses a fabricated replacement',async()=>{
 const r=await auditWoodlandTrioFrames(fixture({missingSecond:true}));
 assert.equal(r.results[1].saved,'missing_saved_bundle_record');
 assert.equal(r.results[1].preflight.phase,'not_run');
});
test('the one-off GitHub workflow guard runs before ordinary queued worker actions',()=>{
 const script=readFileSync(new URL('../scripts/github-publication.mjs',import.meta.url),'utf8');
 const entry="GITHUB_RUN_ID==='41789870058'&&process.env.GITHUB_RUN_ATTEMPT==='2'";
 const a=script.indexOf(entry),b=script.indexOf("const jobs=await collectGithubJobs");
 assert.ok(a>0&&b>a);
 const fragment=script.slice(a,b);
 assert.match(fragment,/auditWoodlandTrioFrames/);
 assert.match(fragment,/process.exit\(0\)/);
 assert.doesNotMatch(fragment,/runGithubJobs|\.api\(.+method:'PUT'/);
});
