# Capture v2

Capture is the "push" half of Avenire: one hotkey turns what the student has open into library
sources. v1 (`context/research/background_worker`) proved the collectors; this rework makes capture
fast, records where every source came from and how to open it again, and handles paywalled and
login-gated pages through the student's own browser session.

Branch: `feat/capture-v2` (from `main`). It must merge cleanly with `feat/chatgpt-plans`, so it does
not touch `packages/ai`, `apps/web/src/server/{runtime,workerLive}.ts`, `.env.example`,
`apps/web/src/features/settings/SettingsPage.tsx` or the export list in
`packages/contracts/src/index.ts`. New wire types go into the existing
`packages/contracts/src/capture.ts`.

## What is wrong today

1. **Slow, all-or-nothing hotkey.** `collectSnapshot` waits on every collector before anything shows.
   The foreground collector has a 25 s budget (the Windows handle scan), PowerShell is spawned per
   capture, and uploads run one after another. Nothing appears on screen until all of it finishes.
2. **Re-captures re-upload.** The upload idempotency key is `snapshot.id + path`, so capturing the
   same PDF twice hashes and uploads it twice and creates a duplicate source.
3. **No provenance.** Local paths are dropped on purpose ("never includes absolute device paths"),
   `sourceUrl` has its query stripped, and scroll position, PDF page, text selection and browser are
   lost. A captured source cannot be reopened where the student left it.
4. **Paywall and login state is guessed.** `ingestionState` runs regexes over error strings
   (`/paywall|subscri/`, `/log ?in|auth|401|403/`). The `paywalledPages` setting is stored but never
   applied. The server fetches pages anonymously, so a paywalled article the student *can* read
   becomes a failure.
5. **Capture logic is spread across apps.** The web app imports `@avenire/desktop/capture-policy`,
   candidate building lives in `apps/web/src/server/library.ts`, and the browser extension exists
   only as v1 JavaScript in `context/`.
6. **Selection is a stub.** `collectSelection` returns nothing, and tab selections are dropped by
   policy because they have no provenance.

## Shape

```
apps/extension        @avenire/extension  MV3 extension (Chromium first; Firefox build target later)
apps/desktop          collectors, loopback channel, uploader, reopen executor
packages/capture      @avenire/capture    pure, client-safe capture logic shared by all three
packages/contracts    capture.ts          wire types: origin, access, extension protocol
packages/database     migration 0012      file.origin, file.access, (user_id, content_hash) index
apps/web              submitCapture, dedupe, reopen UI, typed access states
packages/ingestion    reports access instead of free-text errors; indexes client snapshots as-is
```

`@avenire/capture` has no Node, DOM or Electron imports in its pure modules, so web, mobile, desktop
and the extension can all use it. Subpath exports, no barrel:

| Subpath | Contents |
|---|---|
| `./url` | `normalizeUrl` (drop tracking params `utm_*`, `fbclid`, `gclid`, `mc_*`, `ref_src`; drop the hash except `#page=`/media `#t=`), `dedupeKeyFor(origin)` |
| `./policy` | the blocklist (moved from `apps/desktop/src/capture/policy.ts`, behaviour unchanged, tests moved) |
| `./candidates` | snapshot → candidates (moved from `apps/web/src/server/library.ts`), engagement thresholds |
| `./access` | `classifyAccess(signals)` → `SourceAccess` |
| `./reopen` | `planReopen(origin, context)` → ordered `ReopenPlan[]`, plus URL builders |
| `./extract` | self-contained page extractor (`executeScript`-safe), paywall/login signal probe |

## Origin: where a source came from

Stored as `file.origin` (jsonb, nullable for non-captured files) and exposed as
`LibraryFile.origin`.

```ts
CapturePosition = {
  scrollPct?: number          // 0..100
  textQuote?: { exact: string; prefix?: string; suffix?: string }   // W3C text quote, ≤ 500 chars
  pdfPage?: number            // 1-based
  mediaSec?: number
}

CaptureOrigin =
  | { _tag: "Web"; url; finalUrl?; canonicalUrl?; title; browser: BrowserKind; capturedAt;
      position?: CapturePosition }
  | { _tag: "LocalFile"; deviceId; deviceName; platform; path; appName?; sizeBytes; modifiedAt;
      capturedAt; position?: CapturePosition }

BrowserKind = "chrome" | "edge" | "brave" | "arc" | "vivaldi" | "opera" | "firefox" | "other"
```

- `url` keeps its query (minus tracking parameters). `sourceUrl` stays the provenance-only form.
- `deviceId` is the existing hashed install id. `deviceName` is the OS hostname so the web can say
  "Saved on Abhiram's MacBook". The path is the student's own data, owned by one user row like
  everything else. It is never sent to models or to Ruth Cloud boxes. Cloud hydration already uses
  copies, so it does not need the path.
- A selection becomes a `selection` file whose origin is the page it came from, with `textQuote`.
- `mediaPositionSec` stays for compatibility and is written from `position.mediaSec`.

## Reopen: how to open it again

`planReopen(origin, { deviceId?, extension: boolean, desktop: boolean })` returns plans in
preference order. Every surface runs the first plan it can execute.

```ts
ReopenPlan =
  | { _tag: "FocusTab"; url; position? }                     // extension: focus a matching open tab, else open one, then restore position
  | { _tag: "OpenUrl"; url }                                  // any surface; url carries #:~:text=, #page=N, t=Ns (YouTube/Vimeo/Loom)
  | { _tag: "OpenLocal"; path; appName?; position? }        // desktop on the same deviceId only
  | { _tag: "OpenInLibrary"; fileId; position? }             // always last: Avenire's own viewer at the same spot
```

Executors:

- **Desktop** (`avenire:reopen` IPC, trusted sender only; the main process re-reads the origin
  from the server by `fileId` and never trusts a renderer path): checks that the path exists and
  that size and mtime still match, so a changed file opens with a "changed since capture" note. Then
  it opens with `shell.openPath`, or with the app-specific position form where one exists (macOS
  `open -a Preview`; Acrobat `/A page=N`; VLC `--start-time`; mpv `--start=`). `FocusTab` goes to
  the extension over the loopback channel, falling back to `shell.openExternal(OpenUrl)`.
- **Extension** (`reopen` message): finds a tab whose normalized URL matches. It focuses that tab or
  creates one, then the content script restores the text quote (scroll to the match), the scroll
  percentage, or `video.currentTime`.
- **Web / mobile**: `OpenUrl` in a new tab or `Linking.openURL`. For a local file from another
  device, show "Saved on {deviceName}" and fall back to `OpenInLibrary`.
- Every successful reopen records the existing `opened` file event.

## Access: paywalls and logins

```ts
SourceAccess = "open" | "paywalled" | "login-required" | "partial"
```

Stored on `file.access` (default `"open"`) and exposed on `LibraryFile.access`. `ingestionState`
reads it and drops the regexes.

The principle: **capture what the student can see.** We never bypass a paywall (no archive mirrors,
no header tricks). We read the page the student already has open, in their own session.

1. On the hotkey, the extension runs `extract` in each allowlisted candidate tab. The tab is
   rendered with the student's cookies, so subscriptions, university proxies, LMS logins and Google
   Docs all just work. The result is a `PageSnapshot`: cleaned text, title, canonical URL,
   description/abstract, language, and the `AccessSignals` probe below. It also includes the PDF
   bytes when the tab is a PDF, fetched by the extension with `credentials: "include"`.
2. `classifyAccess(signals)` uses JSON-LD `isAccessibleForFree: false` together with a short
   visible body, known paywall containers (Piano/TinyPass, `[data-paywall]`, `.paywall`, Medium
   metering, Substack, NYT/WSJ/FT gateways), password inputs with little other text, a visible
   text length far below the article's word count, and the HTTP status when the server fetched the
   page itself (401/403 → `login-required`, 402 → `paywalled`).
3. If the student can read it (`open`): the snapshot is uploaded as the source bytes
   (`text/markdown` plus a `web-snapshot` marker). Ingestion indexes it without a server fetch.
4. If the student is blocked too (`paywalled`/`login-required`): apply `settings.paywalledPages`.
   - `title-abstract`: keep a source with the title, description and abstract, set `access`,
     and give it an "Open original" action.
   - `skip`: report it in the capture receipt as skipped with a clear reason.
5. When there is no extension, the server fetches anonymously as it does today, but `remote.ts` /
   `public-document.ts` report the result as a typed `access` value instead of an error string.
6. "Needs you" rows (web and mobile) read `file.access`. "Open original" uses `planReopen`. Once the
   student has logged in, the next capture of that page replaces the stub (same dedupe key) and the
   access state clears.

## Speed

Target: toast visible within **150 ms** of the hotkey and the first sources uploaded within
**2 s** on a warm machine. Every slow step streams instead of blocking.

1. **Instant phase (≤ 50 ms):** build candidates from what is already in memory: the extension's
   pushed tab state and the cheap foreground title. Send `avenire:capture` with every item
   `pending`. The toast renders the list immediately.
2. **Fill-in phase (parallel, each bounded):**
   - extension extraction over the loopback WebSocket: 2.5 s per tab, 4 s total, 4 tabs at a time;
   - document-path resolution: 3 s on macOS/Linux; on Windows, a warm persistent PowerShell host
     (v1 `ps-host.ts`) that is started at app launch and serialized through `ps-queue.ts`, with the
     handle scan capped at 4 s;
   - each item streams `avenire:capture-progress` (`pending → uploading → saved | skipped | failed`)
     as it settles. Late items join the same toast.
3. **Uploads:** three at a time. Hash before uploading. A `(path, size, mtime) → sha256` LRU on
   the desktop avoids rehashing. `POST /api/library/uploads` accepts `sha256`: if the user already
   has a file with that `content_hash`, the server returns the existing file at once (status
   `completed`, no PUT), refreshes its origin, and records a `captured` event.
4. **Server:** `submitCapture` dedupes candidates against existing `dedupe_key`s and inserts files,
   events and jobs in one transaction with batched inserts.
5. **Extension:** pushes tab state on change (debounced 250 ms) plus a 5 s heartbeat over the
   WebSocket. HTTP POST stays only as the fallback when the socket is down. The hotkey asks for a
   fresh report with a 300 ms budget and otherwise uses the cache.

## Extension app (`apps/extension`)

TypeScript MV3, bundled with esbuild like `apps/desktop/scripts/build.mjs`. Output in
`apps/extension/dist`, loaded unpacked in development.

- `background.ts`: tab and engagement state, the WebSocket client to `ws://127.0.0.1:17842/ws`
  (outbound only, keepalive every 20 s, reconnect with backoff), handlers for `capture-request` /
  `reopen` / `ping`, and a `chrome.commands` shortcut plus a toolbar button.
- **Direct mode** when no desktop app is running: the extension uploads to the Avenire origin with
  the student's Avenire cookies (`/api/library/uploads` + `library.submitCapture`). The web server
  accepts `chrome-extension://<id>` origins listed in `AVENIRE_EXTENSION_IDS` (read through Config)
  for those two endpoints only.
- `content.ts`: engagement (dwell, scroll depth, media playing), the current selection as a text
  quote, and position restore for reopen.
- `extract.ts` comes from `@avenire/capture/extract`.
- The popup shows connection status, a "Capture this page" button, and the per-site allowlist. It
  follows the app's design system (dark first, system-ui, 32 px buttons, no nested cards).
- Permissions: `tabs`, `scripting`, `storage`, `alarms`, `webNavigation`, host `<all_urls>`, and
  optional `file:///*`. Incognito tabs are never read.
- The desktop's existing origin check (`chrome-extension:` plus `extensionIds`) applies to both the
  WebSocket and the HTTP receiver.

## Wire protocol (contracts/capture.ts)

`ExtensionMessage` is an Effect Schema tagged union, version 1:
`Hello{senderId, browser, version}`, `TabsReport{tabs}`, `CaptureRequest{requestId, tabIds?}`,
`CaptureResult{requestId, pages: PageSnapshot[], skipped}`, `Reopen{requestId, url, position?}`,
`ReopenResult{requestId, ok}`, `Ping`/`Pong`. `CapturedTab` gains `tabId`, `windowId`, `browser`,
`selection?: CapturePosition["textQuote"]` and `position?: CapturePosition`.

## Build order

1. Contracts (`capture.ts`, `LibraryFile.origin/access`), `@avenire/capture`, migration 0012.
2. Web server and ingestion: storage, content dedupe, typed access, the paywalled-pages setting,
   extension origins, `library.getFile` returning the origin.
3. Desktop: progressive capture, WebSocket channel, parallel deduped uploads, warm PowerShell,
   reopen IPC.
4. Extension app.
5. Web and mobile UI: streaming capture toast, "Open original" through `planReopen`, access-driven
   "Needs you" rows.

## Verification

- Unit tests in `@avenire/capture` for each module (URL normalization, policy (moved), candidates,
  access fixtures from real paywalled HTML, reopen plans per origin and surface).
- Desktop tests for the progress stream ordering, the upload concurrency cap and the hash cache.
- Server tests for content-hash dedupe and for `paywalledPages: skip | title-abstract`.
- `pnpm typecheck` and `pnpm test` in a clean worktree (see the vitest note in the local gotchas).
- `git merge-tree --write-tree main feat/chatgpt-plans feat/capture-v2` reports no conflicts.
