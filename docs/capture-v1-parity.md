# Capture v1 parity audit

2026-10-27 · Implementation complete; platform runtime validation outstanding. Reference root (read-only): `/home/apollo/avenire/context/research/background_worker`. V1 references below are relative to that root; V2 references are relative to `/home/apollo/avenire-capture`. Line numbers identify the current implementation, not a Windows/macOS runtime observation.

For compactness, **C1** = V1 `electron/collectors/`; **C2** = V2 `apps/desktop/src/capture/research/electron/collectors/`; **D** = V2 `apps/desktop/src/capture/`; **E** = V2 `apps/extension/src/`; **P** = V2 `packages/capture/src/`.

| Capture input | V1 implementation and behavior | V2 gap found → final implementation |
|---|---|---|
| Foreground window / document path | `C1/foreground.ts:19`, `C1/document-path-win.ts:19`, `C1/document-path-mac.ts:14`, `C1/document-path-linux.ts:13`: PID/title; Office COM, bounded handles/media siblings, title-matched Recent; macOS Office/lsof; Linux fd/cmdline. | Foreground existed; Windows path ladder was incomplete. `D/foreground.ts:75`, `D/document-path.ts:7`, `C2/document-path-win.ts:24` now use the full Windows ladder and shared capture context. macOS/Linux adapters retained. |
| Windows background windows / paths | `C1/background-windows-win.ts:28`: titled top-level windows; Office documents, batch handle scans, title-matched Recent, conservative shared-PID matching. Bounds: 20 windows / 8 scanned PIDs. | Previously deferred/unwired. `C2/background-windows-win.ts:33` adds guarded EnumWindows through the warm PowerShell queue, Office leftovers, the same scan bounds and attribution rules. |
| macOS background windows / paths | `C1/background-windows-mac.ts:22`: native/Quartz enumeration, at most 3 distinct PID lsof scans. `spec.md:47` describes AX aspirations. | Previously absent. `C2/background-windows-mac.ts:13`, `:59` enumerate AX windows per running app PID, resolve AXDocument file URLs, fall back to lsof for 3 PIDs, cap returned windows at 20. Permission failure degrades with a note. |
| Linux background windows / paths | `C1/background-windows-linux.ts:31`: native/wmctrl EWMH enumeration, at most 5 PID /proc scans. | Previously absent. `C2/background-windows-linux.ts:21` parses wmctrl; xprop EWMH fallback and bounded /proc resolution restore windows and paths. Wayland remains compositor dependent. |
| Windows media / local player paths | `C1/background-media-win.ts:55`, `:80`, `:198`, `C1/now-playing-win.ts:14`: SMTC GetSessions with Await-WinRT/AsTask reflection, synchronous timeline, independent player enumeration. `C1/document-path-win.ts:56`, `:107`: bounded media siblings / title-matched Recent. | Previously empty media. `C2/background-media-win.ts:77`, `:106`, `:258`, `C2/document-path-win.ts:65`, `:124`: restored session and player ladders, at most 6 player PIDs, existing serialized warm host, queue-inclusive deadlines. Browser sessions only enrich uniquely correlated permitted tabs (`D/native.ts:89`). |
| macOS media / local player paths | `C1/background-media-mac.ts:14`, `C1/now-playing-mac.ts:10`: bounded player lsof plus Music AppleScript, only when Music is already running. **Actual v1 contains no MediaRemote implementation.** | Previously absent. `C2/background-media-mac.ts:20`, `C2/now-playing-mac.ts:15` restore actual v1 behavior without launching Music. Private MediaRemote remains outside this port. |
| Linux media / local player paths | `C1/background-media-linux.ts:55`, `:79`, `:140`: one MPRIS/playerctl query, xesam:url, timeline and /proc fallback. | Previously absent. `C2/background-media-linux.ts:61`, `:92`, `:178` restore MPRIS, decoded local URLs, bounded process fallback and browser timeline correlation. |
| All browser windows / inactive / discarded tabs | `extension/background.js:77` reports all windows; `src/capture/candidates.ts:91` intentionally restricts legacy capture to engaged/focused tabs. `extension/capture.js:18` skips discarded extraction. | Three engagement gates dropped background tabs. Removed in `E/capture.ts:40`, `D/tabs.ts:138`, `P/candidates.ts:31`. Every policy-permitted normal-window tab is now included in instant items (`D/pipeline.ts:32`). Active/engagement/selection only prioritize reads; unread/discarded tabs retain URL fallback. This intentionally broadens v1. |
| file: tabs / local origins | `src/capture/candidates.ts:158`, `extension/file-capture.js:123`: local URL conversion / document-byte acquisition. | HTTP-only policy prevented reporting. `P/policy.ts:156`, `E/tabs.ts:59` now permit policy-safe file URLs. `D/collect.ts:126`, `D/local-file.ts:5`, `D/upload.ts:79` convert them to device uploads / basename-only LocalFile origins / owner-bound registry entries. `E/capture.ts:40`, `E/direct.ts:35` read directly only with file access; otherwise skip with “Open Avenire desktop to capture files from this computer”. No file URL is sent for server fetching. |
| HTTP PDF / built-in Chrome PDF viewer | `extension/file-capture.js:123`: browser-session original-file acquisition; PDF page/scroll/highlight unavailable (`docs/Failures.md:62`). | Idle gates prevented reading; viewer wrappers needed normalization. `E/documents.ts:53` resolves HTTP PDFs and `chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/` file wrappers before policy/extraction. Tests cover HTTP viewer wrappers and file: tabs; no invented PDF positions. |
| Drive file / Docs / Slides / Sheets / folder | `extension/discover.js:19`, `:55`, `extension/file-capture.js:453`: rendered discovery, Google exports, credentialed original fetch. | Helpers existed but idle tabs were dropped. `E/documents.ts:29`, `:95`, `E/capture.ts:40` now read all eligible tabs, with injection-independent primary-file fallback. Tests cover Drive `/file/d/id/view`, Docs/Slides/Sheets `/d/id/edit`, exports and folder pages. Empty folder discovery gives a clear skipped reason. `E/direct.ts:35` suppresses redundant server URL capture after a primary export upload while retaining parent pages for linked attachments. |
| Redirect origins / browser cache | `extension/background.js:42`, `src/capture/cache-capture.ts:673`, `:839`, `:909`, `electron/main.ts:165`: original/final/cache URL recovery and download watcher. | `E/tabs.ts:71`, `E/capture.ts:40`, `P/policy.ts:156` preserve original/final policy checks and browser-credentialed byte fetch. Encoded private redirects and wrapped local paths are blocked. Chromium on-disk cache decoding / download watcher remain absent; see deliberate gaps. |
| Allowlisted extraction / discovery / preinstalled tabs | `extension/allowlist.js:66`, `extension/capture.js:104`, `extension/discover.js:19`: host grants + user allowlist, rendered extraction and bounded discovery. | V2 uses granted hosts + readInBrowser opt-in rather than v1 per-domain controls. `E/tabs.ts:147`, `E/background.ts:202`, `:225`, `:229` now inject content.js into existing HTTP(S) tabs on boot/install/update/startup; sentinel makes reinjection idempotent. `E/capture.ts:40`: 6 concurrent readers, 2.5 s/tab, 8 s total. Desktop batches honor the same 8 s budget (`D/channel.ts:351`). |
| Obsidian active / open notes | `C1/obsidian-note.ts:35`, `:49`, `:85`, `:124`, `C1/snapshot.ts:127`: active and open workspace leaves, running-process gate, fail-open with note when state is unknown. | Active note existed; open notes were unwired. `C2/obsidian-note.ts:118`, `D/native.ts:30` restore bounded open-leaf discovery gated on running process. |
| Selection | `C1/snapshot.ts:35`, `C1/selection-*.ts`: browser highlight plus native/clipboard fallback carrying provenance. | Source-aware browser TextQuote/position retained. `D/selection.ts`, `P/policy.ts:156` exclude unattributed native selection. Native clipboard/keystroke fallback deliberately remains disconnected; it cannot prove a highlight or source. |
| Toast / last capture / undo / reopen | `electron/main.ts:31`, `:78`, `:122`, `:224`, `electron/last-capture.ts:8`, `electron/toast-payload.ts:23`: OS toast, pull last capture, single-flight, diagnostic JSON, cache-inbox undo. | V2 already had owner-bound ack/replay but only an app toast. `apps/desktop/src/capture-overlay.ts:22`, `overlay-preload.ts:1`, `preload.ts:1`, `main.ts:856` add a sandboxed, guarded global window and collecting → submitting → done/failed states. Eight-second hover-aware lifetime, animation dismissal, cursor-display anchoring, resize, undo/open/sources actions; capture does not foreground the app. Existing ack/replay and owner-isolated reopen remain. Raw last-capture JSON is not recreated. |

## Collector scheduling and invariants

`D/native.ts:30`, `:124`, `:137` run background windows/media with a fixed 9 s fill-in deadline and Obsidian with 3.5 s; the non-overlapping cache refresh timer is 2 s. The instant phase reads cached observations without waiting. Foreground/background work shares context and process/SMTC memoization; all Windows PowerShell stays on the existing warm host and serialized queue. Deadline checks prevent abandoned work from starting later scans. Partial failures yield notes and remaining sources.

Native windows and media pass app/title blocklists; browser media must match one permitted tab and browser family before adding mediaSec. Local media receives its LocalFile position. Paths stay in device-only snapshots and the owner-bound local registry; final server snapshots strip native paths, and LocalFile upload metadata contains basenames. Capture remains single-flight, owner switches clear caches/pending state, and capture delivery retains acknowledgement/replay. Overlay IPC accepts only its own main frame at the exact file URL; app receipts/actions also require the current owner and capture ID.

## V1 failure safeguards

Reference: `docs/Failures.md:135`–`:163` (F1–F12); `:12`–`:129` (open issues); `:165`–`:181` (design rules).

| V1 failure / rule | Preservation in V2 |
|---|---|
| F1 preload ignored; F2 first capture lost | Electron-only sandboxed preload tested through bundled transform/VM; register-before-ready overlay replay; existing app ack/replay and renderer-reload restoration tested. |
| F3 MV3 suspension; F4 hung tab; F5 false background dwell | Alarms/events remain, bounded parallel polls/reads, visible-only dwell/navigation reset retained; reinjection is idempotent. |
| F6 variable WinRT types; F7 PowerShell backticks; O2 SMTC await | Literal WinRT names, reflection AsTask helper, synchronous timeline, script-marker regression tests. Platform execution still needs validation. |
| F8 competing portable instances | Existing single-instance/hotkey/loopback ownership retained. |
| F9 silent idle drops; B1/B2 engagement/focused-window rules | Superseded by explicit all-tabs requirement; every permitted tab remains a candidate and instant item, including when extraction misses its deadline. |
| F10 Recent false attribution; F11 wrong-process media; B5 conservative attribution | Title overlap required, bounded media-only siblings, no arbitrary cross-player attachment; adapted collector tests cover these rules. |
| F12 process-name mismatches; B3 blocklist wins | Existing process aliases preserved; restored missing sensitive aliases including Windows Olk.exe, Teams, password managers and mail hosts. Titles and redirect origins also checked. |
| O10 parallel PowerShell collapses | Reuse serialized warm host / ps-queue, including enumeration and handles; remaining budgets include queue wait. |
| O11 closed Obsidian reports old state | Open workspace leaves require a running process; unknown process state degrades with a note. O1 ambiguous vault/workspace paths remains a possible miss. |
| B4 browser sessions; B6 degrade rather than throw | Browser sessions only enrich a uniquely correlated permitted tab; never create independent web sources. Bounded native failures preserve other capture results. |

## Deliberate gaps and validation limits

- V1 Chromium on-disk cache decoding and download watcher were not ported: this patch restores browser-session original fetch without introducing a separate cache decoder/watcher lifecycle. Downloads inaccessible to that fetch can still miss; this is a documented parity gap.
- V1 native clipboard/keystroke selection fallback remains disconnected because source/highlight provenance is not established. Browser TextQuote selection remains supported.
- V1 raw last-capture diagnostic JSON/cache inbox is replaced by current owner-bound ack/replay, registry and receipt undo. No raw capture dump is added.
- V1 per-domain extraction allowlist settings are not recreated; V2 retains its granted-host/readInBrowser policy controls.
- No private MediaRemote adapter: actual v1 only implemented Music AppleScript plus player lsof. macOS non-Music now-playing metadata remains a gap versus the aspirational spec.
- V1 unresolved limitations remain: Chrome PDF page/scroll/highlight, terminal/code-editor buffers, WSL/SSH/container paths, Firefox/Safari extension ports, Wayland global enumeration, closed/ambiguous vaults and unavailable OS permissions. No positions or paths are fabricated.
- Adapted Windows/macOS/Linux tests mock subprocesses and validate parsers, scripts, policy and orchestration. They do not establish live SMTC/AX/MPRIS behavior. No Electron, browser or desktop build was launched, as requested. Owned files were changed only in this worktree; no commits, installs or package/lockfile changes.

## Verification

All requested commands exited 0. Full stdout is reproduced below; machine-readable results and log paths: `/tmp/capture-final-verification.json`.

```text
$ pnpm --filter @avenire/desktop typecheck
$ tsc --noEmit
Exit: 0
```

```text
$ pnpm --filter @avenire/desktop test
$ vp test run --config ../../vite.config.ts --dir . --passWithNoTests

 RUN  v5.0.1 /home/apollo/avenire-capture/apps/desktop


 Test Files  29 passed (29)
      Tests  217 passed (217)
   Start at  04:44:45
   Duration  14.01s (tests 71%, import 14%, transform 13%, worker 1%)

Exit: 0
```

```text
$ pnpm --filter @avenire/extension typecheck
$ tsc --noEmit
Exit: 0
```

```text
$ pnpm --filter @avenire/extension test
$ vp test run --config ../../vite.config.ts --dir . --passWithNoTests

 RUN  v5.0.1 /home/apollo/avenire-capture/apps/extension


 Test Files  2 passed (2)
      Tests  55 passed (55)
   Start at  04:45:01
   Duration  836ms (environment 35%, transform 32%, import 20%, tests 13%, worker 1%)

Exit: 0
```

```text
$ pnpm --filter @avenire/capture typecheck
$ tsc --noEmit
Exit: 0
```

```text
$ pnpm --filter @avenire/capture test
$ vp test run --config ../../vite.config.ts --dir . --passWithNoTests

 RUN  v5.0.1 /home/apollo/avenire-capture/packages/capture


 Test Files  8 passed (8)
      Tests  61 passed (61)
   Start at  04:45:04
   Duration  834ms (import 37%, transform 36%, environment 21%, tests 4%, worker 2%)

Exit: 0
```

```text
$ pnpm --filter @avenire/web typecheck
$ tsc --noEmit
Exit: 0
```
