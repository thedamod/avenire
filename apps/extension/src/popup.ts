import * as Schema from "effect/Schema";

declare const __AVENIRE_APP_URL__: string;
const Status = Schema.Struct({
  connected: Schema.Boolean,
  needsCode: Schema.Boolean,
  signedIn: Schema.optional(Schema.Boolean),
  error: Schema.optional(Schema.String),
});
const Result = Schema.Struct({
  ok: Schema.Boolean,
  saved: Schema.optional(Schema.Number),
  skipped: Schema.optional(Schema.Number),
  note: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const status = element("status");
const result = element("result");
const capture = element<HTMLButtonElement>("capture");
const pairing = element<HTMLFormElement>("pairing");
const signIn = element<HTMLAnchorElement>("sign-in");
signIn.href = __AVENIRE_APP_URL__;
async function refresh(): Promise<void> {
  try {
    const value = Schema.decodeUnknownSync(Status)(
      await chrome.runtime.sendMessage({ type: "avenire-status" }),
    );
    // Signed out with no desktop: the status line is the way to sign in.
    const signedOut = !value.connected && value.signedIn === false;
    status.textContent = value.connected
      ? "Connected to Avenire desktop"
      : signedOut
        ? ""
        : "Capturing directly to Avenire";
    status.hidden = signedOut;
    signIn.hidden = !signedOut;
    pairing.hidden = !value.needsCode;
    if (value.error) result.textContent = value.error;
  } catch {
    status.textContent = "Capturing directly to Avenire";
  }
}
capture.addEventListener("click", () => {
  capture.disabled = true;
  capture.textContent = "Capturing…";
  result.textContent = "";
  void chrome.runtime
    .sendMessage({ type: "avenire-capture" })
    .then((raw: unknown) => {
      const value = Schema.decodeUnknownSync(Result)(raw);
      const saved = value.saved ?? 0;
      result.textContent = value.ok
        ? (value.note ??
          (saved
            ? `Saved ${saved} source${saved === 1 ? "" : "s"} to Avenire.`
            : "Nothing new to save."))
        : (value.error ?? "Capture failed. Try again.");
    })
    .catch(() => {
      result.textContent = "Could not reach the extension. Try again.";
    })
    .finally(() => {
      capture.disabled = false;
      capture.textContent = "Capture open tabs";
    });
});
const code = element<HTMLInputElement>("code");
// Digits only, so a pasted "123 456" still pairs.
code.addEventListener("input", () => {
  code.value = code.value.replace(/\D/g, "").slice(0, 6);
});
pairing.addEventListener("submit", (event) => {
  event.preventDefault();
  void chrome.runtime
    .sendMessage({ type: "avenire-pair", code: code.value })
    .then((raw: unknown) => {
      const value = Schema.decodeUnknownSync(Result)(raw);
      result.textContent = value.ok ? "Pairing with desktop…" : (value.error ?? "Pairing failed");
      setTimeout(() => {
        void refresh();
      }, 1000);
    })
    .catch(() => {
      result.textContent = "Could not reach desktop. Try again.";
    });
});
void refresh();
