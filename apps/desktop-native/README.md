# Native Ruth presentation companion

The C++20 / Qt Quick host renders transparent annotations and Qt Quick 3D scenes in
its own process. QML is compiled into executable resources. The application,
authentication and Alt+Space prompt remain Electron. Python is used only by the
subprocess behavior tests; it is not shipped or invoked by the application.

## Build and distribution

Install CMake 3.25+, Ninja, a C++20 compiler and Qt **6.8.3** (Core, Gui, Qml,
Quick, Quick3D and ShaderTools). From the repository root:

```sh
node apps/desktop/scripts/native-build.mjs --qt /absolute/path/to/Qt/6.8.3/gcc_64
```

Use `msvc2022_64` / `macos` Qt kit directories on Windows / macOS. The build stages the
executable, QML imports, plugins and platform libraries in
`apps/desktop/native-dist`. Electron Builder copies that directory to
`resources/native-overlay`, outside `app.asar`. Packaged builds resolve the host
through `process.resourcesPath`; development resolves it from the desktop package.
An operator can supply an absolute `AVENIRE_NATIVE_OVERLAY_EXECUTABLE` override.
Model and renderer input cannot change the executable or its arguments.

Enable the feature before launching Electron:

```sh
AVENIRE_NATIVE_OVERLAY_ENABLED=true pnpm --filter @avenire/desktop dev
```

The cross-platform workflow `.github/workflows/desktop-native.yml` builds, deploys
and exercises a relocated native distribution on Linux, Windows and macOS.
Its protected, manually requested signing jobs verify Authenticode on Windows and
Developer ID signing, notarization and stapling on macOS. Credentials must be
configured in the protected environment; unsigned build artifacts are labelled
unsigned. Linux artifacts retain executable permissions. Build and signing jobs
are configuration until they have actually passed on the target platform.

Qt is a separately deployed dynamic dependency. **Qt Quick 3D is commercial or
GPLv3**, rather than LGPL-only ([Qt 6.8 licensing](https://doc.qt.io/qt-6.8/qtquick3d-index.html)).
A proprietary release needs an appropriate commercial license or a different 3D
dependency; a GPL release needs its corresponding source and notices. This PR does
not assign a license to Avenire or establish a commercial entitlement. The adapted
Bibata cursor component is GPLv3 with attribution and source in this repository;
a commercial Qt license does not change the cursor asset license. Local
exploration and unsigned testing do not establish release licensing.
No comparative RAM, latency or physical GPU claim has been measured. `inspect`
reports the rendering API, which can also be backed by software drivers.

## Process contract

The private transport is newline-delimited JSON on inherited stdin/stdout. There
is no listener, browser engine, external script loading or arbitrary asset path.
Qt diagnostics use stderr. Parent EOF and `shutdown` exit the process. Electron
bounds pending requests, kills a stalled child, and rejects late responses after
session disposal. Existing trusted top-frame and prompt-generation checks remain
in Electron main.

```json
{"id":1,"method":"show","params":{}}
{"id":2,"method":"set_state","params":{"phase":"thinking","reducedMotion":true}}
{"id":3,"method":"annotate","params":{"items":[{"id":"region","kind":"cursor","x":0.3,"y":0.4,"text":"This term controls the damping."}]}}
{"id":4,"method":"visualize","params":{"visible":true,"interactive":true}}
{"id":5,"method":"hide","params":{}}
{"id":6,"method":"shutdown","params":{}}
```

Other methods: `inspect`, `clear`, `capture`. Responses are
`{id,ok:true,result}` or `{id,ok:false,error:{code,message}}`. Escape in the
interactive scene emits `{event:"dismiss"}` and hides both native surfaces.

Frames are capped at 1 MiB, queued work at 32 requests, annotations at 128 and
plain-text labels at 512 characters. Coordinates are normalized to the selected
screen and validated along with extents. Cursor annotations draw the Bibata Modern Ice pointer, a target
ring and clamped explanatory label; they do not move the OS pointer. Rectangles,
arrows and labels also remain available. Screen-pinned annotations do not track
moving or scrolling document content.

Scenes accept 1..32 bounded colored primitives and transforms, with native mouse
and keyboard rotation. They float without a card or backplate. The thinking perimeter uses the landing page Dawn colors (#ABC4FF, #7A6CF0,
#B05BE0) with a rounded glow. Its compiled shader draws four narrow edge bands;
it does not use a fullscreen blur texture. Reduced motion holds a still gradient,
and hidden windows stop both the gradient drift and breathing animation.

The passive overlay
requests topmost, click-through and no-focus behavior. The interactive visualization
is a separate 320x320 window. Compositors govern stacking; secure desktops and
exclusive fullscreen can supersede ordinary topmost windows. Another topmost app
can move ahead when focused; showing or restoring presentation raises the native
surfaces again without requesting focus for the passive overlay.

Capture hides both surfaces, allows the compositor to retire them, samples the
selected display, and restores only the latest requested visibility. A concurrent
hide cannot resurrect a surface. PNGs are capped at 768 KiB before base64 and a
1280-pixel edge. Capture is a screenshot of visible content, not whole-document
text extraction. It may fail on protected content or permission-restricted display
servers; this implementation has no Wayland portal or macOS permission dialog UI.

Alt+Space captures before focusing the prompt. A removable thumbnail shows the
context attached to that ephemeral turn. The image is request-only model context,
not a persisted message attachment or library item. Annotations and scenes apply
once for the current capture/session. Provider retention is outside this local
storage behavior. Full-document accessibility/text extraction remains separate work.

## Behavioral and desktop E2E tests

The transport suite launches the staged, relocated executable and failure-injection
children through the real TypeScript process adapter:

```sh
node apps/desktop/scripts/native-overlay-behavior.mjs
```

The native protocol suite needs only Python's standard library and launches the
compiled host. Offscreen passing does not establish desktop rendering:

```sh
AVENIRE_NATIVE_OVERLAY_EXECUTABLE=/absolute/native-dist/avenire-overlay \
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software \
python -m unittest discover -s apps/desktop-native/tests -p test_engine.py -v
```

Visual acceptance was run separately on isolated X11 and Windows: transparent
compositor pixels, OS click-through, capture exclusion, 3D keyboard rotation and
Escape dismissal. Synthetic fixtures and their generated images are not part of
the final source tree. The sole retained visual artifact shows the native overlay
on an actual Avenire window. Neither this capture nor offscreen tests establish
a live authenticated model round trip or physical GPU performance.
