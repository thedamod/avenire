---
name: explainer-double-pendulum
description: A concise direct physical figure: two linked pendulum rods, native Step/Run/Reset controls, a start-angle slider and an energy readout, using fixed-step RK4.
---

# Double pendulum example

Use `explainer` and `style`. This system explains itself through two rods and bobs; it does not need an unrelated machine or a text panel. The four-state solver and energy use equal 1kg masses and 1m rods. Explanation belongs in chat. The page contains only a short caption and compact controls/readout.

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;color:var(--figure-text);background:var(--figure-page);font:14px/1.5 var(--font-sans)}
figure{max-width:680px;margin:auto;padding:12px}.plate{background:var(--figure-card);border:var(--figure-weight) solid var(--figure-mid);padding:16px}
.corners{display:flex;justify-content:space-between;gap:12px;font:11px/1.4 var(--figure-mono);color:var(--figure-muted)}.title{text-align:right;color:var(--figure-strong)}
svg{display:block;width:100%;height:auto}.rod{stroke:var(--figure-hi);stroke-width:var(--figure-weight);vector-effect:non-scaling-stroke}
.controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0 12px;font:12px var(--figure-mono)}button{font:inherit;color:var(--figure-strong);background:transparent;border:var(--figure-weight) solid var(--figure-mid);padding:6px 10px}
label{display:flex;align-items:center;gap:8px}input{accent-color:var(--figure-lit);max-width:125px}:focus-visible{outline:2px solid var(--figure-hi);outline-offset:3px}
output{font:11px/1.4 var(--figure-mono);color:var(--figure-strong);font-variant-numeric:tabular-nums}figcaption{margin-top:10px;font-size:12px;color:var(--figure-text)}
@media(max-width:440px){.footer{flex-direction:column}.title{max-width:75%}.plate{padding:12px}}
</style></head><body><figure><div class="plate"><div class="corners"><span>Fig 1</span><span class="title">DOUBLE PENDULUM</span></div><svg viewBox="0 0 440 400" role="img" aria-label="Two linked rods with bobs swinging about a fixed pivot"><line x1="200" y1="195" x2="240" y2="195" class="rod"/><line id="a" class="rod"/><line id="b" class="rod"/><circle cx="220" cy="200" r="4" fill="var(--figure-dot)"/><circle id="bob1" r="7" fill="var(--figure-face)" class="rod"/><circle id="bob2" r="9" fill="var(--figure-lit)" class="rod"/></svg><div class="controls"><button id="step" type="button">Step</button><button id="toggle" type="button">Run</button><button id="reset" type="button">Reset</button><label>Start angle <input id="angle" aria-label="First rod starting angle in degrees" type="range" min="20" max="150" value="90"><span id="degrees">90°</span></label></div><div class="corners footer"><span>Change angle · step or run</span><output id="energy" aria-live="off"></output></div></div><figcaption>Two equal 1kg masses on 1m rods, without damping. Small changes to the starting angle can lead to very different paths.</figcaption></figure>
<script type="module">
import { doublePendulum, rk4Step, createRk4Workspace } from '/kits/math.js';
const angle=document.getElementById('angle'),toggle=document.getElementById('toggle'),out=document.getElementById('energy');
let system,state,work,t=0,last=0,acc=0,visible=true,playing=false;
new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;last=0}).observe(document.querySelector('figure'));
function reset(){system=doublePendulum({m1:1,m2:1,l1:1,l2:1,gravity:9.81,theta1:Number(angle.value)*Math.PI/180,theta2:.35});state=system.initial;work=createRk4Workspace(state.length);t=0;acc=0;last=0;document.getElementById('degrees').textContent=angle.value+'°';draw()}
function advance(){state=rk4Step(system.derivative,t,state,1/120,undefined,work);t+=1/120;if(!state.every(Number.isFinite)){playing=false;reset()}}
function draw(){const [a,b,w1,w2]=state,x1=220+90*Math.sin(a),y1=200+90*Math.cos(a),x2=x1+90*Math.sin(b),y2=y1+90*Math.cos(b);
const set=(id,attrs)=>{const e=document.getElementById(id);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v))};
set('a',{x1:220,y1:200,x2:x1,y2:y1});set('b',{x1,y1,x2,y2});set('bob1',{cx:x1,cy:y1});set('bob2',{cx:x2,cy:y2});
const kinetic=.5*(2*w1*w1+w2*w2+2*w1*w2*Math.cos(a-b));const potential=9.81*(3-2*Math.cos(a)-Math.cos(b));
out.textContent=`t ${t.toFixed(1)} s · E ${(kinetic+potential).toFixed(2)} J`;toggle.textContent=playing?'Pause':'Run';}
angle.addEventListener('input',reset);document.getElementById('reset').addEventListener('click',reset);
document.getElementById('step').addEventListener('click',()=>{playing=false;for(let i=0;i<4;i++)advance();acc=0;last=0;draw()});
toggle.addEventListener('click',()=>{playing=!playing;last=0;draw()});document.addEventListener('visibilitychange',()=>{last=0;acc=0});
function frame(now){if(playing&&!document.hidden&&visible){acc+=last?Math.min((now-last)/1000,.05):0;let steps=0;while(acc>=1/120&&steps<6){advance();acc-=1/120;steps++}if(acc>=1/120)acc=0;draw()}last=now;requestAnimationFrame(frame)}
reset();requestAnimationFrame(frame);
</script></body></html>
```

The model starts still in both motion modes, so the learner chooses Step or Run. Its screen coordinates allow every angle without clipping; lengths used for drawing have the same ratio as the solver. Energy includes a constant offset so zero is the lowest hanging state; that does not change the dynamics. Keep these numerical/representation notes in chat, not as extra widget paragraphs.
