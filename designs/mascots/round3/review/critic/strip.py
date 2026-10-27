# python3 strip.py <name> <out.png> "<casefilter,...>" <frames: a-b/step or i,j,k> [CH=300] [zoom=1.0]
# rows = cases whose key contains a filter; columns = chosen frame indices; crop anchored where the visitor acts
import json, sys, os, glob
from PIL import Image, ImageDraw, ImageFont
name, out, filt, frs = sys.argv[1:5]
CH = int(sys.argv[5]) if len(sys.argv) > 5 else 300
zoom = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'raw', name)
font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 15)
def pick(n):
    if '-' in frs:
        ab, st = (frs.split('/') + ['1'])[:2]; a, b = map(int, ab.split('-')); return [i for i in range(a, min(b, n - 1) + 1, int(st))]
    return [int(x) for x in frs.split(',') if int(x) < n]
rows = []
metas = sorted(glob.glob(os.path.join(root, '*', 'meta.json')), key=os.path.getmtime)
for flt in filt.split(','):
    for d in metas:
        M = json.load(open(d))
        if flt not in M['name']: continue
        dd = os.path.dirname(d); dpr = M['dpr']; fr = [f for f in M['frames'] if f['v']]
        if not fr: rows.append((M['name'] + ' (none)', [])); continue
        act = [f for f in fr if f['v'][0]['mode'] in ('act', 'duet')] or fr
        mid = act[len(act) // 2]; v0 = mid['v'][0]; g = mid['g']; s = g['s']
        h = max(f['v'][0]['h'] for f in fr) * s * dpr * zoom
        cx = v0['x'] * s * dpr; gy = (v0['y'] * s - g['top']) * dpr
        box = (int(cx - 1.15 * h), int(gy - 1.6 * h), int(cx + 1.15 * h), int(gy + 0.35 * h))
        cells = []
        for i in pick(len(M['frames'])):
            f = M['frames'][i]
            im = Image.open(os.path.join(dd, '%03d.png' % f['i'])); W, H = im.size
            c = Image.new('RGB', (box[2] - box[0], box[3] - box[1]), (190, 190, 190))
            c.paste(im.crop((max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))), (max(0, -box[0]), max(0, -box[1])))
            c = c.resize((int(c.width * CH / c.height), CH), Image.LANCZOS)
            cells.append((c, '%.2f %s' % (f['t'], f['v'][0]['mode'] if f['v'] else '-')))
        ev = ' | '.join('%s %s' % (e[0], e[1].replace('<b>', '').replace('</b>', '')) for e in M['events'][-6:])
        rows.append((M['name'] + '  ' + ev, cells))
CW = max((c.width for _, cs in rows for c, _ in cs), default=200)
ncol = max((len(cs) for _, cs in rows), default=1)
sh = Image.new('RGB', (ncol * (CW + 4), len(rows) * (CH + 44)), (255, 255, 255)); dr = ImageDraw.Draw(sh)
for r, (title, cs) in enumerate(rows):
    y = r * (CH + 44); dr.text((4, y + 2), title[:200], fill=(150, 40, 20), font=font)
    for k, (c, lab) in enumerate(cs):
        sh.paste(c, (k * (CW + 4), y + 40)); dr.text((k * (CW + 4) + 2, y + 22), lab, fill=(0, 0, 0), font=font)
sh.save(out); print(sh.size)
