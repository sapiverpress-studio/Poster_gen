import test from 'node:test';
import assert from 'node:assert/strict';
import yazl from 'yazl';
import {webcrypto} from 'node:crypto';
const tags='woodland print,nursery wall art,nature poster,puddle art,forest decor,nature wall art,woodland nursery,kids room art,art print,nursery decor,animal art,woodland gift,physical print';
async function zip(invalid=false){
 const z=new yazl.ZipFile();
 for(let n=0;n<6;n++){
  const png=Buffer.alloc(34);png.set([137,80,78,71,13,10,26,10]);png.write('IHDR',12);png.writeUInt32BE(3394,16);png.writeUInt32BE(4800,20);png[33]=n;
  if(invalid&&n===5)png[0]=0;
  z.addBuffer(png,n+'/poster.png');
  z.addBuffer(Buffer.from('Title: The Puddle\nListing title: Puddle Print '+n+'\nSection: Nature\nTags: '+tags+'\n\nDescription:\nFull original description for poster '+n+'.'),n+'/details.md');
 }
 z.end();const chunks=[];for await(const c of z.outputStream)chunks.push(c);
 return new File(chunks,'collection.zip');
}
test('browser imports all six folder metadata records and validates every artwork before reserving slots',async()=>{
 const nodes=new Map(),saved=new Map(),created=[],live=new Map();let file=await zip(true),handler;
 function el(){return {children:[],style:{},listeners:{},append(...v){this.children.push(...v);},replaceChildren(){this.children=[];},addEventListener(k,v){this.listeners[k]=v;},querySelector(){return button;}};}
 const button=el();
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,el());return nodes.get(id);},querySelector(){return {content:'csrf'};},createElement:el};
 const form=document.getElementById('bulk-collection-form');form.elements={collection:{get files(){return [file];}},kind:{value:'artwork'}};
 globalThis.sessionStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 globalThis.fetch=async(url,options={})=>{
  if(url==='/poster/bulk/status')return Response.json({remaining:52});
  if(url==='/poster/bulk/sections')return Response.json({phase:'available',sections:[{id:123,title:'Nature'},{id:456,title:'Wall Art'}]});
  if(url==='/poster/uploads'){
   const body=JSON.parse(options.body);created.push(body);const id=String(created.length).padStart(32,'a');live.set(id,{phase:'uploading'});
   return Response.json({id,chunkBytes:2000000},{status:201});
  }
  const id=url.split('/')[3];
  if(url.endsWith('/finish')){live.set(id,{phase:'ready_for_approval',review:{title:'Ready',description:'Reviewed',tags,imageUrls:[]}});return Response.json({phase:'preparing'});}
  if(url.includes('/chunks/'))return Response.json({ok:true});
  return Response.json(live.get(id));
 };
 try{
  await import('../public/bulk-upload.mjs');handler=form.listeners.submit;
  await handler({preventDefault(){}});
  assert.equal(created.length,0);assert.equal(saved.size,0);assert.match(nodes.get('bulk-status').textContent,/Not a valid PNG/);
  file=await zip();await handler({preventDefault(){}});
  assert.equal(created.length,6);assert.equal(new Set(created.map(x=>x.filename)).size,6);
  created.forEach((x,n)=>{
   assert.equal(x.metadata.name,'The Puddle');assert.equal(x.metadata.etsyTitle,'Puddle Print '+n);
   assert.equal(x.metadata.sectionTitle,'Nature');assert.equal(x.metadata.tags,tags);
   assert.equal(x.metadata.description,'Full original description for poster '+n+'.');
   assert.match(x.filename,/^SP-THE-PUDDLE-[A-F0-9]{8}\.png$/);
  });
  assert.equal(JSON.parse(saved.get('sapiver-physical-bulk-v1')).version,2);
  assert.equal(nodes.get('bulk-deploy').hidden,false);
 }finally{delete globalThis.document;delete globalThis.sessionStorage;delete globalThis.fetch;}
});
