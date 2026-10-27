import sys, os
sys.path.insert(0, '..')
from proto import *

K = [(420, 322), (462, 330), (504, 356), (538, 402), (561, 466), (570, 548), (563, 618),
     (533, 666), (472, 690), (400, 696), (330, 692), (272, 670), (240, 628), (232, 548),
     (234, 486), (230, 432), (220, 388), (212, 356), (220, 334), (244, 326), (284, 326), (330, 324), (376, 320)]
K2 = [(424, 326), (466, 334), (506, 360), (539, 404), (561, 468), (570, 548), (563, 618),
     (533, 666), (472, 690), (400, 696), (330, 692), (272, 670), (240, 628), (232, 548),
     (236, 490), (236, 446), (230, 408), (222, 376), (226, 350), (248, 338), (290, 334), (340, 330), (384, 324)]
opts = [
    ('k -120 out', K, ant((236, 350), -120, 270, -1.2, p=2.2, w0=32, flare=16), 3),
    ('k -105 out', K, ant((236, 350), -105, 280, -1.2, p=2.4, w0=32, flare=16), 3),
    ('k -132 out', K, ant((232, 352), -132, 260, -1.15, p=2.2, w0=32, flare=16), 3),
    ('k2 -112 out', K2, ant((244, 362), -112, 280, -1.22, p=2.3, w0=32, flare=18), 3),
    ('k2 -100 short', K2, ant((244, 362), -100, 240, -1.2, p=2.3, w0=32, flare=18), 4),
    ('k2 none', K2, None, 3),
]
cells = []
for i, (name, body, a, rot) in enumerate(opts):
    x = i * 260
    cells.append(f'<g transform="translate({x+30} 0) scale(0.3)">{sil(body, a, rot)}</g>')
    cells.append(f'<text x="{x + 20}" y="250" font-size="14" font-family="sans-serif">{name}</text>')
    k = 48 / 600
    cells.append(f'<g transform="translate({x + 100} 270) scale({k})">{sil(body, a, rot)}</g>')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 340" width="1600" height="340"><rect width="1600" height="340" fill="#f8f2ea"/>{"".join(cells)}</svg>'
open('proto3.svg', 'w').write(svg)
