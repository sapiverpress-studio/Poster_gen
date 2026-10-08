import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {newFlow,authUrl,equal,seal,unseal,cookieValue,SCOPES,validSetupPassword,newFormChallenge,verifiedFormProof,acceptedRequestContext} from "../lib/oauth.mjs";
const secret="a-test-password-longer-than-twenty-characters";
test("PKCE state and challenge are unique and verifier matches challenge",()=>{
  const a=newFlow(),b=newFlow();
  assert.notEqual(a.state,b.state);assert.notEqual(a.verifier,b.verifier);
  assert.equal(a.challenge,createHash("sha256").update(a.verifier).digest("base64url"));
  assert.ok(a.verifier.length>=43 && a.verifier.length<=128);
});
test("OAuth URL contains approved scopes and callback",()=>{
  const url=new URL(authUrl("ID","https://example.netlify.app/canva/callback",newFlow()));
  assert.equal(url.origin,"https://www.canva.com");
  assert.equal(url.pathname,"/api/oauth/authorize");
  assert.equal(url.searchParams.get("scope"),SCOPES);
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.equal(url.searchParams.get("redirect_uri"),"https://example.netlify.app/canva/callback");
});
test("AES-256-GCM encrypts and authenticates token payload",()=>{
  const encrypted=seal({token:"PRIVATE"},secret,"stored-tokens");
  assert.equal(encrypted.includes("PRIVATE"),false);
  assert.deepEqual(unseal(encrypted,secret,"stored-tokens"),{token:"PRIVATE"});
  assert.throws(()=>unseal(encrypted,secret,"browser-flow"));
  assert.throws(()=>unseal(encrypted+"x",secret,"stored-tokens"));
});
test("password comparison and browser cookie parsing",()=>{
  assert.equal(equal("correct","correct"),true);
  assert.equal(equal("correct","wrong"),false);
  assert.equal(cookieValue("a=1; __Host-sapiver_canva_flow=v1.data; b=2"),"v1.data");
});

test("setup password accepts shorter unique passwords but rejects empty and very short values",()=>{
  assert.equal(validSetupPassword("A1!x9_kQ"), true);
  assert.equal(validSetupPassword("Abc!123"), false);
  assert.equal(validSetupPassword(""), false);
  assert.equal(validSetupPassword(undefined), false);
});

test("setup form challenge succeeds only with a matching, unexpired encrypted cookie",()=>{
  const now=100000;
  const form=newFormChallenge(now);
  const cookie=seal(form,secret,"setup-form");
  assert.equal(verifiedFormProof(form.token,cookie,secret,now+300000),true);
  assert.equal(verifiedFormProof("invalid",cookie,secret,now),false);
  assert.equal(verifiedFormProof(form.token,cookie,secret,now+600001),false);
  assert.equal(verifiedFormProof(form.token,cookie+"t",secret,now),false);
  assert.equal(verifiedFormProof(form.token,null,secret,now),false);
  assert.equal(verifiedFormProof(form.token,seal(form,secret,"browser-flow"),secret,now),false);
});

test("absent or null Origin requires separate CSRF proof, explicit cross-origin is denied",()=>{
  // Use a non-production fixture: live environment values must never occur in repository files.
  const good="https://oauth.example.test";
  assert.equal(acceptedRequestContext(good,good,"same-origin"),true);
  assert.equal(acceptedRequestContext(null,good,"same-origin"),true);
  assert.equal(acceptedRequestContext("null",good,"none"),true);
  assert.equal(acceptedRequestContext("https://evil.example",good,"cross-site"),false);
  assert.equal(acceptedRequestContext(null,good,"cross-site"),false);
  assert.equal(acceptedRequestContext("https://evil.example",good,null),false);
});
