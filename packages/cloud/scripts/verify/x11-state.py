"""Read XSETTINGS and XFixes from the live X server, without Python dependencies."""
import ctypes as C, struct, json, os
x=C.CDLL('libX11.so.6'); x.XOpenDisplay.restype=C.c_void_p;d=x.XOpenDisplay(None);assert d
x.XInternAtom.argtypes=[C.c_void_p,C.c_char_p,C.c_int];x.XInternAtom.restype=C.c_ulong
x.XGetSelectionOwner.argtypes=[C.c_void_p,C.c_ulong];x.XGetSelectionOwner.restype=C.c_ulong
owner=x.XGetSelectionOwner(d,x.XInternAtom(d,b'_XSETTINGS_S0',False));assert owner
actual=C.c_ulong();fmt=C.c_int();count=C.c_ulong();remaining=C.c_ulong();data=C.POINTER(C.c_ubyte)()
x.XGetWindowProperty.argtypes=[C.c_void_p,C.c_ulong,C.c_ulong,C.c_long,C.c_long,C.c_int,C.c_ulong,C.POINTER(C.c_ulong),C.POINTER(C.c_int),C.POINTER(C.c_ulong),C.POINTER(C.c_ulong),C.POINTER(C.POINTER(C.c_ubyte))]
assert x.XGetWindowProperty(d,owner,x.XInternAtom(d,b'_XSETTINGS_SETTINGS',False),0,16384,False,0,C.byref(actual),C.byref(fmt),C.byref(count),C.byref(remaining),C.byref(data))==0
raw=C.string_at(data,count.value);endian='<' if raw[0]==0 else '>';n=struct.unpack_from(endian+'I',raw,8)[0];pos=12;settings={}
for _ in range(n):
    kind=raw[pos];length=struct.unpack_from(endian+'H',raw,pos+2)[0];pos+=4
    name=raw[pos:pos+length].decode();pos+=(length+3)//4*4;pos+=4
    if kind==0:value=struct.unpack_from(endian+'i',raw,pos)[0];pos+=4
    elif kind==1:
        size=struct.unpack_from(endian+'I',raw,pos)[0];pos+=4;value=raw[pos:pos+size].decode();pos+=(size+3)//4*4
    else:value=list(struct.unpack_from(endian+'4H',raw,pos));pos+=8
    settings[name]=value
assert settings['Xft/DPI']==98304,settings
assert settings['Gdk/WindowScalingFactor']==1,settings
assert settings['Gtk/CursorThemeSize']==24,settings
assert settings['Gtk/CursorThemeName']=='Bibata-Modern-Ice',settings
class Cursor(C.Structure):
    _fields_=[('x',C.c_short),('y',C.c_short),('width',C.c_ushort),('height',C.c_ushort),('xhot',C.c_ushort),('yhot',C.c_ushort),('serial',C.c_ulong),('pixels',C.POINTER(C.c_ulong)),('atom',C.c_ulong),('name',C.c_char_p)]
f=C.CDLL('libXfixes.so.3');f.XFixesGetCursorImage.argtypes=[C.c_void_p];f.XFixesGetCursorImage.restype=C.POINTER(Cursor)
cur=f.XFixesGetCursorImage(d).contents
result={'settings':settings,'cursor':{k:getattr(cur,k) for k in ['x','y','width','height','xhot','yhot']},'name':cur.name.decode() if cur.name else None,'themeEnvironment':os.getenv('XCURSOR_THEME'),'sizeEnvironment':os.getenv('XCURSOR_SIZE')}
print(json.dumps(result,indent=2))
