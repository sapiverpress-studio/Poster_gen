import test from 'node:test';
import assert from 'node:assert/strict';
import {compatiblePartnerIds,verifyExistingStreakTrio} from '../lib/streak-trio-inplace-verification.mjs';
import {exactHtmlEntityChanges} from '../lib/poster-template.mjs';
test('only an exact Etsy production-partner id or an omitted read-only field is compatible',()=>{
 assert.equal(compatiblePartnerIds('123456',undefined),true);
 assert.equal(compatiblePartnerIds('123456',null),true);
 assert.equal(compatiblePartnerIds('123456',['123456']),true);
 assert.equal(compatiblePartnerIds('123456',[123456]),true);
 assert.equal(compatiblePartnerIds('123456','123456'),true);
 assert.equal(compatiblePartnerIds('123456',['654321']),false);
 assert.equal(compatiblePartnerIds('123456',[]),false);
 assert.equal(compatiblePartnerIds('123456',['123456','654321']),false);
 assert.equal(compatiblePartnerIds('123456,654321',['123456','654321']),false);
 assert.equal(compatiblePartnerIds('',undefined),false);
});
test('approved Etsy HTML-encoded description is exact only when the actual words stay unchanged',()=>{
 const expected="Three animal prints. Huggles says 'okay' & Edge reads.";
 assert.equal(exactHtmlEntityChanges(expected,
   'Three animal prints. Huggles says &#39;okay&#39; &amp; Edge reads.').exact,true);
 assert.equal(exactHtmlEntityChanges(expected,
   'Three animal prints. Huggles says &#39;okay&#39; &amp; Edge sleeps.').exact,false);
});
test('retained trio recovery never calls a merchant endpoint when publication is disabled',async()=>{
 let calls=0;
 const result=verifyExistingStreakTrio({
  env:()=>null,uploads:{get:async()=>{calls++;return null}},
  etsyStore:{get:async()=>{calls++;return null}},
  client:{api:async()=>{calls++;throw Error('unexpected Etsy API')}},
  request:async()=>{calls++;throw Error('unexpected supplier API')}
 });
 await assert.rejects(result,/Poster publication disabled/);
 assert.equal(calls,0);
});
