# python3 sheet.py <run> <out-prefix> [overview_every=4] [detail_every=1] [cols=8]
import json, sys, os
from PIL import Image, ImageDraw, ImageFont
run, out = sys.argv[1], sys.argv[2]
ov_every = int(sys.argv[3]) if len(sys.argv) > 3 else 4
de_every = int(sys.argv[4]) if len(sys.argv) > 4 else 1
cols = int(sys.argv[5]) if len(sys.argv) > 5 else 8
d = os.path.join(os.path.dirname(__file__), 'raw', run)
M = json.load(open(os.path.join(d, 'meta.json')))
dpr = M['dpr']
try:
    font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 18)
    small = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 14)
except Exception:
    font = small = ImageFont.load_default()
frames = M['frames']
def img(i): return Image.open(os.path.join(d, '%03d.png' % frames[i]['i']))
# overview
ov = [f for f in frames if f['i'] % ov_every == 0]
tw = 420; im0 = img(0); th = int(im0.height * tw / im0.width)
oc = 5 if im0.width > im0.height else 8
if im0.width <= im0.height: tw = 220; th = int(im0.height * tw / im0.width)
rows = (len(ov) + oc - 1) // oc
lab = 40
sheet = Image.new('RGB', (oc * (tw + 6), rows * (th + lab + 6)), (255, 255, 255))
dr = ImageDraw.Draw(sheet)
for k, f in enumerate(ov):
    im = img(frames.index(f)).resize((tw, th), Image.LANCZOS)
    x, y = (k % oc) * (tw + 6), (k // oc) * (th + lab + 6)
    sheet.paste(im, (x, y + lab))
    vs = ' '.join('%s:%s' % (v['slug'], v['mode']) for v in f['v'])
    dr.text((x + 2, y + 1), '%.2fs %s' % (f['t'], vs), fill=(0, 0, 0), font=small)
    dr.text((x + 2, y + 19), f['status'].replace('<b>', '').replace('</b>', '')[:40 if tw > 300 else 20], fill=(90, 60, 40), font=small)
sheet.save(out + '-overview.png')
# detail: crops around each visitor, 1 per frame
cells = []
for f in frames:
    if f['i'] % de_every: continue
    g = f['g']; s = g['s']
    for v in f['v']:
        h = max(v['h'], 30) * s * dpr
        cx, gy = v['x'] * s * dpr, (v['y'] * s - g['top']) * dpr
        box = (int(cx - 1.35 * h), int(gy - 1.75 * h), int(cx + 1.35 * h), int(gy + 0.45 * h))
        cells.append((f, v, box))
if cells:
    CH = 230; CW = int(CH * 2.7 / 2.2)
    rows = (len(cells) + cols - 1) // cols
    sh = Image.new('RGB', (cols * (CW + 4), rows * (CH + 22 + 4)), (255, 255, 255))
    dr = ImageDraw.Draw(sh)
    cache = {}
    for k, (f, v, box) in enumerate(cells):
        if f['i'] not in cache: cache = {f['i']: img(frames.index(f))}
        im = cache[f['i']]
        W, H = im.size
        c = Image.new('RGB', (box[2] - box[0], box[3] - box[1]), (200, 200, 200))
        c.paste(im.crop((max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))), (max(0, -box[0]), max(0, -box[1])))
        c = c.resize((CW, CH), Image.LANCZOS)
        x, y = (k % cols) * (CW + 4), (k // cols) * (CH + 26)
        sh.paste(c, (x, y + 22))
        dr.text((x + 2, y + 2), '%.2f %s %s' % (f['t'], v['slug'], v['mode']), fill=(0, 0, 0), font=small)
    sh.save(out + '-detail.png')
    print('detail', len(cells), sh.size)
print('overview', len(ov), sheet.size)
