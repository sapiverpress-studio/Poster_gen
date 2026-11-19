import test from 'node:test';
import assert from 'node:assert/strict';

// Regression: Android file picker displayed a filename and disabled Analyse,
// but the validation error was below the fold rather than beside the ZIP.
test('manual ZIP recheck displays the exact failure next to picker and creates no merchant product',async()=>{
 const nodes=new Map(),writes=[];let network=0;
 function el(){return {children:[],style:{},listeners:{},append(...values){this.children.push(...values);},replaceChildren(){this.children=[];},addEventListener(type,fn){this.listeners[type]=fn;},querySelector(){return submit;}};}
 const submit=el();
 globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,el());return nodes.get(id);},querySelector(){return {content:'csrf'};},createElement:el};
 const form=document.getElementById('bulk-collection-form');
 form.elements={uploadMode:{value:'four-listings'},collection:{files:[new File(['not a valid ZIP'],'Offbeat-Singular-Trio.zip')]},kind:{value:'artwork'}};
 globalThis.sessionStorage={getItem(){return null;},setItem(k,v){writes.push([k,v]);}};
 globalThis.fetch=async()=>{network++;throw Error('Unexpected network request');};
 try{
  await import('../public/bulk-upload.mjs?invalid-mobile-zip-visible-status');
  const manual=nodes.get('bulk-check-zip');
  assert.equal(typeof manual.listeners.click,'function');
  await manual.listeners.click();
  assert.match(nodes.get('bulk-zip-validation-status').textContent,/ZIP rejected:/);
  assert.match(nodes.get('bulk-zip-validation-status').textContent,/No products created/);
  assert.match(nodes.get('bulk-status').textContent,/ZIP rejected:/);
  assert.equal(nodes.get('bulk-analyse-etsy').disabled,true);
  assert.equal(manual.disabled,false,'Retry remains available after a failed ZIP');
  assert.equal(network,0);
  assert.equal(writes.length,0);
 }finally{
  delete globalThis.document;delete globalThis.sessionStorage;delete globalThis.fetch;
 }
});
