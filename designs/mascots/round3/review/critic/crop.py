# python3 crop.py <run> <out.png> <cols> <frame-index,...> [slug] [pad]  — big crops around a visitor (or the frame centre)
import json, sys, os
from PIL import Image, ImageDraw, ImageFont
run, out, cols = sys.argv[1], sys.argv[2], int(sys.argv[3])
idx = [int(x) for x in sys.argv[4].split(',')]
slug = sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] != '-' else None
pad = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw', run)
M = json.load(open(os.path.join(d, 'meta.json'))); dpr = M['dpr']
font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 16)
cells = []
for i in idx:
    f = M['frames'][i]; g = f['g']; s = g['s']
    im = Image.open(os.path.join(d, '%03d.png' % f['i']))
    vs = [v for v in f['v'] if not slug or v['slug'] == slug]
    if not vs: continue
    if len(vs) == 2 and not slug:
        xs = [v['x'] for v in vs]; h = max(v['h'] for v in vs) * s * dpr
        cx = (sum(xs) / 2) * s * dpr; gy = (max(v['y'] for v in vs) * s - g['top']) * dpr
        half = (abs(xs[0] - xs[1]) / 2 * s * dpr) + 1.2 * h
    else:
        v = vs[0]; h = max(v['h'], 30) * s * dpr
        cx, gy = v['x'] * s * dpr, (v['y'] * s - g['top']) * dpr; half = 1.3 * h * pad
    box = (int(cx - half), int(gy - 1.7 * h * pad), int(cx + half), int(gy + 0.45 * h * pad))
    c = Image.new('RGB', (box[2] - box[0], box[3] - box[1]), (200, 200, 200))
    W, H = im.size
    c.paste(im.crop((max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))), (max(0, -box[0]), max(0, -box[1])))
    cells.append((f, c, vs))
CH = max(c.height for _, c, _ in cells); CH = min(CH, 420)
scaled = [(f, c.resize((int(c.width * CH / c.height), CH), Image.LANCZOS), vs) for f, c, vs in cells]
CW = max(c.width for _, c, _ in scaled)
rows = (len(scaled) + cols - 1) // cols
sh = Image.new('RGB', (cols * (CW + 6), rows * (CH + 26)), (255, 255, 255)); dr = ImageDraw.Draw(sh)
for k, (f, c, vs) in enumerate(scaled):
    x, y = (k % cols) * (CW + 6), (k // cols) * (CH + 26)
    sh.paste(c, (x, y + 22))
    dr.text((x + 2, y + 2), '%.2fs ' % f['t'] + ' '.join('%s:%s' % (v['slug'], v['mode']) for v in vs) + '  ' + f['status'].replace('<b>', '').replace('</b>', '')[:30], fill=(0, 0, 0), font=font)
sh.save(out); print(sh.size)
