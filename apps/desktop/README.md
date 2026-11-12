# Avenire desktop

A thin Electron shell over `apps/web`. `AVENIRE_APP_URL` at build time selects the web
server and is saved in `dist/desktop-config.json`, which is included in the installer.
It defaults to `http://localhost:3000` for local WSL development. The app keeps this origin
when launched from Windows without the build terminal's environment. Only HTTPS origins
or HTTP loopback origins are accepted. A runtime override remains available for development.

For a Windows installer that uses the local WSL web server:

```sh
AVENIRE_APP_URL=http://localhost:3000 pnpm --filter @avenire/desktop run dist --win nsis --x64
```

Keep the web server running in WSL while testing the installed Windows app:

```sh
pnpm dev:web
```

Check `http://localhost:3000` in a Windows browser first. WSL's localhost forwarding must
make the web server reachable from Windows. If Next selects another port, rebuild with
that port in `AVENIRE_APP_URL`. The desktop does not start a web server on its own.

For a deployed release, set the actual web origin before building:

```sh
AVENIRE_APP_URL=https://your-deployed-web-origin pnpm --filter @avenire/desktop run dist --win nsis --x64
```

For Linux desktop development, run the server and shell in separate terminals:

```sh
pnpm dev:web
pnpm dev:desktop
```

The default OS title bar is hidden on the setup and app windows. A shared 40px app bar
uses the existing design tokens and web favicon; native caption buttons preserve window
controls and Windows snap behavior. The bar follows the app theme, reserves space for
macOS traffic lights, and leaves the existing Ava prompt overlay unchanged. App, installer
and tray icons come from the web's existing branding assets; the build generates a
1024px PNG and a multiresolution Windows ICO from the web favicon SVG.

Connection failures show a generic Retry dialog. The app does not display its configured
server address or offer a connection configuration screen.

The installed Electron runtime must be present. If package install scripts were skipped,
run Electron's existing runtime installer before launching:

```sh
cd apps/desktop
node node_modules/electron/install.js
```

## Desktop setup

First launch opens bundled setup before loading the hosted app. Setup works offline and
stores a versioned, atomic per-install choice in Electron's userData directory. The flow is
Hello → About you → Your morning → Shortcuts → Global hotkeys → Window and tab access →
Notifications → Try it → You're set. It composes the web auth Wordmark and MeshGradient,
and shared Button, Input, Chip and Kbd controls using the same UI tokens and bundled Geist fonts.
The brand mesh is a still, so setup does not run an ongoing animation loop.

Global hotkeys register only after Allow. Not now keeps them disabled. Conflicting shortcuts
can be changed; Ask Ava offers Alt+Shift+Space when Alt+Space is occupied. The Try it step
stages policy-filtered sources locally and Undo discards them. On completion, the hosted app
opens for sign-in; study context, source choices, report time, timezone and notification choice
sync through settings.update before the authenticated capture consumer becomes ready. The
staged capture then enters ingestion. Unfinished staged captures are held in memory and are
lost on quit. Ordinary capture stays off until setup completes and an authenticated consumer
confirms its account.
Desktop → Desktop setup and the tray menu reopen it. Users can skip foreground access.

macOS requests Accessibility and Automation only from explicit buttons. The System Events
permission check does not retain its returned title. Office can request its own Automation
grant on the first document capture. These collectors use metadata/file paths rather than
screen images, so they do not request Screen Recording, camera, microphone or Full Disk Access.
Linux foreground capture supports Hyprland on Wayland through `hyprctl`, and X11 through
`xdotool` and `xprop`. Local screen reading on Wayland requires `grim`; annotations use the
bundled Qt overlay with XWayland. Other Wayland compositors may not expose these capabilities.
Browser-tab capture and ordinary uploads remain available.

Google sign-in opens the system browser. `/desktop/authorize` asks the user to confirm
their account, issues a one-minute single-use token through a server action, and returns it
to a random loopback listener protected by a 256-bit state. The desktop exchanges the token
and installs the application session cookies. The web/auth changes must deploy together
with this shell. Email/password sign-in remains inside the desktop window.

## Capture → ingestion

`Alt+C` (⌥C on macOS) samples the current source. Foreground path collectors are
adapted from `context/research/background_worker`: Linux `/proc`, macOS lsof/Office,
Windows COM/handle scans, and Obsidian's active workspace leaf. The copied implementation
is under `src/capture/research`; there are no runtime imports from `context/`.

The HTTP tab receiver matches the reference extension at `127.0.0.1:17842/tabs`. It accepts
the reference `{ senderId, browser, tabs }` envelope and older tab arrays, merges up to 16
profiles, ignores reports older than 10 seconds and drops private tabs. The pinned development
extension ID comes from the reference manifest. Add published Chromium extension IDs through
`AVENIRE_EXTENSION_IDS`. The existing reference extension can be loaded unpacked from
`context/research/background_worker/extension`; the extension itself is not included in this
installer. Its on-demand WebSocket extraction/cache channel is not implemented here.
Browser `file://` tabs become device upload candidates. Public web URLs use `library.submitCapture`.

Local paths are policy-filtered in the main process. Original bytes are streamed through
the existing `/api/library/uploads` ticket/PUT API using a snapshot of the verified owner's
session cookies. The server already stores these bytes and enqueues extraction/indexing.
No absolute device path crosses into web content or becomes a server-fetch URL. Files are
deduplicated per capture; retries reuse deterministic keys. Unsupported/unreadable files are
reported in the receipt. Receipts combine URL captures with uploaded files, including Undo.
The main process retains an unacknowledged receipt across renderer reloads for the same
account; pending receipts do not survive quitting the app. Retrying after a failed local upload
starts a fresh capture. Selection, background enumeration and browser-cache recovery are deferred.

## Build and release

```sh
pnpm --filter @avenire/desktop build
pnpm --filter @avenire/desktop dist
```

Build creates bundled main/boot code, two sandbox-compatible preloads, and the small setup
React setup renderer with locally bundled styles and fonts. It executes the preloads in a restricted VM as a build gate. The packager stages
`dist/package.json` with no production dependency tree, uses ASAR, and excludes source maps.
It creates DMG, NSIS or AppImage artifacts in `release/` and never publishes automatically.
macOS production distribution requires signing/notarization credentials supplied by the release
owner; hardened-runtime and Apple Events entitlements are included. No auto-updater is configured.
The V8 compile cache is enabled before the main bundle in packaged builds and skipped for
AppImage's changing mount paths. Hidden startup is temporarily unthrottled until first paint;
hidden/minimized windows use normal throttling afterward. The Ava overlay is created on demand.

Validate OS permissions, first/warm launch, idle CPU/RSS, shortcut ownership, tray behavior,
provider sign-in, real document upload/indexing, and signed installers on each target OS.
Unit/build/browser-fixture checks do not establish those native behaviors.

### Screen-read privacy and validation

Full-display `read_screen` currently fails closed on every platform. The existing
source collectors omit browser windows, lack authoritative bounds, and can return
partial results. Hyprland's client inventory is useful for rejecting known sensitive
sources but excludes layer-shell surfaces and is not atomic with `grim`; matching
before/after inventories alone cannot prove the captured frame is safe. No pixels
reach the renderer/model through this path. A compositor/portal adapter that provides
reliable frame privacy coverage (including masking protected surfaces) is required
before enabling screen reads. Native presentation availability is consequently not
advertised to the prompt. Ordinary read-only use does not gain an approval requirement.

`pnpm --filter @avenire/desktop test` runs unit tests in a clean checkout, without
native deployment artifacts. `native:build` followed by `native:behavior` explicitly
runs deployment/process integration checks. CI builds the native deployment before
those checks. Native suspension, monitor retention, crash recovery and renderer
fallback regressions are included; real multi-monitor rendering still needs a Qt
build and suitable desktop session.
