import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";

export const SCOPES = "design:content:read design:meta:read folder:read";
export const COOKIE = "__Host-sapiver_canva_flow";
export function newFlow() {
  const verifier = randomBytes(64).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: randomBytes(48).toString("base64url"),
    expiry: Date.now() + 600000
  };
}
export function authUrl(clientId, redirectUri, flow) {
  const url = new URL("https://www.canva.com/api/oauth/authorize");
  for (const [k,v] of Object.entries({
    response_type: "code", client_id: clientId, redirect_uri: redirectUri,
    scope: SCOPES, code_challenge: flow.challenge,
    code_challenge_method: "S256", state: flow.state
  })) url.searchParams.set(k,v);
  return url.toString();
}
export function equal(a,b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  return timingSafeEqual(createHash("sha256").update(a).digest(),createHash("sha256").update(b).digest()) && a.length === b.length;
}
function key(secret, purpose) {
  if (typeof secret !== "string" || secret.length < 20) throw new Error("Weak encryption key");
  return createHmac("sha256",secret).update("sapiver-poster-gen-v1:"+purpose).digest();
}
export function seal(obj,secret,purpose) {
  const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",key(secret,purpose),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(obj),"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),data.toString("base64url")].join(".");
}
export function unseal(value,secret,purpose) {
  if (typeof value!=="string" || value.length>12000) throw new Error("Invalid payload");
  const parts=value.split(".");
  if(parts.length!==4 || parts[0]!=="v1") throw new Error("Invalid version");
  const iv=Buffer.from(parts[1],"base64url"),tag=Buffer.from(parts[2],"base64url");
  if(iv.length!==12 || tag.length!==16) throw new Error("Invalid nonce or tag");
  const decipher=createDecipheriv("aes-256-gcm",key(secret,purpose),iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3],"base64url")),decipher.final()]).toString("utf8"));
}
export function cookieValue(header) {
  const match=(header||"").split(";").map(s=>s.trim()).find(s=>s.startsWith(COOKIE+"="));
  return match?match.slice(COOKIE.length+1):null;
}
