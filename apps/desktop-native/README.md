# Native Ruth overlay engine

A Qt Quick / Qt Quick 3D presentation process with no WebEngine or Chromium. Python
coordinates requests; Qt's native scene graph renders annotations and 3D. Windows
uses Direct3D11 by default, with platform defaults on other OSes. The graphics API
is reported by `inspect`; it does not alone prove a physical GPU or a memory saving.

The current integration moves overlay rendering out of Electron. The application,
authentication and Alt+Space prompt still use Electron. This is an opt-in native
engine integration, not a completed replacement of the desktop shell. Ruth can issue `native_annotate` directives on an ephemeral desktop turn with screen
context. The prompt applies each directive once and rejects a mismatched capture
timestamp, so stored instructions are not replayed onto a later screen. The `native_visualize` tool accepts bounded scenes with 1..32 colored primitives,
transforms and a camera, with real mouse/keyboard rotation. No arbitrary QML,
scripts, URLs or external meshes run. Native visualizations have no card, backplate,
rounded container or decorative border; the scene floats directly over the app.

## Install and run

Requires Python 3.10+ and Qt's platform runtime dependencies. Use a local venv:

```sh
python -m venv .venv
.venv/bin/python -m pip install -r apps/desktop-native/requirements.txt
.venv/bin/python apps/desktop-native/main.py
```

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r apps/desktop-native/requirements.txt
.\.venv\Scripts\python.exe apps/desktop-native/main.py
```

The engine reads newline JSON on stdin and writes one response per line to stdout.
Qt diagnostics go to stderr. EOF exits cleanly. No network listener is opened.

```json
{"id":1,"method":"show","params":{}}
{"id":2,"method":"set_state","params":{"phase":"thinking","reducedMotion":true}}
{"id":3,"method":"annotate","params":{"items":[{"id":"target","kind":"rect","x":0.1,"y":0.2,"width":0.3,"height":0.2}]}}
{"id":4,"method":"visualize","params":{"visible":true,"interactive":true}}
{"id":5,"method":"hide","params":{}}
{"id":6,"method":"shutdown","params":{}}
```

Other methods: `inspect`, `clear`, `capture`. Responses are `{id,ok:true,result}`
or `{id,ok:false,error:{code,message}}`. Requests are bounded to 1 MiB, annotations
to 128 items, and PNG captures to 768 KiB before base64. Images retain aspect ratio
with a maximum 1280-pixel edge; the result includes actual image dimensions.
Screen IDs are Qt screen names from `inspect`. Annotation coordinates are normalized
to the selected display. Display-pinned annotations are not tracked against moving
or scrolling app content yet. Labels use plain text; no remote QML/code is accepted.

Passive overlays request always-on-top, click-through and no-focus behavior. The
interactive visualization is a separate, bounded window. It is static until input;
the only animation is the thinking border, disabled for reduced motion or when
hidden. Arrows use Qt Quick Shape geometry rather than a CPU-painted Canvas.

`hide` hides both surfaces. Escape from the interactive 3D window also dismisses
the current prompt through its private stdio event. Capture hides both before sampling and restores only
the latest requested visibility; concurrent capture refuses with `BUSY`. A hide
arriving during capture cannot resurrect an overlay afterward. Capture returns
screen pixels, not whole-document extraction, and can fail for protected content,
Wayland permission limitations or unsupported capture backends.

## Connect to the desktop application

Set these in the environment that launches Avenire, before starting Electron:

```powershell
$env:AVENIRE_NATIVE_OVERLAY_ENABLED = 'true'
$env:AVENIRE_NATIVE_OVERLAY_PYTHON = (Resolve-Path '.\.venv\Scripts\python.exe').Path
$env:AVENIRE_NATIVE_OVERLAY_SCRIPT = (Resolve-Path '.\apps\desktop-native\main.py').Path
```

Use equivalent absolute paths on Linux/macOS. Both paths must be absolute; model
and renderer input cannot change them. With the feature disabled, the ordinary
prompt remains available. Failure to start Qt shows a screen-context-unavailable
status while retaining text chat.

Alt+Space captures the selected display before opening Ruth, then starts native
presentation for that prompt session. IPC is restricted to the trusted top-frame
`/prompt` document and current session generation. Actual chat submission/streaming,
completion, errors and cancellation drive the thinking state. Hiding the prompt or
exiting the app disposes the process; late responses cannot revive it.

A removable screen thumbnail indicates when context is attached. The screenshot travels as bounded request-only `screenContext`, is attached as an
AI SDK image for inference, and is not inserted into persisted message parts or the
library. It is cleared from the client when the prompt hides. This does not assert
anything about retention by model providers. Full-document text extraction and
live provider inference were not exercised in these native tests.

## Behavioral and E2E verification

Protocol behavior launches the real engine (no mock Qt process):

```sh
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software python -m unittest discover -s apps/desktop-native/tests -p test_engine.py -v
```

For real desktop acceptance, explicitly opt in. It temporarily opens a synthetic
900x600 target window at (80,80); all evidence is cropped to that region. Close other
test overlays and avoid interacting with the target while the test runs.

```powershell
$env:AVENIRE_QT_VISUAL_E2E = '1'
$env:AVENIRE_QT_EVIDENCE = "$env:TEMP\avenire-qt-evidence"
$env:QT_QPA_PLATFORM = 'windows'
python -m unittest discover -s apps/desktop-native/tests -p test_visual_e2e.py -v
```

A PowerShell wrapper runs protocol checks followed by the native desktop E2E:

```powershell
.\apps\desktop-native\tests\windows-e2e.ps1 -Python .\.venv\Scripts\python.exe
```

On isolated Linux X11, use a working X server/window manager and an alpha compositor
without rectangular shadow darkening (e.g. xcompmgr `-n`). Set `QT_QPA_PLATFORM=xcb`,
`DISPLAY`, the same two AVENIRE test variables, and install `xdotool` or set its path
with `AVENIRE_XDOTOOL`. No display is started by these tests. Offscreen passing does
not establish transparency or physical GPU rendering.

The TypeScript process adapter's real-child behavioral suite also covers concurrent
startup, disposal, startup cancellation, process crash and timeout:

```sh
QT_QPA_PLATFORM=xcb node apps/desktop/scripts/native-overlay-behavior.mjs /absolute/venv/bin/python
```

That adapter harness uses Linux `/proc` and process signals; it is not a Windows
harness. Windows native visual behavior is covered by `test_visual_e2e.py`.

Actual captures and machine-readable results are under
`docs/evidence/native-overlay/{windows,linux}`. Windows ran through PowerShell with
portable Python 3.12.10 / PySide6 6.10.2 and reported Direct3D11. Linux used isolated
Xvfb, Openbox and xcompmgr with OpenGL. No macOS, Wayland, signed distribution,
full signed-in Alt+Space/provider round trip, physical-GPU identity or comparative
memory/performance claim is established. Compositors control stacking: secure UI,
exclusive fullscreen and other privileged windows can sit above the overlay.

## Run above an installed Avenire window on Windows

The app-scoped companion demo accepts an explicit Avenire HWND and checks its process
identity before opening native surfaces. Keep Avenire focused, then run:

```powershell
python apps/desktop-native/tests/overlay_on_avenire.py --window-id HWND --out "$env:TEMP/avenire-live-overlay"
```

It captures only that app client region and stays up until Escape in the 3D window
or a ten-minute timeout. The controller-architecture annotation coordinates are a
manual demonstration for the captured paper view, not automatic document tracking.
The app screenshot is committed only to the private PR evidence folder; the public
HTML report embeds synthetic test images. This demo uses the installed Avenire
shell with the companion, rather than claiming a new signed-in Alt+Space model run.
