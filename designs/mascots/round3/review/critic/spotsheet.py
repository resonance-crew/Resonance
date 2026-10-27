# python3 spotsheet.py <name> <out.png> [every=2] [maxcols=14] [cell_h=240] — one row per case, crops anchored where it acts
import json, sys, os, glob
from PIL import Image, ImageDraw, ImageFont
name, out = sys.argv[1], sys.argv[2]
every = int(sys.argv[3]) if len(sys.argv) > 3 else 2
maxcols = int(sys.argv[4]) if len(sys.argv) > 4 else 14
CH = int(sys.argv[5]) if len(sys.argv) > 5 else 240
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw', name)
font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 15)
rows = []
for d in sorted(glob.glob(os.path.join(root, '*', 'meta.json')), key=os.path.getmtime):
    M = json.load(open(d)); dd = os.path.dirname(d); dpr = M['dpr']
    fr = [f for f in M['frames'] if f['v']]
    if not fr:
        rows.append((M['case'] + '  (no visitor: ok=%s)' % M['ok'], [])); continue
    act = [f for f in fr if f['v'][0]['mode'] in ('act', 'duet')] or fr
    v0 = act[len(act) // 2]['v'][0]; g = act[len(act) // 2]['g']; s = g['s']
    h = max(f['v'][0]['h'] for f in fr) * s * dpr
    cx = v0['x'] * s * dpr; gy = (v0['y'] * s - g['top']) * dpr
    box = (int(cx - 1.25 * h), int(gy - 1.75 * h), int(cx + 1.25 * h), int(gy + 0.4 * h))
    cells = []
    sel = M['frames'][::every][:maxcols]
    for f in sel:
        im = Image.open(os.path.join(dd, '%03d.png' % f['i'])); W, H = im.size
        c = Image.new('RGB', (box[2] - box[0], box[3] - box[1]), (190, 190, 190))
        c.paste(im.crop((max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))), (max(0, -box[0]), max(0, -box[1])))
        c = c.resize((int(c.width * CH / c.height), CH), Image.LANCZOS)
        lab = '%.2f %s' % (f['t'], f['v'][0]['mode'] if f['v'] else '-')
        cells.append((c, lab))
    rows.append((M['case'] + '   ' + ' | '.join('%s %s' % (e[0], e[1].replace('<b>', '').replace('</b>', '')) for e in M['events'][-6:]), cells))
CW = max((c.width for _, cs in rows for c, _ in cs), default=200)
ncol = max((len(cs) for _, cs in rows), default=1)
sh = Image.new('RGB', (ncol * (CW + 4), len(rows) * (CH + 44)), (255, 255, 255)); dr = ImageDraw.Draw(sh)
for r, (title, cs) in enumerate(rows):
    y = r * (CH + 44)
    dr.text((4, y + 2), title[:220], fill=(150, 40, 20), font=font)
    for k, (c, lab) in enumerate(cs):
        sh.paste(c, (k * (CW + 4), y + 40))
        dr.text((k * (CW + 4) + 2, y + 22), lab, fill=(0, 0, 0), font=font)
sh.save(out); print(sh.size)
