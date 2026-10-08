// Read-only owner report of scheduled Canva exports. Does not start exports.
import { getStore } from "@netlify/blobs";
import {newFormChallenge,seal,unseal,equal,verifiedFormProof,acceptedRequestContext,validSetupPassword} from "../../lib/oauth.mjs";
import {APPROVED_MASTER,STATE_KEY,PRIVATE_APPROVED_STORE} from "../../lib/approved-export.mjs";

const AUTH_COOKIE="__Host-sapiver_approved_view";
const FORM_COOKIE="__Host-sapiver_approved_form";
const HEADERS={
  "Content-Type":"text/html; charset=utf-8",
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
  "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
};
const env=name=>process.env[name] || (typeof Netlify!=="undefined"?Netlify.env?.get?.(name):undefined);
const escape=s=>String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
function html(title,body,status=200,cookies=[]){
  const h=new Headers(HEADERS);
  cookies.forEach(c=>h.append("Set-Cookie",c));
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><body style="max-width:40rem;padding:1rem;margin:4vh auto;font:16px system-ui;line-height:1.5"><h1>'+escape(title)+'</h1>'+body+'</body></html>',{status,headers:h});
}
function cookie(name,value,seconds){
  return name+"="+value+"; Path=/; Max-Age="+seconds+"; HttpOnly; Secure; SameSite=Strict";
}
function getCookie(req,name){
  const match=(req.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return match?match.slice(name.length+1):null;
}
function auth(req,secret){
  try{
    const state=unseal(getCookie(req,AUTH_COOKIE),secret,"approved-view-session");
    return state?.purpose==="owner-view" && state.expires>Date.now();
  }catch{return false;}
}
function login(secret){
  const form=newFormChallenge();
  return html("Sapiver print master status",
    "<p>Sign in to view your automatically exported A3, A4 and A5 artwork report. This does not start an export.</p>"+
    '<form method="post" action="/canva/approved-report"><input type="hidden" name="proof" value="'+form.token+'">'+
    '<label>Setup password <input type="password" name="password" required autocomplete="off" style="font-size:16px"></label> '+
    '<button type="submit">View export report</button></form>'+
    '<p><small>Session lasts seven days; no need to enter a password for each export.</small></p>',
    200,[cookie(FORM_COOKIE,seal(form,secret,"approved-view-form"),600)]
  );
}
function safeStatus(state){
  if(!state)return "Waiting for the scheduled export worker's first run.";
  const names={
    creating:"The approved Canva export is being requested.",
    pending:"Canva is preparing the file. No new export will be started.",
    ready_for_review:"Print master exported and measured. Visual and physical proof pending.",
    blocked_changed:"The Canva design was edited after approval. Export paused.",
    blocked_format:"The file failed the measured print checks.",
    failed:"The export requires investigation before retrying."
  };
  return names[state.phase]||"Unexpected export state: contact the project owner.";
}
function view(state){
  const details=state?.phase==="ready_for_review"&&state.image ?
    "<h2>Measured PNG</h2><p>"+state.image.width+" × "+state.image.height+" pixels, "+
    Math.round(state.image.bytes/(1024*1024)*10)/10+" MiB</p>"+
    "<table cellpadding='6'><tr><th>Size</th><th>Effective PPI</th></tr>"+
    ["A5","A4","A3"].map(p=>"<tr><td>"+p+"</td><td>"+
      (Number(state.readiness?.print_sizes?.[p]?.effective_ppi)||"Not measured")+"</td></tr>").join("")+
    "</table><p>Full-resolution PNG is stored privately in Netlify Blobs. Automatic PrintShrimp delivery and safe large-file download have not yet been implemented.</p>" : "";
  const time=state?.exported_at ? "<p>Export date: "+escape(state.exported_at)+"</p>" : "";
  return html("Approved Canva poster — export report",
    "<p><strong>"+escape(safeStatus(state))+"</strong></p>"+
    "<p>Product: Dinosaurs Across Time, A5 / A4 / A3</p>"+
    "<p>Approved Canva design revision: "+APPROVED_MASTER.approvedUpdatedAt+"</p>"+
    time+details+
    '<p><a href="/canva/approved-report">Refresh status</a></p>'+
    "<p><small>No Etsy listing or PrintShrimp order has been created.</small></p>");
}
export default async function handler(req){
  try{
    const secret=env("CANVA_CLIENT_SECRET"),password=env("CANVA_SETUP_PASSWORD"),origin=env("CANVA_SITE_ORIGIN");
    if(!secret||!validSetupPassword(password)||!origin)return html("Service unavailable","<p>Configuration incomplete.</p>",503);
    if(req.method==="POST"){
      if(!acceptedRequestContext(req.headers.get("origin"),origin,req.headers.get("sec-fetch-site")))
        return html("Request denied","<p>Invalid request context.</p>",403);
      const length=Number(req.headers.get("content-length")||0);
      if(length>4096)return html("Request too large","",413);
      if(!(req.headers.get("content-type")||"").startsWith("application/x-www-form-urlencoded"))
        return html("Unsupported request","",415);
      const fields=new URLSearchParams((await req.text()).slice(0,4096));
      if(!verifiedFormProof(fields.get("proof"),getCookie(req,FORM_COOKIE),secret,Date.now(),"approved-view-form"))
        return html("Session expired","<p>Reload this page and sign in again.</p>",403);
      if(!equal(fields.get("password")||"",password))
        return html("Incorrect password","<p>Return and try again.</p>",403);
      const session=seal({purpose:"owner-view",expires:Date.now()+7*86400000},secret,"approved-view-session");
      const h=new Headers({"Location":"/canva/approved-report","Cache-Control":"no-store"});
      h.append("Set-Cookie",cookie(AUTH_COOKIE,session,7*86400));
      h.append("Set-Cookie",cookie(FORM_COOKIE,"",0));
      return new Response(null,{status:303,headers:h});
    }
    if(req.method!=="GET")return html("Method not allowed","",405);
    if(!auth(req,secret))return login(secret);
    const state=await getStore(PRIVATE_APPROVED_STORE).get(STATE_KEY,{type:"json",consistency:"strong"});
    return view(state);
  }catch{
    return html("Service unavailable","<p>Could not read the private report. No new export has been started.</p>",503);
  }
}
export const config={path:"/canva/approved-report",rateLimit:{action:"rate_limit",aggregateBy:"ip",windowSize:180,windowLimit:20}};
