# Silhouette area and bounding box of each rest.png (alpha > 40), relative to Tuck, plus stage width at Tuck = 120 px.
import sys
from PIL import Image
R = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3'
def m(path):
    im = Image.open(path).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    bb = a.getbbox()
    n = sum(1 for v in a.getdata() if v)
    return n, bb
tn, tb = m(f'{R}/tuck/parts/rest.png')
k = 120 / (420 * 0.8)   # px per rest.png px at Tuck = 120
for name, p in [('tuck', f'{R}/tuck/parts/rest.png'), ('card v1', f'{R}/card/v1/parts/rest.png'), ('card', f'{R}/card/parts/rest.png')] + [(a, a) for a in sys.argv[1:]]:
    n, bb = m(p)
    print(f'{name:10s} area {n/tn:.3f}x Tuck  bbox {bb[2]-bb[0]}x{bb[3]-bb[1]}  stage {(bb[2]-bb[0])*k:.0f}x{(bb[3]-bb[1])*k:.0f} px (phone {(bb[2]-bb[0])*k*88/120:.0f})')
