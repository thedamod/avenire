/** Runs pinned upstream Node/CDP tools inside the disposable verification sandbox. */
import type { Sandbox } from "@daytonaio/sdk";
import type { Output } from "./gallery.ts";
import { buildWidgetDocument } from "../../../ui/src/widgets/protocol.ts";
import { WIDGET_THEME_TOKENS } from "../../../ui/src/styles/tokens.ts";

export async function figure({
  box,
  work,
  check,
  execute,
  run,
  download,
}: {
  box: Sandbox;
  work: string;
  check: (
    name: string,
    command: string,
    action: () => Promise<{ detail: string; outputs?: Output[] }>,
  ) => Promise<void>;
  execute: (command: string, timeout?: number) => Promise<string>;
  run: (name: string, command: string, files?: string[], timeout?: number) => Promise<void>;
  download: (remote: string, local: string) => Promise<Output>;
}) {
  const root = "/opt/avenire/figures";
  const dir = `${work}/figure`;
  await run(
    "figure pinned inventory + read-only",
    `python -c 'import pathlib,json,hashlib,os; p=pathlib.Path("${root}"); m=json.loads((p/"MANIFEST.json").read_text()); assert len(m)==67; assert all(hashlib.sha256((p/k).read_bytes()).hexdigest()==v for k,v in m.items()); assert not any(p.rglob("*.html")); assert not os.access(p,os.W_OK); assert not os.access(p/"kit/iso-kit.mjs",os.W_OK); print(len(m),"pinned source files verified, read-only")' && test -x "$CHROME_PATH" && echo "$CHROME_PATH"`,
  );
  await run(
    "figure writable copies",
    `mkdir -p '${dir}/examples' && ln -s '${root}/kit' '${dir}/kit' && ln -s '${root}/scripts' '${dir}/scripts' && cp -R '${root}/examples/dial-indicator' '${root}/examples/arcade-cabinet' '${root}/examples/raptor-engine' '${dir}/examples/' && chmod -R u+w '${dir}/examples'`,
  );
  const dial = `${dir}/examples/dial-indicator`;
  for (const theme of ["dark", "light"] as const) {
    const suffix = theme === "light" ? "-light" : "";
    const page = `${dial}/dial-indicator${suffix}.html`;
    await run(
      `figure dial build ${theme}`,
      `cd '${dial}' && node build.mjs ${theme === "light" ? "--light" : ""}`,
    );
    for (const width of [1440, 390])
      await run(
        `figure capture ${theme} ${width}`,
        `node '${root}/scripts/capture.mjs' '${page}' --width ${width} --scale 1 --out '${work}/renders/figure-dial-${theme}-${width}.png' > '${work}/capture.log' && cat '${work}/capture.log' && grep -q 'console: clean' '${work}/capture.log' && grep -q 'scrolls sideways: no' '${work}/capture.log'`,
        [`renders/figure-dial-${theme}-${width}.png`],
      );
    await run(
      `figure line ends ${theme}`,
      `node '${root}/scripts/lines.mjs' '${page}' --reduced --out '${work}/renders/figure-lines-${theme}.png' > '${work}/lines.log' && cat '${work}/lines.log' && grep -q 'line ends: 0' '${work}/lines.log'`,
      [`renders/figure-lines-${theme}.png`],
    );
    await run(
      `figure 4x ${theme}`,
      `node '${root}/scripts/capture.mjs' '${page}' --scale 1 --zoom 210,120,210,170 --out '${work}/renders/figure-detail-${theme}.png'`,
      [`renders/figure-detail-${theme}.png`],
    );
  }
  await run(
    "figure arcade geometry audit",
    `cd '${dir}/examples/arcade-cabinet' && node build.mjs --audit > '${work}/arcade-audit.log' && cat '${work}/arcade-audit.log' && tail -1 '${work}/arcade-audit.log' | grep -q '^audit passed$'`,
    [],
    900,
  );
  await run(
    "figure raptor built size",
    `cd '${dir}/examples/raptor-engine' && node build.mjs && node -e 'const fs=require("node:fs"); const n=fs.statSync("raptor-engine.html").size; console.log("raptor-engine HTML:",n,"bytes"); if(n>8*1024*1024)process.exit(1)'`,
    [],
    900,
  );
  // Wrap a real shader page with production CSP and check the renderer, not just source text.
  await check(
    "figure stored CSP + theme switching + WebGL",
    "wrap raptor page; Playwright checks CSP, both theme messages, WebGL and no-WebGL fallback",
    async () => {
      const html = (
        await box.fs.downloadFile(`${dir}/examples/raptor-engine/raptor-engine.html`)
      ).toString("utf8");
      await box.fs.uploadFile(
        Buffer.from(
          buildWidgetDocument({
            html,
            title: "Raptor CSP",
            colorScheme: "dark",
            tokens: WIDGET_THEME_TOKENS.dark,
          }),
        ),
        `${work}/raptor-widget.html`,
      );
      await box.fs.uploadFile(
        Buffer.from(JSON.stringify(WIDGET_THEME_TOKENS)),
        `${work}/figure-tokens.json`,
      );
      const script = `import json
from pathlib import Path
import functools, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
root=Path("${work}")
tokens=json.loads((root/'figure-tokens.json').read_text())
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def end_headers(self):
  self.send_header('Content-Security-Policy','sandbox allow-scripts')
  super().end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--no-sandbox','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
 for fallback in [False,True]:
  page=browser.new_page(viewport={'width':1100,'height':1000},reduced_motion='reduce')
  page.add_init_script("const locations=new WeakMap();const proto=WebGLRenderingContext.prototype;const locate=proto.getUniformLocation;const write=proto.uniform1f;window.__themeUniforms=[];proto.getUniformLocation=function(p,n){const at=locate.call(this,p,n);if(at)locations.set(at,n);return at};proto.uniform1f=function(at,v){if(locations.get(at)==='uLight')window.__themeUniforms.push(v);return write.call(this,at,v)}")
  if fallback: page.add_init_script("const get=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(k,...a){return k==='webgl'||k==='webgl2'?null:get.call(this,k,...a)}")
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/raptor-widget.html',wait_until='load')
  page.wait_for_timeout(1500)
  assert page.locator('.iso').first.get_attribute('data-theme')=='dark'
  if not fallback: assert page.locator('.rp-stage[data-gl]').count()==1
  page.locator('[data-fire]').click()
  deadline=time.monotonic()+30
  while 'Pc ' not in page.locator('[data-readout]').text_content():
   assert time.monotonic()<deadline, 'Raptor did not reach main stage'
   page.wait_for_timeout(100)
  for theme in ['light','dark']:
   page.evaluate("d=>window.postMessage(d,'*')",{'type':'avenire:theme','colorScheme':theme,'tokens':tokens[theme]})
   page.wait_for_timeout(300)
   assert page.locator('.iso').first.get_attribute('data-theme')==theme
   actual=page.locator('.iso').first.evaluate("e=>getComputedStyle(e).getPropertyValue('--figure-card').trim()")
   assert actual==tokens[theme]['--figure-card'],actual
   if not fallback: assert page.evaluate("window.__themeUniforms.at(-1)")==int(theme=='light')
   page.screenshot(path=str(root/'renders'/('figure-raptor-'+('fallback' if fallback else 'widget')+'-'+theme+'.png')),full_page=True)
  assert page.locator('.iso-svg').count()>0
  if not fallback: assert page.evaluate("!!document.createElement('canvas').getContext('webgl')")
  page.close()
 browser.close()
server.shutdown()
server.server_close()
assert not errors, errors
print('Production CSP: clean; light/dark messages: correct; WebGL and SVG fallback: passed')
`;
      await box.fs.uploadFile(Buffer.from(script), `${work}/figure-csp.py`);
      const detail = await execute("python figure-csp.py", 120);
      const outputs: Output[] = [];
      for (const mode of ["widget", "fallback"])
        for (const theme of ["light", "dark"])
          outputs.push(
            await download(
              `${work}/renders/figure-raptor-${mode}-${theme}.png`,
              `figure-raptor-${mode}-${theme}.png`,
            ),
          );
      return { detail, outputs };
    },
  );
}
