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
 const source=inv(),expected=makeA4A5Inventory(source),written=[],copyWrites=[];
 const prepared={...expected,products:expected.products.map((p,i)=>({...p,product_id:i+10,offerings:p.offerings.map(o=>({...o,price:{amount:Math.round(o.price*100),divisor:100,currency_code:'GBP'}}))}))};
 const listing={listing_id:record.id,shop_id:audit.shopId,state:'active',listing_type:'physical',title:record.title,shop_section_id:record.sectionId,skus:record.sku,description:'Print: A5, A4 and A3.\nChoose your size.'};
 const client={session:async()=>({shop_id:audit.shopId,shop_name:'SapiverPrints'}),api:async(path,options={})=>{
  if(path==='/listings/'+record.id)return listing;
  if(path==='/shops/'+audit.shopId+'/listings/'+record.id&&options.method==='PATCH'){const params=new URLSearchParams(options.body);listing.description=params.get('description');copyWrites.push(listing.description);return listing;}
  if(path.startsWith('/listings/'+record.id+'/inventory')){
   if(options.method==='PUT'){written.push(JSON.parse(options.body));return prepared;}
   return written.length?prepared:source;
  }
  throw Error('Unexpected Etsy API call');
 }};
 const result=await executeA3Removal({client,uploads,plan,id,clock});
 assert.equal(result.phase,'complete');assert.equal(result.results.length,1);
 assert.equal(written.length,1);assert.equal(written[0].products.length,8);
 assert.deepEqual(copyWrites,['Print: A5 and A4.\nChoose your size.']);
 assert.equal(memory.get(sizeChangeKey(id)).phase,'complete');
});
test('failed Etsy read-back stops without retrying the inventory mutation',async()=>{
 const plan=approveA3Removal({audit,ids:[record.id],shopId:audit.shopId,clock}),id='b'.repeat(32);
 const memory=new Map([[sizeChangeKey(id),{phase:'queued',plan,createdAt:t,results:[]}]]);
 const uploads={get:async k=>memory.get(k),setJSON:async(k,v)=>{memory.set(k,v);return {modified:true};}};
 let writes=0;
 const client={session:async()=>({shop_id:audit.shopId,shop_name:'SapiverPrints'}),api:async(path,options={})=>{
  if(path==='/listings/'+record.id)return {listing_id:record.id,shop_id:audit.shopId,state:'active',listing_type:'physical',title:record.title,shop_section_id:record.sectionId,skus:record.sku,description:'A5 and A4'};
  if(options.method==='PUT'){writes++;return {};}
  return inv();
 }};
 const result=await executeA3Removal({client,uploads,plan,id,clock});
 assert.equal(result.phase,'needs_investigation');assert.equal(writes,1);assert.equal(memory.get(sizeChangeKey(id)).phase,'needs_investigation');
});

test('Catalogue Organiser has one owner-approved preset without turning whole listings off',async()=>{
 const {folderCatalogue}=await import('../lib/catalogue-folders.mjs');
 const content=folderCatalogue({audit:{...audit,summary:{physicalTotal:1,activePhysical:1},sections:[{id:44,title:'Nature'}]},status:{phase:'available'},clock});
 assert.match(content,/id="apply-approved-a4a5"/);
 assert.match(content,/16 existing Nature/);
 assert.match(content,/A3 stays available on decorative wall art/);
 assert.doesNotMatch(content,/data-state="inactive"/);
});

test('description reconciliation strips former A3 advertising without rewriting verses',async()=>{
 const {reconcileA4A5Description}=await import('../lib/size-description.mjs');
 const texts=[
  'AVAILABLE SIZES\nA5 — 148 × 210 mm\nA4 — 210 × 297 mm\nA3 — 297 × 420 mm\nCheck the listed A5, A4 and A3 dimensions.',
  'Choose A5 (148 × 210 mm), A4 (210 × 297 mm) or A3 (297 × 420 mm).',
  'Available in A5, A4 and A3. PRINT ONLY.'
 ];
 for(const s of texts){const t=reconcileA4A5Description(s).description;assert.doesNotMatch(t,/\bA3\b/);assert.match(t,/\bA5\b/);assert.match(t,/\bA4\b/);}
 const educational=reconcileA4A5Description('Original alphabet learning art');
 assert.match(educational.description,/AVAILABLE PRINT SIZES/);
 assert.throws(()=>reconcileA4A5Description('Only A3 — wall print.'),/nonstandard/);
});
test('already corrected size inventory updates missing text but never PUTs it',async()=>{
 const plan=approveA3Removal({audit,ids:[record.id],shopId:audit.shopId,clock}),id='c'.repeat(32);
 const memory=new Map([[sizeChangeKey(id),{phase:'queued',plan,createdAt:t,results:[]}]]);
 const uploads={get:async k=>memory.get(k),setJSON:async(k,v)=>{memory.set(k,v);return {modified:true};}};
 const already=inv(['A5','A4']),desc='An educational nature print';
 const listing={listing_id:record.id,shop_id:audit.shopId,state:'active',listing_type:'physical',title:record.title,shop_section_id:record.sectionId,skus:record.sku,description:desc};
 let writes=0,patches=0;
 const client={session:async()=>({shop_id:audit.shopId,shop_name:'SapiverPrints'}),api:async(path,options={})=>{
  if(path==='/listings/'+record.id)return listing;
  if(path==='/listings/'+record.id+'/inventory'){
   if(options.method==='PUT')writes++;
   return already;
  }
  if(path==='/shops/'+audit.shopId+'/listings/'+record.id&&options.method==='PATCH'){patches++;listing.description=new URLSearchParams(options.body).get('description');return listing;}
  throw Error('unexpected provider action');
 }};
 const result=await executeA3Removal({client,uploads,plan,id,clock});
 assert.equal(result.phase,'complete');assert.equal(writes,0);assert.equal(patches,1);
 assert.match(listing.description,/AVAILABLE PRINT SIZES/);
});
