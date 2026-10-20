import test from 'node:test';
import assert from 'node:assert/strict';
import {approveA3Removal,makeA4A5Inventory,executeA3Removal,sizeChangeKey} from '../lib/catalogue-sizes.mjs';
const t=Date.parse('2026-10-20T10:40:00Z'),clock=()=>t;
const record={id:4595277551,title:'Fox Print with Original Woodland Verse',state:'active',section:'Nature',sectionId:60890222,sku:['SP-FOX']};
const audit={version:1,shopId:50893070,checkedAt:t-5000,listings:[record]};
function inv(sizes=['A5','A4','A3'],frames=['Print Only','Black Frame','White Frame','Oak Frame']){
 return {products:sizes.flatMap((size,i)=>frames.map((frame,j)=>({
  sku:'SP-FOX',property_values:[{property_id:513,property_name:'Size',value_ids:[i+1],values:[size]},{property_id:514,property_name:'Frame',value_ids:[j+10],values:[frame]}],
  offerings:[{price:{amount:1399+i*200+j*300,divisor:100,currency_code:'GBP'},quantity:10,is_enabled:true,readiness_state_id:22}]
 }))),price_on_property:[513,514],quantity_on_property:[513,514],sku_on_property:[],readiness_state_on_property:[]};
}
test('eligible A4/A5 poster retains every SKU/frame/price/stock entry',()=>{
 const source=inv(),result=makeA4A5Inventory(source);
 assert.equal(result.products.length,8);assert.equal(result.products.filter(p=>p.sku==='SP-FOX').length,8);
 assert.equal(new Set(result.products.flatMap(p=>p.property_values).filter(v=>v.property_name==='Frame').map(v=>v.values[0])).size,4);
 assert.deepEqual([...new Set(result.products.map(p=>p.property_values[0].values[0]))],['A5','A4']);
 assert.deepEqual(result.price_on_property,[513,514]);
 assert.deepEqual(source.products.length,12);
});
test('unapproved sizes, missing frame option and decorative Wall Art are blocked',()=>{
 assert.throws(()=>makeA4A5Inventory(inv(['A5','A4'])));
 assert.throws(()=>makeA4A5Inventory(inv(['A5','A3'])));
 const mismatched=inv();mismatched.products=mismatched.products.filter(p=>!(p.property_values[0].values[0]==='A4'&&p.property_values[1].values[0]==='Black Frame'));assert.throws(()=>makeA4A5Inventory(mismatched));
 assert.throws(()=>approveA3Removal({audit:{...audit,listings:[{...record,section:'Wall Art'}]},ids:[record.id],shopId:audit.shopId,clock}));
 assert.throws(()=>approveA3Removal({audit:{...audit,checkedAt:t-3600001},ids:[record.id],shopId:audit.shopId,clock}));
});
test('owner-confirmed seller job puts only A4/A5 and verifies unchanged identities',async()=>{
 const plan=approveA3Removal({audit,ids:[record.id],shopId:audit.shopId,clock});
 const id='a'.repeat(32),memory=new Map([[sizeChangeKey(id),{phase:'queued',plan,createdAt:t,results:[]}]]);
 const uploads={get:async k=>memory.get(k),setJSON:async(k,v)=>{memory.set(k,v);return {modified:true};}};
 const source=inv(),expected=makeA4A5Inventory(source),written=[];
 const prepared={...expected,products:expected.products.map((p,i)=>({...p,product_id:i+10,offerings:p.offerings.map(o=>({...o,price:{amount:Math.round(o.price*100),divisor:100,currency_code:'GBP'}}))}))};
 const listing={listing_id:record.id,shop_id:audit.shopId,state:'active',listing_type:'physical',title:record.title,shop_section_id:record.sectionId,skus:record.sku};
 const client={session:async()=>({shop_id:audit.shopId,shop_name:'SapiverPrints'}),api:async(path,options={})=>{
  if(path==='/listings/'+record.id)return listing;
  if(path.startsWith('/listings/'+record.id+'/inventory')){
   if(options.method==='PUT'){written.push(JSON.parse(options.body));return prepared;}
   return written.length?prepared:source;
  }
  throw Error('Unexpected Etsy API call');
 }};
 const result=await executeA3Removal({client,uploads,plan,id,clock});
 assert.equal(result.phase,'complete');assert.equal(result.results.length,1);
 assert.equal(written.length,1);assert.equal(written[0].products.length,8);
 assert.equal(memory.get(sizeChangeKey(id)).phase,'complete');
});
test('failed Etsy read-back stops without retrying the inventory mutation',async()=>{
 const plan=approveA3Removal({audit,ids:[record.id],shopId:audit.shopId,clock}),id='b'.repeat(32);
 const memory=new Map([[sizeChangeKey(id),{phase:'queued',plan,createdAt:t,results:[]}]]);
 const uploads={get:async k=>memory.get(k),setJSON:async(k,v)=>{memory.set(k,v);return {modified:true};}};
 let writes=0;
 const client={session:async()=>({shop_id:audit.shopId,shop_name:'SapiverPrints'}),api:async(path,options={})=>{
  if(path==='/listings/'+record.id)return {listing_id:record.id,shop_id:audit.shopId,state:'active',listing_type:'physical',title:record.title,shop_section_id:record.sectionId,skus:record.sku};
  if(options.method==='PUT'){writes++;return {};}
  return inv();
 }};
 const result=await executeA3Removal({client,uploads,plan,id,clock});
 assert.equal(result.phase,'needs_investigation');assert.equal(writes,1);assert.equal(memory.get(sizeChangeKey(id)).phase,'needs_investigation');
});
