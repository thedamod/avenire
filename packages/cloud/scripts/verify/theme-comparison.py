from PIL import Image, ImageDraw, ImageFont
names=['Adwaita-dark','Arc-Dark','Graphite-Dark']
image=Image.new('RGB',(2400,492),'#141414');draw=ImageDraw.Draw(image);font=ImageFont.truetype('DejaVuSans.ttf',20)
for i,name in enumerate(names):
    draw.text((i*800+16,10),name,fill='#e4e4e4',font=font)
    with Image.open('renders/theme-'+name+'-x11.png') as source:image.paste(source.resize((800,450)),(i*800,42))
image.save('renders/theme-comparison.png')
