/** Build the requested evidence report from a completed real verification run. */
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { gallery, type Check } from "./gallery.ts";
const root = process.argv[2] ?? "/tmp/avenire-snapshot/avenire-sandbox-v4";
const destination = "/tmp/plans/avenire-sandbox-v4";
const checks = JSON.parse(await readFile(root + "/verify.json", "utf8")) as Check[];
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const detail = (name: string) => checks.find((r) => r.check === name)?.detail ?? "Missing check";
const record = JSON.parse(await readFile(root + "/renders/recording-stats.json", "utf8"));
const display = JSON.parse(await readFile(root + "/renders/browser-metrics.json", "utf8"));
const before =
  "data:image/png;base64," +
  (await readFile("/tmp/avenire-snapshot/inspection-v3/before.png")).toString("base64");
const after =
  "data:image/png;base64," + (await readFile(root + "/renders/desktop-x11.png")).toString("base64");
const comparison =
  "data:image/png;base64," +
  (await readFile(root + "/renders/theme-comparison.png")).toString("base64");
const profiles = checks.filter((r) => r.check.startsWith("interaction "));
const shots = checks.filter((r) => r.check.startsWith("screenshot 0."));
const artifacts = (await readdir(root + "/renders")).sort();
const lifecycle = JSON.parse(
  await readFile("/tmp/avenire-snapshot/resource-lifecycle.json", "utf8"),
);
let page = await gallery("Avenire sandbox v4 · implementation evidence", checks, false);
page = page.replace(
  "<style>",
  "<style>\n:root{--bg:#141414;--fg:#e4e4e4eb;--line:#e4e4e414;--muted:#e4e4e45e;--accent:#abc4ff;--pass:#4dab9a;--fail:#fc6b83;--surface:#181818}section{margin-top:28px}figure{margin:16px 0}figcaption{color:var(--muted)}.before-after{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}code,td,th{overflow-wrap:anywhere}table{table-layout:fixed}details{border-top:1px solid var(--line);padding:12px 0}summary{cursor:pointer}@media(max-width:640px){.before-after{grid-template-columns:1fr}table{font-size:12px}td,th{padding:5px}}\n",
);
const narrative = `<section><p>2026-10-11 · Repository /home/apollo/avenire · Branch feat/ruth-v2-foundations · Edits restricted to packages/cloud · No commit.</p><p>Final snapshot is active. ${checks.filter((r) => r.ok).length}/${checks.length} real checks passed; typecheck and 42 unit tests passed. Every verifier sandbox was deleted; v3 preserved. The image retains Debian trixie rather than changing to Ubuntu.</p></section>
<section><h2>Inspection and desktop decisions</h2><p>Daytona runs the desktop as daytona (uid/gid1000), with Xvfb :0 at 24-bit depth, xfce4-session, xfwm4, xfsettingsd, xfce4-panel, Thunar daemon and xfdesktop. /usr/local/lib/daytona-computer-use owns startup. x11vnc is on5901; noVNC/websockify is on6080. User xfconf XML overrides /etc/xdg/xfce4 defaults at session startup. Exec borrows the session D-Bus/DISPLAY from xfdesktop; the toolbox/remote-desktop launch path is preserved.</p><p>One opaque 44px bottom taskbar: Whisker, Browser → Chromium wrapper, Files → Thunar, Terminal → xfce4-terminal, Editor → Mousepad, icon window tasklist, expanding separator, status tray, clock. No dock/second panel/desktop icons/workspace switcher. All four pins were opened with real mouse clicks, and the Xfce preferred-browser helper is also tested.</p><p>Arc-Dark was selected after comparison: its navy-gray surfaces fit the wallpaper and Chromium, and its window outlines are restrained. Graphite-Dark has bright white outlines without compositing; Adwaita-dark is neutral and lacks a packaged matching XFWM theme. Graphite is pinned to release 2026-08-23/commit 2a8dd5aa1346d77539bf8196061260f353ee8d75, SHA-256 a46a5c4bd9562332221c504a58da0d6f4d729c8a74ab26e002b41516df52acb9. <a href="https://github.com/vinceliuice/Graphite-gtk-theme/releases/tag/2026-08-23">Graphite upstream release</a>. uv 0.13.0 and the NodeSource bootstrap at commit c6e581b0d24e5d043476ddb947d70e6fe10e83c9 are also checksummed; see SNAPSHOT.md for hashes.</p><p>Papirus-Dark, Inter 10, Bibata-Modern-Ice 24 px, grayscale antialiasing/slight hinting; terminal DejaVu Sans Mono 10 is the documented mono-font deviation. Wallpaper is a deterministic 1600×900 PNG with navy/indigo gradients and faint geometry, no logo/text. Compositing stays off after off/on capture review; no visible artifacts. Click focus, one workspace, centered placement, no snapping/wrapping/shadows; maximized XFWM title bars are hidden.</p><div class="before-after"><figure><img src="${before}" alt="Stock v3 desktop"><figcaption>Before: /tmp/avenire-snapshot/inspection-v3/before.png ·1024×768</figcaption></figure><figure><img src="${after}" alt="Customized v4 desktop"><figcaption>After: ${escape(root)}/renders/desktop-x11.png ·1600×900</figcaption></figure></div><figure><img src="${comparison}" alt="Adwaita Arc Graphite side by side"><figcaption>${escape(root)}/renders/theme-comparison.png · All candidates and maximized browser screenshots are retained below.</figcaption></figure></section>
<section><h2>Screen mapping and browser</h2><p>1600×900 display; browser ${display.outerWidth}×${display.outerHeight}, content ${display.innerWidth}×${display.innerHeight}, devicePixelRatio=${display.dpr}; 100% zoom verified via Ctrl+0. Effective XSETTINGS DPI 98304 uses xfconf 96, confirmed by decoding X11 data. Xresources 96 DPI and XFixes 24×24 cursor agree. Managed Chromium policies suppress sign-in/password/translate/notification/default-browser/restore prompts. Screensaver/blanking is disabled; Xvfb has no DPMS extension.</p><table><thead><tr><th>Profile</th><th>Result</th><th>Seconds</th><th>Interaction evidence</th></tr></thead><tbody>${profiles
  .map((r) => {
    const d = JSON.parse(r.detail);
    return `<tr><td>${escape(r.check.replace("interaction ", ""))}</td><td>${r.ok ? "PASS" : "FAIL"}</td><td>${r.seconds.toFixed(2)}</td><td>${d.clickCount} clicks, ${d.doubleClickCount} double-click; drag endpoint, both scroll directions, exact text, Ctrl+A/Enter; ±1 screen pixel/model unit.<br>${escape(r.outputs[0]?.path ?? "")}</td></tr>`;
  })
  .join(
    "",
  )}</tbody></table><p>Profiles are provisional and model-agnostic. The table in src/screen.ts can be extended when the separate per-model research finishes. Image profiles scale exactly 0.8/0.64/1; normalized profiles use inclusive 0..1000/999 endpoints. Pure helpers round once and clamp; invalid aspect ratios/nonfinite coordinates fail.</p><table><thead><tr><th>Screenshot</th><th>Dimensions</th><th>Bytes</th><th>Seconds</th></tr></thead><tbody>${shots
  .map((r) => {
    const d = JSON.parse(r.detail);
    return `<tr><td>${escape(r.check)}</td><td>${d.dimensions.join("×")}</td><td>${d.bytes}</td><td>${r.seconds.toFixed(2)}</td></tr>`;
  })
  .join(
    "",
  )}</tbody></table><p>Both screenshot scales have exact 16:9 dimensions; no custom resizing is required. Raw takeRegion is broken in SDK 0.220.0: arguments are reversed, yielding 150×300 for requested 640×360. The verified workaround takeCompressedRegion(scale=1,PNG) yields 640×360, and scale 0.5 yields 320×180. This is a documented API defect; the passing compatibility check retains raw bad output and the working crop. display.getWindows likewise reports zero geometry; its response is retained, while CDP+wmctrl establish the actual geometry.</p></section>
<section><h2>Recording and render results</h2><p>Scripted menu/browser/text/scroll/Thunar/terminal session: ${record.width}×${record.height}, ${record.fps} fps, ${record.durationSeconds.toFixed(3)} s, ${record.bytes} bytes. ${record.MBPerMinute.toFixed(3)} MB/minute; four-hour extrapolation ${record.fourHourGB.toFixed(3)} GB for this mostly static workflow, not a measured four-hour session. Blackdetect: no black intervals. Freezedetect uses -80 dB for small cursor/text motion; detector output and a contact sheet are retained. Any intentional final settling intervals are reported below rather than suppressed.</p><pre>${escape(JSON.stringify(record, null, 2))}</pre><p>matplotlib PNG/SVG/GIF/MP4, both 1280×720@30 manimgx scenes, KiCad native/SVG/PDF/Gerber/schematic export, one-page LaTeX report, all four CSP widgets with zero console errors and Node SVG passed. Manimgx CPU timings are reported in each renderer's output. The scientific dependencies and Debian apt versions resolve at build time; the full inventory is authoritative for this image, not a claim of a completely locked binary environment.</p><details><summary>Exact package inventory</summary><pre>${escape(detail("package inventory"))}</pre></details></section>
<section><h2>Resource lifecycle, limitations and files</h2><pre>${escape(JSON.stringify(lifecycle, null, 2))}</pre><p>Failures during development: initial account memory quota; optional SDK build-log fetch timeout while the backend build continued; one early verify before active state; raw crop argument defect; CDP initially selected a hidden tab after the preferred-browser test opened extra tabs, fixed by selecting a visible tab. All are recorded in the retained runs. No interactive Daytona Dashboard VNC session, production deployment or long-duration recording limit was exercised. Only the named packages/cloud source was edited; widget-kit build generated the explicitly requested dist artifacts. No secrets are in these artifacts.</p><p>Gallery: ${escape(root)}/renders/index.html<br>Check records: ${escape(root)}/verify.json<br>Sandbox deletion evidence: ${escape(root)}/sandbox.json<br>Baseline: /tmp/avenire-snapshot/inspection-v3/{before.png,internals.txt,display.json,sandbox.json,snapshots.json}<br>Report: ${destination}/plan.html</p><details><summary>Absolute paths of every final downloaded artifact</summary><pre>${escape(artifacts.map((name) => root + "/renders/" + name).join("\n"))}</pre></details></section><section><h2>Complete verification table and artifact records</h2></section>`;
page = page.replace("<table><thead>", narrative + "<table><thead>");
// These spacing fixes apply only to report prose, never to literal paths or IDs.
page = page
  .replaceAll("daytona (uid/gid1000)", "daytona (uid/gid 1000)")
  .replaceAll("on5901", "on 5901")
  .replaceAll("on6080", "on 6080");
await mkdir(destination, { recursive: true });
await writeFile(destination + "/plan.html", page);
console.log(destination + "/plan.html");
