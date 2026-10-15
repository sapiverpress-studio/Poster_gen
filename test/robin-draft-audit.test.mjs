import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {auditRobinDraft,descriptionFingerprint,exactHtmlEntityChanges} from '../lib/robin-draft-audit.mjs';
import {templateDraftPlan,TEMPLATE_VERSION} from '../lib/poster-template.mjs';
import {reference,inventory} from './fixtures/poster-template.mjs';

const SKU='SP-THE-ROBIN', LISTING=4595921846, SHOP=50893070, ID='b'.repeat(32);
const digest=s=>createHash('sha256').update(s).digest('hex');
function fixture(){
 const storeMap=new Map(), etsyMap=new Map(), calls=[];
 const uploads={get:async key=>storeMap.get(key),set:async()=>{throw Error('Write forbidden')},setJSON:async()=>{throw Error('Write forbidden')}};
 const etsyStore={get:async key=>etsyMap.get(key),set:async()=>{throw Error('Write forbidden')},setJSON:async()=>{throw Error('Write forbidden')}};
 const plan=templateDraftPlan({filename:SKU+'.png',reference,inventory,shopId:456});
 plan.identity.sectionTitle='Nature';
 plan.hash=digest(JSON.stringify({version:plan.version,identity:plan.identity,referenceListingId:plan.referenceListingId,body:plan.body,inventory:plan.inventory}));
 const sha='1'.repeat(64),approvalHash=digest(sha+':'+plan.hash+':'+TEMPLATE_VERSION);
 storeMap.set('uploads/'+ID+'/state',{listingId:LISTING,phase:'needs_investigation',stage:'etsy_draft',plan,approvedAt:10,approvalHash,image:{sha256:sha}});
 storeMap.set('claims/'+ID+'/publish',{approvalHash});
 etsyMap.set('draft/'+SKU,{listingId:LISTING,uploadId:ID});
 const listing={...plan.body,listing_id:LISTING,shop_id:SHOP,listing_type:'physical',state:'draft',is_personalizable:false,shop_section_id:88,
  tags:plan.body.tags.split(','),images:[1,2,3,4].map(listing_image_id=>({listing_image_id}))};
 listing.description=listing.description.replace(/\n/g,'\r\n');
 const inv={products:plan.inventory.products.map(p=>({...p,offerings:p.offerings.map(o=>({...o,price:{amount:Math.round(o.price*100),divisor:100,currency_code:'GBP'}}))}))};
 const client={session:async()=>({shop_id:SHOP,shop_name:'SapiverPrints'}),api:async(path,opts)=>{calls.push([path,opts?.method||'GET']);if(opts?.method&&opts.method!=='GET')throw Error('Write forbidden');if(path==='/listings/'+LISTING+'?includes=Images')return listing;if(path==='/listings/'+LISTING+'/inventory')return inv;if(path==='/shops/'+SHOP+'/sections')return {results:[{shop_section_id:88,title:'Nature'}]};throw Error('Unexpected API read');}};
 const request=async(url,opts)=>{calls.push(['supplier',opts.method]);if(opts.method!=='GET')throw Error('Write forbidden');return new Response(null,{status:404})};
 return {uploads,etsyStore,client,apiKey:'test-key',request,calls,listing,inv,plan,storeMap,etsyMap};
}
test('read-only robin audit detects a harmless line-ending difference without logging listing content or modifying storage',async()=>{
 const f=fixture();const report=await auditRobinDraft(f);
 assert.equal(report.listingId,LISTING);assert.equal(report.approvalVerified,true);assert.equal(report.inventoryStatus,'verified');assert.equal(report.imageCount,4);
 assert.equal(report.supplierStatus,'absent');assert.equal(report.sectionStatus,'verified');assert.equal(report.readyForSafeRepair,true);
 assert.deepEqual(report.modifiedFields.map(x=>[x.field,x.classification]),[['description','line_endings_only']]);
 assert.ok(f.calls.every(([,method])=>method==='GET'));
 assert.doesNotMatch(JSON.stringify(report),new RegExp(f.plan.body.description.slice(0,20)));
});
test('audit reports genuine mismatches and inventory drift without assuming they are safe',async()=>{
 const f=fixture();f.listing.title='Changed title';f.listing.taxonomy_id=null;f.inv.products.pop();
 const report=await auditRobinDraft(f);
 assert.deepEqual(report.modifiedFields.map(x=>x.field),['title','description','taxonomy_id']);
 assert.equal(report.inventoryStatus,'mismatch');assert.equal(report.readyForSafeRepair,false);
});
test('audit fails closed on changed approval, wrong draft and wrong seller before merchant writes',async()=>{
 for(const failure of ['approval','listing','seller']){
  const f=fixture();if(failure==='approval')f.storeMap.get('claims/'+ID+'/publish').approvalHash='bad';
  if(failure==='listing')f.etsyMap.set('draft/'+SKU,{listingId:12,uploadId:ID});
  if(failure==='seller')f.client.session=async()=>({shop_id:99,shop_name:'SapiverPrints'});
  await assert.rejects(auditRobinDraft(f));
  assert.ok(f.calls.every(([,method])=>method==='GET'));
 }
});
test('specific workflow rerun is read-only and does not run normal queue',()=>{
 const source=readFileSync(new URL('../scripts/github-publication.mjs',import.meta.url),'utf8');
 const gate=source.indexOf("if(process.env.GITHUB_RUN_ID==='38723172616')");
 const audit=source.indexOf('await auditRobinDraft(',gate);
 const normal=source.indexOf('await etsyStore.setJSON(',audit);
 const jobs=source.indexOf('const jobs=await collectGithubJobs(',normal);
 assert.ok(gate>0&&audit>gate&&normal>audit&&jobs>normal);
 assert.match(source.slice(gate,normal),/GITHUB_RUN_ATTEMPT==='2'/);
 assert.doesNotMatch(source.slice(gate,normal),/await runGithubJobs|await collectGithubJobs|await etsyStore.setJSON/);
});
test('fingerprint reports only numeric positions and safe normalization labels',()=>{
 const entity=descriptionFingerprint('Café & bees','Café &amp; bees');
 assert.deepEqual(entity.normalisations,['html_entities']);
 assert.equal(entity.exactSingleEntity,'ampersand_entity');
 const quote=descriptionFingerprint("It's a woodland poem","It&#39;s a woodland poem");
 assert.equal(quote.exactSingleEntity,'apostrophe_numeric_entity');
 assert.equal(quote.actualCharacters-quote.expectedCharacters,4);
 const alteredEntity=descriptionFingerprint("It's a woodland poem","It's a changed sentence");
 assert.equal(alteredEntity.exactSingleEntity,'not_exact_known_entity');assert.equal(entity.shape,'changed_in_middle_or_multiple');
 const truncate=descriptionFingerprint('A long original description','A long original');
 assert.equal(truncate.shape,'truncated');assert.equal(truncate.expectedCharacters,27);
 const altered=descriptionFingerprint('Approved words for a nature poster','A different sentence entirely');
 assert.deepEqual(altered.normalisations,[]);
 assert.doesNotMatch(JSON.stringify(altered),/Approved|different sentence/);
});

test('strict several-entity encoding fingerprint allows only unchanged underlying copy',()=>{
 const original="The robin's nest & a second robin's song. \"A forest\"";
 const encoded="The robin&#39;s nest &amp; a second robin&#39;s song. &quot;A forest&quot;";
 const result=exactHtmlEntityChanges(original,encoded);
 assert.equal(result.exact,true);
 assert.deepEqual(result.entityCounts,{apostrophe_numeric:2,ampersand:1,double_quote:2});
 assert.equal(result.total,5);
 assert.equal(exactHtmlEntityChanges(original,encoded+' extra').exact,false);
 assert.equal(exactHtmlEntityChanges(original,encoded.replace('second','third')).exact,false);
 assert.equal(exactHtmlEntityChanges(original,original).exact,true);
 assert.equal(exactHtmlEntityChanges(original,'The changed text').exact,false);
 assert.doesNotMatch(JSON.stringify(result),/forest|song|robin/);
});
