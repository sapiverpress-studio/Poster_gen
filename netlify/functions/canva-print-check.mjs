import { randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { newFormChallenge, seal, unseal, equal, acceptedRequestContext, verifiedFormProof, validSetupPassword } from "../../lib/oauth.mjs";
import { TEST_DESIGN, inspectPNG, printReadiness, safeCanvaDownloadUrl, selectExportScale, requestedExportDimensions, exportedSizeMatchesSource } from "../../lib/print-check.mjs";

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
const EXPORT_KEY = "first-poster/original.png";
const REPORT_KEY = "first-poster/report.json";
const STORE_NAME = "sapiver-print-exports";
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));

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
    "<p>This read-only test exports the original Canva design <strong>Dinosaurs across time</strong> without changing it, posting Etsy listings, or ordering prints.</p>"+
    "<p>Canvas: 1024 × 1536 pixels. Export dimensions can be higher, but the design remains 2:3 rather than A-series.</p>"+
    "<form action=\"/canva/print-check\" method=\"post\">"+
    "<input type=\"hidden\" name=\"form_token\" value=\""+challenge.token+"\">"+
    "<label for=\"setup-password\">Setup password</label><p><input type=\"password\" id=\"setup-password\" name=\"password\" required autocomplete=\"off\" style=\"font-size:16px;width:100%;max-width:25rem\"></p>"+
    "<p><button type=\"button\" id=\"paste-clipboard\">Paste from clipboard</button> <button type=\"button\" id=\"use-saved-clipboard\">Use saved keyboard clipboard</button></p>"+
    "<section id=\"saved-clipboard-panel\" hidden><label for=\"clipboard-entry\">Paste your saved keyboard item here</label>"+
    "<p><input type=\"text\" id=\"clipboard-entry\" autocomplete=\"off\" style=\"font-size:16px;width:100%;max-width:25rem\"></p></section>"+
    "<p id=\"clipboard-status\" aria-live=\"polite\"></p>"+
    "<p><label for=\"export-scale\">Export size</label> <select id=\"export-scale\" name=\"scale\">"+
    "<option value=\"1\">1× — 1024 × 1536 px</option>"+
    "<option value=\"2\">2× — 2048 × 3072 px</option>"+
    "<option value=\"3\" selected>3× — 3072 × 4608 px</option>"+
    "<option value=\"3.125\">3.125× — 3200 × 4800 px</option>"+
    "<option value=\"4\">4× — 4096 × 6144 px</option></select></p>"+
    "<p><small>Canva Free may reject upscaling above 1.125×. Actual exported pixels are measured.</small></p>"+
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
async function exportPNG(cfg,scale) {
  const token=await accessToken(cfg);
  const metadata=await api(CANVA_BASE+"/designs/"+TEST_DESIGN.id,token);
  if(metadata?.design?.id!==TEST_DESIGN.id)throw Error("Cannot verify this Canva design.");
  const pages=await api(CANVA_BASE+"/designs/"+TEST_DESIGN.id+"/pages?limit=1",token);
  const dims=pages?.items?.[0]?.dimensions;
  if(!dims || dims.width!==TEST_DESIGN.width || dims.height!==TEST_DESIGN.height)
    throw Error("Canva design dimensions have changed; review the design before exporting.");

  const requested=requestedExportDimensions(dims.width,dims.height,scale);
  const created=await api(CANVA_BASE+"/exports",token,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({design_id:TEST_DESIGN.id,format:{type:"png",lossless:true,width:requested.width,pages:[1]}})
  });
  let job=created?.job;
  if(!job?.id || typeof job.id!=="string") throw Error("Canva did not return an export job.");
  for(let i=0; i<12 && job.status==="in_progress"; i++){
    await sleep(1000);
    const result=await api(CANVA_BASE+"/exports/"+encodeURIComponent(job.id),token);
    job=result.job;
  }
  if(job?.status!=="success" || !Array.isArray(job.urls) || job.urls.length!==1)
    throw Error(job?.status==="failed" ? "Canva reported that the export failed." : "Canva export is still processing; retry later.");

  const url=job.urls[0];
  if(!safeCanvaDownloadUrl(url))throw Error("Unexpected Canva download host; export blocked.");
  const response=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:"error"});
  if(!response.ok)throw Error("Could not download original export from Canva.");
  if(Number(response.headers.get("content-length")||"0")>80*1024*1024)throw Error("Export exceeds 80 MB safety limit.");
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>80*1024*1024)throw Error("Export exceeds 80 MB safety limit.");
  const image=inspectPNG(bytes);
  if(!exportedSizeMatchesSource(dims.width,dims.height,image.width,image.height))
    throw Error("Canva returned a different aspect ratio; export NOT approved.");
  const readiness=printReadiness(image.width,image.height);
  const report={design_id:TEST_DESIGN.id,title:metadata.design.title||TEST_DESIGN.title,exported_at:new Date().toISOString(),image,requested,selected_scale:scale,requested_met:Math.abs(image.width-requested.width)<=1,readiness,approved_for_print:false,reason:"2:3 remains different from A-series, regardless of export scale. Artwork detail still requires visual print proofing."};
  const store=getStore(STORE_NAME);
  await store.set(EXPORT_KEY,new Blob([bytes],{type:"image/png"}),{metadata:{design_id:TEST_DESIGN.id,content_type:"image/png",created_at:report.exported_at}});
  await store.setJSON(REPORT_KEY,report);
  return report;
}
async function doExport(req,cfg) {
  if(!acceptedRequestContext(req.headers.get("origin"),cfg.origin,req.headers.get("sec-fetch-site")))
    return errorPage("Form request was rejected.",403);
  if(!(req.headers.get("content-type")||"").startsWith("application/x-www-form-urlencoded"))return errorPage("Invalid form data.",415);
  if(Number(req.headers.get("content-length")||0)>8192)return errorPage("Form too large.",413);
  const fields=new URLSearchParams((await req.text()).slice(0,8192));
  if(!verifiedFormProof(fields.get("form_token"),readCookie(req,FORM_COOKIE),cfg.clientSecret))return errorPage("Form expired. Open a new print-check page.",403);
  if(!equal(fields.get("password")||"",cfg.password))return errorPage("Incorrect setup password.",403);
  let scale;
  try{scale=selectExportScale(fields.get("scale")||"3");}catch{return errorPage("Choose a valid export scale.",400);}
  let report;
  try{report=await exportPNG(cfg,scale);}catch(e){
    return errorPage(e?.message||"Export failed.",502);
  }
  const session=seal({purpose:"print-download",expires:Date.now()+900000},cfg.clientSecret,"print-download");
  const sizes=Object.entries(report.readiness.print_sizes).map(([name,v])=>"<tr><td>"+name+"</td><td>"+v.effective_ppi+" PPI</td><td>"+(v.passes_300ppi?"Meets":"Below")+" 300</td></tr>").join("");
  return page("Canva PNG exported and measured",
    "<p>The Canva PNG was downloaded, checked and stored privately. The original design was not changed.</p>"+
    "<p><strong>Requested export:</strong> "+report.requested.width+" × "+report.requested.height+" pixels ("+report.selected_scale+"×)<br>"+
    "<strong>Actual PNG:</strong> "+report.image.width+" × "+report.image.height+" pixels<br>"+
    "<strong>Returned requested width:</strong> "+(report.requested_met?"Yes":"No — export restriction or plan limit may apply")+"<br>"+
    "<strong>File size:</strong> "+Math.round(report.image.bytes/1024)+" KB<br>"+
    "<strong>Ratio:</strong> "+report.readiness.ratio+"<br>"+
    "<strong>A-series ratio match:</strong> "+(report.readiness.a_series_ratio_matches?"Yes":"NO")+"</p>"+
    "<h2>Effective print resolution</h2><table cellpadding=\"6\"><tr><th>Size</th><th>Resolution</th><th>Result</th></tr>"+sizes+"</table>"+
    "<p><strong>Print approval: NOT APPROVED YET.</strong> The artwork is 2:3 rather than A-series; decide whether to adapt layout, crop or add borders. Visually inspect detail at print size.</p>"+
    "<p><a href=\"/canva/print-file\">Download exported lossless PNG (private, 15-minute access)</a></p>"+
    "<p><a href=\"/canva/print-check\">Start another check</a></p>",
    200,[FORM_CLEAR,cookie(SESSION_COOKIE,session,900)]);
}
async function download(req,cfg) {
  const encoded=readCookie(req,SESSION_COOKIE);
  let session;
  try{session=unseal(encoded,cfg.clientSecret,"print-download");}catch{return errorPage("Download session expired. Run the print check again.",403);}
  if(session.purpose!=="print-download" || session.expires<Date.now())return errorPage("Download session expired.",403);
  const store=getStore(STORE_NAME);
  const bytes=await store.get(EXPORT_KEY,{type:"arrayBuffer",consistency:"strong"});
  if(!bytes)return errorPage("No exported file is available yet.",404);
  return new Response(bytes,{status:200,headers:{
    ...HEADERS,"Content-Type":"image/png","Content-Disposition":'attachment; filename="dinosaurs-across-time-original.png"'
  }});
}
export default async function handler(req) {
  try{
    const config=cfg(),path=new URL(req.url).pathname;
    if(path==="/canva/print-file")return req.method==="GET"?await download(req,config):errorPage("Method not allowed.",405);
    if(path!=="/canva/print-check")return errorPage("Not found.",404);
    if(req.method==="GET")return getForm(config);
    if(req.method==="POST")return await doExport(req,config);
    return errorPage("Method not allowed.",405);
  }catch{
    return errorPage("Print-check service is unavailable. No Etsy or PrintShrimp action was taken.",503);
  }
}
export const config={
  path:["/canva/print-check","/canva/print-file"],
  rateLimit:{action:"rate_limit",aggregateBy:"ip",windowSize:180,windowLimit:10}
};
