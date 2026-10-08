import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { newFormChallenge, seal, verifiedFormProof } from "../lib/oauth.mjs";
import { inspectPNG, printReadiness, safeCanvaDownloadUrl, TEST_DESIGN, selectExportScale, requestedExportDimensions, exportedSizeMatchesSource, exportJobState, validExportSession } from "../lib/print-check.mjs";

function pngHeader(width,height) {
  const b=Buffer.alloc(33);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(b,0);
  b.writeUInt32BE(13,8);
  b.write("IHDR",12,"ascii");
  b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);
  b.writeUInt8(8,24);b.writeUInt8(6,25);
  return b;
}
test("inspect PNG dimensions from the actual file header, never DPI metadata",()=>{
  const result=inspectPNG(pngHeader(1024,1536));
  assert.equal(result.width,1024);assert.equal(result.height,1536);
  assert.equal(result.bytes,33);assert.match(result.sha256,/^[a-f0-9]{64}$/);
});
test("invalid or inconsistent PNG header is rejected",()=>{
  assert.throws(()=>inspectPNG(Buffer.alloc(33)));
  assert.throws(()=>inspectPNG(pngHeader(0,1536)));
  assert.throws(()=>inspectPNG(pngHeader(30000,1536)));
});
test("A-series resolution and shape fail for the source poster",()=>{
  const result=printReadiness(1024,1536);
  assert.equal(result.ratio,1.5);
  assert.equal(result.a_series_ratio_matches,false);
  assert.equal(result.print_sizes.A5.passes_300ppi,false);
  assert.equal(result.print_sizes.A1.passes_300ppi,false);
  assert.ok(result.print_sizes.A5.effective_ppi>result.print_sizes.A1.effective_ppi);
});
test("correct A-series aspect ratio and a large master can pass",()=>{
  const result=printReadiness(7016,9933);
  assert.equal(result.a_series_ratio_matches,true);
  assert.equal(result.print_sizes.A1.passes_300ppi,true);
});
test("export URL validation blocks redirects to third-party and insecure endpoints",()=>{
  assert.equal(safeCanvaDownloadUrl("https://export-download.canva.com/p/file.png?sig=secret"),true);
  assert.equal(safeCanvaDownloadUrl("http://export-download.canva.com/p"),false);
  assert.equal(safeCanvaDownloadUrl("https://canva.com.evil.example/p"),false);
  assert.equal(safeCanvaDownloadUrl("https://evil.example/p"),false);
  assert.equal(safeCanvaDownloadUrl("file:///etc/passwd"),false);
});
test("export workflow is read only to Canva and not connected to Etsy or PrintShrimp",async()=>{
  const code=await readFile(new URL("../netlify/functions/canva-print-check.mjs",import.meta.url),"utf8");
  assert.match(code,/design_id:TEST_DESIGN\.id/);
  assert.match(code,/type:"png",lossless:true/);
  assert.match(code,/private/);
  assert.doesNotMatch(code,/https:\/\/api\.etsy\.com/);
  assert.doesNotMatch(code,/api\.printshrimp/);
  assert.equal(TEST_DESIGN.id,"DAHXUnmHofY");
});

test("API export width scales the Canva canvas without assuming output is source-size",()=>{
  for(const [s,w,h] of [[1,1024,1536],[2,2048,3072],[3,3072,4608],[3.125,3200,4800],[4,4096,6144]]) {
    assert.equal(selectExportScale(String(s)),s);
    assert.deepEqual(requestedExportDimensions(1024,1536,s),{width:w,height:h});
    assert.equal(exportedSizeMatchesSource(1024,1536,w,h),true);
    assert.equal(printReadiness(w,h).a_series_ratio_matches,false);
  }
  assert.equal(exportedSizeMatchesSource(1024,1536,3072,4609),true);
  assert.equal(exportedSizeMatchesSource(1024,1536,3072,4096),false);
  assert.throws(()=>selectExportScale("5"));
  assert.throws(()=>selectExportScale("0"));
  assert.throws(()=>selectExportScale("3e0junk"));
  assert.throws(()=>requestedExportDimensions(1024,1536,20));
});
test("print-check service asks Canva for a width-based PNG export and measures returned pixels",async()=>{
  const code=await readFile(new URL("../netlify/functions/canva-print-check.mjs",import.meta.url),"utf8");
  assert.match(code,/width:requested\.width/);
  assert.match(code,/exportedSizeMatchesSource\(record\.width,record\.height,image\.width,image\.height\)/);
  assert.match(code,/requested_met/);
  assert.match(code,/name=\\"scale\\"/);
  assert.doesNotMatch(code,/if\(image\.width!==TEST_DESIGN\.width/);
});

test("real print-check form proof is verified with its own encryption purpose", async () => {
  const secret = "print-check-test-key-should-be-long-enough";
  const challenge = newFormChallenge();
  const encrypted = seal(challenge, secret, "print-form");
  assert.equal(verifiedFormProof(challenge.token, encrypted, secret, Date.now(), "print-form"), true);
  assert.equal(verifiedFormProof(challenge.token, encrypted, secret), false, "OAuth setup form cannot validate print form");
  assert.equal(verifiedFormProof("wrong", encrypted, secret, Date.now(), "print-form"), false);
  const altered = encrypted.split(".");
  altered[3] = (altered[3][0] === "A" ? "B" : "A") + altered[3].slice(1);
  assert.equal(verifiedFormProof(challenge.token, altered.join("."), secret, Date.now(), "print-form"), false);
  assert.equal(verifiedFormProof(challenge.token, encrypted, secret, Date.now() + 600001, "print-form"), false);
  const code = await readFile(new URL("../netlify/functions/canva-print-check.mjs", import.meta.url), "utf8");
  assert.match(code, /seal\(challenge,cfg\.clientSecret,"print-form"\)/);
  assert.match(code, /verifiedFormProof\(fields\.get\("form_token"\),readCookie\(req,FORM_COOKIE\),cfg\.clientSecret,Date\.now\(\),"print-form"\)/);
});

test("Canva job states and session checks are strict",()=>{
  assert.equal(exportJobState({status:"in_progress"}),"pending");
  assert.equal(exportJobState({status:"failed"}),"failed");
  assert.equal(exportJobState({status:"success",urls:["https://download.canva.com/result"]}),"ready");
  assert.equal(exportJobState({status:"success",urls:[]}),"invalid");
  assert.equal(exportJobState({status:"success",urls:["one","two"]}),"invalid");
  assert.equal(exportJobState({status:"unknown"}),"invalid");
  const session={purpose:"print-job",id:"a".repeat(32),expires:100000};
  assert.equal(validExportSession(session,99999),true);
  assert.equal(validExportSession(session,100001),false);
  assert.equal(validExportSession({...session,id:"../secret"},99999),false);
  assert.equal(validExportSession({...session,purpose:"wrong"},99999),false);
});
test("pending status is recoverable and never resubmits the export",async()=>{
  const code=await readFile(new URL("../netlify/functions/canva-print-check.mjs",import.meta.url),"utf8");
  const segment=code.slice(code.indexOf("async function status(req,cfg) {"),code.indexOf("async function doExport(req,cfg) {"));
  assert.match(segment,/CANVA_BASE\+"\/exports\/"\+encodeURIComponent\(record.canvaJobId\)/);
  assert.doesNotMatch(segment,/CANVA_BASE\+"\/exports",token/);
  assert.match(segment,/if\(state==="pending"\)return pendingPage/);
  assert.match(code,/onlyIfNew:true/);
  assert.match(code,/if\(!inserted.modified\) return id/);
  assert.match(code,/path:\["\/canva\/print-check","\/canva\/print-status","\/canva\/print-file"\]/);
  assert.match(code,/SESSION_COOKIE/);
  assert.match(code,/validExportSession\(session\)/);
});
