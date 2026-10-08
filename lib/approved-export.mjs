// Only revisions expressly approved by the owner may be exported.
// Approval is bound to Canva's updated_at metadata, not merely the design ID.
// Do not automatically replace a pinned revision when Canva is edited.
import { inspectPNG, printReadiness, checkThreeSizeMaster, safeCanvaDownloadUrl } from "./print-check.mjs";

export const APPROVED_MASTER = Object.freeze({
  designId: "DAHXb1PdJlM",
  approvedUpdatedAt: 1791484484,
  width: 3508,
  height: 4961,
  title: "Dinosaurs Across Time — approved A3 working copy",
  page: 1,
  printSizes: Object.freeze(["A5", "A4", "A3"]),
});
export const PRIVATE_APPROVED_STORE = "sapiver-print-approved";
export const PRIVATE_APPROVED_KEY = "approved/" + APPROVED_MASTER.designId + "/" + APPROVED_MASTER.approvedUpdatedAt;
export const STATE_KEY = PRIVATE_APPROVED_KEY + "/state.json";
export const PNG_KEY = PRIVATE_APPROVED_KEY + "/master.png";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function isApprovedRevision(meta, approval=APPROVED_MASTER) {
  return meta?.id===approval.designId && meta.updated_at===approval.approvedUpdatedAt &&
    meta.page_count===1;
}
export function validApprovedPage(page,approval=APPROVED_MASTER) {
  return page?.dimensions?.width===approval.width &&
    page?.dimensions?.height===approval.height;
}
export function safeResponseSize(response) {
  const s=response?.headers?.get?.("content-length");
  return !s || (/^[0-9]+$/.test(s) && Number(s)<=MAX_FILE_BYTES);
}

// All external dependencies injected to support deterministic, offline testing.
// The worker never publishes a product; "ready_for_review" is not print approval.
export async function advanceApprovedMaster({
  store,canva,download,clock=()=>Date.now(),approval=APPROVED_MASTER
}) {
  const prefix="approved/"+approval.designId+"/"+approval.approvedUpdatedAt;
  const stateKey=prefix+"/state.json",fileKey=prefix+"/master.png";
  let state=await store.get(stateKey,{type:"json",consistency:"strong"});
  if(state && ["ready_for_review","blocked_changed","blocked_format","failed","creating"].includes(state.phase))
    return {phase:state.phase, detail:state.reason??null};
  if(state && state.phase!=="pending")
    return {phase:"blocked_invalid_state",detail:"Unexpected stored state; do not submit another Canva export"};

  // Check revision on EVERY in-progress run and before making any new export job.
  const info=await canva.design(approval.designId);
  if(!isApprovedRevision(info,approval)){
    const result={phase:"blocked_changed",reason:"Canva design revision changed since approval; ask owner to review before retrying.",checkedAt:clock()};
    await store.setJSON(stateKey,result);
    return result;
  }

  if(!state){
    const page=await canva.page(approval.designId);
    if(!validApprovedPage(page,approval)){
      const blocked={phase:"blocked_format",reason:"A3 page dimensions changed since approval.",checkedAt:clock()};
      await store.setJSON(stateKey,blocked);
      return blocked;
    }
    const reserved={phase:"creating",reservedAt:clock()};
    const result=await store.setJSON(stateKey,reserved,{onlyIfNew:true});
    if(result?.modified!==true) return {phase:"already_reserved",detail:"Another worker owns export creation"};
    let job;
    try {
      job=await canva.createExport(approval.designId,approval.width);
    } catch {
      // The API might have accepted a request before a timeout. Never risk duplicate creation.
      await store.setJSON(stateKey,{phase:"failed",reason:"Export request outcome uncertain. Manual investigation required.",failedAt:clock()});
      return {phase:"failed"};
    }
    if(typeof job?.id!=="string" || !job.id || !["in_progress","success"].includes(job.status)){
      await store.setJSON(stateKey,{phase:"failed",reason:"Canva did not return a valid job identifier.",failedAt:clock()});
      return {phase:"failed"};
    }
    state={phase:"pending",canvaJobId:job.id,createdAt:clock(),approvedUpdatedAt:approval.approvedUpdatedAt};
    await store.setJSON(stateKey,state);
    return {phase:"pending"};
  }

  // Poll the previously created job. This path NEVER starts a second export job.
  const job=await canva.exportStatus(state.canvaJobId);
  if(job?.status==="in_progress")return {phase:"pending"};
  if(job?.status==="failed"){
    await store.setJSON(stateKey,{...state,phase:"failed",reason:"Canva reported export job failure."});
    return {phase:"failed"};
  }
  if(job?.status!=="success" || !Array.isArray(job.urls) || job.urls.length!==1 ||
      !safeCanvaDownloadUrl(job.urls[0])){
    await store.setJSON(stateKey,{...state,phase:"failed",reason:"Unexpected Canva export result URL or job status."});
    return {phase:"failed"};
  }

  const response=await download(job.urls[0]);
  if(!response?.ok || !safeResponseSize(response))
    return {phase:"pending",detail:"Download temporarily unavailable or too large; job preserved"};
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.byteLength>MAX_FILE_BYTES){
    await store.setJSON(stateKey,{...state,phase:"blocked_format",reason:"PNG exceeds PrintShrimp's 50 MiB safety limit."});
    return {phase:"blocked_format"};
  }
  let image;
  try {image=inspectPNG(bytes);}catch{
    await store.setJSON(stateKey,{...state,phase:"blocked_format",reason:"Exported file is not a valid PNG header."});
    return {phase:"blocked_format"};
  }
  const readiness=printReadiness(image.width,image.height);
  const printshrimp=checkThreeSizeMaster(image,readiness);
  if(image.width!==approval.width || image.height!==approval.height ||
     !printshrimp.meets_measured_upload_checks){
    await store.setJSON(stateKey,{...state,phase:"blocked_format",reason:"Exported image fails expected A3 dimensions, A-series, resolution or file-size checks.",image,printshrimp});
    return {phase:"blocked_format"};
  }
  // Reject a concurrent Canva edit while downloading the exported PNG.
  const after=await canva.design(approval.designId);
  if(!isApprovedRevision(after,approval)){
    await store.setJSON(stateKey,{...state,phase:"blocked_changed",reason:"Canva changed while export was being downloaded."});
    return {phase:"blocked_changed"};
  }
  await store.set(fileKey,new Blob([bytes],{type:"image/png"}),{
    metadata:{design_id:approval.designId,updated_at:String(approval.approvedUpdatedAt),content_type:"image/png"}
  });
  const report={
    phase:"ready_for_review",design_id:approval.designId,approved_updated_at:approval.approvedUpdatedAt,
    exported_at:new Date(clock()).toISOString(),image,print_sizes:["A5","A4","A3"],
    readiness,printshrimp,approved_for_print:false,approved_for_sale:false,
    file_key:fileKey, visual_review_required:true, physical_proof_required:true
  };
  await store.setJSON(stateKey,report);
  return {phase:"ready_for_review",report};
}
