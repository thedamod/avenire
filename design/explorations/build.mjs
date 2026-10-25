// Assemble the design-system sheets: inline tokens.css and the generated anatomy figures.
// `{{fig:name}}` in a *.src.html becomes the figure's SVG. Dark round-2 figures win; round-1
// light figures are re-themed through their old token names until the dark set exists.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = "/tmp/avenire-iso/out";

const FIGURES = {
  hero: ["dark/hero/desk.min.svg", "hero/desk.min.svg"],
  hero3: ["hero3/hero.min.svg", "dark/cards/f3-organize.min.svg"],
  hero4: ["hero4/hero.min.svg", "hero3/hero.min.svg", "dark/cards/f3-organize.min.svg"],
  capture: ["dark/icons/capture.min.svg", "icons/capture.min.svg"],
  organize: ["dark/icons/organize.min.svg", "icons/organize.min.svg"],
  overnight: ["dark/icons/overnight.min.svg", "icons/overnight.min.svg"],
  cite: ["dark/icons/cite.min.svg", "icons/cite.min.svg"],
  "card-collect": ["dark/cards/f2-collect.min.svg", "dark/icons/capture.min.svg", "icons/capture.min.svg"],
  "card-organize": ["dark/cards/f3-organize.min.svg", "dark/icons/organize.min.svg", "icons/organize.min.svg"],
  "card-ask": ["dark/cards/f4-ask.min.svg", "dark/icons/cite.min.svg", "icons/cite.min.svg"],
  "card-plot": ["dark/cards/f5-show.min.svg", "dark/icons/cite.min.svg", "icons/cite.min.svg"],
  "card-overnight": ["dark/cards/f6-overnight.min.svg", "dark/icons/overnight.min.svg", "icons/overnight.min.svg"],
  "card-review": ["dark/cards/f7-review.min.svg", "dark/icons/organize.min.svg", "icons/organize.min.svg"],
};
for (const doodle of ["radio", "chemistry", "physics", "easel", "computer-science", "literature", "geography", "maths"]) {
  FIGURES[`doodle-${doodle}`] = [`covers/${doodle}.min.svg`];
}

// Round-1 light hexes for the lit (periwinkle) part, mapped to amber on dark.
const LIT = { "#B7CBFF": "#1A150D", "#C4D4FF": "#1E180F", "#D1DEFF": "#221B11", "#DEE7FF": "#261E13",
  "#D0DCFA": "#1A150D", "#DBE5FC": "#1E180F", "#E6EDFE": "#221B11", "#EDF2FF": "#261E13", "#8A8A80": "#050505" };

function figure(spec) {
  // name@x,y,w,h crops the figure to a viewBox window
  const [name, crop] = spec.split("@");
  const candidates = FIGURES[name];
  if (!candidates) throw new Error(`unknown figure ${name}`);
  const file = candidates.map((c) => join(OUT, c)).find((p) => existsSync(p));
  if (!file) return `<div class="fig-missing">${name}</div>`;
  let svg = readFileSync(file, "utf8")
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1")
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1")
    .replace(/<svg /, '<svg preserveAspectRatio="xMidYMid meet" ');
  if (crop) svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${crop.split(",").join(" ")}"`);
  // filter ids must be unique per page
  const id = name.replace(/[^a-z0-9]/gi, "");
  svg = svg.replace(/id="([^"]+)"/g, `id="${id}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`);
  const legacy = !file.includes("/dark/");
  if (legacy) for (const [from, to] of Object.entries(LIT)) svg = svg.replaceAll(from, to);
  return `<div class="fig${legacy ? " fig-legacy" : ""}">${svg}</div>`;
}

// Label pills for a figure, positioned in % of its 1100x560 viewBox from the generator's anchors.json.
const LABELS = { youtube: "YouTube", whatsapp: "WhatsApp", course: "Course site", pdf: "Lecture PDF", drive: "Google Drive", notes: "Notes app", email: "Email", screenshot: "Screenshot" };
function labels(spec) {
  const [name, crop] = spec.split("@");
  const [cx, cy, cw, ch] = crop ? crop.split(",").map(Number) : [0, 0, null, null];
  const file = [join(OUT, name, "anchors.json")].find((p) => existsSync(p)) ?? "";
  if (!file) return "";
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.anchors ?? raw.sources ?? [];
  const [vw, vh] = [cw ?? raw.viewBox?.[2] ?? 1100, ch ?? raw.viewBox?.[3] ?? 560];
  return list.filter((a) => LABELS[a.id]).map((a) =>
    `<span class="pill pill-${a.labelSide ?? "above"}" style="left:${((a.x - cx) / vw * 100).toFixed(2)}%; top:${((a.y - cy) / vh * 100).toFixed(2)}%">${LABELS[a.id]}</span>`).join("");
}

const logo = readFileSync("/home/apollo/avenire/avenire-logo-mark.svg", "utf8")
  .replace('width="198" height="154"', 'width="20" height="16"')
  .replace(/fill="currentColor"/, 'fill="currentColor"');
const tokens = readFileSync(join(HERE, "tokens.css"), "utf8");
const base = existsSync(join(HERE, "base.css")) ? readFileSync(join(HERE, "base.css"), "utf8") : "";
for (const page of readdirSync(HERE).filter((f) => f.endsWith(".src.html")).map((f) => f.replace(".src.html", ""))) {
  const src = join(HERE, `${page}.src.html`);
  if (!existsSync(src)) continue;
  const html = readFileSync(src, "utf8")
    .replace("/*{{tokens}}*/", tokens)
    .replace("/*{{base}}*/", base)
    .replace(/\{\{fig:([a-z0-9@.,-]+)\}\}/g, (_, name) => figure(name))
    .replaceAll("{{logo}}", logo)
    .replace(/\{\{labels:([a-z0-9@.,-]+)\}\}/g, (_, name) => labels(name));
  writeFileSync(join(HERE, `${page}.html`), html);
  console.log(page, html.length);
}
