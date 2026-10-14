import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkOwnerPrintSections} from '../lib/owner-upload-smoke.mjs';
import {metadataFields} from '../lib/product-web.mjs';
test('release check verifies exact authenticated section choices and served selection submission without mutations',async()=>{const calls=[];const r=await checkOwnerPrintSections({origin:'https://studio.example',secret:'x'.repeat(40),request:async(u,o)=>{calls.push([u,o]);return new Response(u.endsWith('.mjs')?readFileSync(new URL('../public/poster-upload.mjs',import.meta.url),'utf8'):'<form id="poster-upload-form">'+metadataFields()+'</form>');}});assert.equal(r.phase,'ready');assert.equal(calls.length,2);assert.ok(calls.every(([,o])=>!o.method||o.method==='GET'));});
test('missing or stale selector is not reported as released',async()=>{const r=await checkOwnerPrintSections({origin:'https://studio.example',secret:'x'.repeat(40),request:async()=>new Response('<form id="poster-upload-form"></form>')});assert.equal(r.phase,'not_ready');});
