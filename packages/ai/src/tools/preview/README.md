# Local widget preview

`preview_widget` runs on the Node server handling the chat. `render_widget` is unchanged.
Inline HTML never calls Daytona. A `path` input still uses `resolveWidgetSource` to read the
thread-owned HTML artifact from its chat sandbox; all subsequent rendering is local.

## Process and network model

The Effect service has a process-wide semaphore with two permits and a 60-second queue/run
timeout. A permit remains held through browser cleanup, including request cancellation.
Each call creates a random session, private temporary socket/config/instrumentation directory,
and agent-browser daemon with a fresh transient Chrome profile. No profile, restore key, CDP
attachment, cookies, browser settings or provider credentials are inherited. Only PATH, HOME
and XDG_RUNTIME_DIR are passed from Effect Config; Chrome's installed binary cache is shared,
not browsing state. CLI children run in their own process groups so a timeout kills the wrapper
and native CLI together. Commands have a six-second hard ceiling (two-second browser action
timeout); runner work has a 40-second deadline, exploration a 20-second/25-action ceiling.

One ephemeral HTTP listener binds 127.0.0.1 on a random port. It serves the wrapped HTML at `/`
and built `@avenire/widget-kit` modules at `/kits/*.js`. HTML wrapping uses `wrapWidget`, and
response headers use the production `WIDGET_RESPONSE_CSP`, including `sandbox allow-scripts`.
Module responses have CORS `*` and CORP `cross-origin`, as production does for opaque widgets.
The browser receives the real `avenire:theme` message and widget tokens after load.

Agent-browser's pre-navigation `--allowed-domains 127.0.0.1` blocks external hosts and disables
WebRTC; request routing also aborts XHR/fetch. Because domain filtering does not distinguish
loopback ports, Chrome uses the same listener as a deny proxy, with `--proxy-bypass '<-loopback>'`.
The proxy only accepts GETs to this exact origin and rejects CONNECT, upgrades, other origins,
methods and paths. Widget CSP separately blocks connections, external resources, forms and
frames. This is browser/process isolation, not an OS sandbox for hostile native executables.

Cleanup snapshots the daemon's process tree, sends session-scoped `close`, waits briefly,
kills surviving owned PIDs, closes the HTTP listener and removes the temporary directory. Child TMPDIR points to this directory, so transient Chrome
profiles are removed even after a browser hang.
Node's exit hook kills known owned processes; a 45-second daemon idle timeout is an additional
fallback if the server is abruptly terminated. Cleanup does not close unrelated sessions.

## Exact CLI commands

The runner invokes the package's `bin/agent-browser.js` with Node and argument arrays, never a
shell. All calls carry `--config <temporary-empty-config> --session <random-preview-id> --json`
and the launch flags below (repeating them is required to preserve init scripts across `open`):

```text
--headed false --engine chrome --allowed-domains 127.0.0.1
--proxy http://127.0.0.1:<port> --proxy-bypass <-loopback>
--init-script <temporary-init.js> --color-scheme light|dark --idle-timeout 45s

open
set viewport <width> 600
network route * --abort --resource-type xhr,fetch
open http://127.0.0.1:<port>
wait --load load
eval -b <base64-JavaScript>
snapshot -i
click <preview-selector>
select <preview-selector> <option-value>
fill <preview-selector> preview
mouse move <x> <y>
mouse down
mouse move <x+30> <y+15>
mouse up
console
errors
network requests
set viewport <width> <bounded-height>
screenshot <temporary-state.png>
open http://127.0.0.1:<port>     # final static contact sheet
wait --load load
screenshot --full <temporary-contact-sheet.png>
close
```

Input values are set with native DOM value assignment plus bubbling input/change events,
including range controls unsupported by `fill`. Snapshot refs are refreshed before every
interaction and returned when an accessible role/name matches; reserved per-preview DOM
selectors disambiguate identical names. Pointer targets are discovered from listeners installed
before widget code, inline handlers and grab cursors. Discovery covers native controls and
common ARIA roles; arbitrary custom drag gestures and dynamically introduced controls may
require manual review. Missing number bounds use 0..100; missing step defaults to 1. Selects
are limited to six options. The reporter checks visible text differences, NaN/Infinity,
horizontal overflow, labels/focusability and an independent rAF heartbeat after each action.
Console/debug logs, uncaught exceptions, rejected promises and failed resources/requests are
returned as data. A blocked main thread or debugger pause times out into a freeze result.

## Report and image transport

```text
{
  ok, width, appearance, contentHeight, overflowX,
  screenshots: [{ label, image: { id, mediaType, sizeBytes, width, height,
                                  sheetId, region: { x, y, width, height } } }],
  console: [{ level, text, source, afterAction? }],
  errors: [{ kind, message, stack?, afterAction? }],
  interactions: [{ ref, role, name, action, value?, changedText, error? }],
  accessibility: [{ ref, message }], summary,
  screenshot?: { id, data, mediaType, sizeBytes, width, height },
  consoleMessages: [{ level, text }]
}
```

`contentHeight` is the largest measured height across tested states; `overflowX` records any
observed overflow. State PNGs are clipped to 2400px vertically. Their labeled contact sheet
is sent using `pngImage` and the existing single-image `images.ts` transport. Individual state
images reference the sheet's pixel regions, keeping base64 out of model text. `screenshot` and
`consoleMessages` preserve the existing transport and same-thread repair policy. No image is
available when the widget freezes before its first capture; the result explains that.

`afterAction` records when a fault was observed, not proof of causation for delayed callbacks.
`changedText` measures visible text, not drawing/pixel changes; a canvas-only action can work
with `changedText: false`. A clean report is bounded automated coverage, not a mathematical
correctness proof. Coverage limits are reported explicitly. The model should repair errors and
preview again in the same thread before rendering. No model, repair agent or provider is called
by the preview service or check script.

Example broken-widget diagnostics (full evidence at `/tmp/avenire-preview-check/broken-cold.json`):

```json
{
  "ok": false,
  "width": 640,
  "appearance": "light",
  "contentHeight": 25,
  "overflowX": true,
  "errors": [
    {
      "kind": "overflow",
      "message": "Content overflows the requested width",
      "afterAction": "η: set max 10"
    },
    {
      "kind": "nonfinite",
      "message": "Visible readout contains NaN or Infinity",
      "afterAction": "η: set max 10"
    },
    {
      "kind": "exception",
      "message": "Uncaught TypeError: Injected Step failure",
      "afterAction": "Step: click"
    }
  ],
  "interactions": [
    {
      "ref": "@e1",
      "role": "slider",
      "name": "η",
      "action": "set min",
      "value": "0",
      "changedText": true
    },
    {
      "ref": "@e1",
      "role": "slider",
      "name": "η",
      "action": "set mid",
      "value": "5",
      "changedText": true
    },
    {
      "ref": "@e1",
      "role": "slider",
      "name": "η",
      "action": "set max",
      "value": "10",
      "changedText": true,
      "error": "Content overflows the requested width; Visible readout contains NaN or Infinity"
    },
    {
      "ref": "@e2",
      "role": "button",
      "name": "Step",
      "action": "click",
      "changedText": false,
      "error": "Uncaught TypeError: Injected Step failure"
    }
  ]
}
```

## Setup and deployment

Use Node 24 and pnpm 11 on WSL/Linux:

```bash
pnpm install
pnpm --filter @avenire/widget-kit build
pnpm --filter @avenire/ai preview:setup
pnpm --filter @avenire/ai preview:check
```

`preview:setup` explicitly runs `agent-browser install`. No browser download is hidden in the
workspace postinstall. If Linux shared libraries are missing, provision them with
`pnpm --filter @avenire/ai exec agent-browser install --with-deps` (may require root/sudo).
Install Chrome as the runtime user or copy its cache with matching HOME and permissions.
In this WSL checkout Chrome 155.0.8059.39 was installed in
`/home/apollo/.agent-browser/browsers/chrome-155.0.8059.39` and used successfully.

Deploy on a long-running Node/Linux server/container able to launch local processes and
loopback listeners. Install browser/system dependencies in the image and build kits first.
`agent-browser@0.33.1` is a runtime dependency of both AI and web; web explicitly externalizes
it and includes its binaries/package metadata plus kits in Next file tracing. Browser caches
are not part of Next tracing and must be provisioned separately. A production Next build and
container start are still deployment checks; local runtime/typechecks do not prove that bundle.

The explainer source describes the new behavior. Regenerate the compiled skills with
`pnpm --filter @avenire/ai skills:generate` when integrating (generated skills are outside this
implementation's allowed edit scope).

## Verification and removed path

`preview:check` extracts all four complete HTML examples from widget-kit/API.md, checks the two
Ruth demo files if present, then checks an injected Step exception and max-slider NaN/overflow.
It saves JSON reports, contact-sheet PNGs and timings to `/tmp/avenire-preview-check`, samples
process-tree RSS/count, and fails if an injected fault lacks its triggering action or any tracked
process remains. Cold/warm mean successive fresh isolated sessions, not a reused browser.
RSS is summed resident memory (shared pages can be counted more than once).

Final WSL run (2026-10-13): broken cold 5.205s, broken warm 5.207s, double pendulum
6.185s, three-body 4.922s, curve fit 3.584s, iso 3.565s. Every call peaked at 15
processes and 1099–1288 MiB summed RSS, then left zero processes. Both Ruth demo
files were absent and explicitly skipped. Additional live fixtures exercised 11
form/drag actions at 390px, captured a rejected promise and missing kit request,
blocked example.com, reported a frozen click (11.7s) and startup freeze (10.7s),
and checked cancellation. After the TMPDIR cleanup fix, no transient Chrome
profiles or preview directories remained. The one preview contract test and ten
existing transport/repair tests passed. Web typecheck passed; AI typecheck only
reported the excluded owner scratch file. Scoped lint and diff checks passed.

Removed: the embedded Python Playwright runner, Daytona kit uploads/manifest cache, remote
preview workdir/options/PNG/diagnostics IO, sandbox browser execution and per-thread locks.
The four old remote-runner tests are replaced by one fake-runner contract/compatibility test.
`render_widget`, context/, the owner's scratch file and unrelated parallel work remain outside
this feature's edits.

Official command references: https://agent-browser.dev/debugging,
https://agent-browser.dev/sessions, https://agent-browser.dev/init-scripts,
https://agent-browser.dev/network.
