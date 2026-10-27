# outline.py — what build.mjs adds to a cast manifest, read from its part images:
#   torso.hit       the torso's outline as a polygon (fractions of its image box), a little inside the paper: the
#                   engine's pointer shape (never the arms' or legs' transparent corners)
#   torso-alt.reveal  { at: [x, y] rig units, frac }: where torso-alt differs from torso and how much of the torso that
#                   is — a small secret (摺摺's dog-ear) is something a mitten can lift open; a whole new side is not
#   python3 outline.py <cast/slug/>   → prints { "hit": [...], "reveal": {...} | null }
import json, math, os, sys
from PIL import Image

base = sys.argv[1]
m = json.load(open(os.path.join(base, 'manifest.json')))
P = {p['name']: p for p in m['parts']}
S = m.get('scale', 0.8)


def polygon(path, n=32, shrink=0.94):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    a = im.split()[3].load()
    sx = sy = cnt = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if a[x, y] > 128:
                sx += x; sy += y; cnt += 1
    cx, cy = sx / cnt, sy / cnt
    pts = []
    for i in range(n):
        th = 2 * math.pi * i / n
        dx, dy = math.cos(th), math.sin(th)
        r, far = 0.0, 0.0
        while True:
            x, y = cx + dx * r, cy + dy * r
            if x < 0 or y < 0 or x >= w or y >= h:
                break
            if a[int(x), int(y)] > 128:
                far = r
            r += 1
        pts.append([round((cx + dx * far * shrink) / w, 4), round((cy + dy * far * shrink) / h, 4)])
    return pts


def reveal():
    t, alt = P.get('torso'), P.get('torso-alt')
    if not alt or not alt.get('w'):
        return None
    x0, y0 = min(t['x'], alt['x']), min(t['y'], alt['y'])
    x1, y1 = max(t['x'] + t['w'], alt['x'] + alt['w']), max(t['y'] + t['h'], alt['y'] + alt['h'])
    W, H = int((x1 - x0) * S) + 2, int((y1 - y0) * S) + 2
    layers = []
    for p in (t, alt):
        c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        c.alpha_composite(Image.open(os.path.join(base, p['img'])).convert('RGBA'), (round((p['x'] - x0) * S), round((p['y'] - y0) * S)))
        layers.append(c.load())
    a, b = layers
    n = area = sx = sy = 0
    bx0 = by0 = 1e9; bx1 = by1 = -1e9
    diff = []
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            pa, pb = a[x, y], b[x, y]
            if pa[3] > 128:
                area += 1
            if abs(pa[3] - pb[3]) > 100 or (pa[3] > 128 and pb[3] > 128 and sum(abs(pa[i] - pb[i]) for i in range(3)) > 70):
                n += 1; sx += x; sy += y
                bx0, by0, bx1, by1 = min(bx0, x), min(by0, y), max(bx1, x), max(by1, y)
                diff.append((x, y))
    if not n or not area:
        return None
    # spread: the box around what changed, against the torso's own box (a corner is small, a written-over card is not)
    spread = (bx1 - bx0) * (by1 - by0) / (t['w'] * t['h'] * S * S)
    # the tip: where what changed meets the paper's outline (the edge a mitten takes hold of to lift a corner open)
    def outside(x, y):
        return x < 0 or y < 0 or x >= W or y >= H or max(a[x, y][3], b[x, y][3]) <= 128
    r = 7
    rim = [q for q in diff if any(outside(q[0] + dx, q[1] + dy) for dx, dy in ((r, 0), (-r, 0), (0, r), (0, -r), (r, r), (-r, -r), (r, -r), (-r, r)))]
    tx, ty = sx / n, sy / n
    if rim:   # the rim's middle, pushed out to the paper's edge along the line from the torso's middle
        mx, my = sum(q[0] for q in rim) / len(rim), sum(q[1] for q in rim) / len(rim)
        cx, cy = ((t['x'] + t['w'] / 2) - x0) * S, ((t['y'] + t['h'] / 2) - y0) * S
        ux, uy = mx - cx, my - cy; d = math.hypot(ux, uy) or 1; ux, uy = ux / d, uy / d
        tx, ty = max(rim, key=lambda q: (q[0] - cx) * ux + (q[1] - cy) * uy - 0.5 * abs((q[0] - cx) * uy - (q[1] - cy) * ux))
    return {'at': [round(x0 + sx / n / S, 1), round(y0 + sy / n / S, 1)], 'tip': [round(x0 + tx / S, 1), round(y0 + ty / S, 1)],
            'frac': round(n / area, 3) if spread < 0.3 else 1, 'spread': round(spread, 3)}


print(json.dumps({'hit': polygon(os.path.join(base, P['torso']['img'])), 'reveal': reveal()}))
