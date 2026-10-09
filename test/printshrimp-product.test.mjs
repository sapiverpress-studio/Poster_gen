import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PRINT_PRODUCT,preparePrintShrimpHandoff } from "../lib/printshrimp-product.mjs";
import { APPROVED_MASTER,PNG_KEY } from "../lib/approved-export.mjs";
function good(){
 return {phase:"ready_for_review",design_id:APPROVED_MASTER.designId,
 approved_updated_at:APPROVED_MASTER.approvedUpdatedAt,file_key:PNG_KEY,
 image:{width:3508,height:4961,bytes:39_200_000,sha256:"a".repeat(64)},
 printshrimp:{meets_measured_upload_checks:true},
 readiness:{print_sizes:{A5:{passes_300ppi:true},A4:{passes_300ppi:true},A3:{passes_300ppi:true}}}};
}
test("exactly one master, one shared SKU, and only A5/A4/A3",()=>{
 const h=preparePrintShrimpHandoff(good());
 assert.equal(h.one_master.key,PNG_KEY);
 assert.equal(h.one_master.filename,PRINT_PRODUCT.sku+".png");
 assert.deepEqual(h.etsy.variations.map(v=>v.value),["A5","A4","A3"]);
 assert.equal(new Set(h.etsy.variations.map(v=>v.sku)).size,1);
 assert.equal(h.printshrimp.orderCreationEnabled,false);
 assert.equal(h.printshrimp.uploadStatus,"NOT_UPLOADED");
 assert.equal(h.etsy.listingStatus,"NOT_CREATED");
 assert.equal(h.etsy.publishEnabled,false);
 assert.equal(h.approvals.sale,false);
});
test("reject stale or unverified artwork, bad dimensions, inadequate resolution or file size",()=>{
 for(const change of [
  r=>r.phase="pending",r=>r.design_id="wrong",r=>r.approved_updated_at=0,
  r=>r.file_key="wrong",r=>r.image.width=3200,r=>r.image.height=4608,
  r=>r.image.bytes=51*1024*1024,r=>r.image.sha256="wrong",
  r=>r.printshrimp.meets_measured_upload_checks=false,
  r=>r.readiness.print_sizes.A3.passes_300ppi=false
 ]){
  const r=good();change(r);assert.throws(()=>preparePrintShrimpHandoff(r));
 }
});
test("handoff makes no Etsy publishing or PrintShrimp order calls",async()=>{
 const source=await readFile(new URL("../lib/printshrimp-product.mjs",import.meta.url),"utf8");
 assert.equal(source.includes("fetch("),false);
 assert.equal(source.includes("axios"),false);
});
