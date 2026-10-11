---
name: anatomy-dial-indicator
description: A dial indicator whose plunger displacement moves a needle and numeric reading together.
---

# Dial indicator example

A compact Avenire-token adaptation of the corresponding Anatomy example. Load `anatomy`, `style`, and `kit-api` before adapting it. The example is standalone HTML for `preview_widget` then `render_widget`; explain the mechanism and the simplified model in prose.

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans)}
.card{border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card);padding:var(--space-4);max-width:700px;margin:auto}
.head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);font-size:var(--text-sm)}
.head strong{font-size:var(--text-lg)}.read{font-family:var(--font-mono);font-size:var(--text-sm);color:var(--foreground)}
.hint,.caption{color:var(--muted-foreground);font-size:var(--text-sm);line-height:var(--leading-normal)}
.stage{min-height:260px;display:grid;place-items:center;margin:var(--space-3) 0}.stage svg{max-width:100%}
.controls{display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap}.controls label{display:flex;gap:var(--space-2);align-items:center;font-size:var(--text-sm)}
input[type=range]{width:min(250px,65vw);accent-color:var(--primary)}button,input[type=text]{font:inherit;border:var(--stroke-thin) solid var(--border);border-radius:calc(var(--radius) / 2);background:var(--secondary);color:var(--secondary-foreground);padding:var(--space-2)}
:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}
</style></head><body class="iso"><figure class="card"><div class="head"><strong>Dial indicator</strong><output class="read" id="readout" aria-live="polite"></output></div><div class="stage" id="stage"></div><div class="controls"><label>Displacement <input id="value" type="range" min="0" max="10" step="0.1" value="4"></label></div><p class="hint">Move the specimen under the plunger</p><figcaption class="caption">The plunger height, needle angle, and readout all derive from the same displacement.</figcaption></figure><script type="module">
import { fitProjection, boxCorners, slabOf, cylinder, solidSvg, lineSvg, lineOnTop, ring, iso, figureSvg, ISO_CSS } from '/kits/iso.js';
const css = document.createElement('style');
css.textContent = ISO_CSS + `.iso{--anatomy-page:var(--background);--anatomy-card:var(--card);--anatomy-text:var(--foreground);--anatomy-strong:var(--foreground);--anatomy-muted:var(--figure-label);--anatomy-paper:var(--card);--anatomy-face:var(--card);--anatomy-top:var(--secondary);--anatomy-shade-0:var(--muted);--anatomy-shade-1:var(--secondary);--anatomy-shade-2:var(--card);--anatomy-shade-3:var(--canvas);--anatomy-lit-top:var(--accent);--anatomy-lit-shade:var(--secondary);--anatomy-hi:var(--foreground);--anatomy-mid:var(--muted-foreground);--anatomy-lo:var(--border);--anatomy-faint:var(--canvas-grid);--anatomy-lit:var(--chart-1);--anatomy-halo:var(--foreground);--anatomy-halo-opacity:.08;--anatomy-dot:var(--foreground);--anatomy-red:var(--destructive);--anatomy-green:var(--chart-4);--anatomy-blue:var(--chart-2);--anatomy-weight:var(--stroke-hairline);--anatomy-mono:var(--font-mono);--anatomy-lift:none}`;
document.head.append(css);
const base={x:-100,y:-55,w:200,d:110,r:6};
const P=fitProjection(boxCorners(base,-8,80),480,260,{pad:30});
const block=(p,z,h,tone='mid',lit=false)=>solidSvg(slabOf(p,z,h,P,6,0.7),{tone,lit});
const round=(x,y,r,z,h,tone='mid',lit=false)=>solidSvg(cylinder(x,y,r,z,h,P,28,0.5),{tone,lit});
const edge=(a,b,z,tone='lo')=>lineSvg(lineOnTop(a,b,z,P),{tone});
const feet=()=>[[-82,-40],[82,-40],[-82,40],[82,40]].map(([x,y])=>round(x,y,5,-8,3,'lo')).join('');
const foundation=()=>feet()+block(base,-5,5,'mid')+block({x:-88,y:-43,w:176,d:86,r:4},0,1,'faint');
const show=(body,label,readout)=>{document.getElementById('stage').innerHTML=figureSvg({width:480,height:260,label,body});document.getElementById('readout').textContent=readout};

const value=document.getElementById('value');
function draw(){const v=Number(value.value);let b=foundation();
b+=block({x:-62,y:-18,w:9,d:34,r:1},1,68,'hi');
b+=block({x:-62,y:-17,w:112,d:5,r:1},64,5,'mid');
b+=round(36,-14,22,68,7,'hi');
const a=-2.4+v/10*4.8;const start=[36,-14],end=[36+18*Math.cos(a),-14+18*Math.sin(a)];
b+=edge(start,end,76,'lit')+lineSvg(ring(36,-14,18,76,P,48),{tone:'lo'});
b+=block({x:-12,y:-18,w:24,d:34,r:2},1,4,'mid');
b+=round(36,-14,2,44+v,24-v,'lit',true);
show(b,'Dial gauge with plunger and needle',v.toFixed(1)+' mm');}
value.addEventListener('input',draw);draw();
</script></body></html>
```
