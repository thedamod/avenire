import { readFile } from "node:fs/promises";
export type Output = { path: string; bytes: number };
export type Check = {
  check: string;
  ok: boolean;
  seconds: number;
  command: string;
  detail: string;
  outputs: Output[];
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export async function gallery(snapshot: string, results: Check[], embedMedia = true) {
  const mediaUrls = new Map<string, string>();
  for (const r of results)
    for (const o of r.outputs) {
      const extension = o.path.split(".").pop()!;
      const mime = (
        {
          png: "image/png",
          svg: "image/svg+xml",
          gif: "image/gif",
          jpeg: "image/jpeg",
          jpg: "image/jpeg",
          mp4: "video/mp4",
          pdf: "application/pdf",
        } as Record<string, string>
      )[extension];
      if (mime && embedMedia)
        mediaUrls.set(o.path, `data:${mime};base64,${(await readFile(o.path)).toString("base64")}`);
    }
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(snapshot)} render verification</title><style>
:root{color-scheme:dark;--bg:#141414;--fg:#e4e4e4eb;--line:#e4e4e414;--muted:#e4e4e45e;--accent:#abc4ff;--pass:#4dab9a;--fail:#fc6b83}*{box-sizing:border-box}body{margin:24px auto;padding:0 20px;max-width:1440px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}h1{font-size:24px}h2{font-size:17px;margin:0 0 8px}a{color:var(--accent)}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid var(--line);padding:8px;vertical-align:top}.pass{color:var(--pass)}.fail{color:var(--fail)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:24px;margin-top:32px}article{min-width:0;border-top:1px solid var(--line);padding-top:16px}img,video,object{width:100%;max-height:600px;object-fit:contain;background:var(--bg)}object{height:500px}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted);font:12px/1.5 monospace}p{overflow-wrap:anywhere}@media print{:root{--bg:#fff;--fg:#111;--muted:#444;--line:#ccc}body{background:var(--bg);color:var(--fg)}.grid{display:block}article{break-inside:avoid}video{height:200px}}
</style><body><h1>${escape(snapshot)} · render verification</h1><p>${results.filter((r) => r.ok).length}/${results.length} checks passed. Timings are wall-clock seconds in a real CPU sandbox; each command’s time includes SDK transport. ${embedMedia ? "Media are embedded in this document; raw outputs are also saved alongside it." : "Raw media are retained at the absolute paths below and embedded in the separate on-disk verification gallery."}</p><table><thead><tr><th>Check</th><th>Result</th><th>Seconds</th><th>Output bytes</th></tr></thead><tbody>${results.map((r) => `<tr><td>${escape(r.check)}</td><td class="${r.ok ? "pass" : "fail"}">${r.ok ? "PASS" : "FAIL"}</td><td>${r.seconds.toFixed(2)}</td><td>${r.outputs.reduce((n, o) => n + o.bytes, 0)}</td></tr>`).join("")}</tbody></table><main class="grid">${results
    .map(
      (r) =>
        `<article><h2>${escape(r.check)} · ${r.ok ? "PASS" : "FAIL"} · ${r.seconds.toFixed(2)} s</h2><pre>${escape(r.command)}</pre><p>${escape(r.detail)}</p>${r.outputs
          .map((o) => {
            const file = o.path.split("/").pop()!;
            const url =
              mediaUrls.get(o.path) ?? (embedMedia ? encodeURIComponent(file) : encodeURI(o.path));
            const media = !embedMedia
              ? ""
              : /\.(png|svg|gif|jpeg|jpg)$/.test(file)
                ? `<img src="${url}" alt="${escape(r.check)}">`
                : /\.mp4$/.test(file)
                  ? `<video src="${url}" controls loop muted></video>`
                  : /\.pdf$/.test(file)
                    ? `<object data="${url}" type="application/pdf"><a href="${url}">Open PDF</a></object>`
                    : "";
            return `${media}<p><a href="${url}">${escape(file)}</a> · ${o.bytes} bytes<br><code>${escape(o.path)}</code></p>`;
          })
          .join("")}</article>`,
    )
    .join("")}</main></body></html>`;
}
