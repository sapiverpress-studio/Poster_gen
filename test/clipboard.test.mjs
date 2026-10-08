import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { appendIntoPassword, attachClipboardUI } from "../public/canva-clipboard.mjs";

function fakeElement() {
  const callbacks = {};
  return {
    value: "",
    hidden: true,
    textContent: "",
    focused: false,
    addEventListener: (name, handler) => { callbacks[name] = handler; },
    focus() { this.focused = true; },
    async emit(name, ev = {}) { return callbacks[name]?.(ev); },
  };
}

function fixture(clipboard) {
  const elements = Object.fromEntries([
    "setup-password", "paste-clipboard", "use-saved-clipboard",
    "saved-clipboard-panel", "clipboard-entry", "clipboard-status",
  ].map(id => [id, fakeElement()]));
  const doc = { getElementById: id => elements[id] ?? null };
  assert.equal(attachClipboardUI(doc, clipboard), true);
  return elements;
}

test("clipboard text appends to masked password only when non-empty", () => {
  const field = { value: "first" };
  assert.equal(appendIntoPassword(field, "second"), true);
  assert.equal(field.value, "firstsecond");
  assert.equal(appendIntoPassword(field, ""), false);
  assert.equal(appendIntoPassword(field, undefined), false);
  assert.equal(field.value, "firstsecond");
});

test("paste button fills the password field without exposing its value in status", async () => {
  const e = fixture({ readText: async () => "SAVED_CLIPBOARD_CONTENT" });
  await e["paste-clipboard"].emit("click");
  assert.equal(e["setup-password"].value, "SAVED_CLIPBOARD_CONTENT");
  assert.doesNotMatch(e["clipboard-status"].textContent, /SAVED_CLIPBOARD_CONTENT/);
});

test("clipboard permission denial provides a keyboard-clipboard fallback", async () => {
  const e = fixture({ readText: async () => { throw Error("Denied"); } });
  await e["paste-clipboard"].emit("click");
  assert.match(e["clipboard-status"].textContent, /Use saved clipboard/i);
  assert.equal(e["setup-password"].value, "");
});

test("saved Android keyboard clipboard transfers then clears the plain-text field", async () => {
  const e = fixture();
  await e["use-saved-clipboard"].emit("click");
  assert.equal(e["saved-clipboard-panel"].hidden, false);
  assert.equal(e["clipboard-entry"].focused, true);
  e["clipboard-entry"].value = "PRIVATE_VALUE";
  await e["clipboard-entry"].emit("input");
  assert.equal(e["setup-password"].value, "PRIVATE_VALUE");
  assert.equal(e["clipboard-entry"].value, "");
  assert.doesNotMatch(e["clipboard-status"].textContent, /PRIVATE_VALUE/);
});

test("native paste event is handled without leaving sensitive text in plain-text field", async () => {
  const e = fixture();
  let prevented = false;
  await e["clipboard-entry"].emit("paste", {
    clipboardData: { getData: kind => kind === "text/plain" ? "CLIPBOARD_SECRET" : "" },
    preventDefault: () => { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(e["setup-password"].value, "CLIPBOARD_SECRET");
  assert.equal(e["clipboard-entry"].value, "");
  assert.equal(e["saved-clipboard-panel"].hidden, true);
});

test("CSP permits only same-origin scripts while password input stays masked", async () => {
  const code = await readFile(new URL("../netlify/functions/canva-oauth.mjs", import.meta.url), "utf8");
  assert.match(code, /script-src 'self'/);
  assert.match(code, /id=\\\"setup-password\\\" type=\\\"password\\\"/);
  assert.match(code, /canva-clipboard\.mjs/);
});

test("form submission CSP allows redirects to the exact Canva OAuth host only", async () => {
  const code = await readFile(new URL("../netlify/functions/canva-oauth.mjs", import.meta.url), "utf8");
  assert.match(code, /form-action 'self' https:\/\/www\.canva\.com;/);
  assert.doesNotMatch(code, /form-action 'self' https:;/);
  assert.doesNotMatch(code, /form-action \*/);
});
