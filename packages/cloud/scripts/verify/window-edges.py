"""Check the active window's outer frame and retain enlarged edge strips."""
from PIL import Image
from pathlib import Path
import json, re, subprocess, sys

name = sys.argv[1]
window = subprocess.check_output(['xdotool', 'getactivewindow'], text=True).strip()
info = subprocess.check_output(['xwininfo', '-id', window], text=True)
def field(label):
    return int(re.search(label + r':\s*(-?\d+)', info)[1])
x, y, w, h = [field(k) for k in ['Absolute upper-left X', 'Absolute upper-left Y', 'Width', 'Height']]
prop = subprocess.check_output(['xprop', '-id', window, '_NET_FRAME_EXTENTS'], text=True)
left, right, top, bottom = map(int, prop.split('=')[1].split(','))
image = Image.open('renders/'+name+'-x11.png').convert('RGB')
x0, y0 = max(0, x-left), max(0, y-top)
x1, y1 = min(image.width, x+w+right), min(image.height, y+h+bottom)
strips = [image.crop((x0, y0, x1, min(y1,y0+14))), image.crop((x0, max(y0,y1-14), x1, y1)),
          image.crop((x0,y0,min(x1,x0+14),y1)).transpose(Image.Transpose.ROTATE_90),
          image.crop((max(x0,x1-14),y0,x1,y1)).transpose(Image.Transpose.ROTATE_90)]
sheet = Image.new('RGB', (max(s.width for s in strips)*3, sum(s.height for s in strips)*3), '#181818')
offset = 0
for strip in strips:
    enlarged = strip.resize((strip.width*3,strip.height*3), Image.Resampling.NEAREST)
    sheet.paste(enlarged,(0,offset)); offset += enlarged.height
sheet.save('renders/'+name+'-edges.png')
def longest(points):
    best = run = 0
    for point in points:
        run = run+1 if min(image.getpixel(point)) > 110 else 0
        best = max(best,run)
    return best
lengths = []
for inset in range(2):
    lengths += [longest((px,py) for px in range(x0+8,x1-8)) for py in [y0+inset,y1-1-inset]]
    lengths += [longest((px,py) for py in range(y0+8,y1-8)) for px in [x0+inset,x1-1-inset]]
result = {'window':name,'bounds':[x0,y0,x1,y1],'extents':[left,right,top,bottom],'longestLightRun':max(lengths)}
Path('renders/'+name+'-edges.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result))
if '--expect-light' in sys.argv:
    assert max(lengths) >= 20, 'Baseline did not expose a light rim: '+json.dumps(result)
else:
    assert max(lengths) < 20, 'Light window border: '+json.dumps(result)
