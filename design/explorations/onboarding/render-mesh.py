import sys, numpy as np
from PIL import Image
def hexrgb(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16)/255 for i in (0,2,4)])
def ss(e0,e1,x):
    t=np.clip((x-e0)/(e1-e0),0,1); return t*t*(3-2*t)
def render(t, W=1440, H=900, colors=("#06111f","#ff4f7b","#4f8cff","#ffd166","#20e3b2"), seed=0):
    C=[hexrgb(c) for c in colors]
    xs=(np.arange(W)+0.5)/W; ys=1-(np.arange(H)+0.5)/H
    X,Y=np.meshgrid(xs,ys); X=X*W/H
    s,c=np.sin,np.cos
    P=[(0.52+0.35*s(0.7*t),0.52+0.35*c(0.9*t)),
       (0.48+0.35*s(0.6*t+1.7),0.48+0.35*c(0.8*t+2.3)),
       (0.50+0.38*s(0.9*t+0.7),0.50+0.38*c(0.7*t+1.7)),
       (0.46+0.33*s(0.5*t+2.9),0.46+0.33*c(1.1*t+0.2)),
       (0.50+0.30*s(0.8*t-1.4),0.50+0.30*c(0.6*t-0.9))]
    E=[0.85,0.85,0.90,0.95,0.90]
    col=np.zeros((H,W,3)); ws=np.full((H,W),1e-3)
    for (px,py),e,cc in zip(P,E,C):
        w=ss(e,0.05,np.hypot(X-px,Y-py)); col+=w[...,None]*cc; ws+=w
    col/=ws[...,None]
    rng=np.random.default_rng(seed); col+=(rng.random((H,W))[...,None]-0.5)*0.02
    v=ss(1.1,0.35,np.hypot(X-0.5,Y-0.5)); col*=v[...,None]
    return np.clip(col,0,1)
if __name__=="__main__":
    out=sys.argv[1]
    for t in [float(a) for a in sys.argv[2:]]:
        Image.fromarray((render(t)*255).astype(np.uint8)).save(f"{out}/mesh-t{t}.png")
