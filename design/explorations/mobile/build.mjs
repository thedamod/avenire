// Build the Avenire mobile page: one Paper-ready fragment per screen + manifest + preview board.
//   node design/mobile/build.mjs
// Paper import (next session, after the weekly MCP limit resets): for each manifest entry,
//   create_artboard({ name, styles: { width, height, left, top, backgroundColor } }) on the "Mobile" page,
//   then write_html({ mode: "insert-children", html: <fragment> }). See IMPORT.md.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const modules = ["screens-home.mjs", "screens-report.mjs", "screens-rest.mjs"];
const screens = [];
for (const m of modules) {
  try {
    screens.push(...(await import(join(HERE, m))).default);
  } catch (e) {
    if (e.code === "ERR_MODULE_NOT_FOUND" && e.message.includes(m)) continue;
    throw e;
  }
}

const COLS = ["Read me", "Home", "Search and Ask", "Notebook", "Morning report", "Citations", "Chat", "Chats and Tasks", "Filing", "Settings and Trash", "Onboarding"];
const PITCH_X = 470, PITCH_Y = 944, ORIGIN = [0, 0];

// Paper clones existing desktop nodes; the preview shows a labelled stand-in.
const CLONE = /<x-paper-clone node-id="([^"]+)" style="([^"]*)" data-preview="([^"]*)"\s*\/>/g;
// SHARED_NODES="statusBar=3NZ-0,homeHeader=3O9-0,shelf=3PW-0" swaps identical shared markup for clones of M01's nodes.
const lib = await import(join(HERE, "lib.mjs"));
const home = await import(join(HERE, "screens-home.mjs"));
const report = await import(join(HERE, "screens-report.mjs"));
const SHARED = { statusBar: lib.statusBar(), homeHeader: home.homeHeader(), shelf: home.shelf(), homeComposer: home.homeComposer(), tabsNotebooks: home.tabsHome(0), tabsSources: home.tabsHome(2), reportNav: report.reportNav() };
const SHARED_MULTI = { homeComposer: 2 }; // dock + home indicator → "dockId+indicatorId"
const sharedNodes = Object.fromEntries((process.env.SHARED_NODES ?? "").split(",").filter(Boolean).map((kv) => kv.split("=")));
const forPaper = (html) => {
  let out = html.replace(CLONE, (_, id, style) => `<x-paper-clone node-id="${id}" style="${style}" />`);
  for (const [key, ids] of Object.entries(sharedNodes)) out = out.split(SHARED[key]).join(ids.split("+").map((id) => `<x-paper-clone node-id="${id}" />`).join(""));
  return out.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ");
};
const forPreview = (html) => html.replace(CLONE, (_, id, style, label) =>
  `<div style="${style}display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(135deg,#161616 0 8px,#121212 8px 16px);border:1px dashed #3A3A3A;color:#8A8A8A;font:12px/16px 'Geist Mono',monospace;text-align:center;padding:12px;">${label}<br/>(clone ${id})</div>`);

const outDir = join(HERE, "screens");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const rowsByCol = {};
const manifest = screens.map((s) => {
  const w = s.w ?? 390, h = s.h ?? 844;
  const file = `${s.id}.html`;
  writeFileSync(join(outDir, file), forPaper(s.body).trim() + "\n");
  rowsByCol[s.col] = (rowsByCol[s.col] ?? 0) + 1;
  return {
    id: s.id, name: `${s.id} ${s.name}`, file: `screens/${file}`, column: COLS[s.col],
    styles: { width: `${w}px`, height: `${h}px`, left: `${ORIGIN[0] + s.col * PITCH_X + (s.col > 0 ? 90 : 0)}px`, top: `${ORIGIN[1] + s.row * PITCH_Y}px`, backgroundColor: s.bg ?? "#0B0B0B", overflow: "clip" },
  };
});
writeFileSync(join(HERE, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// Preview board, laid out like the Paper canvas
const maxRow = Math.max(...screens.map((s) => s.row + Math.ceil((s.h ?? 844) / PITCH_Y)));
const board = screens.map((s) => {
  const w = s.w ?? 390, h = s.h ?? 844;
  return `<section style="position:absolute;left:${40 + s.col * PITCH_X}px;top:${80 + s.row * PITCH_Y}px;">
  <div style="font:12px/16px system-ui;color:#8A8A8A;padding-bottom:10px;">${s.id} ${s.name}</div>
  <div id="${s.id}" style="width:${w}px;height:${h}px;position:relative;overflow:hidden;display:flex;flex-direction:column;background:${s.bg ?? "#0B0B0B"};border-radius:${w === 390 ? 44 : 6}px;outline:1px solid #222;">${forPreview(s.body)}</div>
</section>`;
}).join("\n");
const heads = COLS.map((c, i) => `<div style="position:absolute;left:${40 + i * PITCH_X}px;top:24px;font:600 15px/20px system-ui;color:#EDEDED;">${c}</div>`).join("");
writeFileSync(join(HERE, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>Avenire · Mobile</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#050505;-webkit-font-smoothing:antialiased;width:${80 + COLS.length * PITCH_X}px;height:${120 + maxRow * PITCH_Y}px;position:relative}</style></head>
<body>${heads}${board}</body></html>\n`);

// Review helper: view.html?ids=M01,M02,M03 renders just those screens side by side
writeFileSync(join(HERE, "view.html"), `<!doctype html><html><head><meta charset="utf-8"><title>Avenire · Mobile (view)</title>
<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#050505;-webkit-font-smoothing:antialiased;display:flex;gap:40px;padding:20px}</style></head>
<body><script>
const S = ${JSON.stringify(Object.fromEntries(screens.map((s) => [s.id, { name: s.name, w: s.w ?? 390, h: s.h ?? 844, bg: s.bg ?? "#0B0B0B", body: forPreview(s.body) }])))};
const ids = (new URLSearchParams(location.search).get("ids") || "M01").split(",");
document.body.innerHTML = ids.map((id) => { const s = S[id]; return \`<section><div style="font:12px/16px system-ui;color:#8A8A8A;padding-bottom:8px">\${id} \${s.name}</div><div style="width:\${s.w}px;height:\${s.h}px;position:relative;overflow:hidden;display:flex;flex-direction:column;background:\${s.bg};border-radius:\${s.w === 390 ? 44 : 6}px;outline:1px solid #222">\${s.body}</div></section>\`; }).join("");
</script></body></html>\n`);

console.log(`${screens.length} screens → screens/, manifest.json, index.html`);
