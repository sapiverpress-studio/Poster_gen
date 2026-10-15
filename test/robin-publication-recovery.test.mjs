import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {recoverRobinDraft} from '../lib/robin-publication-recovery.mjs';
import {matchesApprovedEtsyDescription,templateDraftPlan,TEMPLATE_VERSION} from '../lib/poster-template.mjs';
import {reference,inventory,shipping,processing,returns,carriers} from './fixtures/poster-template.mjs';

const SKU='SP-THE-ROBIN',L=4595921846,S=50893070,ID='b'.repeat(32);
const hash=v=>createHash('sha256').update(v).digest('hex');
function memory(){const data=new Map();return {data,get:async k=>data.get(k),setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&data.has(k))return {modified:false};data.set(k,structuredClone(v));return {modified:true};}};}
async function fixture(){
 const uploads=memory(),etsyStore=memory(),calls=[];let state='draft',supplier=null,descriptionDrift=false,posts=0;
 const plan=templateDraftPlan({filename:SKU+'.png',reference,inventory,shopId:456});
 plan.identity.sectionTitle='Nature';plan.body.production_partner_ids='55';
 plan.body.description="The robin's nest and a robin's song & woodland verse - artwork selected and prepared for print.";
 const master=Buffer.from('approved robin source');const previews=['one','two','three','four'].map(s=>Buffer.from(s));
 plan.identity.previewHashes=previews.map(hash);
 plan.hash=hash(JSON.stringify({version:plan.version,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 const approvalHash=hash(hash(master)+':'+plan.hash+':'+TEMPLATE_VERSION);
 const asset={phase:'needs_investigation',stage:'etsy_draft',listingId:L,productId:ID,plan,approvedAt:1,approvalHash,image:{sha256:hash(master),bytes:master.length},masterKey:'uploads/'+ID+'/master.png'};
 await uploads.setJSON('uploads/'+ID+'/state',asset);uploads.data.set(asset.masterKey,master);
 previews.forEach((b,i)=>uploads.data.set('uploads/'+ID+'/mockups/'+i+'.jpg',b));
 await uploads.setJSON('claims/'+ID+'/publish',{approvalHash});
 await uploads.setJSON('products/'+ID+'/record',{etsyListingId:L,pendingRevision:ID});
 await etsyStore.setJSON('draft/'+SKU,{phase:'inventory_pending',listingId:L,uploadId:ID});
 const inventoryRead={products:plan.inventory.products.map(p=>({...p,offerings:p.offerings.map(o=>({...o,price:{amount:Math.round(o.price*100),divisor:100,currency_code:'GBP'}}))}))};
 const client={session:async()=>({shop_id:S,shop_name:'SapiverPrints'}),api:async(path,o={})=>{
  calls.push([path,o.method||'GET']);
  if(path===`/listings/${L}?includes=Images`)return {...plan.body,listing_id:L,shop_id:S,listing_type:'physical',state,is_personalizable:false,
   shop_section_id:88,tags:plan.body.tags.split(','),description:descriptionDrift?'Really changed listing content':plan.body.description.replaceAll("'",'&#39;'),
   images:[1,2,3,4].map(n=>({listing_image_id:n,rank:n})),url:`https://www.etsy.com/listing/${L}`};
  if(path===`/listings/${L}/inventory`)return inventoryRead;
  if(path===`/shops/${S}/sections`)return {results:[{shop_section_id:88,title:'Nature'}]};
  if(path.includes('/shipping-profiles/'))return shipping;
  if(path.includes('/readiness-state-definitions/'))return {...processing,shop_id:S};
  if(path.includes('/policies/return/'))return {...returns,shop_id:S};
  if(path.startsWith('/shipping-carriers'))return carriers;
  if(path.endsWith('/production-partners'))return {results:[{partner_name:'PrintShrimp',location:'Romford',production_partner_id:55}]};
  if(path===`/shops/${S}/listings/${L}`&&o.method==='PATCH'){if(!supplier)throw Error('Missing supplier');assert.equal(o.body,'state=active');state='active';return {state};}
  throw Error('Unexpected API '+path);
 }};
 const request=async(url,o)=>{calls.push(['supplier',o.method]);if(o.method==='POST'){posts++;supplier={product_id:'supplier-robin',sku:SKU,variants:['A5','A4','A3'].map(size=>({size,image_url:'https://supplier.example.test/'+size}))};return Response.json({success:true});}return supplier?Response.json({success:true,product:supplier}):new Response(null,{status:404});};
 const env=k=>({POSTER_PUBLICATION_ENABLED:'true',SHRIMP_APIKEY:'test-api-key',CANVA_SITE_ORIGIN:'https://poster.example.test'}[k]);
 return {uploads,etsyStore,client,request,env,calls,getPosts:()=>posts,drift:()=>{descriptionDrift=true;}};
}
test('ampersand-escaped approved content is equivalent; material title/description changes remain rejected',()=>{
 assert.equal(matchesApprovedEtsyDescription('Robin & meadow','Robin &amp; meadow'),true);
 assert.equal(matchesApprovedEtsyDescription('Robin & meadow','Robin and meadow'),false);
 assert.equal(matchesApprovedEtsyDescription('Robin & meadow','Robin &amp; meadow altered'),false);
 assert.equal(matchesApprovedEtsyDescription('Robin & meadow','Robin &lt; meadow'),false);
 assert.equal(matchesApprovedEtsyDescription('Robin & meadow',null),false);
 assert.equal(matchesApprovedEtsyDescription("Robin's meadow & verse",'Robin&#39;s meadow & verse'),true);
 assert.equal(matchesApprovedEtsyDescription("Robin's meadow & verse",'Robin&#39;s meadow & changed'),false);
 assert.equal(matchesApprovedEtsyDescription("Robin's meadow & verse",'Robin&#39;s  meadow & verse'),false);
 assert.equal(matchesApprovedEtsyDescription('One & two & three','One &amp; two & three'),true);
 assert.equal(matchesApprovedEtsyDescription('One & two & three','One & two &amp; three'),true);
 assert.equal(matchesApprovedEtsyDescription('One & two & three','One &amp; two & changed'),false);
});
test('exact multi-entity encoding preserves approved text and rejects any extra characters',()=>{
 assert.equal(matchesApprovedEtsyDescription("Robin's nest and robin's tree","Robin&#39;s nest and robin&#39;s tree"),true);
 assert.equal(matchesApprovedEtsyDescription("Robin's nest & robin's tree","Robin&#39;s nest &amp; robin&#39;s tree"),true);
 assert.equal(matchesApprovedEtsyDescription("Robin's nest and robin's tree","Robin&#39;s nest and robin&#39;s TREE"),false);
 assert.equal(matchesApprovedEtsyDescription("Robin's nest and robin's tree","Robin&#39;s nest and  robin&#39;s tree"),false);
 assert.equal(matchesApprovedEtsyDescription("Robin 🪺 & song","Robin 🪺 &amp; song"),true);
});
test('recovery of EXISTING robin draft reuses all twelve variations and four images; transfers supplier and activates once',async()=>{
 const f=await fixture();const r=await recoverRobinDraft(f);
 assert.equal(r.phase,'published');assert.equal(r.listingId,L);assert.equal(f.getPosts(),1);
 assert.equal(f.calls.filter(([p,m])=>m==='POST'&&p!=='supplier').length,0);
 assert.equal(f.calls.filter(([p,m])=>m==='PUT').length,0);
 assert.equal(f.calls.filter(([p,m])=>m==='PATCH').length,1);
 const state=await f.uploads.get('uploads/'+ID+'/state');assert.equal(state.phase,'published');
 assert.equal(state.supplierProductId,'supplier-robin');
 assert.equal((await f.uploads.get('supplier/'+SKU)).ordersEnabled,false);
 assert.equal((await f.uploads.get('supplier/'+SKU)).phase,'verified');
 assert.equal((await f.etsyStore.get('draft/'+SKU)).listingId,L);
 assert.ok([...f.uploads.data.entries()].some(([k,v])=>k.startsWith('transfers/')&&v.revoked));
 await assert.rejects(recoverRobinDraft(f));assert.equal(f.getPosts(),1);
});
test('changed buyer-facing copy blocks recovery BEFORE any reserved write or supplier POST',async()=>{
 const f=await fixture();f.drift();
 await assert.rejects(recoverRobinDraft(f),/description discrepancy differs/);
 assert.equal(f.getPosts(),0);assert.ok(f.calls.every(([,method])=>method==='GET'));
 assert.equal((await f.etsyStore.get('draft/'+SKU)).phase,'inventory_pending');
});
test('supplier failure retains existing draft, prevents Etsy activation and does not replay automatically',async()=>{
 const f=await fixture(),orig=f.request;
 f.request=async(u,o)=>{if(o.method==='POST')throw Error('private-value');return orig(u,o);};
 const result=await recoverRobinDraft(f);
 assert.equal(result.phase,'needs_investigation');assert.equal(result.step,'supplier');
 assert.ok(f.calls.every(([,m])=>m!=='PATCH'));
 assert.ok([...f.uploads.data.entries()].some(([k,v])=>k.startsWith('transfers/')&&v.revoked));
 await assert.rejects(recoverRobinDraft(f));assert.equal(f.getPosts(),0);
});
test('completed robin is not invoked in future generic workers',()=>{
 const source=readFileSync(new URL('../scripts/github-publication.mjs',import.meta.url),'utf8');
 assert.equal(source.includes('await recoverRobinDraft('),false);
 assert.equal(source.includes('await auditRobinDraft('),false);
 assert.equal(source.includes('await runGithubJobs('),true);
});
