import sharp from 'sharp';
import {createPosterUploadHandler} from '../lib/poster-upload-web.mjs';
import {prepareUploadedPoster,assetKey} from '../lib/uploaded-poster.mjs';
import {seal} from '../lib/oauth.mjs';
import {shipping,processing,returns,carriers} from './fixtures/poster-template.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/poster-upload.mjs',import.meta.url),'utf8');
function fixture({catalog=false,serverPhase='available',serverListings=[],responseFor}={}){
 const events={},button={disabled:false},status={textContent:'',dataset:{}},assigned=[],calls=[],storage=new Map();const catalogStatus=catalog?{textContent:'queued',dataset:{phase:'pending'}}:null,auth={hidden:true},select={options:[{value:''}],appendChild(option){this.options.push(option);}};
 const options=['artwork','educational','dinosaur','pattern','poster','bundle'].map(value=>({value,dataset:{type:['pattern','poster','bundle'].includes(value)?'digital':'physical'}}));const kind={value:'pattern',options,get selectedOptions(){return options.filter(o=>o.value===this.value);}};
 const elements={kind,type:{value:'physical',addEventListener:(name,fn)=>events[name]=fn},poster:{files:[]},previews:{files:[]},referenceListingId:select,seamlessConfirmed:{checked:true}};for(const [key,value]of Object.entries({name:'Leaves',subject:'Leaves',price:'4.99',licence:'Personal use only',instructions:'Download and unzip',tags:'leaves',taxonomyId:''}))elements[key]={value};
 const digital={hidden:false,querySelectorAll:()=>[elements.price,elements.licence,elements.instructions]},physical={hidden:false};const form={elements,dataset:{},querySelector:()=>button,querySelectorAll:q=>q==='[data-digital]'?[digital]:[physical],addEventListener:(name,fn)=>events[name]=fn};
 const label={textContent:'Poster type'};const document={querySelector:()=>({content:'csrf'}),getElementById:id=>id==='poster-upload-form'?form:id==='upload-status'?status:id==='poster-kind-label'?label:id==='catalog-status'?catalogStatus:id==='catalog-auth-note'?(catalog?auth:null):null,createElement:()=>({value:'',textContent:''}),addEventListener:(event,fn)=>{events[event]=fn;},hidden:false};
 const fetch=async(path,opts)=>{calls.push([path,opts]);if(responseFor)return responseFor(path,opts);return {ok:true,json:async()=>path==='/poster/catalog/status'?{phase:serverPhase,listings:serverListings}:path==='/poster/uploads'?{id:'a'.repeat(32),chunkBytes:2,phase:'uploading'}:{stored:true}};};
 runInNewContext(source,{document,fetch,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{assign:u=>assigned.push(u)},setTimeout,console});
 return {events,elements,form,digital,physical,button,status,label,assigned,calls,catalogStatus,auth,select,storage};
}
test('browser product selection shows relevant fields and accepts only the selected file type',()=>{
 const f=fixture();assert.equal(f.digital.hidden,true);assert.equal(f.elements.kind.value,'artwork');assert.equal(f.label.textContent,'Poster type');assert.equal(f.elements.poster.accept,'.png');assert.equal(f.elements.price.disabled,true);
 f.elements.type.value='digital';f.events.change();assert.equal(f.physical.hidden,true);assert.equal(f.digital.hidden,false);assert.equal(f.elements.kind.value,'pattern');assert.equal(f.label.textContent,'Product group');assert.equal(f.elements.poster.accept,'.zip');assert.equal(f.elements.price.disabled,false);
});
test('browser uploads original ZIP chunks once and queues preparation without approving publication',async()=>{
 const f=fixture();f.elements.type.value='digital';f.events.change();const blob=new Blob(['zipbytes']);f.elements.poster.files=[{name:'Leaves.zip',size:blob.size,slice:(...args)=>blob.slice(...args)}];await f.events.submit({preventDefault(){}});
 assert.equal(f.calls.filter(([p])=>p==='/poster/uploads').length,1);assert.equal(f.calls.filter(([p])=>p.includes('/chunks/')).length,4);assert.ok(f.calls.some(([p])=>p.endsWith('/finish')));assert.ok(f.calls.every(([p])=>!p.endsWith('/approve')));assert.equal(f.assigned[0],'/poster/upload?id='+'a'.repeat(32));assert.ok(f.calls.every(([,o])=>o.headers['X-Poster-CSRF']==='csrf'));
});
test('browser rejects a mismatched file before contacting the server and reports the issue',async()=>{
 const f=fixture();f.elements.type.value='digital';f.events.change();f.elements.poster.files=[{name:'Leaves.png',size:100}];await f.events.submit({preventDefault(){}});assert.equal(f.calls.length,0);assert.match(f.status.textContent,/ZIP/);assert.equal(f.button.disabled,false);
});

test('switching back from digital restores printed-artwork default and label',()=>{
 const f=fixture();f.elements.type.value='digital';f.events.change();f.elements.type.value='physical';f.events.change();assert.equal(f.elements.kind.value,'artwork');assert.equal(f.label.textContent,'Poster type');
});

test('numbered Canva file requires a poster name before starting a network upload',async()=>{
 const f=fixture(),blob=new Blob(['png file bytes long enough']);f.elements.poster.files=[{name:'47271.png',size:blob.size,slice:(...args)=>blob.slice(...args)}];f.elements.name.value='';await f.events.submit({preventDefault(){}});assert.equal(f.calls.length,0);assert.match(f.status.textContent,/Name/);
});

test('live Etsy references appear automatically without losing selected Canva artwork',async()=>{
 const f=fixture({catalog:true,serverPhase:'available',serverListings:[{id:987,title:'Existing SapiverPrints reference'}]});
 const file={name:'47271.png',size:4800};f.elements.poster.files=[file];f.elements.name.value='Coast to coast';
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(f.catalogStatus.textContent,/Select an Etsy physical listing/);
 assert.equal(f.select.options.length,2);
 assert.equal(f.select.options[1].value,'987');
 assert.equal(f.select.options[1].textContent,'Existing SapiverPrints reference');
 assert.equal(f.elements.poster.files[0],file);
 assert.equal(f.elements.name.value,'Coast to coast');
 assert.equal(f.calls.filter(([path])=>path==='/poster/catalog/status').length,1);
 assert.equal(f.calls.filter(([,opts])=>opts?.method==='POST').length,0);
});
test('live Etsy seller consent failure shows existing authorisation guidance but no secrets',async()=>{
 const f=fixture({catalog:true,serverPhase:'seller_consent_required'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.auth.hidden,false);
 assert.match(f.catalogStatus.textContent,/seller approval is missing/);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0][0],'/poster/catalog/status');
});


function selectedPng(f){const blob=new Blob(['a'.repeat(100)]);const file={name:'Leaves.png',size:blob.size,slice:(...args)=>blob.slice(...args)};f.elements.poster.files=[file];return file;}
test('expired-session HTML redirect cannot become an undefined upload receipt and preserves the selected file',async()=>{
 const f=fixture({responseFor:async()=>({ok:true,status:200,redirected:true,url:'https://poster.example.test/poster/workflow',json:async()=>{throw SyntaxError('HTML');}})}),file=selectedPng(f);
 await f.events.submit({preventDefault(){}});assert.match(f.status.textContent,/session has expired/);assert.doesNotMatch(f.status.textContent,/undefined|phase/);assert.equal(f.elements.poster.files[0],file);assert.equal(f.button.disabled,false);assert.equal(f.storage.size,0);assert.equal(f.assigned.length,0);
});
test('missing JSON and successful responses without a confirmed upload ID cannot send artwork chunks',async()=>{
 for(const response of [{ok:true,status:200,json:async()=>{throw SyntaxError('HTML');}},{ok:true,status:201,json:async()=>({})},{ok:true,status:201,json:async()=>null}]){
  const f=fixture({responseFor:async()=>response});selectedPng(f);await f.events.submit({preventDefault(){}});
  assert.match(f.status.textContent,/upload data|upload ID/);assert.doesNotMatch(f.status.textContent,/undefined/);assert.equal(f.calls.length,1);assert.equal(f.storage.size,0);assert.equal(f.assigned.length,0);
 }
});
test('server JSON session error is shown before artwork can upload',async()=>{
 const f=fixture({responseFor:async()=>({ok:false,status:401,json:async()=>({code:'studio_session_required'})})});selectedPng(f);await f.events.submit({preventDefault(){}});assert.match(f.status.textContent,/session has expired/);assert.equal(f.calls.length,1);assert.equal(f.button.disabled,false);
});
test('malformed old saved receipt is discarded instead of requesting an undefined upload ID',async()=>{
 const f=fixture();selectedPng(f);await f.events.submit({preventDefault(){}});const signature=JSON.parse(f.storage.get('poster-upload')).signature;f.storage.set('poster-upload',JSON.stringify({signature}));f.calls.length=0;f.assigned.length=0;await f.events.submit({preventDefault(){}});
 assert.ok(f.calls.every(([path])=>!path.includes('undefined')));assert.equal(f.calls.filter(([path])=>path==='/poster/uploads').length,1);assert.equal(JSON.parse(f.storage.get('poster-upload')).id,'a'.repeat(32));
});
test('owner-cleared saved attempt starts a fresh upload instead of reopening the retired review',async()=>{
 let created=0;const f=fixture({responseFor:async(path,o)=>{
  if(path==='/poster/uploads')return Response.json({id:(++created===1?'a':'b').repeat(32),chunkBytes:2000000,phase:'uploading'},{status:201});
  if(!o.method)return Response.json({phase:'cancelled'});
  return Response.json({stored:true});
 }});selectedPng(f);await f.events.submit({preventDefault(){}});f.calls.length=0;f.assigned.length=0;await f.events.submit({preventDefault(){}});
 assert.equal(created,2);assert.equal(f.calls[0][0],'/poster/uploads/'+'a'.repeat(32));assert.equal(f.calls[1][0],'/poster/uploads');assert.equal(f.assigned[0],'/poster/upload?id='+'b'.repeat(32));assert.equal(JSON.parse(f.storage.get('poster-upload')).id,'b'.repeat(32));
});


function actualServer({expired=false}={}){
 const origin='https://poster.example.test',secret='integration-test-owner-key-long-enough',map=new Map(),jobs=[];
 const uploads={get:async k=>map.get(k),set:async(k,v,o)=>{if(o?.onlyIfNew&&map.has(k))return {modified:false};map.set(k,v);return {modified:true};},setJSON:async(k,v,o)=>{if(o?.onlyIfNew&&map.has(k))return {modified:false};map.set(k,v);return {modified:true};},delete:async k=>map.delete(k)};
 const env=n=>({CANVA_SITE_ORIGIN:origin,CANVA_CLIENT_SECRET:secret,CANVA_SETUP_PASSWORD:'test-password',ETSY_PRINTS_KEYSTRING:'app',ETSY_PRINTS_SHARED_SECRET:'shared',POSTER_PUBLICATION_ENABLED:'false'}[n]);
 const cookie='__Host-poster_owner='+seal({csrf:'csrf',expiry:Date.now()+(expired?-1000:3600000)},secret,'poster-owner');
 const handler=createPosterUploadHandler({env,uploads,dispatchJob:async(id,action)=>jobs.push({id,action})});
 const responseFor=(path,o)=>handler(new Request(origin+path,{method:o.method||'GET',body:o.body,headers:{...o.headers,Origin:origin,Cookie:cookie}}),{});
 return {uploads,map,jobs,responseFor};
}
test('actual browser submission reaches real API, stores PNG chunks and prepares a first-product review without an existing listing',async()=>{
 const server=actualServer(),f=fixture({responseFor:server.responseFor});
 const bytes=await sharp({create:{width:3508,height:4961,channels:3,background:'#997755'}}).png().toBuffer(),blob=new Blob([bytes]);
 f.elements.poster.files=[{name:'Leaves.png',size:blob.size,slice:(...args)=>blob.slice(...args)}];
 await f.events.submit({preventDefault(){}});
 assert.equal(server.jobs.length,1);assert.equal(server.jobs[0].action,'prepare');const id=server.jobs[0].id;
 assert.equal(f.assigned[0],'/poster/upload?id='+id);assert.equal((await server.uploads.get(assetKey(id))).phase,'preparing');assert.equal((await server.uploads.get(assetKey(id))).referenceListingId,null);
 const liveShipping={...shipping,shipping_profile_id:11,shipping_profile_destinations:shipping.shipping_profile_destinations.map(d=>({...d,min_delivery_days:null,max_delivery_days:null}))};
 const client={session:async()=>({shop_name:'SapiverPrints',shop_id:456}),api:async(path,o)=>{assert.equal(o,undefined);if(path==='/seller-taxonomy/nodes')return {results:[{id:123,name:'Prints',children:[]}]};if(path.startsWith('/shipping-carriers?'))return carriers;if(path.includes('/shipping-profiles?'))return {results:[liveShipping]};if(path.endsWith('/shipping-profiles/11'))return liveShipping;if(path.includes('/readiness-state-definitions?'))return {results:[{...processing,readiness_state_id:22}]};if(path.endsWith('/readiness-state-definitions/22'))return processing;if(path.includes('/policies/return?'))return {results:[{...returns,return_policy_id:33}]};if(path.endsWith('/policies/return/33'))return returns;if(path.endsWith('/production-partners'))return {results:[{partner_name:'PrintShrimp',location:'Romford, England',production_partner_id:55}]};throw Error('Unexpected merchant request');}};
 await prepareUploadedPoster({id,uploads:server.uploads,client,mockups:async()=>['one','two','three','four'].map(s=>Buffer.from(s))});
 const ready=await server.uploads.get(assetKey(id));assert.equal(ready.phase,'ready_for_approval');assert.equal(ready.plan.inventory.products.length,12);assert.deepEqual(await server.uploads.get(ready.masterKey),bytes);
 assert.equal(ready.listingId,undefined);assert.equal(ready.supplierProductId,undefined);assert.equal(server.jobs.length,1);
});
test('expired owner session through the real API fails clearly before any product or chunks are saved',async()=>{
 const server=actualServer({expired:true}),f=fixture({responseFor:server.responseFor}),file=selectedPng(f);
 await f.events.submit({preventDefault(){}});assert.match(f.status.textContent,/session has expired/);assert.equal(server.map.size,0);assert.equal(server.jobs.length,0);assert.equal(f.elements.poster.files[0],file);assert.equal(f.assigned.length,0);
});
