/** Publication gate: rendered Cloud visuals must use the shared figure palette, not invented ones. */
import { CLOUD_WORKSPACE, type CloudBox } from "@avenire/cloud/cloud-box";
import { WIDGET_THEME_TOKENS } from "@avenire/ui/tokens";
import * as Effect from "effect/Effect";
import { posix } from "node:path";
import { RuthToolError } from "../tools/core.ts";
import { runPaths } from "./paths.ts";

const MEDIA = /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i;
const HTML = /\.html?$/i;
const SVG = /\.svg$/i;
/** Screenshots, photos and third-party images Ruth did not render are published as they are. */
export const isCapture = (path: string) => path.split("/").includes("captures");

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
const NEUTRAL_ENDS = new Set(["#000000", "#ffffff"]);
const TOKEN_COLORS = new Set<string>(
  Object.values(WIDGET_THEME_TOKENS).flatMap((tokens) =>
    Object.values(tokens as Record<string, string>).filter((value) => /^#[0-9a-f]{6}$/i.test(value)),
  ),
);
const NAMED =
  "red|green|blue|teal|orange|yellow|gold|navy|purple|pink|cyan|magenta|lime|maroon|olive|aqua|fuchsia|silver|gr[ae]y|brown|coral|crimson|indigo|violet|salmon|tomato|turquoise|skyblue|steelblue|slategr[ae]y|darkblue|lightblue|darkgreen|lightgreen|orchid|khaki|tan|beige|lavender|plum|chocolate|firebrick|darkorange|royalblue|dodgerblue|seagreen|limegreen|darkred|darkgr[ae]y|lightgr[ae]y|dimgr[ae]y|whitesmoke|ghostwhite|aliceblue|ivory|snow|linen";
const NAMED_COLOR = new RegExp(
  `(?:color|fill|stroke|background|fillStyle|strokeStyle|shadowColor)\\s*[:=]\\s*["']?(${NAMED})\\b`,
  "gi",
);
const channel = (value: string, scale: number) =>
  value.endsWith("%") ? (Number.parseFloat(value) / 100) * 255 : Number.parseFloat(value) * scale;
const hslToHex = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return hex(f(0) * 255, f(8) * 255, f(4) * 255);
};

/** Colour literals in markup, normalised to #rrggbb (alpha dropped) or a lower-case name. */
export const colorLiterals = (text: string): string[] => {
  const found: string[] = [];
  for (const [, value] of text.matchAll(/(?<![\w&/-])#([0-9a-f]{3,8})\b/gi)) {
    if (![3, 4, 6, 8].includes(value!.length)) continue;
    const full =
      value!.length <= 4 ? [...value!.slice(0, 3)].map((c) => c + c).join("") : value!.slice(0, 6);
    found.push(`#${full.toLowerCase()}`);
  }
  for (const [, fn, args] of text.matchAll(/\b(rgba?|hsla?)\(([^()]*)\)/gi)) {
    if (/var|calc|from/i.test(args!)) continue;
    const parts = args!.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) continue;
    found.push(
      fn!.toLowerCase().startsWith("rgb")
        ? hex(channel(parts[0]!, 1), channel(parts[1]!, 1), channel(parts[2]!, 1))
        : hslToHex(
            Number.parseFloat(parts[0]!),
            Number.parseFloat(parts[1]!) / 100,
            Number.parseFloat(parts[2]!) / 100,
          ),
    );
  }
  for (const [, name] of text.matchAll(NAMED_COLOR)) found.push(name!.toLowerCase());
  return [...new Set(found)];
};

/** HTML follows live light/dark through variables; static SVG may use palette values directly. */
export const markupViolations = (name: string, text: string): string[] =>
  colorLiterals(text).filter((color) =>
    HTML.test(name)
      ? !NEUTRAL_ENDS.has(color)
      : !NEUTRAL_ENDS.has(color) && !TOKEN_COLORS.has(color),
  );

const MEDIA_CHECK = String.raw`
import colorsys, json, os, subprocess, sys, tempfile
from PIL import Image, ImageSequence
theme = json.load(open(sys.argv[1]))
path = sys.argv[2]
SURFACES = ["--figure-page", "--figure-card", "--figure-paper", "--figure-face", "--figure-top",
            "--figure-shade-0", "--figure-shade-1", "--figure-shade-2", "--figure-shade-3",
            "--figure-lit-top", "--figure-lit-shade"]
SIGNALS = ["--figure-red", "--figure-green", "--figure-blue"]
def rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))
surfaces = {name: [rgb(t["tokens"][k]) for k in SURFACES] for name, t in theme["themes"].items()}
signal_hues = [colorsys.rgb_to_hsv(*[c / 255 for c in rgb(t["tokens"][k])])[0] * 360
               for t in theme["themes"].values() for k in SIGNALS]
def signal(h):
    return any(min(abs(h - s), 360 - abs(h - s)) <= 20 for s in signal_hues)
def frames(p):
    if os.path.splitext(p)[1].lower() in (".mp4", ".webm", ".mov"):
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", p], capture_output=True, text=True, check=True)
        duration = float(probe.stdout.strip() or 0)
        out = []
        for at in (0.1, 0.5, 0.9):
            target = tempfile.mktemp(suffix=".png")
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(duration * at), "-i", p,
                            "-frames:v", "1", target], check=True)
            out.append(Image.open(target).convert("RGB"))
            os.remove(target)
        return out
    seq = [f.convert("RGB") for f in ImageSequence.Iterator(Image.open(p))]
    return [seq[0], seq[len(seq) // 2], seq[-1]] if len(seq) > 2 else seq
def inspect(img):
    img = img.copy()
    img.thumbnail((480, 480))
    w, h = img.size
    px = img.load()
    ring = max(1, min(w, h) // 50)
    border = {}
    for x in range(w):
        for y in list(range(ring)) + list(range(h - ring, h)):
            border[px[x, y]] = border.get(px[x, y], 0) + 1
    for y in range(h):
        for x in list(range(ring)) + list(range(w - ring, w)):
            border[px[x, y]] = border.get(px[x, y], 0) + 1
    background = max(border, key=border.get)
    matched = [name for name, colors in surfaces.items()
               if any(max(abs(i - j) for i, j in zip(background, c)) <= 6 for c in colors)]
    off, tinted, counts = 0, 0, {}
    for x in range(w):
        for y in range(h):
            r, g, b = px[x, y]
            hi, lo = max(r, g, b), min(r, g, b)
            if hi - lo < 10:
                continue
            if hi < 90:
                tinted += 1
            elif hi - lo >= 40 and not signal(colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[0] * 360):
                off += 1
                key = "#%02x%02x%02x" % (r, g, b)
                counts[key] = counts.get(key, 0) + 1
    return {"background": "#%02x%02x%02x" % background, "theme": matched[0] if matched else None,
            "off": off / (w * h), "tinted": tinted / (w * h),
            "colors": sorted(counts, key=counts.get, reverse=True)[:4]}
problems, themes, worst = [], set(), {"off": 0, "tinted": 0, "colors": []}
for result in map(inspect, frames(path)):
    if result["theme"] is None:
        problems.append("its background %s is not a figure surface" % result["background"])
    else:
        themes.add(result["theme"])
    if result["off"] > worst["off"]:
        worst["off"], worst["colors"] = result["off"], result["colors"]
    worst["tinted"] = max(worst["tinted"], result["tinted"])
if worst["off"] > 0.005:
    problems.append("%.1f%% of its pixels use off-palette colours such as %s" % (worst["off"] * 100, ", ".join(worst["colors"])))
if worst["tinted"] > 0.03:
    problems.append("%.0f%% of its pixels are tinted dark surfaces (navy/slate panels)" % (worst["tinted"] * 100))
if len(themes) > 1:
    problems.append("its frames mix light and dark surfaces")
print(json.dumps({"problems": sorted(set(problems))}))
`;
const SCRIPT_PATH = `${CLOUD_WORKSPACE}/.avenire/theme-check.py`;
const PYTHON = "/opt/avenire/python/bin/python";
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const mediaProblems = Effect.fn("RuthCloud.mediaThemeProblems")(function* (
  box: CloudBox,
  runId: string,
  path: string,
) {
  yield* box.writeFile(SCRIPT_PATH, new TextEncoder().encode(MEDIA_CHECK));
  const themeFile = `${runPaths(runId).runDir}/visual-theme.json`;
  const result = yield* box.exec(
    `${PYTHON} -I ${shellQuote(SCRIPT_PATH)} ${shellQuote(themeFile)} ${shellQuote(path)}`,
    { timeoutSeconds: 120 },
  );
  const parsed = (() => {
    try {
      return JSON.parse(result.output.trim().split("\n").at(-1) ?? "") as { problems: string[] };
    } catch {
      return undefined;
    }
  })();
  if (result.exitCode !== 0 || !parsed) {
    // An unreadable or unusual file is not a palette violation; the checker never blocks on itself.
    yield* Effect.logWarning("Cloud visual theme check could not run", {
      path,
      output: result.output.slice(-500),
    });
    return [];
  }
  return parsed.problems;
});

/**
 * Fails with a recoverable tool error when a rendered visual ignores the figure palette, so Ruth
 * re-renders it instead of publishing navy panels or teal/orange series into the report.
 */
export const checkVisualTheme = Effect.fn("RuthCloud.checkVisualTheme")(function* (input: {
  tool: string;
  box: CloudBox;
  runId: string;
  path: string;
  bytes: Uint8Array;
}) {
  const name = posix.basename(input.path);
  if (isCapture(input.path)) return;
  const themeFile = `${runPaths(input.runId).runDir}/visual-theme.json`;
  if (HTML.test(name) || SVG.test(name)) {
    const violations = markupViolations(name, new TextDecoder().decode(input.bytes));
    if (!violations.length) return;
    return yield* new RuthToolError({
      tool: input.tool,
      code: "invalid_input",
      recoverable: true,
      message: HTML.test(name)
        ? `${name} hardcodes colours (${violations.slice(0, 8).join(", ")}), so it cannot follow Avenire's light/dark figure theme. Use var(--figure-…) in CSS/SVG and read getComputedStyle(figure).getPropertyValue('--figure-…') in canvas/WebGL code (redraw on avenire:themechange). Only black, white and transparent may be literal. Fix the file and publish again.`
        : `${name} uses colours outside the figure palette (${violations.slice(0, 8).join(", ")}). Use the token values in ${themeFile} and publish again.`,
    });
  }
  if (!MEDIA.test(name)) return;
  const problems = yield* mediaProblems(input.box, input.runId, input.path).pipe(
    Effect.catchTag("CloudError", (error) =>
      Effect.logWarning("Cloud visual theme check failed", { error }).pipe(Effect.as([])),
    ),
    Effect.catchTag("SandboxTimeout", () => Effect.succeed([])),
  );
  if (!problems.length) return;
  return yield* new RuthToolError({
    tool: input.tool,
    code: "invalid_input",
    recoverable: true,
    message: `${name} does not follow Avenire's figure palette: ${problems.join("; ")}. Re-render it from ${themeFile} (themes.dark unless the task asks for light): figure-page/card surfaces, neutral series (hi/mid/lo) told apart by labels, dashes or hatching, and red/green/blue only as signals. Then publish again. A screenshot or photo you did not render goes under a captures/ folder and is published as it is.`,
  });
});
