import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  APPROVED_MASTER,advanceApprovedMaster,isApprovedRevision,
  validApprovedPage,safeResponseSize,MAX_FILE_BYTES,STATE_KEY,PNG_KEY
} from "../lib/approved-export.mjs";

const goodMeta={id:APPROVED_MASTER.designId,updated_at:APPROVED_MASTER.approvedUpdatedAt,page_count:1};
const page={dimensions:{width:3508,height:4961}};
const jobId="canva-job-1";
function storeMock(){
  const rows=new Map(),writes=[];
  return {
    rows,writes,
    async get(key){return rows.get(key)||null},
    async setJSON(key,value,opts={}){
      if(opts.onlyIfNew && rows.has(key))return {modified:false};
      rows.set(key,value);writes.push(key);return {modified:true};
    },
    async set(key,data){rows.set(key,data);writes.push(key);return {modified:true}}
  };
}
function pngHeader(width=3508,height=4961){
  const bytes=Buffer.alloc(33);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes,0);
  bytes.writeUInt32BE(13,8);bytes.write("IHDR",12,"ascii");
  bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);
  return bytes;
}
function fixture(store,options={}){
  const calls={create:0,status:0,download:0,design:0};
  const canva={
    async design(){calls.design++;return options.meta??goodMeta},
    async page(){return options.page??page},
    async createExport(){calls.create++;if(options.failCreate)throw Error("timeout");return{id:jobId,status:"in_progress"}},
    async exportStatus(){calls.status++;return options.job??{status:"success",urls:["https://export-download.canva.com/test/approved.png"]}}
  };
  const download=async()=>{calls.download++;return{ok:true,headers:{get:()=>null},arrayBuffer:async()=>pngHeader(options.width,options.height)}};
  return {store,canva,download,calls,clock:()=>1791485000000};
}
test("approval is bound to one Canva revision and A3 dimensions",()=>{
  assert.equal(APPROVED_MASTER.designId,"DAHXb1PdJlM");
  assert.equal(APPROVED_MASTER.approvedUpdatedAt,1791485393);
  assert.equal(isApprovedRevision(goodMeta),true);
  assert.equal(isApprovedRevision({...goodMeta,updated_at:1791484485}),false);
  assert.equal(validApprovedPage(page),true);
  assert.equal(validApprovedPage({dimensions:{width:1024,height:1536}}),false);
});
test("first run creates only one job and second run finishes without new POST",async()=>{
  const store=storeMock(),f=fixture(store);
  assert.equal((await advanceApprovedMaster(f)).phase,"pending");
  assert.equal(f.calls.create,1);
  assert.equal((await advanceApprovedMaster(f)).phase,"ready_for_review");
  assert.equal(f.calls.create,1);
  assert.equal(f.calls.status,1);
  assert.ok(store.rows.has(PNG_KEY));
  const saved=store.rows.get(STATE_KEY);
  assert.equal(saved.approved_for_sale,false);
  assert.equal(saved.printshrimp.meets_measured_upload_checks,true);
  assert.deepEqual(saved.print_sizes,["A5","A4","A3"]);
  assert.equal((await advanceApprovedMaster(f)).phase,"ready_for_review");
  assert.equal(f.calls.create,1);
  assert.equal(f.calls.design,3);
});
test("a design modified after owner approval is blocked without any export POST",async()=>{
  const f=fixture(storeMock(),{meta:{...goodMeta,updated_at:goodMeta.updated_at+1}});
  assert.equal((await advanceApprovedMaster(f)).phase,"blocked_changed");
  assert.equal(f.calls.create,0);
  assert.equal((await advanceApprovedMaster(f)).phase,"blocked_changed");
});
test("a wrong-sized design is blocked before export",async()=>{
  const f=fixture(storeMock(),{page:{dimensions:{width:1024,height:1536}}});
  assert.equal((await advanceApprovedMaster(f)).phase,"blocked_format");
  assert.equal(f.calls.create,0);
});
test("Canva pending jobs are checked, not restarted",async()=>{
  const f=fixture(storeMock(),{job:{status:"in_progress"}});
  await advanceApprovedMaster(f);
  assert.equal((await advanceApprovedMaster(f)).phase,"pending");
  assert.equal(f.calls.create,1);
});
test("uncertain Canva POST never automatically duplicates an export",async()=>{
  const f=fixture(storeMock(),{failCreate:true});
  assert.equal((await advanceApprovedMaster(f)).phase,"failed");
  assert.equal((await advanceApprovedMaster(f)).phase,"failed");
  assert.equal(f.calls.create,1);
});
test("suspicious export URL and invalid shape are rejected",async()=>{
  const f=fixture(storeMock(),{job:{status:"success",urls:["https://canva.com.evil.example/p"]}});
  await advanceApprovedMaster(f);
  assert.equal((await advanceApprovedMaster(f)).phase,"failed");
  const wrong=fixture(storeMock(),{width:3000,height:4500});
  await advanceApprovedMaster(wrong);
  assert.equal((await advanceApprovedMaster(wrong)).phase,"blocked_format");
  assert.equal(wrong.store.rows.has(PNG_KEY),false);
});
test("file cap rejects excessive content length",()=>{
  assert.equal(safeResponseSize({headers:{get:()=>String(MAX_FILE_BYTES+1)}}),false);
  assert.equal(safeResponseSize({headers:{get:()=>String(MAX_FILE_BYTES)}}),true);
  assert.equal(safeResponseSize({headers:{get:()=>null}}),true);
  assert.equal(safeResponseSize({headers:{get:()=>"x"}}),false);
});
test("scheduled function stays private and reuses existing token renewal",async()=>{
  const source=await readFile(new URL("../netlify/functions/canva-auto-approved.mjs",import.meta.url),"utf8");
  const existing=await readFile(new URL("../netlify/functions/canva-print-check.mjs",import.meta.url),"utf8");
  assert.ok(source.includes('schedule:"0 */4 * * *"'));
  assert.equal(source.includes('path:"/'),false);
  assert.equal(source.includes("etsy.com"),false);
  assert.equal(source.includes("printshrimp.com"),false);
  assert.ok(existing.includes("export async function accessToken(cfg)"));
});
