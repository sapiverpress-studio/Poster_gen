// Browser-only helpers for the one-time Canva setup password form.
// No clipboard contents are logged, stored, or sent anywhere by this module.
export function appendIntoPassword(field, text) {
  if (!field || typeof text !== "string" || text.length === 0) return false;
  field.value += text;
  return true;
}

export function attachClipboardUI(doc, clipboard = globalThis.navigator?.clipboard) {
  const password = doc.getElementById("setup-password");
  const button = doc.getElementById("paste-clipboard");
  const savedButton = doc.getElementById("use-saved-clipboard");
  const panel = doc.getElementById("saved-clipboard-panel");
  const entry = doc.getElementById("clipboard-entry");
  const status = doc.getElementById("clipboard-status");
  if (!password || !button || !savedButton || !panel || !entry || !status) return false;

  const message = (value) => { status.textContent = value; };
  button.addEventListener("click", async () => {
    if (typeof clipboard?.readText !== "function") {
      message("Clipboard button unavailable here. Use the keyboard clipboard option below.");
      return;
    }
    try {
      const text = await clipboard.readText();
      if (appendIntoPassword(password, text)) {
        message("Clipboard text added to password field.");
      } else {
        message("Clipboard is empty. Try your keyboard's saved clipboard.");
      }
    } catch {
      message("Browser blocked clipboard access. Select 'Use saved clipboard' instead.");
    }
  });

  savedButton.addEventListener("click", () => {
    panel.hidden = false;
    entry.focus();
    message("Select a saved item from your keyboard's clipboard.");
  });

  // Android keyboard history sometimes inserts text without firing a 'paste'
  // event. The 'input' fallback handles that without leaving it visible.
  entry.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    if (appendIntoPassword(password, text)) {
      entry.value = "";
      panel.hidden = true;
      password.focus();
      message("Saved clipboard text added to password field.");
    }
  });

  entry.addEventListener("input", () => {
    // Don't consume partial text during an IME composition sequence.
    if (entry.composing) return;
    const text = entry.value;
    if (!text) return;
    if (appendIntoPassword(password, text)) {
      entry.value = "";
      message("Text added to password field. You can paste another saved item or continue.");
    }
  });
  entry.addEventListener("compositionstart", () => { entry.composing = true; });
  entry.addEventListener("compositionend", () => {
    entry.composing = false;
    const text = entry.value;
    if (appendIntoPassword(password, text)) {
      entry.value = "";
      message("Text added to password field.");
    }
  });

  return true;
}

if (typeof document !== "undefined") attachClipboardUI(document);
