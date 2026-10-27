# pixels.py — counts, per frame, the pixels inside the clean rects that differ between the stage shown and hidden.
#   python3 -I pixels.py px/badges.json   (rects grown by `grow` px)
import json, sys
from PIL import Image, ImageChops

report = json.load(open(sys.argv[1]))
grow = float(sys.argv[2]) if len(sys.argv) > 2 else 0
for run in report:
    worst = (0, None)
    total = 0
    for f in run['frames']:
        a = Image.open(f + '-on.png').convert('RGB')
        b = Image.open(f + '-off.png').convert('RGB')
        diff = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 24 else 0)
        n = 0
        for r in run['rects']:
            box = (max(0, int(r['x'] - grow)), max(0, int(r['y'] - grow)), min(a.width, int(r['x'] + r['w'] + grow + 0.999)), min(a.height, int(r['y'] + r['h'] + grow + 0.999)))
            if box[2] <= box[0] or box[3] <= box[1]:
                continue
            n += sum(1 for v in diff.crop(box).getdata() if v)
        total += n
        if n > worst[0]:
            worst = (n, f)
    print(f"{run['tag']}: frames {len(run['frames'])}, changed px inside (grow {grow}) total {total}, worst {worst[0]} at {worst[1]}")
