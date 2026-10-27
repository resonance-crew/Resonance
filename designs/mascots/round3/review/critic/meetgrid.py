# python3 meetgrid.py <name> <case-substr> <out.png> <frame idx list or a-b/step> [cols=4] [CH=260] — crop around both, grid
import json, sys, os, glob
from PIL import Image, ImageDraw, ImageFont
name, flt, out, frs = sys.argv[1:5]
cols = int(sys.argv[5]) if len(sys.argv) > 5 else 4
CH = int(sys.argv[6]) if len(sys.argv) > 6 else 260
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw', name)
font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 15)
d = [d for d in glob.glob(os.path.join(root, '*', 'meta.json')) if flt in d][0]
M = json.load(open(d)); dd = os.path.dirname(d); dpr = M['dpr']
duet = [f for f in M['frames'] if len(f['v']) == 2 and all(v['mode'] == 'duet' for v in f['v'])] or [f for f in M['frames'] if f['v']]
g = duet[0]['g']; s = g['s']
xs = [v['x'] for f in duet for v in f['v']]; ys = [v['y'] for f in duet for v in f['v']]
h = max(v['h'] for f in duet for v in f['v']) * s * dpr
box = (int(min(xs) * s * dpr - 0.8 * h), int((max(ys) * s - g['top']) * dpr - 1.5 * h), int(max(xs) * s * dpr + 0.8 * h), int((max(ys) * s - g['top']) * dpr + 0.3 * h))
if '-' in frs:
    ab, st = (frs.split('/') + ['1'])[:2]; a, b = map(int, ab.split('-')); idx = list(range(a, min(b, len(M['frames']) - 1) + 1, int(st)))
else: idx = [int(x) for x in frs.split(',')]
cells = []
ev = M['events']
for i in idx:
    f = M['frames'][i]
    im = Image.open(os.path.join(dd, '%03d.png' % f['i'])); W, H = im.size
    c = Image.new('RGB', (box[2] - box[0], box[3] - box[1]), (190, 190, 190))
    c.paste(im.crop((max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))), (max(0, -box[0]), max(0, -box[1])))
    c = c.resize((int(c.width * CH / c.height), CH), Image.LANCZOS)
    last = [e for e in ev if e[0] <= f['t'] + 1e-6]
    cells.append((c, '%.2f %s' % (f['t'], last[-1][1][:34] if last else '')))
CW = max(c.width for c, _ in cells); rows = (len(cells) + cols - 1) // cols
sh = Image.new('RGB', (cols * (CW + 4), rows * (CH + 24)), (255, 255, 255)); dr = ImageDraw.Draw(sh)
for k, (c, lab) in enumerate(cells):
    x, y = (k % cols) * (CW + 4), (k // cols) * (CH + 24)
    sh.paste(c, (x, y + 22)); dr.text((x + 2, y + 2), lab, fill=(0, 0, 0), font=font)
sh.save(out); print(sh.size, M['case'])
