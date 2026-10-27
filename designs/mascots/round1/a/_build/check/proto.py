"""Silhouette prototypes for the v2 sprout placement (not a deliverable)."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pencil import *

V1 = [(402, 318), (444, 326), (492, 352), (532, 400), (559, 466), (569, 545), (563, 618),
      (533, 666), (472, 690), (400, 696), (330, 692), (272, 670), (240, 628), (234, 548),
      (245, 470), (274, 404), (314, 354), (360, 327)]

# v2: the upper-left shoulder rises into a short thick neck (the sprout's sheath)
V2 = [(424, 334), (470, 344), (510, 372), (543, 416), (563, 476), (570, 548), (563, 618),
      (533, 666), (472, 690), (400, 696), (330, 692), (272, 670), (240, 628), (232, 548),
      (238, 474), (252, 414), (266, 362), (280, 318), (300, 292), (326, 288), (342, 304),
      (362, 326), (390, 334)]


def ant(base, heading, L, turns, w0=29, wm=18, wc=29, w1=19, p=2.1, flare=14):
    c = resample(turtle(base, heading, L, turns, p=p), 2.0, False)
    N = len(c)
    W = []
    for i in range(N):
        u = i / (N - 1)
        if u < 0.5:
            w = lerp(w0, wm, smooth(u / 0.5))
        elif u < 0.84:
            w = lerp(wm, wc, smooth((u - 0.5) / 0.34))
        else:
            w = lerp(wc, w1, smooth((u - 0.84) / 0.16))
        if u < 0.12:
            w += (0.12 - u) / 0.12 * flare
        W.append(w)
    l, cap, r = tube(c, W)
    return l + cap + r[::-1]


def sil(body, a, rot, fill='#3a2a22'):
    loop = clockwise(resample(catmull(body, True, 12), 2.5, True))
    feet = [ellipse(334, 702, 41, 19, -6, 60), ellipse(470, 704, 41, 19, 6, 60)]
    return (f'<g transform="rotate({rot} 402 694)"><path fill="{fill}" d="{d_poly(loop)}{d_poly(a) if a else ""}"/></g>'
            f'<path fill="{fill}" d="{"".join(d_poly(f) for f in feet)}"/>')


opts = [
    ('v1', V1, ant((402, 352), -80, 400, -1.32), -4),
    ('a crook in', V2, ant((306, 316), -112, 300, 1.2, p=2.2), 3),
    ('b ear out', V2, ant((306, 316), -78, 300, -1.25, p=2.2), 3),
    ('c lean out bow', V2, ant((304, 318), -128, 290, 1.15, p=2.0), 3),
    ('d short bow', V2, ant((304, 318), -120, 250, 1.05, p=2.0), 4),
    ('e no sprout', V2, None, 3),
]
cells = []
for i, (name, body, a, rot) in enumerate(opts):
    x = i * 260
    cells.append(f'<g transform="translate({x} 0) scale(0.3)">{sil(body, a, rot)}</g>')
    cells.append(f'<text x="{x + 20}" y="250" font-size="14" font-family="sans-serif">{name}</text>')
    # 48 px tall version
    k = 48 / 600
    cells.append(f'<g transform="translate({x + 100} 270) scale({k})">{sil(body, a, rot)}</g>')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 340" width="1600" height="340"><rect width="1600" height="340" fill="#f8f2ea"/>{"".join(cells)}</svg>'
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'proto.svg'), 'w').write(svg)
print('ok')
