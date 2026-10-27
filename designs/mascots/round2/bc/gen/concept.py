#!/usr/bin/env python3
"""Concept sheet for 片片 Flick (1600 x 1000). Run: python3 -I gen/concept.py -> concept.svg"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import filters, hatch, paths, ellipse_pts, pencil_line, spline
from flick import build, PAL

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')

CREAM = 'oklch(96.5% 0.015 75)'
CREAM2 = 'oklch(94.6% 0.017 72)'
NIGHT = 'oklch(21% 0.012 60)'
INK = 'oklch(26% 0.03 60)'
SOFT = 'oklch(50% 0.025 60)'
FONT = "font-family=\"'PingFang TC','Noto Sans TC',sans-serif\""

# the character's own extent in its 800 box (fan top to sole), for "N px tall" scaling
TOP, BOTTOM = 132, 746
H = BOTTOM - TOP


def place(ref, cx, y, height, extra=''):
    """<use> the main character so that it stands `height` px tall, centred on cx, its top at y."""
    k = height / H
    return f'<use href="#{ref}" transform="translate({cx - 400 * k:.1f},{y - TOP * k:.1f}) scale({k:.4f})"{extra}/>'


def text(x, y, s, size=15, color=SOFT, weight=400, anchor='start'):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}" {FONT}>{s}</text>'


def main():
    d_main, s_main = build('bc-', 'main')
    d_m, s_m = build('bc-t1-', 'moved')
    d_s, s_s = build('bc-t2-', 'shy')

    paper_grain = '''<filter id="bc-sheet-grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="17" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.33  0 0 0 -1.6 0.95" result="g"/>
    <feComposite in="g" in2="SourceGraphic" operator="in"/>
  </filter>'''

    # a faint pencil ground line under the main illustration
    ground = pencil_line(spline([(130, 905), (420, 902), (700, 906), (880, 903)], 6, closed=False), 7, passes=2, spread=0.8)
    ground_svg = (f'<g style="stroke:{PAL["shadow_ground"]}" stroke-width="2" fill="none" opacity="0.35" filter="url(#bc-graphite)">'
                  + ''.join(f'<path d="{d}"/>' for d in ground) + '</g>')

    # divider: a hand-drawn wavy rule
    wv = [(1000 + (6 if i % 2 else -6), 30 + i * 47) for i in range(21)]
    divider = (f'<g style="stroke:{SOFT}" stroke-width="1.6" fill="none" opacity="0.45" filter="url(#bc-graphite)">'
               + ''.join(f'<path d="{d}"/>' for d in pencil_line(spline(wv, 8, closed=False), 3, passes=1, spread=0.4)) + '</g>')

    def frame(x, y, w, h, fillc, label=None, sub=None):
        out = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fillc}"/>'
        return out

    k_main = 1.14
    main_svg = f'<g transform="translate({500 - 400 * k_main:.1f},{906 - 742 * k_main:.1f}) scale({k_main})"><g id="bc-flick">{s_main}</g></g>'

    # thumbnails: each pose in its own 800 box, scaled into 250 frames
    def thumb(svg, x, y, size=250):
        k = size / 800 * 1.12
        return f'<g transform="translate({x + size / 2 - 400 * k:.1f},{y + size - 30 - 742 * k:.1f}) scale({k:.4f})">{svg}</g>'

    R = 1040  # right column x

    parts = [f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1600 1000" width="1600" height="1000">
<defs>{filters()}
{paper_grain}
<clipPath id="bc-clip-night"><rect x="{R}" y="300" width="250" height="250" rx="14"/></clipPath>
<clipPath id="bc-clip-t1"><rect x="{R}" y="640" width="250" height="250" rx="14"/></clipPath>
<clipPath id="bc-clip-t2"><rect x="{R + 280}" y="640" width="250" height="250" rx="14"/></clipPath>
{d_main}
{d_m}
{d_s}
</defs>
<rect width="1600" height="1000" fill="{CREAM}"/>
<rect x="1000" width="600" height="1000" fill="{CREAM2}"/>
<rect width="1600" height="1000" fill="#fff" filter="url(#bc-sheet-grain)" opacity="0.5"/>
{divider}
''']

    # ---- left: the main illustration
    parts.append(text(60, 92, '片片', 46, INK, 700) + text(170, 92, 'Flick', 30, SOFT, 400))
    parts.append(text(60, 130, '一個用色鉛筆上色的剪紙小傢伙。腦後用一顆銅釘別著三張故事卡，聽到故事時，卡片會繞著銅釘扇開', 17, SOFT))
    parts.append(ground_svg)
    parts.append(f'<g id="bc-main-art">{main_svg}</g>')
    parts.append(text(60, 960, 'B×C｜色鉛筆剪紙貼紙（第二輪修訂）　·　主姿勢「嗨！」：前臂從紙袖套下滑出、舉過頭，故事卡半開（好奇）', 14, SOFT))

    # ---- right (a): scale test
    parts.append(text(R, 62, 'a｜縮小測試', 16, INK, 600))
    parts.append(place('bc-flick', R + 55, 100, 96))
    parts.append(place('bc-flick', R + 165, 148, 48))
    parts.append(place('bc-flick', R + 290, 100, 96, ' filter="url(#bc-sil)"'))
    parts.append(place('bc-flick', R + 405, 148, 48, ' filter="url(#bc-sil)"'))
    parts.append(text(R + 55, 222, '96 px', 13, anchor='middle') + text(R + 165, 222, '48 px', 13, anchor='middle')
                 + text(R + 290, 222, '剪影 96', 13, anchor='middle') + text(R + 405, 222, '剪影 48', 13, anchor='middle'))

    # ---- right (b): night paper
    parts.append(text(R, 284, 'b｜夜紙 oklch(21% 0.012 60)', 16, INK, 600))
    parts.append(f'<rect x="{R}" y="300" width="250" height="250" rx="14" fill="{NIGHT}"/>')
    parts.append(f'<g clip-path="url(#bc-clip-night)">{place("bc-flick", R + 125, 322, 206)}</g>')
    # the fan as a feeling scale (a few small words)
    notes = [('標誌：一顆銅釘別住的三張故事卡', INK, 15, 600),
             ('收起　轉進頭後：安靜、害羞', SOFT, 14, 400),
             ('半開　好奇、在聽', SOFT, 14, 400),
             ('全開　被故事打動', SOFT, 14, 400),
             ('', SOFT, 14, 400),
             ('手：肩上一截紙袖套，銅釘是肩膀，', SOFT, 14, 400),
             ('前臂從袖套下滑出，舉到頭頂', SOFT, 14, 400)]
    for i, (t, c, sz, wt) in enumerate(notes):
        if t:
            parts.append(text(R + 280, 330 + i * 27, t, sz, c, wt))

    # ---- right (c): two poses
    parts.append(text(R, 624, 'c｜被故事打動', 16, INK, 600) + text(R + 280, 624, '害羞・卡片收起', 16, INK, 600))
    parts.append(f'<rect x="{R}" y="640" width="250" height="250" rx="14" fill="{CREAM}"/>')
    parts.append(f'<rect x="{R + 280}" y="640" width="250" height="250" rx="14" fill="{CREAM}"/>')
    parts.append(f'<g clip-path="url(#bc-clip-t1)">{thumb(s_m, R, 640)}</g>')
    parts.append(f'<g clip-path="url(#bc-clip-t2)">{thumb(s_s, R + 280, 640)}</g>')
    parts.append(text(R, 916, '卡片全開、眼睛笑彎、雙手張開', 13) + text(R + 280, 916, '三張卡轉進頭後，只露出一角', 13))

    parts.append('</svg>')
    open(os.path.join(ROOT, 'concept.svg'), 'w').write('\n'.join(parts))
    print('wrote concept.svg')


if __name__ == '__main__':
    main()
