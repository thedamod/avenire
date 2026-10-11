---
name: sim-double-pendulum
description: Run a two-link pendulum with math.js RK4, a fixed-step loop, pause control, and energy readout.
---

# Double pendulum example

This shows a sensitive dynamical system without adding an elaborate machine. The readout and the drawn rods use one state. Load `simulation`, `style`, and `kit-api`; preview start, pause, and slider reset.

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;font:var(--text-base)/var(--leading-normal) var(--font-sans);color:var(--foreground)}
figure{margin:auto;max-width:700px;padding:var(--space-4);border:var(--stroke-hairline) solid var(--figure-frame);border-radius:var(--radius);background:var(--card)}
h2{margin:0;font-size:var(--text-lg)}p{color:var(--muted-foreground);font-size:var(--text-sm)}
svg{width:100%;height:auto;display:block;background:var(--canvas);border-radius:var(--radius)}.rod{stroke:var(--foreground);stroke-width:var(--stroke-regular)}
.controls{display:flex;gap:var(--space-4);align-items:center;flex-wrap:wrap;margin-top:var(--space-3)}button{font:inherit;padding:var(--space-2);color:var(--secondary-foreground);background:var(--secondary);border:var(--stroke-thin) solid var(--border);border-radius:var(--radius)}
input{accent-color:var(--primary)}:focus-visible{outline:var(--stroke-emphasis) solid var(--ring);outline-offset:2px}output{font:var(--text-sm) var(--font-mono)}
</style></head><body><figure><h2>Double pendulum</h2><p>Change the first starting angle to reset the motion.</p><svg viewBox="0 0 440 300" role="img" aria-label="Two linked pendulum rods"><line id="a" class="rod"/><line id="b" class="rod"/><circle cx="220" cy="68" r="4" fill="var(--foreground)"/><circle id="bob1" r="7" fill="var(--chart-1)"/><circle id="bob2" r="9" fill="var(--chart-2)"/></svg><div class="controls"><label>Start angle <input id="angle" type="range" min="20" max="140" value="90">°</label><button id="toggle" type="button">Pause</button><output id="energy"></output></div><p>Model: two equal masses and lengths, no damping. Energy is in normalized units.</p></figure>
<script type="module">
import { doublePendulum, rk4Step, createRk4Workspace } from '/kits/math.js';
const angle=document.getElementById('angle'),toggle=document.getElementById('toggle'),out=document.getElementById('energy');
let system,state,work,t=0,last=0,acc=0,visible=true,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;last=0}).observe(document.querySelector('figure'));
function reset(){system=doublePendulum({theta1:Number(angle.value)*Math.PI/180,theta2:0.35});state=system.initial;work=createRk4Workspace(state.length);t=0;acc=0;draw()}
function draw(){const [a,b,w1,w2]=state,x1=220+90*Math.sin(a),y1=68+90*Math.cos(a),x2=x1+90*Math.sin(b),y2=y1+90*Math.cos(b);
const set=(id,attrs)=>{const e=document.getElementById(id);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v))};
set('a',{x1:220,y1:68,x2:x1,y2:y1});set('b',{x1,y1,x2,y2});set('bob1',{cx:x1,cy:y1});set('bob2',{cx:x2,cy:y2});
const kinetic=.5*(2*w1*w1+w2*w2+2*w1*w2*Math.cos(a-b));const potential=-9.81*(2*Math.cos(a)+Math.cos(b));
out.textContent=`t ${t.toFixed(1)} s · energy ${(kinetic+potential).toFixed(2)}`;}
angle.addEventListener('input',reset);toggle.addEventListener('click',()=>{playing=!playing;toggle.textContent=playing?'Pause':'Play';last=0});
document.addEventListener('visibilitychange',()=>{last=0});
function frame(now){if(playing&&!document.hidden&&visible){const dt=last?Math.min((now-last)/1000,.05):0;acc+=dt;let steps=0;while(acc>=1/120&&steps++<7){state=rk4Step(system.derivative,t,state,1/120,undefined,work);t+=1/120;acc-=1/120}if(steps>7)acc=0;draw()}last=now;requestAnimationFrame(frame)}
reset();if(!playing)toggle.textContent='Play';requestAnimationFrame(frame);
</script></body></html>
```
