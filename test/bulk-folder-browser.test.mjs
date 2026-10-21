import test from 'node:test';
import assert from 'node:assert/strict';
import yazl from 'yazl';
import {webcrypto} from 'node:crypto';
const tags='woodland print,nursery wall art,nature poster,puddle art,forest decor,nature wall art,woodland nursery,kids room art,art print,nursery decor,animal art,woodland gift,physical print';
async function zip(invalid=false,itemCount=6){
 const z=new yazl.ZipFile();
 for(let n=0;n<itemCount;n++){
  const png=Buffer.alloc(34);png.set([137,80,78,71,13,10,26,10]);png.write('IHDR',12);png.writeUInt32BE(3394,16);png.writeUInt32BE(4800,20);png[33]=n;
  if(invalid&&n===5)png[0]=0;
  z.addBuffer(png,n+'/poster.png');
  z.addBuffer(Buffer.from('Title: The Puddle\nListing title: Puddle Print '+n+'\nSection: Nature\nTags: '+tags+'\n\nDescription:\nFull original description for poster '+n+'.'),n+'/details.md');
 }
 z.end();const chunks=[];for await(const c of z.outputStream)chunks.push(c);
 return new File(chunks,'collection.zip');
}
test('new six-poster collections without BOTH trio manifests stop before uploading any merchant product',async()=>{
 const nodes=new Map(),saved=new Map(),created=[];let file=await zip(true);
 function el(){return {children:[],style:{},listeners:{},append(...v){this.children.push(...v);},replaceChildren(){this.children=[];},addEventListener(k,v){this.listeners[k]=v;},querySelector(){return button;}};}
 const button=el();
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,el());return nodes.get(id);},querySelector(){return {content:'csrf'};},createElement:el};
 const form=document.getElementById('bulk-collection-form');form.elements={collection:{get files(){return[file];}},kind:{value:'artwork'}};
 globalThis.sessionStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 globalThis.fetch=async(url,options={})=>{if(url==='/poster/uploads')created.push(JSON.parse(options.body));return Response.json({phase:'unavailable'},{status:503});};
 try{
  await import('../public/bulk-upload.mjs');
  const handler=form.listeners.submit;
  await handler({preventDefault(){}});
  assert.equal(created.length,0);
  assert.equal(saved.size,0);
  assert.match(nodes.get('bulk-status').textContent,/two distinct trio listings/);
  file=await zip(false);
  await handler({preventDefault(){}});
  assert.equal(created.length,0);
  assert.equal(saved.size,0);
  assert.match(nodes.get('bulk-status').textContent,/bundle-1.md and bundle-2.md/);
 }finally{delete globalThis.document;delete globalThis.sessionStorage;delete globalThis.fetch;}
});
test('two-item collection consumes only two slots, or stores both privately if fewer than two remain',async()=>{
 for(const remaining of [1,2,3]){
  const nodes=new Map(),saved=new Map(),created=[],live=new Map();
  function element(){return {children:[],style:{},listeners:{},append(...v){this.children.push(...v);},replaceChildren(){this.children=[];},addEventListener(k,v){this.listeners[k]=v;},querySelector(){return submit;}};}
  const submit=element();
  globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},querySelector(){return {content:'csrf'};},createElement:element};
  const form=document.getElementById('bulk-collection-form');
  form.elements={collection:{files:[await zip(false,2)]},kind:{value:'artwork'},storeOnly:{checked:false}};
  globalThis.sessionStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
  Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
  globalThis.fetch=async(url,options={})=>{
   if(url==='/poster/bulk/status')return Response.json({remaining});
   if(url==='/poster/bulk/sections')return Response.json({phase:'available',sections:[{id:123,title:'Nature'}]});
   if(url==='/poster/uploads'){
    const body=JSON.parse(options.body);created.push(body);
    const id=String(created.length).padStart(32,'a');live.set(id,{phase:'uploading'});
    return Response.json({id,chunkBytes:2000000},{status:201});
   }
   const id=url.split('/')[3];
   if(url.endsWith('/finish')){live.set(id,{phase:'ready_for_approval',review:{title:'Ready',description:'Reviewed',tags,imageUrls:[]}});return Response.json({phase:'preparing'});}
   if(url.includes('/chunks/'))return Response.json({ok:true});
   return Response.json(live.get(id));
  };
  try{
   await import('../public/bulk-upload.mjs?two-slot-'+remaining);
   await form.listeners.submit({preventDefault(){}});
   const session=JSON.parse(saved.get('sapiver-physical-bulk-v1'));
   assert.equal(session.items.length,2);
   assert.equal(created.length,2);
   assert.ok(created.every(v=>v.storeOnly===(remaining<2)));
   assert.equal(session.storeOnly,remaining<2);
  }finally{delete globalThis.document;delete globalThis.sessionStorage;delete globalThis.fetch;}
 }
});
