"""Three quick silhouette ideas inside direction A (one domain: a small listening creature)."""
import math
import os
import random
from pencil import *

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rng = random.Random(3)

SIL = 'oklch(52% 0.03 55)'
PAPER = 'oklch(96.5% 0.015 75)'


def sil(poly, extra=''):
    return f'<path d="{d_poly(poly)}" fill="{SIL}"{extra}/>'


def eye_dot(x, y, rx=7, ry=10):
    return (f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{PAPER}"/>'
            f'<ellipse cx="{x}" cy="{y + 2}" rx="{rx - 3}" ry="{ry - 4}" fill="oklch(28% 0.03 45)"/>')


parts = []

# 1 — 聽芽: bean body, a fiddlehead "listening sprout" on top, little curl tail
ox = 0
body = clockwise(catmull([(392, 300), (452, 308), (505, 338), (540, 390), (556, 455), (562, 530), (560, 600),
                          (540, 652), (492, 684), (420, 694), (350, 692), (290, 676), (252, 640), (238, 580),
                          (238, 505), (250, 435), (278, 372), (325, 322)], True, 10))
c = turtle((402, 330), -88, 330, -1.3)
W = [lerp(30, 14, i / (len(c) - 1)) for i in range(len(c))]
l, cap, r = tube(c, W)
tail = turtle((540, 650), -10, 110, -0.9)
lt, ct, rt = tube(tail, [lerp(24, 10, i / (len(tail) - 1)) for i in range(len(tail))])
g1 = [sil(l + cap + r[::-1]), sil(lt + ct + rt[::-1]), sil(body),
      sil(ellipse(338, 692, 44, 20)), sil(ellipse(468, 694, 44, 20)),
      sil(ellipse(232, 528, 22, 40, rot=55)), sil(ellipse(572, 590, 20, 38, rot=-15)),
      eye_dot(345, 468), eye_dot(440, 466)]
parts.append(f'<g transform="translate(-30,0) scale(0.66)">{"".join(g1)}</g>')

# 2 — 垂葉: a low wide dome with two long leaf-flaps hanging to the ground
dome = clockwise(catmull([(400, 420), (480, 428), (545, 470), (575, 560), (570, 650), (520, 690), (400, 698),
                          (280, 690), (230, 650), (225, 560), (255, 470), (320, 428)], True, 10))
leafL = clockwise(catmull([(300, 440), (262, 470), (222, 560), (205, 650), (215, 705), (240, 700), (262, 640),
                           (285, 540), (318, 462)], True, 10))
leafR = [(800 - x, y) for x, y in leafL]
g2 = [sil(dome), sil(leafL), sil(leafR[::-1]), eye_dot(365, 560, 6, 8), eye_dot(435, 560, 6, 8),
      sil(ellipse(350, 702, 36, 14)), sil(ellipse(450, 702, 36, 14))]
parts.append(f'<g transform="translate(430,0) scale(0.66)">{"".join(g2)}</g>')

# 3 — 高腳: a round fluffy body up on two long thin legs, a long plume tail
ball = clockwise(ellipse(400, 380, 120, 112, n=90, rng=rng, wob=0.035))
legL = pencil_stroke(catmull([(370, 470), (360, 580), (352, 690)], False, 10), 14, rng, 0.02, 0.02, 0.1, 0.9)
legR = pencil_stroke(catmull([(430, 470), (442, 580), (450, 690)], False, 10), 14, rng, 0.02, 0.02, 0.1, 0.9)
plume = clockwise(catmull([(500, 420), (560, 430), (630, 380), (660, 300), (640, 250), (610, 310), (560, 360),
                           (505, 380)], True, 10))
g3 = [sil(plume), sil(legL), sil(legR), sil(ball), sil(ellipse(345, 694, 26, 10)), sil(ellipse(458, 694, 26, 10)),
      eye_dot(370, 370), eye_dot(432, 368)]
parts.append(f'<g transform="translate(880,0) scale(0.66)">{"".join(g3)}</g>')

labels = [(235, '① 聽芽：頭上一根會捲會伸的聽芽'), (695, '② 垂葉：兩片垂到地面的葉狀耳'), (1145, '③ 高腳：長腿上的一團絨球')]
txt = ''.join(f'<text x="{x}" y="540" text-anchor="middle" font-size="20" fill="oklch(36% 0.04 50)" '
              f'font-family="PingFang TC, Noto Sans TC, sans-serif">{t}</text>' for x, t in labels)
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 580">'
       f'<rect width="1400" height="580" fill="{PAPER}"/>{"".join(parts)}{txt}</svg>')
open(os.path.join(OUT, 'explore.svg'), 'w').write(svg)
print('ok')
