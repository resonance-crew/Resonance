#!/usr/bin/env python3
# sheet.py <out> <cols> <tileW> <files...> — a labelled contact sheet (label = file name)
import sys, os
from PIL import Image, ImageDraw
out, cols, tw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
files = [f for f in sys.argv[4:] if os.path.exists(f) and os.path.getsize(f) > 0]
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    s = tw / im.width
    ims.append((os.path.basename(f), im.resize((tw, max(1, round(im.height * s))), Image.LANCZOS)))
th = max(i.height for _, i in ims) if ims else 10
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (tw + 6), rows * (th + 18)), 'white')
d = ImageDraw.Draw(sheet)
for k, (name, im) in enumerate(ims):
    x, y = (k % cols) * (tw + 6), (k // cols) * (th + 18)
    sheet.paste(im, (x, y + 16))
    d.text((x + 2, y + 2), name, fill='black')
sheet.save(out, quality=85) if out.endswith('.jpg') else sheet.save(out)
print(out, sheet.size)
