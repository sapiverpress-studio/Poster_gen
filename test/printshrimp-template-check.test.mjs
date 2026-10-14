import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSupplierTemplates} from '../lib/printshrimp-template-check.mjs';
test('template discovery makes one GET and returns shape without supplier values',async()=>{
 let calls=0;
 const result=await inspectSupplierTemplates({apiKey:'private-key',request:async(url,o)=>{calls++;assert.equal(url,'https://api.printshrimp.com/functions/v1/api-get-templates');assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.equal(o.headers['x-api-key'],'private-key');return Response.json({templates:[{id:'private-id',url:'https://example.test/private',name:'private-name',mockups:[{image_url:'private-art'}]}]});}});
 assert.equal(calls,1);assert.equal(result.phase,'available');assert.doesNotMatch(JSON.stringify(result),/private-|example.test/);assert.equal(result.schema.templates.count,1);
});
test('unavailable endpoint retains only numeric status',async()=>{assert.deepEqual(await inspectSupplierTemplates({apiKey:'key',request:async()=>new Response('private error',{status:403})}),{phase:'unavailable',httpStatus:403});});
