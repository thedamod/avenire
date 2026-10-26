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
    status.textContent = value.connected
      ? "Connected to desktop"
      : value.signedIn === false
        ? "Not signed in"
        : "Direct mode";
    pairing.hidden = !value.needsCode;
    signIn.hidden = value.signedIn !== false;
    if (value.error) result.textContent = value.error;
  } catch {
    status.textContent = "Direct mode";
  }
}
capture.addEventListener("click", () => {
  capture.disabled = true;
  result.textContent = "Capturing…";
  void chrome.runtime
    .sendMessage({ type: "avenire-capture" })
    .then((raw: unknown) => {
      const value = Schema.decodeUnknownSync(Result)(raw);
      result.textContent = value.ok
        ? (value.note ?? `Saved ${value.saved ?? 0} source(s).`)
        : (value.error ?? "Capture failed");
    })
    .catch(() => {
      result.textContent = "Could not reach the extension. Try again.";
    })
    .finally(() => {
      capture.disabled = false;
    });
});
pairing.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = element<HTMLInputElement>("code").value;
  void chrome.runtime
    .sendMessage({ type: "avenire-pair", code })
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
