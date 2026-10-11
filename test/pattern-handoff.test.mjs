import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {Blob,File} from 'node:buffer';

const script=readFileSync(new URL('../public/poster-upload.mjs',import.meta.url),'utf8');
const channel='sapiver-pattern-poster-handoff-v1';
const patternOrigin='https://sapiver-pattern-forge.netlify.app';
class FakeDataTransfer{
  constructor(){this.files=[];this.items={add:file=>this.files.push(file)};}
}
function setup(){
  const sent=[],events=new Map(),calls=[],navigations=[];
  const options=[{value:'educational',dataset:{type:'physical'}},{value:'pattern',dataset:{type:'digital'}},{value:'poster',dataset:{type:'digital'}}];
  const kind={options,value:'educational',get selectedOptions(){return options.filter(o=>o.value===this.value)}};
  const fields={
    type:{value:'physical',addEventListener(){}},poster:{files:[],accept:'.png,.zip'},
    kind,price:{value:'12.99',focus(){}},useEmbeddedText:{checked:false},
    seamlessConfirmed:{checked:true},name:{value:''},subject:{value:''},
    tags:{value:''},taxonomyId:{value:''},licence:{value:''},instructions:{value:''},
    previews:{files:[]},referenceListingId:{value:''}
  };
  let notice;
  const form={elements:fields,dataset:{},querySelectorAll:()=>[],
    parentNode:{insertBefore(node){notice=node}},
    querySelector:()=>({disabled:false}),
    addEventListener(name,handler){events.set(name,handler)}};
  const status={dataset:{},textContent:''};
  const doc={querySelector:()=>({content:'csrf-token'}),
    getElementById:id=>id==='poster-upload-form'?form:id==='upload-status'?status:null,
    createElement:()=>({setAttribute(){},textContent:''})};
  const opener={postMessage(message,targetOrigin){sent.push({message,targetOrigin})}};
  const win={opener,addEventListener(name,fn){events.set(name,fn)}};
  const json=(data,status=200)=>({ok:status<400,status,async json(){return data}});
  const uploadId='Y'.repeat(32);
  const fetch=async(path,opts)=>{
    calls.push({path,opts});
    if(path==='/poster/uploads'&&opts.method==='POST')return json({id:uploadId,chunkBytes:2048,phase:'uploading'},201);
    if(path.startsWith('/poster/uploads/'+uploadId+'/chunks/'))return json({stored:true});
    if(path.endsWith('/finish'))return json({phase:'preparing'},202);
    throw Error('Unexpected route '+path);
  };
  const store=new Map();
  runInNewContext(script,{document:doc,window:win,crypto:{getRandomValues:a=>a.fill(17)},
    Blob,File,DataTransfer:FakeDataTransfer,fetch,location:{assign:s=>navigations.push(s)},
    sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},createImageBitmap(){throw Error('Unused')}});
  const challenge=sent.find(x=>x.message.type==='ready').message.challenge;
  const kit=new File([Buffer.alloc(128)],'sapiver-autumn-leaves-etsy-kit.zip',{type:'application/zip'});
  const payload={channel,type:'kit',challenge,projectId:'pf-project-mgkk1122-abcd123',projectTitle:'Autumn Leaves',updateProductId:null,file:kit};
  const emit=(data=payload,origin=patternOrigin,source=opener)=>events.get('message')({origin,source,data});
  return {fields,form,events,calls,sent,emit,payload,get notice(){return notice},navigations};
}
test('rejects untrusted origins and transfers ZIP only into owner-reviewed digital form',()=>{
  const h=setup();
  h.emit(h.payload,'https://attacker.invalid');
  assert.equal(h.fields.poster.files.length,0);
  h.emit();
  assert.equal(h.fields.poster.files[0].name,'sapiver-autumn-leaves-etsy-kit.zip');
  assert.equal(h.fields.type.value,'digital');
  assert.equal(h.fields.kind.value,'pattern');
  assert.equal(h.fields.useEmbeddedText.checked,true);
  assert.equal(h.fields.price.value,'','Never assume a selling price');
  assert.equal(h.fields.seamlessConfirmed.checked,false,'Owner must explicitly verify seamless repeat');
  assert.equal(h.fields.name.value,'Autumn Leaves');
  assert.match(h.notice.textContent,/Nothing is published automatically/);
  assert.equal(h.sent.at(-1).message.type,'received');
});
test('preparation is authenticated same-origin and acknowledges stable product ID only after finish',async()=>{
  const h=setup();h.emit();
  h.fields.price.value='3.95';h.fields.seamlessConfirmed.checked=true;
  await h.events.get('submit')({preventDefault(){}});
  const paths=h.calls.map(x=>x.path);
  assert.deepEqual(paths,['/poster/uploads','/poster/uploads/'+'Y'.repeat(32)+'/chunks/0','/poster/uploads/'+'Y'.repeat(32)+'/finish']);
  const create=h.calls[0];assert.equal(create.opts.headers['X-Poster-CSRF'],'csrf-token');
  const input=JSON.parse(create.opts.body);
  assert.equal(input.type,'digital');
  assert.equal(input.metadata.kind,'pattern');
  assert.equal(input.metadata.price,'3.95');
  assert.equal(input.metadata.seamlessConfirmed,true);
  assert.equal(h.sent.at(-1).message.type,'saved');
  assert.equal(h.sent.at(-1).message.productId,'Y'.repeat(32));
  assert.equal(h.navigations[0],'/poster/upload?id='+'Y'.repeat(32));
});
