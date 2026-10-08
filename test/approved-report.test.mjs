import test from "node:test";
import assert from "node:assert/strict";
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
 assert.equal(APPROVED_MASTER.approvedUpdatedAt,1791484484);
});
