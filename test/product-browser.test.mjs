import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/poster-upload.mjs',import.meta.url),'utf8');
function fixture({catalog=false,serverPhase='available',serverListings=[]}={}){
 const events={},button={disabled:false},status={textContent:'',dataset:{}},assigned=[],calls=[],storage=new Map();const catalogStatus=catalog?{textContent:'queued',dataset:{phase:'pending'}}:null,auth={hidden:true},select={options:[{value:''}],appendChild(option){this.options.push(option);}};
 const options=['artwork','educational','dinosaur','pattern','poster','bundle'].map(value=>({value,dataset:{type:['pattern','poster','bundle'].includes(value)?'digital':'physical'}}));const kind={value:'pattern',options,get selectedOptions(){return options.filter(o=>o.value===this.value);}};
 const elements={kind,type:{value:'physical',addEventListener:(name,fn)=>events[name]=fn},poster:{files:[]},previews:{files:[]},referenceListingId:select,seamlessConfirmed:{checked:true}};for(const [key,value]of Object.entries({name:'Leaves',subject:'Leaves',price:'4.99',licence:'Personal use only',instructions:'Download and unzip',tags:'leaves',taxonomyId:''}))elements[key]={value};
 const digital={hidden:false,querySelectorAll:()=>[elements.price,elements.licence,elements.instructions]},physical={hidden:false};const form={elements,dataset:{},querySelector:()=>button,querySelectorAll:q=>q==='[data-digital]'?[digital]:[physical],addEventListener:(name,fn)=>events[name]=fn};
 const label={textContent:'Poster type'};const document={querySelector:()=>({content:'csrf'}),getElementById:id=>id==='poster-upload-form'?form:id==='upload-status'?status:id==='poster-kind-label'?label:id==='catalog-status'?catalogStatus:id==='catalog-auth-note'?(catalog?auth:null):null,createElement:()=>({value:'',textContent:''}),addEventListener:(event,fn)=>{events[event]=fn;},hidden:false};
 const fetch=async(path,opts)=>{calls.push([path,opts]);return {ok:true,json:async()=>path==='/poster/catalog/status'?{phase:serverPhase,listings:serverListings}:path==='/poster/uploads'?{id:'a'.repeat(32),chunkBytes:2,phase:'uploading'}:{stored:true}};};
 runInNewContext(source,{document,fetch,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},location:{assign:u=>assigned.push(u)},setTimeout,console});
 return {events,elements,form,digital,physical,button,status,label,assigned,calls,catalogStatus,auth,select};
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
