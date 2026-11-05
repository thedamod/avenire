# Local desktop exploration

A developer feature for inspecting exactly what a JSON tool-result consumer can see,
and testing semantic input versus a real cursor. It uses an independently installed
`agent-desktop` CLI; no native binary, daemon, SDK, or new npm dependency ships with
Avenire. Requires Node 24 and a signed-in graphical desktop.

This is not wired into Ruth, Electron IPC, capture ingestion, or the hosted server.
The exported functions are local tooling, not a remote authorization boundary.

## Observe

Install `agent-desktop` separately using its official installation guide. Load its
version-matched instructions before use:

```sh
agent-desktop skills get desktop
agent-desktop skills get platform
agent-desktop status
agent-desktop list-windows --app YOUR_APP
node apps/desktop/scripts/explore/inspect.mjs --app YOUR_APP --window-id WINDOW_ID --out /tmp/my-desktop-capture
```

Use a new output directory with an existing parent. `--window-id` is optional when
there is one matching window. Ambiguity and permission errors fail rather than
selecting a different target. `--binary /absolute/path/to/agent-desktop` supports a
separately installed executable, including a Windows `.exe` invoked from WSL.

Each capture uses a fresh driver session to avoid overwriting another consumer's
refs. The manifest records it; probes and their follow-up read reuse that session.
Driver session/ref retention follows the installed CLI's lifecycle policy.

- `model-visible.json`: byte-for-byte snapshot stdout, including qualified refs,
  bounds, available actions, and incomplete/partial coverage metadata.
- `summary.json`: node and role counts, without claiming complete document coverage.
- `status.json` and `manifest.json`: platform and capture provenance.
- `window.png`: only with `--screenshot`; pinned to the resolved snapshot window.
- `failure.json`: records a failed attempt. Existing evidence is retained.

The PNG is separate from the JSON. A model only receives pixels if its caller
attaches that image as image content. This tool does not run a separate model or
claim an AI SDK integration. A screenshot is a later observation, not an atomic
pair with the accessibility tree. Inspect the two for UI changes between captures.

Files are local and use restrictive POSIX creation modes. Windows ACLs still follow
the parent directory. Captures can contain private content; only the supplied
synthetic demo is suitable for publishing without reviewing/redacting it.

## Exercise one input action

Select a qualified `@snapshot:eN` ref from the saved tree. Input requires an explicit
flag, and the ref must exist in that capture. A stale ref is refused by the driver.

```sh
node apps/desktop/scripts/explore/probe.mjs --capture /tmp/my-desktop-capture --ref '@snapshot:e1' --mode semantic-click --out /tmp/my-click --allow-input
node apps/desktop/scripts/explore/probe.mjs --capture /tmp/my-desktop-capture --ref '@snapshot:e1' --mode cursor-hover --out /tmp/my-hover --allow-input
```

`semantic-click` runs a default headless ref click. `cursor-hover` explicitly runs
`--headed hover`, which may focus the exact window and moves the real pointer. It
leaves focus and the cursor at the target; the operator owns restoring them. Neither
mode silently falls back to the other. Each performs one action, saves its delivery
report, then reads the same window into `after/`. A driver success report does not
prove the intended application effect. Review the new tree and, if needed, capture
a new image. A post-action read failure does not make the action safe to repeat.

## Disposable Windows demo

From Windows PowerShell:

```powershell
powershell.exe -NoProfile -File .\apps\desktop\scripts\explore\fixture.ps1
```

It opens a WinForms window with a named button, a status label, and an unlabeled
custom-painted panel. Inspect `powershell.exe` and select the window titled
`Avenire desktop exploration` if multiple windows match. Click `Run experiment`;
the status becomes `Status: experiment completed`. The orange planet and painted
caption appear in pixels but not the UI Automation tree. Close the demo afterward.

For an independent Windows cursor readback, run this before and after an action:

```powershell
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position | ConvertTo-Json -Compress
```

## Validation

```sh
node --test apps/desktop/scripts/explore/explore.node-test.mjs
```

The focused tests cover exact payload preservation, incomplete snapshots, explicit
image capture, target pinning, overwrite refusal, input gating, session continuity,
uncertain delivery, no retries, and malformed/nonzero process output. The HTML
exploration report under `docs/research/` records the actual Windows demonstration
and the source-backed CUA comparison. Linux/macOS behavior and CUA were not run.
