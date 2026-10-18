import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardBody} from '../lib/product-web.mjs';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {seal} from '../lib/oauth.mjs';

const make=(id,name,phase,extra={})=>({productId:id.repeat(32),type:'physical',metadata:{name,subject:name,sectionTitle:'Nature'},phase,previewId:id.repeat(32),files:[{name:name+'.png',bytes:20000000}],...extra});
const records=[
 make('a','The Robin','published',{etsyListingId:4595921846,supplierProductId:'supplier-record-1'}),
 make('b','The Fox','published',{pendingRevision:'e'.repeat(32),pendingPhase:'needs_investigation',lastError:'Review retained Etsy and PrintShrimp references'}),
 make('c','Coast to coast','uploading',{pendingRevision:'f'.repeat(32)}),
 make('d','A second Robin','needs_investigation',{pendingRevision:'g'.repeat(32)})
];

test('saved uploader records are compact, grouped and never pretend to be the live Etsy catalogue',()=>{
 const html=dashboardBody(records,{});
 assert.match(html,/Upload history/);
 assert.match(html,/Needs attention \(3\)/);
 assert.match(html,/Completed uploads \(1\)/);
 assert.match(html,/href="\/poster\/catalogue"/);
 assert.match(html,/These are saved uploader records, not a live Etsy catalogue/);
 assert.match(html,/<details class="history-group" open>/);
 assert.match(html,/<details class="history-group"><summary>Completed uploads/);
 assert.match(html,/Review retained Etsy and PrintShrimp references/);
 assert.match(html,/href="\/poster\/upload\?id=e{32}"/);
 assert.match(html,/href="https:\/\/www\.etsy\.com\/listing\/4595921846"/);
 assert.match(html,/Technical details/);
 assert.match(html,/Stored PrintShrimp product reference/);
 assert.doesNotMatch(html,/<h3>The Robin<\/h3>/);
});
test('filters find product names and sections and keep failed upload attempts distinct',()=>{
 let html=dashboardBody(records,{subject:'coast'});
 assert.match(html,/Needs attention \(1\)/);
 assert.doesNotMatch(html,/A second Robin/);
 html=dashboardBody(records,{status:'needs_investigation'});
 assert.match(html,/Needs attention \(2\)/);
 html=dashboardBody(records,{subject:'nature',status:'published'});
 assert.match(html,/records<\/span>/);
 assert.match(html,/The Robin/);
 assert.match(html,/The Fox/);
});
test('upload-history route keeps authenticated session and renders compact page',async()=>{
 const site='https://poster.example.test',secret='a-test-encryption-key-of-sufficient-length';
 const env=n=>({CANVA_SITE_ORIGIN:site,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'owner-password',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',POSTER_PUBLICATION_ENABLED:'true'}[n]);
 const recordsMap=new Map(records.map(p=>['products/'+p.productId+'/record',p]));
 const uploads={get:async key=>recordsMap.get(key)||null,list:async function*(){yield {blobs:[...recordsMap.keys()].map(key=>({key}))};}};
 const handler=createPosterUploadHandler({env,uploads});
 const owner='__Host-poster_owner='+seal({csrf:'token',expiry:Date.now()+3600000},secret,'poster-owner');
 const res=await handler(new Request(site+'/poster/products',{headers:{cookie:owner}}),{waitUntil(){}});
 assert.equal(res.status,200);
 const text=await res.text();
 assert.match(text,/<title>Upload history · Sapiver Prints<\/title>/);
 assert.match(text,/Needs attention \(3\)/);
 assert.match(text,/Dashboard/);
 const publicRes=await handler(new Request(site+'/poster/products'),{waitUntil(){}});
 assert.equal(publicRes.status,303);
});
