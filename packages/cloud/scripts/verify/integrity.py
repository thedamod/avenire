from PIL import Image
from pathlib import Path
import json, subprocess, xml.etree.ElementTree as E, zipfile
for p in Path('renders').glob('*.png'):
 with Image.open(p) as image:image.verify()
with Image.open('renders/matplotlib.png') as image:assert image.size==(1280,720)
with Image.open('renders/matplotlib.gif') as image:assert image.n_frames>1
for name in ['manimgx-plot','manimgx-spatial']:
 data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json','renders/'+name+'.mp4']))
 video=next(s for s in data['streams'] if s['codec_type']=='video')
 assert (video['width'],video['height'],video['r_frame_rate'])==(1280,720,'30/1'),video
 assert float(data['format']['duration'])>=1.9,data
 print(name, '1280x720 30fps', data['format']['duration']+'s')
for p in Path('renders').glob('*.svg'):assert E.parse(p).getroot().tag.endswith('svg')
with zipfile.ZipFile('renders/kicad-gerbers.zip') as z:
 assert z.testzip() is None
 assert len(z.namelist())>=3
 print('Gerbers',len(z.namelist()),'files')
info=subprocess.check_output(['pdfinfo','renders/report.pdf'],text=True)
assert 'Pages:           1' in info,info
print('All PNGs decode; GIF animated; SVGs parse; PDF is one page')
