import sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter, FFMpegWriter
plt.rcParams.update({'figure.facecolor':'#181818','axes.facecolor':'#181818','text.color':'#e4e4e4','axes.labelcolor':'#e4e4e4','xtick.color':'#aaaaaa','ytick.color':'#aaaaaa','axes.edgecolor':'#777777','axes.linewidth':0.6,'font.size':10})
x=np.linspace(0,2*np.pi,160)
fig,ax=plt.subplots(figsize=(6.4,3.6),layout='constrained')
line,=ax.plot(x,np.sin(x),color='#a5a2e9',lw=1)
ax.scatter(x[::12],np.sin(x[::12]),s=12,color='#e4e4e4',linewidths=0)
ax.set(xlabel='Time / s',ylabel='Amplitude',title='Harmonic motion',ylim=(-1.3,1.3))
ax.grid(alpha=.12,linewidth=.5)
kind=sys.argv[1]
if kind in ('png','svg'):fig.savefig('renders/matplotlib.'+kind,dpi=200)
else:
 def update(i):line.set_ydata(np.sin(x-i/12));return line,
 anim=FuncAnimation(fig,update,frames=36,interval=1000/18,blit=True)
 anim.save('renders/matplotlib.'+kind,writer=PillowWriter(fps=18) if kind=='gif' else FFMpegWriter(fps=18,codec='libx264',extra_args=['-pix_fmt','yuv420p']),dpi=100)
print('wrote',kind)
