import sys, os, math
sys.path.insert(0, '..')
from proto import *

DOME = [(410, 318), (452, 326), (498, 352), (536, 400), (561, 466), (570, 545), (563, 618),
        (533, 666), (472, 690), (400, 696), (330, 692), (272, 670), (240, 628), (233, 548),
        (243, 470), (268, 404), (306, 356), (354, 328)]

def bumped(pts, at, h, width, skew=0.0):
    loop = clockwise(resample(catmull(pts, True, 12), 2.5, True))
    nr = normals(loop, True)
    N = len(loop)
    i0 = min(range(N), key=lambda i: math.dist(loop[i], at))
    half = int(width / 2.5 / 2)
    out = list(loop)
    for j in range(-half, half + 1):
        u = j / half
        b = math.exp(-((u - skew) / 0.42) ** 2) * (1 - u * u)
        k = (i0 + j) % N
        out[k] = (loop[k][0] + nr[k][0] * h * b, loop[k][1] + nr[k][1] * h * b)
    apex = out[i0]
    return out, apex, math.degrees(math.atan2(nr[i0][1], nr[i0][0]))

def sil2(loop, a, rot, fill='#3a2a22'):
    feet = [ellipse(334, 702, 41, 19, -6, 60), ellipse(470, 704, 41, 19, 6, 60)]
    return (f'<g transform="rotate({rot} 402 694)"><path fill="{fill}" d="{d_poly(loop)}{d_poly(a) if a else ""}"/></g>'
            f'<path fill="{fill}" d="{"".join(d_poly(f) for f in feet)}"/>')

opts = []
for name, at, h, width, hd, L, turns, p, rot in [
    ('m1 10oclock', (292, 368), 46, 150, None, 260, -1.2, 2.3, 3),
    ('m2 higher', (318, 346), 48, 150, None, 270, -1.2, 2.3, 3),
    ('m3 lower', (270, 398), 44, 160, None, 250, -1.15, 2.2, 3),
    ('m4 up-lean', (306, 356), 50, 150, -118, 280, -1.25, 2.4, 3),
    ('m5 bow in', (306, 356), 50, 150, -128, 270, 1.2, 2.2, 3),
]:
    loop, apex, nd = bumped(DOME, at, h, width)
    head = hd if hd is not None else nd
    # start a little inside the apex, along the normal
    b = (apex[0] - math.cos(math.radians(nd)) * 14, apex[1] - math.sin(math.radians(nd)) * 14)
    a = ant(b, head, L, turns, p=p, w0=30, flare=16)
    opts.append((f'{name} n{nd:.0f}', loop, a, rot))
loop, apex, nd = bumped(DOME, (306, 356), 50, 150)
opts.append(('none', loop, None, 3))
cells = []
for i, (name, loop, a, rot) in enumerate(opts):
    x = i * 260
    cells.append(f'<g transform="translate({x+30} 0) scale(0.3)">{sil2(loop, a, rot)}</g>')
    cells.append(f'<text x="{x + 20}" y="250" font-size="14" font-family="sans-serif">{name}</text>')
    k = 48 / 600
    cells.append(f'<g transform="translate({x + 100} 270) scale({k})">{sil2(loop, a, rot)}</g>')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 340" width="1600" height="340"><rect width="1600" height="340" fill="#f8f2ea"/>{"".join(cells)}</svg>'
open('proto4.svg', 'w').write(svg)
