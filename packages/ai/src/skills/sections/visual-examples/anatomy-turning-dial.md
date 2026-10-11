---
name: anatomy-turning-dial
description: A turning combination dial carries a small hand and a detachable pod.
---

# Turning dial example

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
</style></head><body class="iso"><figure class="card"><div class="head"><strong>Turning dial</strong><output class="read" id="readout" aria-live="polite"></output></div><div class="stage" id="stage"></div><div class="controls"><label>Dial <input id="angle" type="range" min="0" max="360" value="0"></label><button id="pod" type="button">Detach pod</button></div><p class="hint">Turn the dial; detach the pod</p><figcaption class="caption">The pointer and hand rotate from one angle. The pod can detach; a real assembly would need a joint and clearance audit.</figcaption></figure><script type="module">
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

let detached=false;const angle=document.getElementById('angle');
function draw(){const a=Number(angle.value)*Math.PI/180;let b=foundation();
b+=round(0,0,38,4,8,'hi');b+=lineSvg(ring(0,0,31,13,P,60),{tone:'lo'});
for(let i=0;i<12;i++){const t=i*Math.PI/6;b+=edge([30*Math.cos(t),30*Math.sin(t)],[36*Math.cos(t),36*Math.sin(t)],13,'lo');}
b+=round(0,0,8,13,4,'lit',true);
b+=edge([0,0],[27*Math.cos(a),27*Math.sin(a)],18,'lit');
const handX=18*Math.cos(a),handY=18*Math.sin(a);b+=round(handX,handY,5,18,6,'mid');
b+=block({x:handX-3,y:handY-2,w:20,d:4,r:1},24,3,'hi');
b+=round(detached?70:handX+20,detached?30:handY,5,20,6,detached?'lo':'lit',!detached);
show(b,'Combination dial with a rotating hand and detachable pod',`${Math.round(Number(angle.value)/3.6)%100} · ${detached?'pod detached':'pod attached'}`);}
angle.addEventListener('input',draw);document.getElementById('pod').addEventListener('click',e=>{detached=!detached;e.currentTarget.textContent=detached?'Attach pod':'Detach pod';draw()});draw();
</script></body></html>
```
