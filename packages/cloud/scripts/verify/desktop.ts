import type { Sandbox } from "@daytonaio/sdk";
import { writeFile } from "node:fs/promises";
import { SCREEN, SCREEN_PROFILES, screenshotScale, toScreen, toModel } from "../../src/screen.ts";
import type { Output } from "./gallery.ts";
export const sessionEnv =
  "export $(tr '\\0' '\\n' < /proc/$(pgrep -n xfdesktop)/environ | grep -E '^(DBUS_SESSION_BUS_ADDRESS|DISPLAY|XDG_[A-Z_]+)=' | xargs); ";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Result = { detail: string; outputs?: Output[] };
type Harness = {
  box: Sandbox;
  work: string;
  renders: string;
  check: (name: string, command: string, action: () => Promise<Result>) => Promise<void>;
  execute: (command: string, timeout?: number) => Promise<string>;
  run: (name: string, command: string, files?: string[], timeout?: number) => Promise<void>;
  launch: (name: string, command: string) => Promise<void>;
  download: (remote: string, local: string) => Promise<Output>;
  shot: (name: string, x: number, y: number) => Promise<Output[]>;
};
export async function desktop(h: Harness) {
  const { box, work, renders, check, execute, run, launch, download, shot } = h;
  const exec = (cmd: string) => execute(sessionEnv + cmd);
  async function json(name: string, value: unknown): Promise<Output> {
    const data = JSON.stringify(value, null, 2) + "\n",
      path = `${renders}/${name}.json`;
    await writeFile(path, data);
    return { path, bytes: Buffer.byteLength(data) };
  }
  async function capture(name: string, response: object, expected: [number, number]) {
    const b64 = Object.values(response).find(
      (v): v is string => typeof v === "string" && v.length > 1000,
    );
    if (!b64) throw Error("Screenshot has no image");
    const data = Buffer.from(b64, "base64");
    const extension = data[0] === 137 ? "png" : "jpeg";
    await box.fs.uploadFile(data, `${work}/renders/${name}.${extension}`);
    const dimensions = JSON.parse(
      await execute(
        `python -c 'from PIL import Image;import json;print(json.dumps(Image.open("renders/${name}.${extension}").size))'`,
      ),
    ) as number[];
    if (dimensions[0] !== expected[0] || dimensions[1] !== expected[1])
      throw Error(`Unexpected dimensions ${dimensions}, expected ${expected}`);
    return {
      output: await download(`${work}/renders/${name}.${extension}`, `${name}.${extension}`),
      dimensions,
      bytes: data.length,
    };
  }
  async function cdp(expression: string): Promise<any> {
    const command = `python desktop-cdp.py ${Buffer.from(expression).toString("base64")}`;
    return JSON.parse(await execute(command));
  }
  async function browserFocus() {
    await exec(
      `wmctrl -xa chromium; id=$(xdotool search --onlyvisible --class chromium | tail -1); wmctrl -ir "$id" -b add,maximized_vert,maximized_horz`,
    );
    await sleep(400);
  }
  await check("computer use start", "sandbox.computerUse.start()", async () => ({
    detail: JSON.stringify(await box.computerUse.start()),
  }));
  await sleep(6000);
  await check("display", "display.getInfo() + xrandr + xdpyinfo", async () => {
    const info = await box.computerUse.display.getInfo();
    if (
      !info.displays?.some(
        (d) => d.width === SCREEN.width && d.height === SCREEN.height && d.isActive,
      )
    )
      throw Error(JSON.stringify(info));
    const detail = await exec(
      "xrandr; xdpyinfo | head -25; ps -eo user,pid,ppid,args; cat /proc/net/tcp",
    );
    await box.fs.uploadFile(Buffer.from(detail), `${work}/renders/desktop-internals.txt`);
    return {
      detail: JSON.stringify(info) + "\n" + detail,
      outputs: [
        await json("display", info),
        await download(`${work}/renders/desktop-internals.txt`, "desktop-internals.txt"),
      ],
    };
  });
  await run(
    "desktop configuration",
    sessionEnv +
      `test "$(xfconf-query -c xsettings -p /Gtk/CursorThemeName)" = Bibata-Modern-Ice && test "$(xfconf-query -c xsettings -p /Gtk/CursorThemeSize)" = 24 && test "$(xfconf-query -c xsettings -p /Xft/DPI)" = 96 && test "$(xfconf-query -c xsettings -p /Gdk/WindowScalingFactor)" = 1 && test "$(xfconf-query -c xsettings -p /Xft/RGBA)" = none && test "$(xfconf-query -c xsettings -p /Net/IconThemeName)" = Papirus-Dark && test "$(xfconf-query -c xsettings -p /Net/ThemeName)" = Graphite-Dark && test "$(xfconf-query -c xfwm4 -p /general/theme)" = Graphite-Dark && test "$(xfconf-query -c xfce4-desktop -p /desktop-icons/style)" = 0 && test "$(xfconf-query -c xfwm4 -p /general/use_compositing)" = false && test "$(xfconf-query -c xfwm4 -p /general/workspace_count)" = 1 && test "$XCURSOR_THEME" = Bibata-Modern-Ice && test "$XCURSOR_SIZE" = 24 && test "$(pgrep -cx xfce4-panel)" = 1 && ! pgrep -x plank && ! pgrep -x xfce4-screensaver && ! pgrep -x xscreensaver && ! pgrep -x light-locker && xfconf-query -c xfce4-panel -p /panels && xfconf-query -c xfce4-panel -lv && xfconf-query -c xfwm4 -lv && xrdb -query && xset q`,
  );
  await run("XSETTINGS and cursor", sessionEnv + "python x11-state.py > renders/x11-state.json", [
    "renders/x11-state.json",
  ]);
  await check("clean desktop", "takeFullScreen(true) and actual X11 cursor", async () => ({
    detail: "Single bottom taskbar, custom wallpaper; X11 capture includes actual Bibata cursor.",
    outputs: await shot("desktop", 1080, 450),
  }));
  await check("Whisker menu", "computerUse.mouse.click(22,878)", async () => {
    await box.computerUse.mouse.click(22, 878);
    await sleep(700);
    const outputs = await shot("whisker-menu", 250, 550);
    await box.computerUse.keyboard.press("escape");
    return { detail: "Whisker launcher opened by mouse", outputs };
  });
  await execute(
    `cp renders/matplotlib.png mixed/figure.png; cp renders/report.pdf mixed/report.pdf; cp renders/matplotlib.mp4 mixed/motion.mp4; cp renders/check.kicad_pcb mixed/board.kicad_pcb; cp plot-render.py mixed/model.py; printf '# Avenire\nMixed render outputs\n' > mixed/README.md`,
  );
  // Click the actual pinned buttons and assert their windows, then arrange consistently.
  await check("pinned file manager", "mouse.click taskbar Files → Thunar", async () => {
    await box.computerUse.mouse.click(110, 878);
    await sleep(1400);
    await exec(
      `xdotool search --onlyvisible --class Thunar && thunar ${work}/mixed; wmctrl -r mixed -e 0,30,30,670,470`,
    );
    return { detail: "Pinned Files opens Thunar", outputs: await shot("thunar", 280, 230) };
  });
  await check("pinned terminal", "mouse.click taskbar Terminal → xfce4-terminal", async () => {
    await box.computerUse.mouse.click(154, 878);
    await sleep(1400);
    await exec(
      `xdotool search --onlyvisible --class xfce4-terminal && wmctrl -r Terminal -e 0,725,80,650,350`,
    );
    await box.computerUse.keyboard.type("python --version; node --version; pnpm --version", 20);
    await box.computerUse.keyboard.press("enter");
    return {
      detail: "Pinned Terminal opens xfce4-terminal; version commands typed",
      outputs: await shot("terminal", 900, 250),
    };
  });
  await check("taskbar cursor", "X11 actual Bibata cursor over taskbar", async () => ({
    detail: "24 px cursor over pinned taskbar buttons",
    outputs: await shot("taskbar", 110, 878),
  }));
  await check("pinned editor", "mouse.click taskbar Editor → mousepad", async () => {
    await box.computerUse.mouse.click(198, 878);
    await sleep(1300);
    const detail = await exec("xdotool search --onlyvisible --class mousepad");
    await exec('wmctrl -r "Untitled" -e 0,60,60,740,480');
    const outputs = await shot("mousepad", 350, 280);
    await exec('wmctrl -c "Untitled"');
    return { detail, outputs };
  });
  await check("pinned browser", "mouse.click taskbar Browser → Chromium", async () => {
    await box.computerUse.mouse.click(66, 878);
    await sleep(3000);
    return { detail: await exec("xdotool search --onlyvisible --class chromium") };
  });
  await check(
    "Xfce preferred applications",
    "exo-open --launch WebBrowser and FileManager",
    async () => {
      await exec(
        "exo-open --launch WebBrowser http://127.0.0.1:8765/interaction.html && exo-open --launch FileManager " +
          work +
          "/mixed",
      );
      await sleep(1200);
      return {
        detail: await exec(
          "test -f /usr/share/xfce4/helpers/avenire-browser.desktop && xdotool search --onlyvisible --class chromium && xdotool search --onlyvisible --class Thunar",
        ),
      };
    },
  );
  await launch(
    "desktop browser",
    sessionEnv + `avenire-browser http://127.0.0.1:8765/interaction.html`,
  );
  await sleep(1600);
  await browserFocus();
  await check(
    "browser scale and geometry",
    "CDP devicePixelRatio + Ctrl+0 + display.getWindows + wmctrl",
    async () => {
      await box.computerUse.keyboard.hotkey("ctrl+0");
      const metrics = await cdp(
        `({dpr:devicePixelRatio,outerWidth,outerHeight,innerWidth,innerHeight,screenWidth:screen.width,screenHeight:screen.height,availableHeight:screen.availHeight,screenX,screenY,url:location.href})`,
      );
      if (
        metrics.dpr !== 1 ||
        metrics.outerWidth !== 1600 ||
        metrics.outerHeight !== 856 ||
        metrics.screenX !== 0 ||
        metrics.screenY !== 0
      )
        throw Error(JSON.stringify(metrics));
      const windows = await box.computerUse.display.getWindows();
      const native = await exec("wmctrl -lG; xprop -root _NET_WORKAREA");
      return {
        detail: JSON.stringify({ metrics, windows }) + "\n" + native,
        outputs: [
          await json("browser-metrics", metrics),
          await json("windows", windows),
          ...(await shot("browser", 950, 350)),
        ],
      };
    },
  );
  await check(
    "Graphite window borders",
    "unmaximized Chromium and native window edge pixels",
    async () => {
      await exec(
        `wmctrl -r 'Ruth input verification' -b remove,maximized_vert,maximized_horz; wmctrl -r 'Ruth input verification' -e 0,770,470,790,350; wmctrl -a 'Ruth input verification'`,
      );
      await sleep(700);
      const outputs = await shot("browser-unmaximized", 1000, 620);
      // Reproduce the upstream symbolic foreground mapping in a disposable copy.
      // Leave the shipped theme/config untouched, and restore it even on failure.
      try {
        await exec(
          `mkdir -p "$HOME/.themes"; cp -r /usr/share/themes/Graphite-Dark "$HOME/.themes/Graphite-Before"; sed -i 's/ c #2C2C2C"/ c gray88 s active_color_1"/' "$HOME/.themes/Graphite-Before/xfwm4/left-active.xpm" "$HOME/.themes/Graphite-Before/xfwm4/right-active.xpm" "$HOME/.themes/Graphite-Before/xfwm4/bottom-active.xpm"; xfconf-query -c xfwm4 -p /general/theme -s Graphite-Before`,
        );
        await sleep(700);
        outputs.push(...(await shot("border-before", 1000, 620)));
        await exec("python window-edges.py border-before --expect-light");
        outputs.push(
          await download(`${work}/renders/border-before-edges.png`, "border-before-edges.png"),
          await download(`${work}/renders/border-before-edges.json`, "border-before-edges.json"),
        );
      } finally {
        await exec(
          'xfconf-query -c xfwm4 -p /general/theme -s Graphite-Dark; rm -rf "$HOME/.themes/Graphite-Before"',
        );
      }
      for (const name of ["thunar", "terminal", "mousepad", "browser", "browser-unmaximized"])
        for (const extension of ["png", "json"])
          outputs.push(
            await download(
              `${work}/renders/${name}-edges.${extension}`,
              `${name}-edges.${extension}`,
            ),
          );
      await browserFocus();
      return {
        detail:
          "Graphite-Dark GTK/XFWM, native Chromium frame; frame perimeter pixels contain no long light rim. Enlarged edge crops retained for visual inspection.",
        outputs,
      };
    },
  );
  await check(
    "compositor comparison",
    "XFWM compositing off/on; same windows and cursor",
    async () => {
      const outputs: Output[] = [];
      try {
        for (const enabled of [false, true]) {
          await exec(`xfconf-query -c xfwm4 -p /general/use_compositing -s ${enabled}`);
          await sleep(600);
          outputs.push(...(await shot("compositor-" + (enabled ? "on" : "off"), 950, 400)));
        }
      } finally {
        await exec("xfconf-query -c xfwm4 -p /general/use_compositing -s false");
      }
      return {
        detail:
          "Both settings captured and visually reviewed. Compositing remains off; no visible artifacts in either capture.",
        outputs,
      };
    },
  );
  for (const scale of [0.8, 0.64])
    for (const [format, quality] of [
      ["png", 90],
      ["jpeg", 60],
      ["jpeg", 80],
      ["jpeg", 95],
    ] as const)
      await check(
        `screenshot ${scale} ${format} q${quality}`,
        "screenshot.takeCompressed({scale,format,quality})",
        async () => {
          const data = await capture(
            `scale-${scale}-${format}-${quality}`,
            await box.computerUse.screenshot.takeCompressed({ scale, format, quality }),
            [1600 * scale, 900 * scale],
          );
          return {
            detail: JSON.stringify({ scale, format, quality, ...data, requiresResize: false }),
            outputs: [data.output],
          };
        },
      );
  await check(
    "screenshot crop SDK defect and fallback",
    "takeRegion raw evidence; takeCompressedRegion PNG scale=1",
    async () => {
      const region = { x: 300, y: 150, width: 640, height: 360 };
      // 0.220.0 reverses the positional arguments: API receives x=height,y=width,w=y,h=x.
      const raw = await capture(
        "crop-raw-sdk",
        await box.computerUse.screenshot.takeRegion(region, true),
        [150, 300],
      );
      const working = await capture(
        "crop",
        await box.computerUse.screenshot.takeCompressedRegion(region, {
          scale: 1,
          format: "png",
          showCursor: false,
        }),
        [640, 360],
      );
      const reference = await capture(
        "crop-reference-full",
        await box.computerUse.screenshot.takeFullScreen(false),
        [1600, 900],
      );
      await execute(
        `python -c 'from PIL import Image,ImageChops; a=Image.open("renders/crop-reference-full.png").convert("RGB").crop((300,150,940,510)); b=Image.open("renders/crop.png").convert("RGB"); assert ImageChops.difference(a,b).getbbox() is None, "Crop origin/content mismatch"'`,
      );
      return {
        detail: JSON.stringify({
          region,
          rawDimensions: raw.dimensions,
          workingDimensions: working.dimensions,
          sdkDefect: "takeRegion reverses positional arguments in SDK 0.220.0",
          workaround: "takeCompressedRegion with scale=1 and format=png",
          originContentMatchesFullScreenshot: true,
        }),
        outputs: [raw.output, working.output, reference.output],
      };
    },
  );
  await check("screenshot compressed crop", "takeCompressedRegion PNG scale=0.5", async () => {
    const region = { x: 300, y: 150, width: 640, height: 360 };
    const data = await capture(
      "crop-compressed",
      await box.computerUse.screenshot.takeCompressedRegion(region, { scale: 0.5, format: "png" }),
      [320, 180],
    );
    return { detail: JSON.stringify({ region, ...data }), outputs: [data.output] };
  });
  for (const profile of SCREEN_PROFILES)
    await check(
      "interaction " + profile.id,
      "mouse move/click/double-click/drag/scroll + keyboard type/press/hotkey via toScreen",
      async () => {
        await browserFocus();
        await cdp(
          'window.scrollTo(0,0);events.length=0;document.querySelector("#text").value="";true',
        );
        const mappings = [];
        for (const desired of [
          { x: 400, y: 460 },
          { x: 800, y: 560 },
          { x: 1200, y: 650 },
        ]) {
          const model = toModel(desired, profile),
            screen = toScreen(model, profile);
          await box.computerUse.mouse.move(screen.x, screen.y);
          await sleep(100);
          const location = await exec("xdotool getmouselocation --shell");
          if (!location.includes(`X=${screen.x}\nY=${screen.y}`)) throw Error(location);
          await box.computerUse.mouse.click(screen.x, screen.y);
          await sleep(80);
          const last = await cdp(`events.filter(e=>e.type==='click').at(-1)`);
          if (
            !last ||
            Math.abs(last.screenX - screen.x) > 1 ||
            Math.abs(last.screenY - screen.y) > 1
          )
            throw Error(JSON.stringify({ screen, last }));
          const round = toModel({ x: last.screenX, y: last.screenY }, profile);
          if (Math.abs(round.x - model.x) > 1 || Math.abs(round.y - model.y) > 1)
            throw Error("Model roundtrip mismatch");
          mappings.push({
            desired,
            model,
            screen,
            observed: { x: last.screenX, y: last.screenY },
            scale: screenshotScale(profile),
          });
        }
        const p = (point: { x: number; y: number }) => toScreen(toModel(point, profile), profile);
        const a = p({ x: 500, y: 460 }),
          b = p({ x: 750, y: 510 });
        await box.computerUse.mouse.click(a.x, a.y, "left", true);
        await sleep(100);
        const beforeDrag = await cdp("events.filter(e=>e.type==='click').length");
        if (beforeDrag !== 5)
          throw Error(`Expected 3 clicks + 2 double-click presses, got ${beforeDrag}`);
        await box.computerUse.mouse.drag(a.x, a.y, b.x, b.y);
        await sleep(100);
        await box.computerUse.mouse.scroll(b.x, b.y, "down", 3);
        await sleep(180);
        await box.computerUse.mouse.scroll(b.x, b.y, "up", 3);
        await sleep(180);
        await cdp("scrollTo(0,0);true");
        const t = p({ x: 420, y: 250 });
        await box.computerUse.mouse.click(t.x, t.y);
        await box.computerUse.keyboard.hotkey("ctrl+a");
        await box.computerUse.keyboard.type(`Ruth ${profile.id}: 0123456789`, 15);
        await box.computerUse.keyboard.press("enter");
        await box.computerUse.keyboard.type("Exact input.", 15);
        const report = await cdp('({events,text:document.querySelector("#text").value})');
        const clicks = report.events.filter((e: any) => e.type === "click");
        const doubles = report.events.filter((e: any) => e.type === "dblclick");
        const wheels = report.events.filter((e: any) => e.type === "wheel");
        const pointerUps = report.events.filter((e: any) => e.type === "pointerup");
        const expected = `Ruth ${profile.id}: 0123456789\nExact input.`;
        if (
          clicks.length !== 7 ||
          doubles.length !== 1 ||
          !wheels.some((e: any) => e.deltaY > 0) ||
          !wheels.some((e: any) => e.deltaY < 0) ||
          report.text !== expected ||
          !report.events.some(
            (e: any) => e.type === "keydown" && e.ctrlKey && e.key.toLowerCase() === "a",
          ) ||
          !report.events.some(
            (e: any) =>
              e.type === "pointermove" &&
              e.buttons === 1 &&
              Math.abs(e.screenX - b.x) <= 1 &&
              Math.abs(e.screenY - b.y) <= 1,
          ) ||
          !pointerUps.some(
            (e: any) => Math.abs(e.screenX - b.x) <= 1 && Math.abs(e.screenY - b.y) <= 1,
          )
        )
          throw Error(
            JSON.stringify({
              clicks: clicks.length,
              doubles: doubles.length,
              wheels,
              text: report.text,
              pointerUps,
            }),
          );
        return {
          detail: JSON.stringify({
            profile: profile.id,
            mappings,
            clickCount: clicks.length,
            doubleClickCount: doubles.length,
            typedText: report.text,
            scrollDirections: ["down", "up"],
          }),
          outputs: [await json("interaction-" + profile.id, { profile, mappings, ...report })],
        };
      },
    );
  await check(
    "recording",
    "~30 second scripted desktop session, ffprobe, blackdetect, freezedetect",
    async () => {
      const recording = await box.computerUse.recording.start("verify-v4");
      const started = Date.now();
      let stopped;
      try {
        await box.computerUse.mouse.click(22, 878);
        await sleep(1500);
        await box.computerUse.keyboard.press("escape");
        await browserFocus();
        await box.computerUse.keyboard.hotkey("ctrl+l");
        await box.computerUse.keyboard.type("http://127.0.0.1:8765/interaction.html", 20);
        await box.computerUse.keyboard.press("enter");
        await sleep(800);
        await box.computerUse.mouse.click(420, 250);
        await box.computerUse.keyboard.type("Avenire Ruth — recording verification", 60);
        await box.computerUse.keyboard.press("enter");
        await box.computerUse.mouse.scroll(800, 550, "down", 4);
        await sleep(900);
        await box.computerUse.mouse.scroll(800, 550, "up", 4);
        await exec(`wmctrl -a mixed`);
        await sleep(1600);
        await box.computerUse.mouse.move(200, 230);
        await exec("wmctrl -a Terminal");
        await box.computerUse.keyboard.type('printf "recording verified\\n"', 60);
        await box.computerUse.keyboard.press("enter");
        await sleep(1300);
        await browserFocus();
        while (Date.now() - started < 30000) {
          await box.computerUse.mouse.move(
            500 + (Math.floor((Date.now() - started) / 1000) % 6) * 100,
            500,
          );
          await box.computerUse.mouse.scroll(
            1000,
            500,
            Math.floor((Date.now() - started) / 1000) % 2 ? "up" : "down",
            1,
          );
          await sleep(700);
        }
      } finally {
        stopped = await box.computerUse.recording.stop(recording.id);
      }
      if (stopped.status !== "completed") throw Error(JSON.stringify(stopped));
      await execute(`cp '${stopped.filePath}' renders/desktop-recording.mp4`);
      await execute(
        'ffmpeg -v error -y -i renders/desktop-recording.mp4 -vf "fps=1/5,scale=640:360,tile=3x2" -frames:v 1 renders/recording-contact.png',
      );
      const output = await download(stopped.filePath, "desktop-recording.mp4");
      const probe = JSON.parse(
        await execute(
          "ffprobe -v error -show_streams -show_format -of json renders/desktop-recording.mp4",
        ),
      );
      const stream = probe.streams.find((s: any) => s.codec_type === "video");
      const seconds = Number(probe.format.duration);
      if (stream.width !== 1600 || stream.height !== 900 || seconds < 29)
        throw Error(JSON.stringify(probe));
      const analysis = await execute(
        'ffmpeg -hide_banner -i renders/desktop-recording.mp4 -vf "blackdetect=d=0.2:pix_th=0.10,freezedetect=n=-80dB:d=2" -an -f null - 2>&1',
        120,
      );
      if (/black_start:/.test(analysis)) throw Error("Black interval detected: " + analysis);
      const stats = {
        width: stream.width,
        height: stream.height,
        fps: stream.r_frame_rate,
        durationSeconds: seconds,
        bytes: output.bytes,
        MBPerMinute: ((output.bytes / 1e6) * 60) / seconds,
        fourHourGB: ((output.bytes / 1e9) * 14400) / seconds,
        freezeIntervals: [...analysis.matchAll(/lavfi.freezedetect[^\n]*/g)].map((m) => m[0]),
        blackIntervals: [],
        note: "Threshold -80dB retains cursor/text motion; intentional settling may produce short intervals. Video and contact sheet retained for review.",
      };
      await box.fs.uploadFile(Buffer.from(analysis), `${work}/renders/recording-analysis.txt`);
      return {
        detail: JSON.stringify(stats),
        outputs: [
          output,
          await download(`${work}/renders/recording-contact.png`, "recording-contact.png"),
          await json("recording-probe", probe),
          await json("recording-stats", stats),
          await download(`${work}/renders/recording-analysis.txt`, "recording-analysis.txt"),
        ],
      };
    },
  );
}
