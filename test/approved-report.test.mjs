import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {APPROVED_MASTER} from "../lib/approved-export.mjs";
test("owner report uses CSRF proof, an HttpOnly cookie and the exact approved revision",async()=>{
 const src=await readFile(new URL("../netlify/functions/canva-approved-report.mjs",import.meta.url),"utf8");
 assert.ok(src.includes('getStore(PRIVATE_APPROVED_STORE).get(STATE_KEY'));
 assert.ok(src.includes('"approved-view-form"'));
 assert.ok(src.includes('sameSite')===false);
 assert.ok(src.includes('SameSite=Strict'));
 assert.ok(src.includes('HttpOnly; Secure'));
 assert.ok(src.includes('windowLimit:20'));
 assert.ok(src.includes('approved-report'));
 assert.ok(src.includes('No new export has been started'));
 assert.ok(src.includes('getCookie(req,FORM_COOKIE)'));
 assert.ok(!src.includes('/exports",token'));
 assert.equal(APPROVED_MASTER.approvedUpdatedAt,1791485393);
});

test("handover omits absolute Netlify site origins to avoid false-positive secret scanning",async()=>{
 const status=await readFile(new URL("../docs/PROJECT_STATUS.md",import.meta.url),"utf8");
 const deploymentOrigin=/https:\/\/[a-z0-9-]+\.netlify\.app\b/gi;
 assert.equal(deploymentOrigin.test(status),false,"Use CANVA_SITE_ORIGIN with route paths instead of the live origin literal");
 assert.ok(status.includes("CANVA_SITE_ORIGIN"));
});

test("tracked release files omit literal deployed site origins, including worker YAML and scripts",async()=>{
 const root=new URL("../",import.meta.url);
 const paths=execFileSync("git",["ls-files","-z"],{cwd:root,encoding:"utf8"}).split("\0").filter(Boolean);
 for(const path of paths){
  const source=await readFile(new URL(path,root),"utf8");
  const deployedOrigin=["https:","","sapiver-poster-gen-auth.netlify.app"].join("/");
  assert.equal(source.includes(deployedOrigin),false,"Remove literal deployment origin from "+path);
 }
});
