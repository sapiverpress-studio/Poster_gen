import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {auditButterflyDraft,descriptionFingerprint} from '../lib/butterfly-draft-audit.mjs';
import {templateDraftPlan,TEMPLATE_VERSION} from '../lib/poster-template.mjs';
import {reference,inventory} from './fixtures/poster-template.mjs';

const SKU='SP-BUTTERFLY', LISTING=4595774989, SHOP=50893070, ID='b'.repeat(32);
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
test('read-only butterfly audit detects a harmless line-ending difference without logging listing content or modifying storage',async()=>{
 const f=fixture();const report=await auditButterflyDraft(f);
 assert.equal(report.listingId,LISTING);assert.equal(report.approvalVerified,true);assert.equal(report.inventoryStatus,'verified');assert.equal(report.imageCount,4);
 assert.equal(report.supplierStatus,'absent');assert.equal(report.sectionStatus,'verified');assert.equal(report.readyForSafeRepair,true);
 assert.deepEqual(report.modifiedFields.map(x=>[x.field,x.classification]),[['description','line_endings_only']]);
 assert.ok(f.calls.every(([,method])=>method==='GET'));
 assert.doesNotMatch(JSON.stringify(report),new RegExp(f.plan.body.description.slice(0,20)));
});
test('audit reports genuine mismatches and inventory drift without assuming they are safe',async()=>{
 const f=fixture();f.listing.title='Changed title';f.listing.taxonomy_id=null;f.inv.products.pop();
 const report=await auditButterflyDraft(f);
 assert.deepEqual(report.modifiedFields.map(x=>x.field),['title','description','taxonomy_id']);
 assert.equal(report.inventoryStatus,'mismatch');assert.equal(report.readyForSafeRepair,false);
});
test('audit fails closed on changed approval, wrong draft and wrong seller before merchant writes',async()=>{
 for(const failure of ['approval','listing','seller']){
  const f=fixture();if(failure==='approval')f.storeMap.get('claims/'+ID+'/publish').approvalHash='bad';
  if(failure==='listing')f.etsyMap.set('draft/'+SKU,{listingId:12,uploadId:ID});
  if(failure==='seller')f.client.session=async()=>({shop_id:99,shop_name:'SapiverPrints'});
  await assert.rejects(auditButterflyDraft(f));
  assert.ok(f.calls.every(([,method])=>method==='GET'));
 }
});
test('only corrective attempt five of the exact butterfly workflow run can invoke recovery',()=>{
 const source=readFileSync(new URL('../scripts/github-publication.mjs',import.meta.url),'utf8');
 const gate=source.indexOf("if(process.env.GITHUB_RUN_ID==='38693218239')");
 const attempt=source.indexOf("if(process.env.GITHUB_RUN_ATTEMPT==='5')",gate);
 const call=source.indexOf('await recoverButterflyDraft(',attempt);
 const skip=source.indexOf('Butterfly historical worker attempt skipped',call);
 const normal=source.indexOf('const jobs=await collectGithubJobs',skip);
 assert.ok(gate>0&&attempt>gate&&call>attempt&&skip>call&&normal>skip);
 const scoped=source.slice(gate,source.indexOf(" }else{\n await etsyStore.setJSON",skip));
 assert.equal((scoped.match(/await recoverButterflyDraft\(/g)||[]).length,1);
 assert.doesNotMatch(scoped,/auditButterflyDraft|await runGithubJobs|await collectGithubJobs|await etsyStore.setJSON/);
 assert.match(source.slice(skip,normal),/no merchant writes/i);
});
test('fingerprint reports only numeric positions and safe normalization labels',()=>{
 const entity=descriptionFingerprint('Café & bees','Café &amp; bees');
 assert.deepEqual(entity.normalisations,['html_entities']);assert.equal(entity.shape,'changed_in_middle_or_multiple');
 const truncate=descriptionFingerprint('A long original description','A long original');
 assert.equal(truncate.shape,'truncated');assert.equal(truncate.expectedCharacters,27);
 const altered=descriptionFingerprint('Approved words for a nature poster','A different sentence entirely');
 assert.deepEqual(altered.normalisations,[]);
 assert.doesNotMatch(JSON.stringify(altered),/Approved|different sentence/);
});
