# python3 meetsheet.py <name> <out.png> [every=2] [maxcols=12] [cell_h=230] — one row per case, crop around both
import json, sys, os, glob
from PIL import Image, ImageDraw, ImageFont
name, out = sys.argv[1], sys.argv[2]
every = int(sys.argv[3]) if len(sys.argv) > 3 else 2
maxcols = int(sys.argv[4]) if len(sys.argv) > 4 else 12
CH = int(sys.argv[5]) if len(sys.argv) > 5 else 230
only = sys.argv[6] if len(sys.argv) > 6 else None
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw', name)
font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 15)
rows = []
for d in sorted(glob.glob(os.path.join(root, '*', 'meta.json')), key=os.path.getmtime):
    M = json.load(open(d)); dd = os.path.dirname(d); dpr = M['dpr']
    if only and only not in M['name']: continue
    duet = [f for f in M['frames'] if len(f['v']) == 2 and all(v['mode'] == 'duet' for v in f['v'])]
    if not duet: duet = [f for f in M['frames'] if len(f['v']) == 2] or [f for f in M['frames'] if f['v']]
    if not duet: rows.append((M['case'] + ' none', [])); continue
    g = duet[0]['g']; s = g['s']
    xs = [v['x'] for f in duet for v in f['v']]; ys = [v['y'] for f in duet for v in f['v']]
    h = max(v['h'] for f in duet for v in f['v']) * s * dpr
    x0, x1 = min(xs) * s * dpr - 0.9 * h, max(xs) * s * dpr + 0.9 * h
    gy = (max(ys) * s - g['top']) * dpr
    box = (int(x0), int(gy - 1.55 * h), int(x1), int(gy + 0.3 * h))
    sel = [f for f in M['frames'] if f['i'] % every == 0 and f['v']]
    first = next((k for k, f in enumerate(sel) if f in duet or (f['i'] >= duet[0]['i'] - 8)), 0)
    sel = sel[max(0, first):][:maxcols]
    cells = []
    for f in sel:
        im = Image.open(os.path.join(dd, '%03d.png' % f['i'])); W, H = im.size
        c = Image.new('RGB', (box[2] - box[0], box[3] - box[1]), (190, 190, 190))
        c.paste(im.crop((max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))), (max(0, -box[0]), max(0, -box[1])))
        c = c.resize((int(c.width * CH / c.height), CH), Image.LANCZOS)
        cells.append((c, '%.2f %s' % (f['t'], ' '.join(v['mode'][:5] for v in f['v']))))
    rows.append((M['case'] + '  ' + ' | '.join('%s %s' % (e[0], e[1]) for e in M['events'] if 'act' in e[1] or 'meet' in e[1] or 'leave' in e[1])[:200], cells))
CW = max((c.width for _, cs in rows for c, _ in cs), default=200)
ncol = max((len(cs) for _, cs in rows), default=1)
sh = Image.new('RGB', (ncol * (CW + 4), len(rows) * (CH + 44)), (255, 255, 255)); dr = ImageDraw.Draw(sh)
for r, (title, cs) in enumerate(rows):
    y = r * (CH + 44)
    dr.text((4, y + 2), title[:230], fill=(150, 40, 20), font=font)
    for k, (c, lab) in enumerate(cs):
        sh.paste(c, (k * (CW + 4), y + 40)); dr.text((k * (CW + 4) + 2, y + 22), lab, fill=(0, 0, 0), font=font)
sh.save(out); print(sh.size)
