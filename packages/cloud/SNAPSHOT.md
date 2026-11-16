# Avenire sandbox snapshot

`avenire-sandbox-v7` is the shared image for ephemeral Ava chat sandboxes and persistent Cloud boxes. Base: `daytonaio/sandbox:0.9.0-slim`, **Debian trixie**, not Ubuntu. Retaining Debian preserves the verified KiCad/X11/Daytona runtime. Snapshot resources are fixed by SDK 0.220.0: **4 vCPU / 8 GB RAM / 10 GB disk**. The image itself does not consume the sandbox's 10 GB allocation. Existing sandboxes must be recreated to receive v7.

## Desktop

One **44 px bottom, full-width Xfce panel**, always visible, opaque navy. Left to right: Whisker launcher, Browser (`avenire-browser` → Debian Chromium), Files (`thunar`), Terminal (`xfce4-terminal`), Editor (`mousepad`), icon-only grouped window tasklist, expanding separator, status tray, 24-hour clock. Active tasks have a lavender bottom indicator. Whisker favorites are the same four applications; Xfce preferred-app helpers resolve to the browser wrapper, thunar and xfce4-terminal. No workspace switcher, second panel or Plank. Desktop icons are disabled.

Graphite-Dark GTK/XFWM, Papirus-Dark, Bibata-Modern-Ice at 24 px, Inter 10, grayscale antialiasing and slight hinting. The terminal uses DejaVu Sans Mono 10 and a solid dark palette; this is a deliberate typography deviation to preserve a readable installed mono face. Arc-Dark and Adwaita-dark remain installed as fallback themes. Graphite's release **2026-08-23**, commit `2a8dd5aa1346d77539bf8196061260f353ee8d75`, has archive SHA-256 `a46a5c4bd9562332221c504a58da0d6f4d729c8a74ab26e002b41516df52acb9`; the build checks it before running the installer. Graphite includes a matching XFWM theme; Adwaita uses the stock Default XFWM theme. Graphite installs with `--tweaks rimless`. Its active XFWM XPM frames originally use `gray88 s active_color_1`, which XFWM maps to GTK's light foreground. The installer replaces both that mapping and symbolic `active_color_2` with literal `#2C2C2C`, preserving the resize hit area and window-control glyphs. User GTK CSS removes decoration borders/outlines/shadows, including the non-composited solid-CSD case and headerbar highlights. Chromium's seeded profile uses `browser.custom_chrome_frame=false` and GTK system theme (`system_theme=1`), so unmaximized Chromium uses the same corrected native XFWM frame. Graphite's build-only sassc and unrelated shell/HiDPI themes are removed after installation.

The navy/indigo wallpaper is a real 1600×900 PNG, generated deterministically with Python stdlib by `assets/desktop/generate-wallpaper.py`. It has no text/logo. Both `monitorscreen` (Xvfb's actual output) and `monitor0` are configured. PNG avoids the missing SVG pixbuf loader observed in v3.

Display: **1600×900, 100%, 96 DPI**. Xfce's `/Xft/DPI` XML value is **96**; xfsettingsd multiplies it by 1024 when publishing **98304** over XSETTINGS. Storing 98304 directly in xfconf would be clamped to 500 DPI. `/Gdk/WindowScalingFactor=1`, Xresources `Xft.dpi: 96`, GTK/Xresources/environment cursor size 24. The verifier decodes the actual XSETTINGS property and reads XFixes cursor metadata.

XFWM: single workspace, click-to-focus, centered placement, minimize/maximize/close on the right, titleless/borderless maximized windows, no shadows, compositing off. Edge tiling, snapping and workspace/window wrapping are disabled. Off/on comparison screenshots and recording tests determine whether the no-compositor default has artifacts.

Chromium: actual desktop `/usr/bin/chromium`, separate from Playwright's renderer. The wrapper opens maximized, uses `--force-device-scale-factor=1`, no first-run/default-browser/restore bubble, basic password store, and loopback-only CDP port 9222 for testing and local automation. Managed policies disable sign-in, sync, saved passwords, translation, notifications, autofill, promotional tabs and background mode; zoom defaults to 100%. The verifier presses Ctrl+0 and checks devicePixelRatio, browser geometry and screen metrics through CDP.

`desktop-session` runs as an ordinary Xfce autostart entry to merge Xresources, set the root cursor, and disable screensaver/blanking. Xvfb has no DPMS extension; its unsupported `xset -dpms` response is expected. Screensaver/locker/power-manager/Plank packages are purged if installed; notifications use do-not-disturb. No Daytona service or process-launch command is replaced. User configs are copied via `Image.addLocalFile` and chowned to daytona; root policies/theme/cursor assets stay root-owned.

## Daytona desktop internals

Read-only inspection from a disposable live **v3** sandbox on 2026-10-11:

- OS: Debian GNU/Linux 13 (trixie), 13.5. Exec and desktop uid/gid 1000 (`daytona`). Image entrypoint `/usr/local/bin/daytona sleep infinity`; computer-use server `/usr/local/lib/daytona-computer-use`.
- `computerUse.start()` starts Xvfb, Xfce and remote desktop. Observed Xvfb command: `/usr/bin/Xvfb :0 -screen 0 1024x768x24`. Display `:0`, 24-bit depth. v4 changes the image's `VNC_RESOLUTION` to 1600x900; the verifier checks the actual resulting command and display dimensions.
- Xfce session: `xfce4-session`, children `xfwm4`, `xfsettingsd`, `xfce4-panel`, `Thunar --daemon`, `xfdesktop`; `xfconfd` is separate. A session `dbus-daemon`, ssh-agent and gpg-agent run as daytona. Versions: XFWM 4.20.0-1; panel 4.20.4-1; session 4.20.2-2; xfdesktop 4.20.1-1.
- VNC: `/usr/bin/x11vnc -display :0 -forever -shared -rfbport 5901`; noVNC proxy `/usr/share/novnc/utils/novnc_proxy --vnc localhost:5901 --listen 6080`; Python websockify serves `/usr/share/novnc`.
- Defaults live under `/etc/xdg/xfce4/`, including `panel/default.xml`, `Xft.xrdb`, `xinitrc`, keyboard shortcuts, xsettings and session XML. Runtime user channels live in `~/.config/xfce4/xfconf/xfce-perchannel-xml/`; baked user XML is read at session startup. The stock desktop had a top panel, bottom launcher panel and Home/File System desktop icons. No Plank, screensaver or notification daemon appeared in the baseline process list.
- `/etc/xdg/autostart/xfsettingsd.desktop` is present. v4 adds only the settings autostart. Daytona toolbox process/file/recording APIs remain in use.
- `process.executeCommand` does not inherit the desktop's DISPLAY/session D-Bus. Desktop commands borrow `DBUS_SESSION_BUS_ADDRESS`, `DISPLAY` and `XDG_*` from `/proc/$(pgrep -n xfdesktop)/environ`; no new session bus is started.
- The first exec after create can reset its connection; scripts retry before setup. Baseline `ss` and `xdpyinfo` were absent; ports are established from live command lines. v4 adds x11-utils and checks xdpyinfo/xrandr. An initial inspection query used :1; it was corrected to :0 in the reproducible inspection script.

Baseline evidence: `/tmp/avenire-snapshot/inspection-v3/{before.png,internals.txt,display.json,sandbox.json,snapshots.json}`. The inspection sandbox is deleted in `finally`. Its startup measurement included an 8-second settling delay; the full verification reports the direct API call separately.

## Runtime stacks

| Component         | Selection                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python            | Python 3.13 venv `/opt/avenire/python` first on PATH; numpy, scipy, pandas, openpyxl, sympy, matplotlib, networkx, scikit-learn, polars, Pillow, imageio, Playwright, manimgx.        |
| manimgx           | Manim CE-style API on Rust/wgpu, CPU renderer without a GPU; its own typesetter/encoder. No Manim CE/Cairo/Pango toolchain added.                                                     |
| KiCad             | Debian KiCad 9 without recommended libraries/docs/models. `pcbnew` belongs to `/usr/bin/python3`; `kicad-cli` works from the regular shell. Bookworm base guard uses KiCad backports. |
| Browser rendering | Python Playwright headless shell/full browser under `/opt/avenire/browsers`; Debian Chromium is the visible taskbar browser.                                                          |
| JavaScript        | Node 24 from NodeSource; pnpm **11.17.0** globally via npm, usable offline by daytona. Bun and Pi absent.                                                                             |
| Reports/media     | TeX Live base/extra/recommended fonts, FFmpeg, poppler-utils.                                                                                                                         |

uv's 0.13.0 installer is pinned/checksummed (SHA-256 `283cbef4bdaca819bd896b0dacb8a085c4c05dbc880642aa5001d97bc4db74ba`). NodeSource's setup_24.x is pinned to commit `c6e581b0d24e5d043476ddb947d70e6fe10e83c9`, checksum `6e3d580f5bd7ccf2aa1e8df8d35c60d78e873c3ff8beb282c9bebd914904ad72`. Graphite's archive is pinned/checksummed; cursor/icons/themes come from signed Debian apt repositories. Scientific package versions, the Python 3.13 patch and signed apt packages still resolve at build time; this is not a fully locked binary environment. Actual Debian/Python versions are retained by each live verification inventory.

## Screen profiles

Import `@avenire/cloud/screen`. `SCREEN={width:1600,height:900}`. `SCREEN_PROFILES` is provisional and contains no per-model/provider routing; a later research task owns that choice.

| ID              | Screenshot | Coordinates               | Scale |
| --------------- | ---------- | ------------------------- | ----- |
| pixels-1280x720 | 1280×720   | image pixels              | 0.8   |
| pixels-1024x576 | 1024×576   | image pixels              | 0.64  |
| pixels-native   | 1600×900   | display/image pixels      | 1     |
| normalized-1000 | 1280×720   | inclusive 0–1000 per axis | 0.8   |
| normalized-999  | 1280×720   | inclusive 0–999 per axis  | 0.8   |

`toScreen`/`toModel` round and clamp; valid display coordinates are 0..1599 and 0..899. Image-pixel profiles use exact dimension ratios. Normalized endpoints map to the first and last valid display pixels. Profile dimensions must be positive integers with a 16:9 aspect ratio; normalized max must be a positive integer; nonfinite points fail. `screenshotScale` validates the profile and returns its width ratio. A crop has its own origin/dimensions and must not be sent through a full-screen profile without translating its origin first.

## Build and verification

From the repository root:

```sh
pnpm --filter @avenire/cloud snapshot:build
pnpm --filter @avenire/cloud snapshot:verify
pnpm --filter @avenire/cloud typecheck
pnpm --filter @avenire/cloud test
pnpm exec vp fmt packages/cloud
```

Package scripts load `.env.local` with `tsx --env-file-if-exists=../../.env.local`. Do not log API keys. Creating resources bills the owner. `ensureSnapshot` never rebuilds an existing name; the build script waits for an in-progress build and requires active state. SDK 0.220.0's optional remote log stream can fail independently with an unhandled fetch timeout; the build uses API polling without that optional stream. Replacing a named existing snapshot requires explicit authorization; **never delete v3**.

`verify-snapshot.ts` builds widget-kit locally (only the requested generated dist), creates one outbound-blocked sandbox, runs the independent checks, downloads outputs, and deletes the sandbox in `finally` with bounded retries. A deletion failure is a failed check that names the resource. The fixtures avoid `matplotlib.py`, which would shadow matplotlib.

| Checks           | Outputs                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime          | Disk/RAM, science imports, Node24/offline pnpm11.17.0 as daytona, KiCad/pcbnew, TeX/FFmpeg/Poppler, package inventory.                                                                                            |
| matplotlib       | Thin lines on dark background: 200 DPI PNG, SVG, animated Pillow GIF and FFmpeg MP4.                                                                                                                              |
| manimgx          | MathTex + axes/sine plot inspect storyboard; 1280×720@30 CPU 2D and ThreeDScene videos/storyboards, wall time and renderer CPU time.                                                                              |
| KiCad            | Generated native board, schematic, PCB SVG/PDF, CRC-checked Gerber ZIP, schematic SVG. Minimal fixtures test file export, not electrical design correctness.                                                      |
| LaTeX            | One-page headings/equation/table/embedded matplotlib report PDF and page-one PNG.                                                                                                                                 |
| Widgets          | Four exact API.md snippets in both light and dark; production widget bootstrap/tokens/CSP; stage pixels, isometric face tones/hairlines, text/edge contrast, Step/Run/Reset, theme state and 390px layout; any console/page error fails.                                                               |
| Node             | SVG written by Node.                                                                                                                                                                                              |
| Desktop          | Direct startup time, display/xrandr/xdpyinfo, XSETTINGS/cursor metadata, one panel/no dock/theme/scaling/hygiene, clean desktop/menu/Thunar/terminal/Mousepad/browser, actual pinned launcher clicks and window existence; maximized and unmaximized browser; 3x edge crops and light-rim pixel checks. |
| Theme/compositor | Graphite native frames, disposable reproduction of original symbolic light rims, final perimeter pixel checks; compositor off/on screenshots.                                                                                                                  |
| Screenshots      | PNG and JPEG at qualities 60/80/95, scales 0.8/0.64, exact decoded sizes/bytes; region and half-scale compressed region.                                                                                          |
| Interaction      | Every profile: full-screen mouse location and browser event coordinates, ±1 pixel/model unit; click/double-click counts, drag endpoint, up/down wheel, exact text with newline, Ctrl+A and Enter.                 |
| Recording        | ~30s menu/browser/typing/scrolling/Thunar/terminal session; MP4, ffprobe, blackdetect/freezedetect, MB/min and 4h size projection.                                                                                |
| Integrity        | All PNGs decode, GIF animated, SVG XML, Gerber ZIP CRC, one-page PDF, manimgx dimensions/fps/duration.                                                                                                            |

Widget fixtures use `buildWidgetDocument` and `WIDGET_THEME_TOKENS` from the production UI runtime. Its CSP allows the loopback kits, inline scripts/styles, data/blob images/media and data fonts, with `connect-src 'none'`, `base-uri 'none'` and `form-action 'none'`. There is no independent fixture theme or copy of the four examples.

Current outputs: `/tmp/avenire-snapshot/avenire-sandbox-v7/verify.json`, `sandbox.json`, and **`renders/index.html`** plus every downloaded artifact. `SNAPSHOT` and `OUT_DIR` can override the target/root; use a different output root to retain failed/earlier evidence. Each JSON row records PASS/FAIL (`ok`), wall seconds, command, diagnostic output and absolute artifact paths/bytes. The gallery embeds every image/video/PDF as a data URL so it is self-contained, while retaining links to raw downloaded files.

### API limitations to verify explicitly

SDK 0.220.0's `takeRegion` reverses positional arguments. A requested region `{x:300,y:150,width:640,height:360}` returns **150×300**, with the wrong origin. Use **`takeCompressedRegion(region, {format: "png", scale: 1})`** for a correct 640×360 crop, or scale 0.5 for 320×180. The verifier explicitly preserves the raw bad crop and asserts the working fallback. No SDK dependency or package outside cloud is patched.

`takeFullScreen(true)` paints a diagnostic crosshair rather than the actual theme cursor. `*-x11.png` companion captures use FFmpeg X11 input with `-draw_mouse 1` to show Bibata. `display.getWindows()` may return zero geometry even for visible windows; preserve its actual response and use CDP plus wmctrl/X11 to establish dimensions rather than inventing geometry. Four-hour storage is an extrapolation, not a four-hour test. A passing suite does not validate an interactive Dashboard VNC connection, production deployment or long recorder duration limits.

## Live v4 results

Final snapshot **`avenire-sandbox-v4`**, ID `0d1210b4-488b-499c-8696-ebc0c1a365f8`, is active (2026-10-11). Image size: 6.275 GiB. **59/59 real checks passed** in the final `snapshot:verify` run; summed check wall times were 219.236 s. Local typecheck, 42 tests and package formatting passed. The final verification sandbox `0235449f-f407-455e-92de-9aa9167fd3a0` was deleted at 20:38:01 UTC; its deletion is the last passing check.

| Measurement           | Final result                                                                                                                                               | Evidence under `renders/`                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Desktop startup       | 8.213 s direct API call                                                                                                                                    | `display.json`, `desktop-x11.png`                                                                       |
| Display/browser       | 1600×900; maximized browser 1600×856; DPR 1 / 100% zoom                                                                                                    | `browser-metrics.json`, `browser-x11.png`                                                               |
| Theme/compositor      | Arc-Dark selected; compositor off, no visible artifacts                                                                                                    | `theme-comparison.png`, individual candidate/window captures, `compositor-off.png`, `compositor-on.png` |
| Screenshot scale 0.8  | Exactly 1280×720; PNG 38,033 bytes; JPEG q60/q80/q95 35,059 / 43,931 / 66,949 bytes                                                                        | `scale-0.8-*`                                                                                           |
| Screenshot scale 0.64 | Exactly 1024×576; PNG 27,437 bytes; JPEG q60/q80/q95 23,004 / 28,784 / 44,530 bytes                                                                        | `scale-0.64-*`                                                                                          |
| Crops                 | Raw SDK defect retained; working 640×360 PNG origin/content matches full screenshot; compressed half crop 320×180                                          | `crop-*`                                                                                                |
| Five profiles         | All PASS; actual mouse/event coordinates within ±1 px; 7 clicks, 1 double-click each, drag endpoint, both wheel directions, exact text and keyboard events | `interaction-*.json`                                                                                    |
| Recording             | 1600×900, 30 fps, 30.033 s, 1,562,621 bytes; 3.122 MB/min; 0.749 GB/4h extrapolation; no detected black/frozen intervals at documented thresholds          | `desktop-recording.mp4`, `recording-stats.json`, `recording-probe.json`, `recording-contact.png`        |
| Science/media         | All matplotlib/manimgx/KiCad/LaTeX/widget/Node outputs passed; manimgx 2D/3D wall 3.179/5.153 s                                                            | Full self-contained `index.html`                                                                        |

Actual packages: Arc 20221218-1, Bibata 2.0.6-1, Papirus 20250501-1, Chromium 154.0.8037.92-1~deb13u1, Inter 4.1+ds-1, Mousepad 0.6.3-1, Whisker 2.9.2-1, XFWM 4.20.0-1, panel 4.20.4-1, KiCad 9.0.2+dfsg-1, Poppler 25.03.0-5+deb13u4; Python 3.13.16, Node 24.21.0, pnpm 11.17.0. The full inventory includes all Python package versions in `verify.json`/the gallery.

Final evidence root: **`/tmp/avenire-snapshot/avenire-sandbox-v4/`**. Report generator `scripts/verify/report.ts` writes **`/tmp/plans/avenire-sandbox-v4/plan.html`** with before/after and theme comparisons, all check times/commands/sizes, profile results, package versions, resource lifecycle and every absolute artifact path.

The owner-authorized cancelled-attempt scratch v4 snapshot and scratch sandbox were deleted. One newly built intermediate v4 snapshot was deleted before the final build. Every created inspection/verification sandbox was deleted; v3 remains active. Resource IDs are recorded in `/tmp/avenire-snapshot/resource-lifecycle.json` and final live state in `final-resource-state.json`. Earlier runs remain under `avenire-sandbox-v4-run1` through `-run4`; none replace the final 59/59 evidence. The last fixture correction selects a visible CDP tab after preferred-app testing opens extra tabs, preventing hidden-page geometry/event measurements.

## Server-owned agent box policy

Cloud boxes use the shared snapshot; no image rebuild was required for the server-agent
migration. Pi and model/API credentials are not installed or mounted. Reused boxes detach
legacy vault mounts. Task egress defaults to the domain firewall for `registry.npmjs.org`,
`pypi.org` and `files.pythonhosted.org`; explicit `network: open` clears both allow lists.
The task policy is reapplied before hydration. Chat sandboxes retain their existing blocked
network default and optional configured allow list.

Hydrated inputs now live under `/home/daytona/.avenire/<stable-user-slug>/`; their tracked
cache cap is 4 GiB of the 10 GB writable allocation. Run work/outputs remain under
`/home/daytona/workspace/runs/<runId>/out`. The server chooses a screen profile and uses
`takeCompressed` or `takeCompressedRegion(scale:1)`; credentials and model calls remain
outside the box. Conformance uses a temporary v4 box, the same tool executors, and a local
fixture. Its `--mock` option spends no model credit and the box is deleted in cleanup.

## Pinned figure toolchain (v5 history)

Pinned upstream `dbf697a527bbf7d358668e1557cb1e35ff725d46`, MIT; attribution is in README files. The historical source directory contained SKILL.md, LICENSE, kit/, scripts/, references/ and all eight examples’ source (67 files, SHA-256 MANIFEST.json); generated HTML is excluded. Installed root-owned, readable but not writable at `/opt/avenire/figures`. `CHROME_PATH=/usr/local/bin/avenire-figure-chromium` (Debian Chromium with `--no-sandbox`, required by Daytona’s namespace isolation) drives the upstream capture/drive/lines scripts over CDP using Node built-ins. Copy sources into a writable tree preserving relative imports, then `node build.mjs` / `--light` / `--audit`.

`snapshot:verify` checks the manifest/read-only inventory, dial builds in both themes, desktop/390 captures, line ends zero in both themes, 4x details, arcade geometry audit, rebuilt raptor size, and production widget CSP/theme/WebGL/fallback. PNGs and results join the existing gallery under `/tmp/avenire-snapshot/avenire-sandbox-v5`.

Chat sandbox defaults: `CHAT_SANDBOX_LIFETIME_MINUTES=120`, `CHAT_SANDBOX_IDLE_STOP_MINUTES=120`. Commands remain 120s by default with 900s maximum. Read-only tools may read `/opt/avenire/figures`; write/artifact paths keep their workspace boundary. Widgets accept exactly one inline html (512,000 bytes) or sandbox .html path (8 MiB), with size checked before download. App shadcn colours are unchanged; an app-wide theme switch would separately replace semantic UI colours and review controls, text, focus/contrast, desktop/mobile and all charts.

The sprint registry model is Fireworks GLM 5.3 Flash. No commits.

The first full visual demo exhausted 80 steps before delivery; an experimental 120-step budget was used for the second run. The owner then clarified that ordinary visuals must be fast: chat uses figure as appearance/behaviour guidance with flexible code, and performs one preview before delivery. Full capture/drive/lines/audit loops and the 30–90 minute production estimate apply only to explicitly requested deep builds/verification. The chat sandbox is back to a 60-minute hard lifetime and 15-minute idle stop (still configurable via CHAT_SANDBOX_LIFETIME_MINUTES and CHAT_SANDBOX_IDLE_STOP_MINUTES); deep builds run as Ava Cloud tasks. Directory setup retries transport errors twice and prepares the computer workspace once per sandbox. User commands are not automatically retried. The widget frame waits up to 30 seconds for larger pages; the card footer wraps and stacks on narrow widths.


## Fast interactive explainers

The combined `explainer` skill replaces the separate visual/physical-model guides. It selects direct pendulum-style models, actual machine mechanisms or faithful analogies, and keeps explanations outside the widget. Runtime and example figure tokens use the same neutral `--figure-*` namespace. Previously stored HTML must be regenerated to adopt it. Chat and Cloud have no model step-count cap. Preview errors are returned to the same model and prevent rendering until repaired. Rendering is withheld while a preview fails, and a repaired page is delivered after a clean preview. Unrepairable errors end with an explicit failure explanation. Snapshot v6 carries the renamed source directory and neutral CSS namespace; v5 is historical.

## Neutral figure runtime (v6)

Pinned sources are installed at `/opt/avenire/figures`; the launcher is `/usr/local/bin/avenire-figure-chromium`. Runtime CSS, adapters and example sources use `--figure-*`. The adapted inventory has 67 files with a refreshed local SHA-256 manifest. Attribution is in README files and original MIT copyright notices remain in LICENSE files. The v4/v5 images are historical; they were deleted after the final v7 verifier passed.

## Live v6 results

Snapshot `avenire-sandbox-v6` (`6ba54939-cd5a-4629-8ca9-9150cb05c537`) passed **74/74** live checks on 2026-10-13. Both figure themes built and captured at desktop/390px without console errors or sideways scrolling; both line checks reported `line ends: 0`; the arcade audit passed. The largest built example was 1,610,425 bytes. Production CSP, theme messages, WebGL and SVG fallback passed. Verification sandbox `8dca8264-14f2-4620-99e7-17c1915898ba` was deleted at 04:28:12 UTC.

Evidence: `/tmp/avenire-snapshot/avenire-sandbox-v6/verify.json`, `sandbox.json`, and `renders/index.html`. Build submission returned a gateway error after creating the snapshot; the same build was recovered by ID and completed, without another snapshot creation. Previous v4/v5 snapshots were retained.


## Live v7 results

The existing `avenire-sandbox-v7` (`c68cc85a-99b9-4720-ac9c-cba98e26462b`) was already active when this task resumed. A disposable inspection sandbox confirmed that its GTK CSS, Xfce settings and Chromium preferences match the final local configuration and its XFWM active frame is literal `#2C2C2C`; no replacement build or intermediate snapshot was needed.

The final `OUT_DIR=/tmp/avenire-snapshot/avenire-sandbox-v7-final pnpm --filter @avenire/cloud snapshot:verify` run passed **78/78** checks on 2026-10-13. All four API.md snippets passed in both light and dark, using the production bootstrap/CSP/theme tokens. Coverage includes stage pixels (with a lower coverage floor for deliberately sparse, crisp pendulum rods), isometric face colours and 0.6px edges, text contrast (6.95:1 light / 7.37:1 dark), real legend colours, Step/Run/Reset, theme changes without state reset and 390px layout. The canvas examples use device-pixel-ratio backing stores. The curve includes labelled axes and residuals; the isometric example installs `ISO_CSS` and renders a base, rail, carriage and adjustment knob.

Desktop screenshots were visually inspected, including enlarged edge strips: desktop/taskbar, Thunar, terminal, Mousepad, maximized/unmaximized Chromium and Whisker. The verifier recreates the original XFWM symbolic foreground mapping in a disposable user theme and then restores the shipped theme. Its reproduced original frame has a 774-pixel light run; each final app perimeter has zero. Resize hit areas remain. Display is 1600×900 at 96 DPI, one bottom panel, Papirus-Dark, Bibata 24px, compositing off. All screen-profile input checks passed. Recording: 1600×900, 30 fps, 30.033 s, 1,476,520 bytes, no detected black or frozen intervals at the verifier thresholds.

Final evidence: `/tmp/avenire-snapshot/avenire-sandbox-v7-final/verify.json`, `sandbox.json`, `resource-lifecycle.json`, `renders/index.html`, and the self-contained `renders/widgets.html`. Widget PNGs are `renders/widget-{pendulum,three-body,curve-fit,iso}-{light,dark}.png`; stage and phone captures use `-stage.png` / `-phone.png`. The original/fixed border captures are `renders/border-before-x11.png` and `renders/browser-unmaximized-x11.png`, with corresponding `-edges.png` / `-edges.json`; `renders/desktop-contact.png` assembles all eight desktop views. Verification sandbox `6a7452e4-7222-4655-b362-761043c3407a` was deleted at 09:46:08 UTC. Cloud typecheck, the four existing snapshot tests and scoped formatting/diff checks passed. No unit tests were added, no model calls were made and nothing was committed.

Earlier evidence is preserved under `avenire-sandbox-v7` (initial 78/78), `avenire-sandbox-v7-capacity-attempt` (no sandbox accepted while the prior 8 GiB sandbox occupied the 10 GiB account memory limit), and `avenire-sandbox-v7-hi-dpi-attempt` (76/78 before the sparse-pendulum pixel threshold correction; both corrected pendulums also passed focused live rechecks). The final 78/78 run uses the corrected fixtures throughout.

After that final pass, `avenire-sandbox-v4` (`0d1210b4-488b-499c-8696-ebc0c1a365f8`) and `avenire-sandbox-v5` (`81c4195d-6202-46f1-8727-aa0ee928020d`) were deleted. At 09:47:12 UTC the SDK confirmed only v6 and v7 remain among the Avenire snapshots, both active. All four sandboxes created during the resumed inspection/verification work are confirmed absent, and no owned verification sandbox remains. No new/intermediate snapshot was created; v7 was reused. IDs and current state are recorded in `resource-lifecycle.json`.
