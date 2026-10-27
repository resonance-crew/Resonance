# trim.py <rawDir> <outDir> <scale> <names…> — crops each part to its alpha box (+2 px), prints offsets/sizes in rig units.
import sys, json
from PIL import Image
raw, out, s = sys.argv[1], sys.argv[2], float(sys.argv[3])
res = {}
for name in sys.argv[4:]:
    im = Image.open(f"{raw}/{name}.png").convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v > 3 else 0)
    bb = a.getbbox()
    if not bb:
        res[name] = {'x': 0, 'y': 0, 'w': 0, 'h': 0}
        continue
    x0, y0, x1, y1 = max(bb[0] - 2, 0), max(bb[1] - 2, 0), min(bb[2] + 2, im.width), min(bb[3] + 2, im.height)
    im.crop((x0, y0, x1, y1)).save(f"{out}/{name}.png", optimize=True)
    res[name] = {'x': round(x0 / s, 2), 'y': round(y0 / s, 2), 'w': round((x1 - x0) / s, 2), 'h': round((y1 - y0) / s, 2)}
print(json.dumps(res))
