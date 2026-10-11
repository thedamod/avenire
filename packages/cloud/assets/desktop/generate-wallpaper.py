"""Reproducible 1600x900 RGB PNG, using only the Python standard library."""
import math, struct, zlib
from pathlib import Path
W,H=1600,900
pixels=bytearray()
for y in range(H):
    pixels.append(0)
    for x in range(W):
        glow=math.exp(-(((x-1050)/730)**2+((y-280)/560)**2))
        fold=max(0,1-abs((x+y*.7)-1260)/390)**3
        fine=0.65 if abs((x+y*.7)-1260)<1.2 or abs((x+y*.7)-1480)<1.2 else 0
        pixels.extend(round(v) for v in (12+7*glow+3*fold+fine,17+8*glow+2*fold+fine,31+19*glow+10*fold+fine))
def chunk(kind,data):
    return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data))
Path(__file__).with_name('wallpaper.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',W,H,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels,9))+chunk(b'IEND',b''))
