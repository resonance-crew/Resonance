import math, sys
from PIL import Image
def lin(c):
    c=c/255
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def oklch(rgb):
    r,g,b=[lin(x) for x in rgb]
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b
    m=0.2119034982*r+0.6806995451*g+0.1073969566*b
    s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l,m,s=[x**(1/3) for x in (l,m,s)]
    L=0.2104542553*l+0.7936177850*m-0.0040720468*s
    a=1.9779984951*l-2.4285922050*m+0.4505937099*s
    bb=0.0259040371*l+0.7827717662*m-0.8086757660*s
    return round(L*100,1), round(math.hypot(a,bb),4), round(math.degrees(math.atan2(bb,a))%360,0)
def sample(f, boxes):
    im=Image.open(f).convert('RGB'); print(f, im.size)
    for bx in boxes:
        reg=im.crop(bx); px=list(reg.getdata()); n=len(px)
        avg=tuple(sum(p[i] for p in px)/n for i in range(3))
        print(bx, [round(x,1) for x in avg], oklch(avg))
if __name__=='__main__':
    f=sys.argv[1]; boxes=[tuple(int(v) for v in b.split(',')) for b in sys.argv[2:]]
    sample(f, boxes)
