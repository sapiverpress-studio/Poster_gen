import test from 'node:test';
import assert from 'node:assert/strict';
import {FOUR_TRIOS,SHOP} from '../lib/four-existing-trios-section-audit.mjs';
import {assignExistingFourTrios} from '../lib/four-existing-trios-section-apply.mjs';
const sectionId=61291652;
function fixture({changeBeforeWrite=false}={}){
 const etsyStore=new Map(),ids=new Map(FOUR_TRIOS.map(x=>[x.id,null])),ops=[];
 const client={
  session:async()=>({shop_id:SHOP,shop_name:'SapiverPrints'}),
  api:async(path,opts={})=>{
   const section='/shops/'+SHOP+'/sections';
   if(path===section&&(!opts.method||opts.method==='GET'))
    return {results:[{shop_section_id:sectionId,title:'Trio Collection'}]};
   const put=/^\/shops\/50893070\/listings\/(\d+)$/.exec(path);
   if(put&&opts.method==='PATCH'){
    const id=Number(put[1]),body=new URLSearchParams(opts.body);
    assert.equal(body.get('shop_section_id'),String(sectionId));
    assert.equal([...body.keys()].length,1);
    if(changeBeforeWrite&&id===FOUR_TRIOS[0].id)throw Error('Simulated Etsy failure');
    ids.set(id,sectionId);ops.push({op:'patch',id});return {listing_id:id,shop_section_id:sectionId};
   }
   const match=/^\/listings\/(\d+)(\?includes=Images|\/inventory)$/.exec(path);
   if(!match)throw Error('Unexpected API path '+path);
   const id=Number(match[1]),spec=FOUR_TRIOS.find(x=>x.id===id);
   if(!spec)throw Error('Unexpected Etsy listing ID');
   const num=FOUR_TRIOS.findIndex(x=>x.id===id);
   if(match[2]==='/inventory'){
    const count=num<2?1:4;
    return {products:Array.from({length:count},(_,i)=>({
     sku:'TRIO-'+id,property_values:num<2?[]:[
      {property_id:10,property_name:'Size',values:['A4']},
      {property_id:11,property_name:'Frame',values:[['Print Only','Black Frame','White Frame','Oak Frame'][i]]}
     ],offerings:[{price:25+i,quantity:10,is_enabled:true}]
    }))};
   }
   return {listing_id:id,shop_id:SHOP,state:'active',listing_type:'physical',
    shop_section_id:ids.get(id),title:spec.titlePrefix+' A4 Printed Art',
    description:'Three separate physical prints',taxonomy_id:42,
    shipping_profile_id:61,return_policy_id:5,readiness_state_id:7,
    tags:['set of three prints'],images:Array.from({length:num<2?5:4},(_,i)=>({listing_image_id:10000+num*10+i}))};
  }
 };
 const store={
  get:async k=>etsyStore.get(k),
  setJSON:async (k,v,opts={})=>{ops.push({op:'claim',phase:v.phase});
   if(opts.onlyIfNew&&etsyStore.has(k))return {modified:false};
   etsyStore.set(k,v);return {modified:true};}
 };
 return{client,etsyStore:store,ops,ids};
}
test('moves exactly four existing listings to Trio Collection and changes no inventory',async()=>{
 const f=fixture(),r=await assignExistingFourTrios({client:f.client,etsyStore:f.etsyStore});
 assert.equal(r.phase,'complete');
 assert.deepEqual(r.movedIds,FOUR_TRIOS.map(x=>x.id));
 assert.equal(r.sectionId,sectionId);
 assert.equal(r.newListings,0);
 assert.equal(r.orders,0);
 assert.equal(r.sizesUnchanged,true);
 assert.deepEqual(f.ops.filter(x=>x.op==='patch').map(x=>x.id),FOUR_TRIOS.map(x=>x.id));
 await assert.rejects(assignExistingFourTrios({client:f.client,etsyStore:f.etsyStore}),/changed; do not update/);
 assert.equal(f.ops.filter(x=>x.op==='patch').length,4);
});
test('partial Etsy failure retains completed IDs and prohibits automatic retry',async()=>{
 const f=fixture({changeBeforeWrite:true});
 await assert.rejects(assignExistingFourTrios({client:f.client,etsyStore:f.etsyStore}),/Simulated Etsy failure/);
 const claims=[...f.ops.filter(x=>x.op==='claim')];
 assert.equal(claims.at(-1).phase,'needs_investigation');
 assert.equal(f.ops.filter(x=>x.op==='patch').length,0);
});
test('fails closed on a listing that was already moved; does not PATCH again',async()=>{
 const f=fixture();f.ids.set(FOUR_TRIOS[0].id,sectionId);
 await assert.rejects(assignExistingFourTrios({client:f.client,etsyStore:f.etsyStore}),
  /expected uncategorised active trios changed/);
 assert.equal(f.ops.filter(x=>x.op==='patch').length,0);
});
