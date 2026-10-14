import test from 'node:test';
import assert from 'node:assert/strict';
import {workerFailure,reportWorkerResult} from '../lib/worker-diagnostics.mjs';
test('diagnostics reject arbitrary exception text, operation and status injection',()=>{
 for(const error of [Error('secret-provider-token'),Object.assign(Error('Etsy request failed'),{etsyOperation:'private-path\n::notice::secret',etsyStatus:'400 secret'})]){
  assert.doesNotMatch(JSON.stringify(workerFailure(error)),/secret|private-path|notice/);
 }
 assert.deepEqual(workerFailure(Object.assign(Error('Etsy request failed'),{etsyOperation:'images',etsyStatus:429})),{reason:'etsy_request_failed',operation:'images',httpStatus:429});
});
test('reporting fails on product errors and catalogue errors, permits empty valid queue',()=>{
 const lines=[],output={log:s=>lines.push(s),error:s=>lines.push(s)};
 const base={completed:0,skipped:0,failures:[],cataloguePhase:'available'};
 assert.equal(reportWorkerResult({...base,failures:[{action:'publish',reason:'etsy_request_failed',operation:'inventory',httpStatus:400}]},output),1);
 assert.ok(lines.some(s=>s.includes('::error::')&&s.includes('400')));
 assert.equal(reportWorkerResult({...base,cataloguePhase:'seller_consent_required'},output),1);
 assert.equal(reportWorkerResult(base,output),0);assert.ok(lines.some(s=>s.includes('does not retry')));
 assert.equal(reportWorkerResult({...base,completed:1},output),0);
});
