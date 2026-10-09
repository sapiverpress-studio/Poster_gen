import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/poster-upload.mjs',import.meta.url),'utf8');
function fixture(){
 const events={},button={disabled:false},status={textContent:'',dataset:{}},assigned=[],calls=[],storage=new Map();
 const options=['pattern','poster','bundle','educational','dinosaur','artwork'].map(value=>({value,dataset:{type:['pattern','poster','bundle'].includes(value)?'digital':'physical'}}));const kind={value:'pattern',options,get selectedOptions(){return options.filter(o=>o.value===this.value);}};
 const elements={kind,type:{value:'physical',addEventListener:(name,fn)=>events[name]=fn},poster:{files:[]},previews:{files:[]},seamlessConfirmed:{checked:true}};for(const [key,value]of Object.entries({name:'Leaves',subject:'Leaves',price:'4.99',licence:'Personal use only',instructions:'Download and unzip',tags:'leaves',taxonomyId:''}))elements[key]={value};
 const digital={hidden:false,querySelectorAll:()=>[elements.price,elements.licence,elements.instructions]},physical={hidden:false};const form={elements,dataset:{},querySelector:()=>button,querySelectorAll:q=>q==='[data-digital]'?[digital]:[physical],addEventListener:(name,fn)=>events[name]=fn};
 const document={querySelector:()=>({content:'csrf'}),getElementById:id=>id==='poster-upload-form'?form:id==='upload-status'?status:null};
 const fetch=async(path,opts)=>{calls.push([path,opts]);return {ok:true,json:async()=>path==='/poster/uploads'?{id:'a'.repeat(32),chunkBytes:2,phase:'uploading'}:{stored:true}};};
 runInNewContext(source,{document,fetch,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},location:{assign:u=>assigned.push(u)},setTimeout,console});
 return {events,elements,form,digital,physical,button,status,assigned,calls};
}
test('browser product selection shows relevant fields and accepts only the selected file type',()=>{
 const f=fixture();assert.equal(f.digital.hidden,true);assert.equal(f.elements.kind.value,'educational');assert.equal(f.elements.poster.accept,'.png');assert.equal(f.elements.price.disabled,true);
 f.elements.type.value='digital';f.events.change();assert.equal(f.physical.hidden,true);assert.equal(f.digital.hidden,false);assert.equal(f.elements.kind.value,'pattern');assert.equal(f.elements.poster.accept,'.zip');assert.equal(f.elements.price.disabled,false);
});
test('browser uploads original ZIP chunks once and queues preparation without approving publication',async()=>{
 const f=fixture();f.elements.type.value='digital';f.events.change();const blob=new Blob(['zipbytes']);f.elements.poster.files=[{name:'Leaves.zip',size:blob.size,slice:(...args)=>blob.slice(...args)}];await f.events.submit({preventDefault(){}});
 assert.equal(f.calls.filter(([p])=>p==='/poster/uploads').length,1);assert.equal(f.calls.filter(([p])=>p.includes('/chunks/')).length,4);assert.ok(f.calls.some(([p])=>p.endsWith('/finish')));assert.ok(f.calls.every(([p])=>!p.endsWith('/approve')));assert.equal(f.assigned[0],'/poster/upload?id='+'a'.repeat(32));assert.ok(f.calls.every(([,o])=>o.headers['X-Poster-CSRF']==='csrf'));
});
test('browser rejects a mismatched file before contacting the server and reports the issue',async()=>{
 const f=fixture();f.elements.type.value='digital';f.events.change();f.elements.poster.files=[{name:'Leaves.png',size:100}];await f.events.submit({preventDefault(){}});assert.equal(f.calls.length,0);assert.match(f.status.textContent,/ZIP/);assert.equal(f.button.disabled,false);
});
