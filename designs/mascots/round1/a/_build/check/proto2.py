import sys, os
sys.path.insert(0, '..')
from proto import *

# f: a side "ear": the neck leaves the upper-left side of the head at ~-130°
F = [(410, 322), (456, 330), (500, 356), (536, 402), (560, 466), (570, 548), (563, 618),
     (533, 666), (472, 690), (400, 696), (330, 692), (272, 670), (240, 628), (232, 548),
     (236, 478), (232, 430), (222, 392), (214, 360), (222, 340), (246, 336), (280, 344), (316, 336), (360, 324)]
# g: two lobes: the crown dome right of centre, a lower shoulder lobe on the left with a notch between
G = [(430, 320), (474, 330), (512, 356), (544, 402), (563, 470), (570, 548), (563, 618),
     (533, 666), (472, 690), (400, 696), (330, 692), (272, 670), (240, 628), (232, 548),
     (236, 474), (246, 410), (262, 362), (282, 330), (310, 316), (338, 322), (360, 338), (384, 332)]
# h: a bulb whose off-centre top tapers into the shoot
H = [(390, 330), (444, 334), (494, 358), (532, 404), (559, 466), (569, 545), (563, 618),
     (533, 666), (472, 690), (400, 696), (330, 692), (272, 670), (240, 628), (234, 548),
     (242, 470), (258, 400), (276, 340), (292, 296), (308, 270), (326, 280), (346, 310)]
opts = [
    ('f side ear', F, ant((236, 360), -128, 260, 1.1, p=2.0), 3),
    ('f2 side ear out', F, ant((236, 360), -118, 260, -1.15, p=2.0), 3),
    ('g lobe crook', G, ant((300, 336), -112, 270, 1.15, p=2.0, w0=34, flare=18), 4),
    ('g2 lobe lean', G, ant((300, 336), -122, 270, 1.05, p=1.8, w0=34, flare=18), 4),
    ('h bulb shoot', H, ant((308, 290), -110, 250, 1.1, p=2.0, w0=26, flare=10), 3),
    ('g no sprout', G, None, 4),
]
cells = []
for i, (name, body, a, rot) in enumerate(opts):
    x = i * 260
    cells.append(f'<g transform="translate({x} 0) scale(0.3)">{sil(body, a, rot)}</g>')
    cells.append(f'<text x="{x + 20}" y="250" font-size="14" font-family="sans-serif">{name}</text>')
    k = 48 / 600
    cells.append(f'<g transform="translate({x + 100} 270) scale({k})">{sil(body, a, rot)}</g>')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 340" width="1600" height="340"><rect width="1600" height="340" fill="#f8f2ea"/>{"".join(cells)}</svg>'
open('proto2.svg', 'w').write(svg)
