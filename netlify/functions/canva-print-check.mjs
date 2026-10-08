import { createHash, randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { newFormChallenge, seal, unseal, equal, acceptedRequestContext, verifiedFormProof, validSetupPassword } from "../../lib/oauth.mjs";
import { TEST_DESIGN, SOURCE_DESIGN, inspectPNG, printReadiness, safeCanvaDownloadUrl, selectExportScale, requestedExportDimensions, exportedSizeMatchesSource, exportJobState, validExportSession, checkThreeSizeMaster } from "../../lib/print-check.mjs";

const FORM_COOKIE = "__Host-sapiver_export_form";
const SESSION_COOKIE = "__Host-sapiver_export_session";
const FORM_CLEAR = FORM_COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
const HEADERS = {
  "Cache-Control":"no-store",
  "Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff",
  "Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const CANVA_BASE = "https://api.canva.com/rest/v1";
const STORE_NAME = "sapiver-print-exports";
const JOB_LIFETIME_MS = 60 * 60 * 1000;
const jobKey = id => "first-poster/jobs/" + id + ".json";
const fileKey = id => "first-poster/files/" + id + ".png";
const exportStore = () => getStore({name: STORE_NAME, consistency:"strong"});

function env(name) { return process.env[name] || (typeof Netlify !== "undefined" ? Netlify.env?.get?.(name) : undefined); }
function cfg() {
  const clientId=env("CANVA_CLIENT_ID"), clientSecret=env("CANVA_CLIENT_SECRET"), password=env("CANVA_SETUP_PASSWORD"), origin=env("CANVA_SITE_ORIGIN");
  if(!clientId || !clientSecret || !password || !origin || !validSetupPassword(password)) throw Error("Export service configuration incomplete.");
  if(new URL(origin).origin!==origin || !origin.startsWith("https://")) throw Error("Configured origin is invalid.");
  return {clientId,clientSecret,password,origin};
}
function readCookie(req,name) {
  const part=(req.headers.get("cookie") || "").split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="));
  return part ? part.slice(name.length+1) : null;
}
function cookie(name,value,seconds) { return name+"="+value+"; Path=/; Max-Age="+seconds+"; HttpOnly; Secure; SameSite=Lax"; }
function escape(value) { return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function page(title,body,status=200,cookies=[]) {
  const markup="<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"+escape(title)+"</title></head>" +
    "<body style=\"font:16px system-ui;max-width:36rem;margin:6vh auto;padding:1.2rem;line-height:1.5\"><h1>"+escape(title)+"</h1>"+body+"</body></html>";
  const h=new Headers({...HEADERS,"Content-Type":"text/html; charset=utf-8"});
  for(const c of cookies)h.append("Set-Cookie",c);
  return new Response(markup,{status,headers:h});
}
function errorPage(text,status=400) {
  return page("Export not completed","<p>"+escape(text)+"</p><p><a href=\"/canva/print-check\">Return to print check</a></p>",status);
}
function getForm(cfg){
  const challenge=newFormChallenge();
  const proof=seal(challenge,cfg.clientSecret,"print-form");
  return page("Check Canva print export",
    "<p>This test exports the separate <strong>A3 working copy of Dinosaurs Across Time</strong>. The original Canva poster remains untouched. No Etsy listing or PrintShrimp order will be created.</p>"+
    "<p>Canva working copy: 3508 × 4961 pixels (A3 aspect ratio). The export must be visually checked for layout, bleed and image clarity.</p>"+
    "<form action=\"/canva/print-check\" method=\"post\">"+
    "<input type=\"hidden\" name=\"form_token\" value=\""+challenge.token+"\">"+
    "<label for=\"setup-password\">Setup password</label><p><input type=\"password\" id=\"setup-password\" name=\"password\" required autocomplete=\"off\" style=\"font-size:16px;width:100%;max-width:25rem\"></p>"+
    "<p><button type=\"button\" id=\"paste-clipboard\">Paste from clipboard</button> <button type=\"button\" id=\"use-saved-clipboard\">Use saved keyboard clipboard</button></p>"+
    "<section id=\"saved-clipboard-panel\" hidden><label for=\"clipboard-entry\">Paste your saved keyboard item here</label>"+
    "<p><input type=\"text\" id=\"clipboard-entry\" autocomplete=\"off\" style=\"font-size:16px;width:100%;max-width:25rem\"></p></section>"+
    "<p id=\"clipboard-status\" aria-live=\"polite\"></p>"+
    "<p><label for=\"export-scale\">Export size</label> <select id=\"export-scale\" name=\"scale\">"+
    "<option value=\"1\" selected>1× — 3508 × 4961 px (A3 master)</option>"+
    "<option value=\"1.125\">1.125× — 3947 × 5581 px (extra detail if available)</option>"+
    "<option value=\"2\">2× — 7016 × 9922 px (larger, optional)</option>"+
    ""+
    "</select></p>"+
    "<p><small>1× should be sufficient for A3 at 300 PPI. Extra export pixels do not restore detail missing from raster illustrations.</small></p>"+
    "<button type=\"submit\">Export PNG and measure pixels</button></form>"+
    "<p><small>Files are stored in private Netlify storage; download requires an authenticated browser session.</small></p>"+
    "<script type=\"module\" src=\"/canva-clipboard.mjs\"></script>",200,[cookie(FORM_COOKIE,proof,600)]);
}
async function accessToken(cfg) {
  const store=getStore("sapiver-canva-private");
  const entry=await store.getWithMetadata("primary",{consistency:"strong"});
  if(!entry?.data)throw Error("Canva is not yet connected.");
  const token=unseal(entry.data,cfg.clientSecret,"stored-tokens");
  if(typeof token.access_token!=="string" || typeof token.refresh_token!=="string") throw Error("Canva tokens are invalid.");
  if(Number(token.expires_at)>Date.now()+90000) return token.access_token;

  // A single writer may exchange Canva's rotating, single-use refresh token.
  const nonce=randomBytes(24).toString("hex"), lockKey="primary-refresh-lock";
  let lock=await store.set(lockKey,JSON.stringify({nonce,until:Date.now()+60000}),{onlyIfNew:true});
  if(!lock.modified) {
    const old=await store.getWithMetadata(lockKey,{consistency:"strong"});
    if(!old?.data)throw Error("Canva token refresh is busy. Try again shortly.");
    let prior;
    try{prior=JSON.parse(old.data);}catch{throw Error("Canva refresh lock invalid; reconnect Canva.");}
    if(!Number.isFinite(prior.until)||prior.until>Date.now())throw Error("Another refresh is running. Try again shortly.");
    lock=await store.set(lockKey,JSON.stringify({nonce,until:Date.now()+60000}),{onlyIfMatch:old.etag});
    if(!lock.modified)throw Error("Another refresh is running. Try again shortly.");
  }
  try {
    const latest=await store.getWithMetadata("primary",{consistency:"strong"});
    if(!latest?.data)throw Error("Canva token record missing.");
    const latestToken=unseal(latest.data,cfg.clientSecret,"stored-tokens");
    if(latestToken.expires_at>Date.now()+90000)return latestToken.access_token;
    const response=await fetch(CANVA_BASE+"/oauth/token",{
      method:"POST",
      headers:{
        "Content-Type":"application/x-www-form-urlencoded",
        Authorization:"Basic "+Buffer.from(cfg.clientId+":"+cfg.clientSecret).toString("base64")
      },
      body:new URLSearchParams({grant_type:"refresh_token",refresh_token:latestToken.refresh_token}).toString(),
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw Error("Canva refresh failed. Reconnect Canva and retry.");
    const updated=await response.json();
    if(!updated.access_token || !updated.refresh_token)throw Error("Canva returned incomplete refreshed credentials.");
    const record={
      ...latestToken, access_token:updated.access_token,refresh_token:updated.refresh_token,
      scope:updated.scope??latestToken.scope,expires_at:Date.now()+Number(updated.expires_in||0)*1000
    };
    const saved=await store.set("primary",seal(record,cfg.clientSecret,"stored-tokens"),{onlyIfMatch:latest.etag});
    if(!saved.modified) throw Error("Token changed during refresh; reconnect Canva before further requests.");
    return record.access_token;
  } finally {
    const current=await store.getWithMetadata(lockKey,{consistency:"strong"});
    try {
      if(JSON.parse(current?.data||"{}").nonce===nonce)await store.delete(lockKey);
    }catch{/* keep lock if storage is temporarily unavailable; never release another owner's lock */}
  }
}
async function api(url,token,options={}) {
  const response=await fetch(url,{...options,headers:{Authorization:"Bearer "+token,...(options.headers||{})},signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw Error("Canva API rejected the export request ("+response.status+").");
  return await response.json();
}
function sessionFromRequest(req,cfg) {
  const encoded=readCookie(req,SESSION_COOKIE);
  if(!encoded)return null;
  try {
    const session=unseal(encoded,cfg.clientSecret,"print-session");
    return validExportSession(session) ? session : null;
  } catch {
    return null;
  }
}
function makeSession(id,cfg) {
  const expires=Date.now()+JOB_LIFETIME_MS;
  const value=seal({purpose:"print-job",id,expires},cfg.clientSecret,"print-session");
  return cookie(SESSION_COOKIE,value,3600);
}
function pendingPage(description,cookieHeader) {
  return page("Canva export requested",
    "<p>"+escape(description)+"</p>"+
    "<p>Your Canva export job has been saved. You don't need to enter the password or start another export.</p>"+
    "<p><a href=\"/canva/print-status\">Check existing export status</a></p>"+
    "<p><small>Keep using this browser. The private session lasts one hour.</small></p>",
    200,cookieHeader?[FORM_CLEAR,cookieHeader]:[]);
}
function reportPage(report,cookieHeader) {
  const sizes=Object.entries(report.readiness.print_sizes).map(([name,v])=>
    "<tr><td>"+name+"</td><td>"+v.effective_ppi+" PPI</td><td>"+(v.passes_300ppi?"Meets":"Below")+" 300</td></tr>").join("");
  return page("Canva PNG exported and measured",
    "<p>The Canva PNG is saved privately. Your Canva design has not been changed.</p>"+
    "<p><strong>Requested:</strong> "+report.requested.width+" × "+report.requested.height+" px ("+report.selected_scale+"×)<br>"+
    "<strong>Actual:</strong> "+report.image.width+" × "+report.image.height+" px<br>"+
    "<strong>Requested width returned:</strong> "+(report.requested_met?"Yes":"No")+"<br>"+
    "<strong>File size:</strong> "+Math.round(report.image.bytes/1024)+" KB<br>"+
    "<strong>Ratio:</strong> "+report.readiness.ratio+"<br>"+
    "<strong>A-series ratio match:</strong> "+(report.readiness.a_series_ratio_matches?"Yes":"No")+"</p>"+
    "<h2>Effective print resolution</h2><table cellpadding=\"6\"><tr><th>Size</th><th>Resolution</th><th>Result</th></tr>"+sizes+"</table>"+
    "<p><strong>PrintShrimp 50 MB limit:</strong> "+(report.printshrimp?.within_printshrimp_50mb_upload_limit?"Within limit":"TOO LARGE")+"<br>"+
    "<strong>Measured checks for A3/A4/A5:</strong> "+(report.printshrimp?.meets_measured_upload_checks?"Pass":"Further adjustments required")+"</p>"+
    "<p><strong>Print approval: PENDING VISUAL PROOF.</strong> The A-series ratio and pixel density are measured above. Check legibility, artwork placement, any clipping and PrintShrimp safe margins before approving.</p>"+
    "<p><a href=\"/canva/print-file\">Download PNG (private one-hour session)</a></p>",
    200,cookieHeader?[cookieHeader]:[]);
}
async function beginExport(cfg,scale,tokenOfForm,context) {
  const id=createHash("sha256").update(tokenOfForm).digest("hex").slice(0,32);
  const store=exportStore(), key=jobKey(id);
  const placeholder={status:"starting",createdAt:Date.now(),expires:Date.now()+JOB_LIFETIME_MS};
  const inserted=await store.setJSON(key,placeholder,{onlyIfNew:true});
  if(!inserted.modified) return id; // A double-submit must never start another Canva export.
  // The API calls can take longer than a browser navigation. Respond immediately,
  // and let Netlify finish creation after the response using waitUntil.
  const startJob = async () => {
  try {
    const token=await accessToken(cfg);
    const metadata=await api(CANVA_BASE+"/designs/"+TEST_DESIGN.id,token);
    if(metadata?.design?.id!==TEST_DESIGN.id)throw Error("The Canva design could not be verified.");
    const pages=await api(CANVA_BASE+"/designs/"+TEST_DESIGN.id+"/pages?limit=1",token);
    const dims=pages?.items?.[0]?.dimensions;
    if(!dims || dims.width!==TEST_DESIGN.width || dims.height!==TEST_DESIGN.height)
      throw Error("Canva design dimensions changed. Review the design before exporting.");
    const requested=requestedExportDimensions(dims.width,dims.height,scale);
    const created=await api(CANVA_BASE+"/exports",token,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({design_id:TEST_DESIGN.id,format:{type:"png",lossless:true,width:requested.width,pages:[1]}})
    });
    const job=created?.job;
    if(!job?.id || typeof job.id!=="string")throw Error("Canva did not return a job identifier.");
    await store.setJSON(key,{
      status:"in_progress",design_id:TEST_DESIGN.id,canvaJobId:job.id,createdAt:placeholder.createdAt,
      expires:placeholder.expires,requested,selected_scale:scale,
      width:dims.width,height:dims.height,title:metadata.design.title||TEST_DESIGN.title
    });
    return id;
  } catch (error) {
    await store.setJSON(key,{...placeholder,status:"failed",error:"Could not start the Canva export. Open a new print-check form."});
    // Background promises should resolve after recording a safe error.
  }
  };
  if (typeof context?.waitUntil === "function") context.waitUntil(startJob());
  else await startJob();
  return id;
}
async function readJob(store,id) {
  return await store.get(jobKey(id),{type:"json",consistency:"strong"});
}
async function status(req,cfg) {
  const session=sessionFromRequest(req,cfg);
  if(!session)return errorPage("Your private export session has expired. Open a new print-check form.",403);
  const store=exportStore();
  const record=await readJob(store,session.id);
  if(!record)return errorPage("Export job not found. Start a new print check.",404);
  if(record.status==="complete" && record.report)return reportPage(record.report);
  if(record.status==="failed")return errorPage(record.error || "Canva export failed. Start a new print check.",502);
  if(record.expires<Date.now())return errorPage("This export job is over one hour old. Start a new print check.",410);
  if(record.status==="starting")return pendingPage("The export request is being prepared. Check its status again shortly.");
  if(record.status!=="in_progress" || !record.canvaJobId)return errorPage("Unexpected export status. No new export was started.",502);

  const token=await accessToken(cfg);
  const result=await api(CANVA_BASE+"/exports/"+encodeURIComponent(record.canvaJobId),token);
  const job=result?.job, state=exportJobState(job);
  if(state==="pending")return pendingPage("Canva is still preparing the high-resolution PNG.");
  if(state==="failed"){
    await store.setJSON(jobKey(session.id),{...record,status:"failed",error:"Canva reported the export failed."});
    return errorPage("Canva reported the export failed. Start a new print-check form.",502);
  }
  if(state!=="ready")return errorPage("Canva returned an unrecognised export status. The job is preserved.",502);

  const url=job.urls[0];
  if(!safeCanvaDownloadUrl(url))return errorPage("The Canva export link used an unexpected host. Job preserved.",502);
  const response=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:"error"});
  if(!response.ok)return errorPage("Could not download the completed Canva export. Try checking status again.",502);
  if(Number(response.headers.get("content-length")||0)>80*1024*1024)
    return errorPage("The Canva export exceeds the 80 MB limit.",413);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>80*1024*1024)return errorPage("The Canva export exceeds the 80 MB limit.",413);
  const image=inspectPNG(bytes);
  if(!exportedSizeMatchesSource(record.width,record.height,image.width,image.height))
    return errorPage("Canva returned a different aspect ratio. This export cannot be approved.",502);
  const readiness=printReadiness(image.width,image.height);
  const printshrimp=checkThreeSizeMaster(image,readiness);
  const report={
    design_id:record.design_id||SOURCE_DESIGN.id,title:record.title,exported_at:new Date().toISOString(),
    image,requested:record.requested,selected_scale:record.selected_scale,
    requested_met:Math.abs(image.width-record.requested.width)<=1,
    readiness,printshrimp,approved_for_print:false,
    reason:"A-series dimensions and PPI must be verified; typography, illustration clarity, safety margins and PrintShrimp specifications still require review."
  };
  await store.set(fileKey(session.id),new Blob([bytes],{type:"image/png"}),{
    metadata:{design_id:TEST_DESIGN.id,created_at:report.exported_at,content_type:"image/png"}
  });
  await store.setJSON(jobKey(session.id),{...record,status:"complete",report});
  return reportPage(report);
}
async function doExport(req,cfg,context) {
  if(!acceptedRequestContext(req.headers.get("origin"),cfg.origin,req.headers.get("sec-fetch-site")))
    return errorPage("Form request was rejected.",403);
  if(!(req.headers.get("content-type")||"").startsWith("application/x-www-form-urlencoded"))return errorPage("Invalid form data.",415);
  if(Number(req.headers.get("content-length")||0)>8192)return errorPage("Form too large.",413);
  const fields=new URLSearchParams((await req.text()).slice(0,8192));
  const formToken=fields.get("form_token");
  if(!verifiedFormProof(formToken,readCookie(req,FORM_COOKIE),cfg.clientSecret,Date.now(),"print-form"))
    return errorPage("Form expired. Open a new print-check page.",403);
  if(!equal(fields.get("password")||"",cfg.password))return errorPage("Incorrect setup password.",403);
  let scale;
  try{scale=selectExportScale(fields.get("scale")||"1");}catch{return errorPage("Choose a valid export scale.",400);}
  const id=await beginExport(cfg,scale,formToken,context);
  return pendingPage("Your export request was sent to Canva.",makeSession(id,cfg));
}
async function download(req,cfg) {
  const session=sessionFromRequest(req,cfg);
  if(!session)return errorPage("Download session expired. Open the print check again.",403);
  const store=exportStore();
  const record=await readJob(store,session.id);
  if(record?.status!=="complete")return errorPage("Export not yet finished. Check its status first.",409);
  const bytes=await store.get(fileKey(session.id),{type:"arrayBuffer",consistency:"strong"});
  if(!bytes)return errorPage("Export file not found. Check its status again.",404);
  return new Response(bytes,{status:200,headers:{
    ...HEADERS,"Content-Type":"image/png",
    "Content-Disposition":'attachment; filename="dinosaurs-across-time-A3-master.png"'
  }});
}
export default async function handler(req,context) {
  try{
    const config=cfg(),path=new URL(req.url).pathname;
    if(path==="/canva/print-file")return req.method==="GET"?await download(req,config):errorPage("Method not allowed.",405);
    if(path==="/canva/print-status")return req.method==="GET"?await status(req,config):errorPage("Method not allowed.",405);
    if(path!=="/canva/print-check")return errorPage("Not found.",404);
    if(req.method==="GET")return getForm(config);
    if(req.method==="POST")return await doExport(req,config,context);
    return errorPage("Method not allowed.",405);
  } catch(error) {
    const msg=error?.message;
    const safe=typeof msg==="string" && /^(Canva API rejected the export request \(\d{3}\)\.|Canva is not yet connected\.|Canva token refresh is busy\.|Another refresh is running\.)$/.test(msg);
    return errorPage(safe?msg:"Print-check service is temporarily unavailable. The existing job has not been restarted.",503);
  }
}
export const config={
  path:["/canva/print-check","/canva/print-status","/canva/print-file"],
  rateLimit:{action:"rate_limit",aggregateBy:"ip",windowSize:180,windowLimit:24}
};
