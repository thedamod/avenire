import { readFile } from "node:fs/promises";
/** Use the exact end-to-end API examples, rather than reimplementing their algorithms. */
export async function widgetPages() {
  const api = await readFile(new URL("../../../widget-kit/API.md", import.meta.url), "utf8");
  const examples = [...api.matchAll(/```html\n([\s\S]*?)\n```/g)].map((m) => m[1]!);
  if (examples.length !== 3)
    throw new Error(`Expected three complete API widgets, found ${examples.length}`);
  const iso = `<!doctype html><meta charset="utf-8"><script type="module">
import {fitProjection,boxCorners,slabOf,solidSvg,figureSvg,ISO_CSS} from '/kits/iso.js';
const style=document.createElement('style');style.textContent=ISO_CSS;document.head.append(style);
const plan={x:0,y:0,w:80,d:50,r:5};const P=fitProjection(boxCorners(plan,0,12),520,360);
document.body.innerHTML=figureSvg({width:520,height:360,label:'Isometric block',body:solidSvg(slabOf(plan,0,12,P))});
</script>`;
  const csp =
    "default-src 'none'; script-src 'unsafe-inline' http://127.0.0.1:8765/kits/; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'";
  return ["pendulum", "three-body", "curve-fit", "iso"].map((name, i) => ({
    name,
    html: (examples[i] ?? iso).replace(
      "<!doctype html>",
      `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><style>body{margin:20px;background:#181818;color:#e4e4e4}svg{width:520px;height:360px}</style>`,
    ),
  }));
}
