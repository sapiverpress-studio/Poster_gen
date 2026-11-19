import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {CURRENT_SEO,approvalKey,fingerprint,proposalHash,validateCurrentSeoProposal,
 prepareCurrentSeoAudit,applyCurrentSeoApproval,markCurrentSeoFailure} from '../lib/etsy-current-seo.mjs';
import {suggestCurrentSeo} from '../lib/etsy-current-seo-ai.mjs';
import {handleCurrentSeo} from '../lib/etsy-current-seo-web.mjs';

const ID='a'.repeat(32),APPROVAL='b'.repeat(32),shopId=50893070;
const physical={shop_id:shopId,listing_id:111,state:'active',listing_type:'physical',
 title:'Fox Woodland Wall Art Print',tags:['fox poster','woodland art'],
 description:'An original illustrated fox poster, supplied as an unframed physical print. AI-assisted artwork.',
 taxonomy_id:12,shop_section_id:25,price:{amount:1250,divisor:100,currency_code:'GBP'},
 shipping_profile_id:55,return_policy_id:77,has_variations:true,who_made:'someone_else',when_made:'made_to_order',is_supply:false};
const digital={...physical,listing_id:222,listing_type:'download',title:'Striped Cosy Seamless Pattern Digital Download',
 tags:['seamless pattern','digital download'],description:'DIGITAL DOWNLOAD of a repeatable artwork ZIP. AI-assisted design. No physical item is shipped.',
 shipping_profile_id:null,return_policy_id:null,has_variations:false};
const tags=['fox woodland print','woodland fox art','fox illustration','animal wall decor','british wildlife','nature wall print','cottagecore decor','woodland decor','orange animal art','wildlife wall art','fox art poster','forest animal gift','fox bedroom print'];
const digitalTags=['seamless pattern','faux knit pattern','cosy digital art','digital paper file','crochet look art','stripe repeat','yarn print design','craft pattern file','textile digital art','knitted texture','fabric digital file','cozy blue stripes','downloadable design'];
const proposal={title:'Woodland Fox Wall Art Print',tags,intro:'An illustrated woodland fox physical art print, suitable for nature-themed home decor.'};
const digitalProposal={title:'Cosy Faux Knit Seamless Digital Pattern',tags:digitalTags,intro:'A digital seamless pattern download with faux knitted stripes and a cosy yarn-inspired finish.'};
function store(){
 const map=new Map();return {map,get:async(key)=>map.get(key)??null,
 setJSON:async(key,val,opts={})=>{if(opts.onlyIfNew&&map.has(key))return{modified:false};map.set(key,structuredClone(val));return{modified:true}}};
}
function clientFactory(){
 const listings=new Map([[111,structuredClone(physical)],[222,structuredClone(digital)]]);
 const writes=[],images=new Map([[111,'https://i.etsystatic.com/50893070/r/il/abc/111/il_570xN.111.jpg'],
  [222,'https://i.etsystatic.com/50893070/r/il/def/222/il_570xN.222.jpg']]);
 const inventory={products:[{product_id:10,offerings:[{price:12.5,quantity:10}],property_values:[{property_name:'Size',values:['A4']}]}]};
 const files={results:[{listing_file_id:33,filename:'pattern.zip',size_bytes:43210}]};
 const client={session:async()=>({shop_id:shopId,shop_name:'SapiverPrints'}),api:async(path,opts={})=>{
  if(path==='/shops/'+shopId+'/listings/active?limit=100&offset=0')return {results:[...listings.values()].map(x=>({listing_id:x.listing_id,shop_id:shopId,state:'active'}))};
  if(path==='/listings/111/inventory')return structuredClone(inventory);
  if(path==='/shops/'+shopId+'/listings/222/files')return structuredClone(files);
  const m=/^\/listings\/(\d+)(\/images)?$/.exec(path);
  if(m){
   const row=listings.get(Number(m[1]));
   if(!row)throw Error('Missing seller listing');
   if(m[2])return {results:[{listing_id:row.listing_id,listing_image_id:row.listing_id+1000,rank:1,url_570xN:images.get(row.listing_id)}]};
   return structuredClone(row);
  }
  if(path.startsWith('/shops/'+shopId+'/listings/')&&opts.method==='PATCH'){
   const id=Number(path.split('/').at(-1)),old=listings.get(id);
   writes.push({id,opts});
   if(!old)throw Error('Missing');
   const fields=new URLSearchParams(opts.body);
   const updated={...old,title:fields.get('title')||old.title,tags:(fields.get('tags')||'').split(','),
    description:fields.get('description')||old.description};
   listings.set(id,updated);return structuredClone(updated);
  }
  throw Error('Unexpected Etsy request: '+path);
 }};
 return {client,listings,writes,inventory,files};
}
test('current catalogue snapshots physical and digital listings without Etsy writes',async()=>{
 const uploads=store(),f=clientFactory();
 await uploads.setJSON(CURRENT_SEO,{id:ID,phase:'queued',createdAt:Date.now(),rows:[]});
 const x=await prepareCurrentSeoAudit({client:f.client,uploads,id:ID});
 assert.deepEqual([x.count,x.ready],[2,2]);
 const state=await uploads.get(CURRENT_SEO);
 assert.equal(state.rows[0].status,'pending');
 assert.equal(state.rows[1].type,'download');
 assert.equal(state.rows[0].fingerprint,fingerprint(physical));
 assert.equal(f.writes.length,0);
});
test('validates 13 unique buyer tags and correct physical versus digital product types',()=>{
 assert.equal(validateCurrentSeoProposal(proposal,'physical').tags.length,13);
 assert.equal(validateCurrentSeoProposal(digitalProposal,'download').title,digitalProposal.title);
 assert.throws(()=>validateCurrentSeoProposal({...proposal,tags:tags.slice(1)},'physical'),/13 unique/);
 assert.throws(()=>validateCurrentSeoProposal({...digitalProposal,title:'Fox framed physical print'},'download'),/Digital title/);
 assert.throws(()=>validateCurrentSeoProposal({...proposal,title:'Digital Pattern'},'physical'),/physical print/);
});
async function prepared({type='physical',includeIntro=false}={}){
 const f=clientFactory(),uploads=store();
 const source=type==='physical'?physical:digital,p=type==='physical'?proposal:digitalProposal;
 const row={id:source.listing_id,type:source.listing_type,title:source.title,tags:source.tags,
  description:source.description,fingerprint:fingerprint(source),status:'apply_queued',
  proposal:p,applyId:APPROVAL};
 row.proposalHash=proposalHash(row,p);
 await uploads.setJSON(CURRENT_SEO,{id:ID,phase:'ready',shopId,checkedAt:Date.now(),rows:[row]});
 await uploads.setJSON(approvalKey(APPROVAL),{auditId:ID,listingId:source.listing_id,proposalHash:row.proposalHash,includeIntro});
 return {f,uploads,row};
}
test('approved physical SEO writes only metadata, backs up originals and verifies inventory',async()=>{
 const {f,uploads}=await prepared();
 const result=await applyCurrentSeoApproval({client:f.client,uploads,id:APPROVAL});
 assert.deepEqual(result,{id:111,status:'updated'});
 assert.equal(f.writes.length,1);
 assert.deepEqual([...new URLSearchParams(f.writes[0].opts.body).keys()],['title','tags']);
 assert.equal(f.listings.get(111).description,physical.description);
 assert.equal(f.listings.get(111).price.amount,physical.price.amount);
 assert.ok((await uploads.get('seo-current/backup/'+APPROVAL)).protectedRecord);
 assert.equal((await uploads.get(CURRENT_SEO)).rows[0].status,'updated');
});
test('approved digital SEO never touches download files or existing disclosure',async()=>{
 const {f,uploads}=await prepared({type:'download',includeIntro:true});
 await applyCurrentSeoApproval({client:f.client,uploads,id:APPROVAL});
 assert.equal(f.writes.length,1);
 assert.ok(f.listings.get(222).description.startsWith(digitalProposal.intro));
 assert.ok(f.listings.get(222).description.includes('AI-assisted design'));
 assert.equal((await uploads.get('seo-current/backup/'+APPROVAL)).protectedRecord.files[0][1],'pattern.zip');
});
test('changed live listing blocks SEO write and all duplicate approvals remain claimed',async()=>{
 const {f,uploads}=await prepared();
 f.listings.get(111).price.amount=1300;
 await assert.rejects(applyCurrentSeoApproval({client:f.client,uploads,id:APPROVAL}),/Listing changed/);
 assert.equal(f.writes.length,0);
});
test('unknown outcome is retained for investigation rather than retried',async()=>{
 const {uploads}=await prepared();
 await markCurrentSeoFailure({uploads,id:APPROVAL});
 assert.equal((await uploads.get(CURRENT_SEO)).rows[0].status,'needs_investigation');
});
test('owner saves one edited review and queues an explicit seller worker without writing Etsy',async()=>{
 const {uploads,f,row}=await prepared();
 const state=await uploads.get(CURRENT_SEO);state.rows[0].status='proposed';state.rows[0].applyId=null;
 await uploads.setJSON(CURRENT_SEO,state);
 const jobs=[],handler=async (path,body)=>handleCurrentSeo({
  path,req:new Request('https://poster.example.test'+path,{method:'POST',
   headers:{'Content-Type':'application/json','x-poster-csrf':'owner-token'},body:JSON.stringify(body)}),
  uploads,owner:{csrf:'owner-token'},env:()=>'',dispatch:async(job,action)=>jobs.push({job,action}),
  clock:()=>Date.now(),page:x=>new Response(x),esc:x=>x
 });
 const edited=await handler('/poster/seo/current/edit',{id:111,...proposal,title:'Fox in a Forest Wall Art Print'});
 assert.equal(edited.status,200);
 const value=await edited.json();assert.ok(value.proposalHash);
 const queued=await handler('/poster/seo/current/apply',{id:111,proposalHash:value.proposalHash,includeIntro:false,confirm:true});
 assert.equal(queued.status,202);
 assert.equal(jobs.length,1);assert.equal(jobs[0].action,'seo_current_apply');
 assert.equal(f.writes.length,0);
});
test('image-based existing-listing analyser uses one verified Etsy image and a strict schema',async()=>{
 const row={...physical,id:111,type:'physical',imageUrl:'https://i.etsystatic.com/50893070/r/il/abc/111/il_570xN.111.jpg'};
 const photo=await sharp({create:{width:600,height:900,channels:3,background:'#5a94ab'}}).jpeg().toBuffer();
 const seen=[];let result;
 const request=async(url,opts)=>{
  seen.push(url);
  if(url.startsWith('https://i.etsystatic.com/'))return new Response(photo,{headers:{'content-type':'image/jpeg'}});
  result=JSON.parse(opts.body);
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(proposal)},finish_reason:'stop'}]})};
 };
 const cacheStore=store();
 const out=await suggestCurrentSeo({row,apiKey:'test',cacheStore,monthlyLimit:5,request});
 assert.equal(out.title,proposal.title);
 assert.equal(seen.length,2);
 assert.equal(result.response_format.type,'json_schema');
 assert.equal(result.messages[1].content[1].type,'image_url');
 assert.ok(result.messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,'));
 const same=await suggestCurrentSeo({row,apiKey:'test',cacheStore,monthlyLimit:5,request});
 assert.deepEqual(same,out);
 assert.equal(seen.length,3,'identical listing reuses existing OpenAI result after reading artwork');
 const different={...row,title:'Fox in Meadow Wall Art Print'};
 const changed=await suggestCurrentSeo({row:different,apiKey:'test',cacheStore,monthlyLimit:5,request});
 assert.deepEqual(changed,out);
 assert.equal(seen.length,5,'changed listing text invalidates cache and pays for another analysis');
 assert.equal([...cacheStore.map.keys()].filter(k=>k.startsWith('seo-ai/usage/')).length,2);
});
