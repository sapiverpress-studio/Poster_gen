import { getStore } from "@netlify/blobs";
import { newFlow, authUrl, equal, seal, unseal, cookieValue, COOKIE, FORM_COOKIE, newFormChallenge, acceptedRequestContext, verifiedFormProof, validSetupPassword } from "../../lib/oauth.mjs";

const HEADERS = {"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};
const CLEAR = COOKIE+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
const FORM_CLEAR = FORM_COOKIE+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
function secureFormCookie(value) {
  return FORM_COOKIE + "=" + value + "; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax";
}
function formCookie(header) {
  const item = (header || "").split(";").map(s => s.trim()).find(s => s.startsWith(FORM_COOKIE + "="));
  return item ? item.slice(FORM_COOKIE.length + 1) : null;
}
function env(name){
  // Netlify serverless functions expose project environment variables through process.env.
  // A fallback supports runtimes exposing Netlify.env as well.
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.length > 0) return fromProcess;
  try {
    return typeof Netlify !== "undefined" && typeof Netlify.env?.get === "function"
      ? Netlify.env.get(name)
      : undefined;
  } catch { return undefined; }
}
function setup(){
  const clientId=env("CANVA_CLIENT_ID"), secret=env("CANVA_CLIENT_SECRET"), password=env("CANVA_SETUP_PASSWORD"), origin=env("CANVA_SITE_ORIGIN");
  const variables = {
    CANVA_CLIENT_ID: clientId,
    CANVA_CLIENT_SECRET: secret,
    CANVA_SETUP_PASSWORD: password,
    CANVA_SITE_ORIGIN: origin,
  };
  const missing = Object.entries(variables).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    // Keys are fixed, public configuration identifiers. Never log or display the values.
    throw Error("config_missing:" + missing.join(","));
  }
  if(!validSetupPassword(password)) throw Error("password_too_short");
  let u;
  try { u = new URL(origin); } catch { throw Error("origin_invalid"); }
  if(u.protocol !== "https:" || u.origin !== origin) throw Error("origin_invalid");
  return {clientId,secret,password,origin,redirect:origin+"/canva/callback"};
}
function page(title,message,status=200,headers={}){
  const html="<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body style=\"font:16px system-ui;max-width:40rem;margin:8vh auto;padding:2rem;line-height:1.5\"><h1>"+title+"</h1>"+message+"</body></html>";
  return new Response(html,{status,headers:{...HEADERS,...headers,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self' https://www.canva.com; frame-ancestors 'none'; base-uri 'none'"}});
}
function rejected(status,message,headers={}){return page("Canva not connected","<p>"+message+"</p><a href=\"/canva/start\">Try again</a>",status,headers);}
async function start(req,cfg){
  if(req.method==="GET") {
    const form = newFormChallenge();
    const encrypted = seal(form, cfg.secret, "setup-form");
    return page("Connect Canva",
      "<p>Only the Sapiver Press owner should authorise this application.</p>" +
      "<form method=\"post\" action=\"/canva/start\">" +
      "<input type=\"hidden\" name=\"form_token\" value=\"" + form.token + "\">" +
      "<label for=\"setup-password\">Setup password</label>" +
      "<p><input id=\"setup-password\" type=\"password\" name=\"password\" required autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" style=\"font-size:16px;width:100%;max-width:24rem;box-sizing:border-box;min-height:44px\"></p>" +
      "<p><button type=\"button\" id=\"paste-clipboard\">Paste from clipboard</button> " +
      "<button type=\"button\" id=\"use-saved-clipboard\">Use saved keyboard clipboard</button></p>" +
      "<div id=\"saved-clipboard-panel\" hidden><label for=\"clipboard-entry\">Tap below and choose your saved text from the keyboard clipboard</label>" +
      "<p><input id=\"clipboard-entry\" type=\"text\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" style=\"font-size:16px;width:100%;max-width:24rem;box-sizing:border-box;min-height:44px\"></p>" +
      "<small>Text is transferred into the masked password field and cleared from this box.</small></div>" +
      "<p id=\"clipboard-status\" role=\"status\" aria-live=\"polite\"></p>" +
      "<p><button type=\"submit\">Continue to Canva</button></p></form>" +
      "<script type=\"module\" src=\"/canva-clipboard.mjs\"></script>",
      200, {"Set-Cookie": secureFormCookie(encrypted)});
  }
  if(req.method!=="POST") return rejected(405,"Method not allowed");
  if(!acceptedRequestContext(req.headers.get("origin"), cfg.origin, req.headers.get("sec-fetch-site"))) {
    return rejected(403,"Invalid request context");
  }
  if(!(req.headers.get("content-type")||"").startsWith("application/x-www-form-urlencoded")) return rejected(415,"Invalid form");
  if(Number(req.headers.get("content-length")||"0")>8192) return rejected(413,"Form too large");
  const text=(await req.text()).slice(0,8192);
  const form = new URLSearchParams(text);
  if(!verifiedFormProof(form.get("form_token"), formCookie(req.headers.get("cookie")), cfg.secret)) {
    return rejected(403,"Form session expired or invalid. Open Connect Canva again.");
  }
  const password=form.get("password")||"";
  if(!equal(password,cfg.password)) return rejected(403,"Invalid password");
  const flow=newFlow();
  const sealed=seal({state:flow.state,verifier:flow.verifier,expiry:flow.expiry},cfg.secret,"browser-flow");
  const cookie=COOKIE+"="+sealed+"; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax";
  const headers = new Headers({...HEADERS, Location: authUrl(cfg.clientId,cfg.redirect,flow)});
  headers.append("Set-Cookie", cookie);
  headers.append("Set-Cookie", FORM_CLEAR);
  return new Response(null, {status: 303, headers});
}
async function callback(req,cfg){
  if(req.method!=="GET") return rejected(405,"Method not allowed");
  const args=new URL(req.url).searchParams;
  if(args.has("error")) return rejected(400,"Authorisation was cancelled or declined",{"Set-Cookie":CLEAR});
  const codes=args.getAll("code"),states=args.getAll("state"),cookie=cookieValue(req.headers.get("cookie"));
  if(codes.length!==1 || !codes[0] || codes[0].length>8192 || states.length!==1 || !cookie) return rejected(400,"Invalid authorisation response",{"Set-Cookie":CLEAR});
  let flow;
  try{ flow=unseal(cookie,cfg.secret,"browser-flow"); }catch{return rejected(400,"Session could not be verified",{"Set-Cookie":CLEAR});}
  if(!flow.expiry || flow.expiry<Date.now() || !equal(flow.state,states[0]) || !flow.verifier) return rejected(400,"Expired or mismatched session",{"Set-Cookie":CLEAR});
  try{
    const body=new URLSearchParams({grant_type:"authorization_code",code:codes[0],code_verifier:flow.verifier,redirect_uri:cfg.redirect});
    const response=await fetch("https://api.canva.com/rest/v1/oauth/token",{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:"Basic "+Buffer.from(cfg.clientId+":"+cfg.secret).toString("base64")},
      body:body.toString(),signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw Error("Token exchange failed");
    const token=await response.json();
    if(typeof token.access_token!=="string" || typeof token.refresh_token!=="string" || token.access_token.length<10 || token.refresh_token.length<10) throw Error("Missing token");
    const record={access_token:token.access_token,refresh_token:token.refresh_token,scope:token.scope||"",expires_at:Date.now()+Math.max(0,Number(token.expires_in)||0)*1000,connected_at:Date.now()};
    await getStore("sapiver-canva-private").set("primary",seal(record,cfg.secret,"stored-tokens"));
    return page("Canva connected","<p>Authorisation succeeded. Tokens are encrypted in private server storage. No Etsy listing or PrintShrimp order has been created.</p>",200,{"Set-Cookie":CLEAR});
  }catch{return rejected(502,"Unable to exchange or save Canva credentials. Review Netlify Function logs and settings.",{"Set-Cookie":CLEAR});}
}
export default async function handler(req){
  try{
    const cfg=setup(),route=new URL(req.url).pathname;
    if(route==="/canva/start") return await start(req,cfg);
    if(route==="/canva/callback") return await callback(req,cfg);
    return rejected(404,"Not found");
  }catch(error){
    // Only publish a fixed diagnostic code. Never expose environment variable values,
    // token payloads, password contents, or stack traces to visitors.
    const known = new Set(["password_too_short", "origin_invalid"]);
    const message = typeof error?.message === "string" ? error.message : "";
    const isSafeMissing = /^config_missing:(CANVA_CLIENT_ID|CANVA_CLIENT_SECRET|CANVA_SETUP_PASSWORD|CANVA_SITE_ORIGIN)(,(CANVA_CLIENT_ID|CANVA_CLIENT_SECRET|CANVA_SETUP_PASSWORD|CANVA_SITE_ORIGIN))*$/.test(message);
    const code = isSafeMissing || known.has(message) ? message : "server_unavailable";
    return rejected(503, "Setup check: " + code + ". No credentials were exposed.");
  }
}
export const config={
  path: ["/canva/start", "/canva/callback"],
  // Bound brute-force attempts at the Netlify edge. Applies to both routes.
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 180, windowLimit: 6 }
};
