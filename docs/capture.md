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
  | { _tag: "LocalFile"; deviceId; deviceName; platform; fileName; appName?; sizeBytes; sha256;
      capturedAt; position?: CapturePosition }

BrowserKind = "chrome" | "edge" | "brave" | "arc" | "vivaldi" | "opera" | "firefox" | "other"
```

- `url` is the reopen URL: the query is kept, minus tracking parameters (`utm_*`, `fbclid`, ...)
  and secret-looking parameters (`token`, `sig`, `signature`, `key`, `auth`, `code`,
  `access_token`, `session`, `X-Amz-*`, `X-Goog-*`). `sourceUrl` stays the query-free citation
  form, and it is the only URL that models and Ruth Cloud see.
- **Absolute paths never leave the device.** The server stores only `fileName`, `deviceId`,
  `deviceName` ("Saved on Abhiram's MacBook") and the content hash. The desktop keeps a
  main-process **local origin registry**: `fileId → { path, sha256, size, mtimeMs, appName }`,
  written only from native collector output after an upload returns its file, and persisted under
  `app.getPath("userData")`. Losing the registry (reinstall) only downgrades reopen to
  `OpenInLibrary`.
- `deviceId` is a random install id persisted in the desktop's userData. It replaces today's
  hostname+username hash.
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

- **Desktop** (`avenire:reopen` IPC takes only `{ fileId, position? }` from a trusted sender; the path
  comes from the local origin registry, never from the renderer or the server). It checks the path:
  absolute, a regular file after `realpath`, no UNC/device paths, no executable or shortcut
  extensions (`.exe .app .lnk .bat .cmd .sh .command .desktop ...`). If size or mtime changed, it
  re-hashes and opens with a "changed since capture" note. Then it opens with `shell.openPath`, or with the app-specific position form where one exists (fixed argument arrays via `execFile`, never a shell: macOS
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
SourceAccess = "open" | "paywalled" | "login-required"
```

Access is evidence about the student's reach, kept apart from extraction coverage (how much of the
document was read). A canvas editor, an inaccessible frame or a browser PDF viewer that yields no
text is a coverage problem (`partial`/unsupported coverage), not an access state. A title-only stub
that indexes successfully keeps its blocked access state.

Stored on `file.access` (default `"open"`) and exposed on `LibraryFile.access`. `ingestionState`
reads it and drops the regexes.

The principle: **capture what the student can see.** We never bypass a paywall (no archive mirrors,
no header tricks). We read the page the student already has open, in their own session.

**Read in the browser, no extra friction.** The switch is the existing `captureLoggedInPages`
setting, shown on the Settings page and passed to the extension as `CaptureRequest.readInBrowser`.
When it is on, the extension reads **real content, never screenshots**: the rendered page text
and the original files (PDF and Office bytes) through the student's own browser session. There
are no per-site prompts and no allowlist to curate. The blocklist and incognito exclusion still
apply. When it is off, the server fetches public URLs anonymously as it does today.

1. On the hotkey, the extension runs `extract` in every candidate tab. The tab is rendered with the
   student's cookies, so subscriptions, university proxies and LMS logins just work. The result is
   a `PageSnapshot`: cleaned text, title, canonical URL, description/abstract, language and the
   `AccessSignals` probe below. Files are read as bytes from the browser:
   - a PDF/Office tab: the extension service worker fetches the tab's URL with
     `credentials: "include"`. Built-in PDF viewer tabs can't host a content script, but the
     service worker can still fetch their URL;
   - documents linked on the page (an LMS module page listing lecture PDFs): port v1's
     `discover.js`/`file-capture.js` link discovery and fetch them the same way, capped at 10 files
     and 256 MiB total per capture;
   - Google Docs/Slides/Sheets: fetch the export URL (`/export?format=pdf`/`docx`) in the session,
     because the canvas editor has no DOM text.

   The bytes stream to the desktop as binary frames (or straight to the upload API in direct mode)
   and become ordinary uploaded originals: same hashing, same content dedupe, and the same viewer
   as an uploaded PDF.
2. `classifyAccess(signals)` uses JSON-LD `isAccessibleForFree: false` together with a short
   visible body, known paywall containers (Piano/TinyPass, `[data-paywall]`, `.paywall`, Medium
   metering, Substack, NYT/WSJ/FT gateways), password inputs with little other text, a visible
   text length far below the article's word count, and the HTTP status when the server fetched the
   page itself (401/403 → `login-required`, 402 → `paywalled`).
3. If the student can read it (`open`): the cleaned page is uploaded as markdown bytes, with
   `kind: "web-page"` and `mimeType: "text/markdown"` (`sourceUploads.ts` allows that pairing). The
   upload declares `origin` and `access`, and its dedupe key is `dedupeKeyFor(origin)` (not
   `upload:<ticketId>`), so URL captures and snapshot uploads of one page are the same file. Stored
   markdown already routes to the text extractor, so ingestion never refetches.
   Only visible, rendered text is read; hidden paywall markup is never scraped.
4. If the student is blocked too (`paywalled`/`login-required`): apply `settings.paywalledPages`.
   - `title-abstract`: keep a source with the title, description and abstract, set `access`,
     and give it an "Open original" action.
   - `skip`: report it in the capture receipt as skipped with a clear reason.
5. When there is no extension, the server fetches anonymously as it does today. Extraction carries
   a typed access observation: the HTTP status is kept through `AcquisitionError`, and
   `public-document.ts`, `remote.ts`, `extract/index.ts` and `av.ts` stop flattening it into
   strings. Network, throttling and unsupported-format failures stay distinct; a bare 403 with no
   login markers is not proof of a login wall. `file.access` is written only through
   `FileIndexer`'s publication transaction (success or partial) or a worker failure transaction,
   both guarded by `ownsPublication` (user → file → claim lock order, generation, token, lease).
6. "Needs you" rows (web and mobile) read `file.access`. "Open original" uses `planReopen`. Once the
   student has logged in, the next capture of that page replaces the stub: same dedupe key, new
   bytes, access cleared, and a generation-safe re-enqueue. Today's dedupe returns the old file
   unchanged, which is a bug.

## Speed

Target: toast visible within **150 ms** of the hotkey and the first sources uploaded within
**2 s** on a warm machine. Every slow step streams instead of blocking.

1. **Instant phase (≤ 50 ms):** fix the capture id and owner-bound pending state first. Build
   candidates from what is already in memory: the extension's pushed tab state and the last
   foreground window, refreshed by a cheap poll every 2 s while the app runs. Send
   `avenire:capture-started` with every item `pending`. The toast renders the list immediately.
   The renderer submits nothing yet.
2. **Fill-in phase (parallel, each bounded):**
   - extension extraction over the loopback WebSocket: 2.5 s per tab, 4 s total, 4 tabs at a time;
   - document-path resolution: 3 s on macOS/Linux; on Windows, a warm persistent PowerShell host
     (v1 `ps-host.ts`) that is started at app launch and serialized through `ps-queue.ts`, with the
     handle scan capped at 4 s;
   - each item streams `avenire:capture-progress` (sequenced; `pending → uploading → saved |
     skipped | failed`) as it settles. Late items join the same toast.
   - when everything has settled, main sends the final `avenire:capture` payload once. The renderer
     submits it and acknowledges it, exactly as today. Single-flight capture, owner isolation,
     trusted main-frame IPC and reload replay all stay; a placeholder is never acknowledged.
3. **Uploads:** three at a time. Hash before uploading. A `(path, size, mtime) → sha256` LRU on
   the desktop avoids rehashing. `SourceUploads.create` (`POST /api/library/uploads`) looks up a
   completed `source_upload` with the same `(user_id, sha256)` whose `completed_file_id` is an owned,
   active, non-purging file (indexed). On a hit it returns `status: "completed"` with the existing
   `file` in the ticket, refreshes the origin, and records a `captured` event. The client skips the
   PUT; today the desktop PUTs even completed tickets. The lookup is serialized with creation and
   rechecked at PUT completion to cover concurrent captures. An archived match is restored to the
   inbox.
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
- **Pairing (the Origin header is not authentication).** The server issues a per-user capture
  pairing token (`GET /api/capture/pairing`, an HMAC of user id + install id under a server
  secret). The desktop and the extension each fetch it with their own Avenire session, and the
  extension's `Hello` must carry the token for the desktop's signed-in owner. If the browser isn't
  signed in to Avenire, the popup accepts a 6-digit code shown in the desktop tray instead. The
  resulting secret goes in `chrome.storage.local`. Messages are size-capped and request-correlated,
  and per-socket state is dropped on disconnect.
- **Direct mode** when no desktop app is running: the service worker uploads to the Avenire origin
  with the student's Avenire cookies. Extension fetches to permitted hosts count as same-site, so
  better-auth's Lax cookie is sent. The server accepts exact `chrome-extension://<id>` origins from
  `AVENIRE_EXTENSION_IDS` (Config, comma-separated, each `/^[a-p]{32}$/`, empty by default) **only**
  on `POST /api/library/captures`, `POST /api/library/uploads` and `PUT`/`DELETE
  /api/library/uploads/:id`. They are not added to `AUTH_TRUSTED_ORIGINS`, and `/api/rpc` is not
  relaxed.
- `content.ts`: engagement (dwell, scroll depth, media playing), the current selection as a text
  quote, and position restore for reopen.
- `extract.ts` comes from `@avenire/capture/extract`.
- The popup shows connection status and a "Capture this page" button. That's all: no settings
  live in the extension; the switch is Avenire's own setting. It follows the app's design system
  (dark first, system-ui, 32 px buttons, no nested cards).
- Permissions: `tabs`, `scripting`, `storage`, `alarms` and host `<all_urls>`, granted once at
  install with no per-site prompts. That host access is what lets reading in the browser work
  without friction, and the store listing justifies it and discloses that page content and files
  go to the student's own Avenire library. A static content script runs on http(s) pages for
  engagement and selection. Reading happens only on the hotkey, and only when
  `readInBrowser` is true. `file:///*` is optional, because Chrome needs a manual toggle for it,
  and the desktop already reads `file://` tabs from disk. Incognito tabs are never read.
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
