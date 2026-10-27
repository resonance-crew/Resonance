import os
import random
from tingya import *
from build_character import character_svg

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = "'PingFang TC','Noto Sans TC',sans-serif"
PAPER = 'oklch(96.5% 0.015 75)'
NIGHT_PAPER = 'oklch(21% 0.012 60)'
TXT = 'oklch(36% 0.04 50)'
TXT_MUTED = 'oklch(52% 0.03 55)'
rng = random.Random(21)


def paper_filter():
    return """<filter id="a-paper" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="2" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.26  -2.2 0 0 0 1.18" result="specks"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.004 0.03" numOctaves="2" seed="8" result="f"/>
  <feColorMatrix in="f" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.4  0 0 0 0 0.3  0 0 -0.4 0 0.24" result="fibres"/>
  <feMerge><feMergeNode in="fibres"/><feMergeNode in="specks"/></feMerge>
</filter>"""


def paper_rect(x, y, w, h, fill, opacity=0.5):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#000" filter="url(#a-paper)" opacity="{opacity}"/>')


def frame(x, y, w, h, cls='a-ink', op=0.55, r=14):
    pts = [(x + r, y), (x + w / 2, y - 1.5), (x + w - r, y), (x + w, y + r), (x + w + 1.2, y + h / 2), (x + w, y + h - r),
           (x + w - r, y + h), (x + w / 2, y + h + 1.2), (x + r, y + h), (x, y + h - r), (x - 1, y + h / 2), (x, y + r)]
    loop = clockwise(resample(catmull(pts, True, 10), 3, True))
    polys = outline_passes(loop, rng, 1.0, passes=[(1.5, op, 1.0, 1.03, 0, 0.8), (1.0, op * 0.6, 0.3, 0.5, 1.2, 1.0)])
    return f'<g filter="url(#a-lead)">{poly_paths(polys, cls)}</g>'


def label(x, y, t, size=15, anchor='start', fill=TXT_MUTED, weight=400):
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" fill="{fill}" '
            f'font-weight="{weight}" text-anchor="{anchor}">{t}</text>')


def pencil_line(pts, w=1.6, op=0.6, cls='a-ink'):
    c = resample(catmull(pts, False, 10), 2, False)
    return f'<g filter="url(#a-lead)">{poly_paths([(pencil_stroke(c, w, rng, 0.2, 0.3, 0.4), op)], cls)}</g>'


# ---------------------------------------------------------------- poses
PEEK = pose(
    body_rot=-13,
    antenna=dict(heading=-102, L=430, turns=-0.92, p=2.4),
    face=dict(dx=-26, dy=-6, rot=-6),
    look=(-0.9, -0.1), lid=0.0,
    brow_l=dict(c=(344, 462), ang=-2, bend=-3.5), brow_r=dict(c=(457, 460), ang=2, bend=-3.5),
    mouth=dict(mode='o', w=20),
    arm_l_hidden=True,
    arm_r=dict(pts=[(498, 520), (520, 520), (538, 516)], w0=34, w1=34, start=0.0),
    arm_r_outside=True,
)
MOVED = pose(
    body_rot=0,
    antenna=dict(heading=-91, L=420, turns=-0.62, p=2.6),
    eye_mode='soft', blush=1.5,
    brow_l=dict(c=(345, 470), ang=-15, bend=-1.5), brow_r=dict(c=(456, 468), ang=15, bend=-1.5),
    mouth=dict(mode='wobble', w=15, c=(401, 550)),
    arm_l=dict(pts=[(276, 590), (318, 600), (356, 596)], w0=36, w1=35, start=0.25),
    arm_r=dict(pts=[(524, 590), (482, 600), (444, 596)], w0=36, w1=35, start=0.25),
    tear=(476, 528),
)


def moved_vibes(d):
    c, W = d.antenna_geo()
    e = c[-1]
    return e


def build():
    defs = [style_block(), filters(), paper_filter()]
    # the main drawing, once, reused by <use>
    main = Drawer(MAIN, 'a-', seed=7)
    defs.append(f'<g id="a-tingya">\n{main.draw()}\n</g>')
    small96 = Drawer(MAIN, 'a-s96-', seed=7, pen=3.0, detail=0.5)
    defs.append(f'<g id="a-tingya-96">\n{small96.draw()}\n</g>')
    small48 = Drawer(MAIN, 'a-s48-', seed=7, pen=5.0, detail=0.5)
    defs.append(f'<g id="a-tingya-48">\n{small48.draw(with_shadow=False)}\n</g>')
    sil = Drawer(MAIN, 'a-sil-', seed=7).silhouette()

    out = [paper_rect(0, 0, 1600, 1000, PAPER, 0.16)]

    # ---------------- main illustration (left, ~1000 × 1000)
    s = 1.34
    tx, ty = 500 - 405 * s, 548 - 440 * s
    out.append(f'<use href="#a-tingya" transform="translate({fmt(tx)} {fmt(ty)}) scale({s})"/>')
    # a few soft marks on the paper: the sprout hears something
    def C(x, y):
        return (tx + x * s, ty + y * s)
    for (pts, w, op) in [
        ([C(232, 150), C(222, 172), C(222, 196)], 1.8, 0.5),
        ([C(210, 138), C(196, 168), C(198, 204)], 1.6, 0.38),
    ]:
        out.append(pencil_line(pts, w, op))
    out.append(label(56, 72, 'A｜色鉛筆小生物', 18, fill=TXT_MUTED))
    out.append(label(56, 112, '聽芽 Tingya', 34, fill=TXT, weight=600))
    out.append(label(56, 144, '頭上那根捲起的芽，是它的耳朵', 17, fill=TXT_MUTED))

    # divider
    out.append(pencil_line([(1000, 40), (1001, 500), (999, 960)], 1.2, 0.35))

    # ---------------- (a) size test strip
    ax, ay, aw, ah = 1030, 40, 540, 200
    out.append(frame(ax, ay, aw, ah))
    out.append(label(ax + 18, ay + 30, '縮小測試（同一支筆重畫，線寬固定）', 14))
    # 96 px tall: the drawing spans y 150→724 in its own box (574)
    k96 = 96 / 574
    out.append(f'<use href="#a-tingya-96" transform="translate({fmt(ax + 70 - 400 * k96)} {fmt(ay + 160 - 724 * k96)}) scale({k96:.4f})"/>')
    out.append(label(ax + 70, ay + 186, '96px', 13, 'middle'))
    k48 = 48 / 574
    out.append(f'<use href="#a-tingya-48" transform="translate({fmt(ax + 200 - 400 * k48)} {fmt(ay + 160 - 724 * k48)}) scale({k48:.4f})"/>')
    out.append(label(ax + 200, ay + 186, '48px', 13, 'middle'))
    out.append(f'<g transform="translate({fmt(ax + 300 - 400 * k48)} {fmt(ay + 160 - 724 * k48)}) scale({k48:.4f})">{sil}</g>')
    out.append(label(ax + 300, ay + 186, '48px 剪影', 13, 'middle'))
    # and the 48 on night paper
    out.append(paper_rect(ax + 370, ay + 52, 150, 116, NIGHT_PAPER, 0.25))
    out.append(f'<use href="#a-tingya-48" style="{night_style()}" transform="translate({fmt(ax + 445 - 400 * k48)} {fmt(ay + 150 - 724 * k48)}) scale({k48:.4f})"/>')
    out.append(label(ax + 445, ay + 186, '48px 夜紙', 13, 'middle'))

    # ---------------- (c1) curious peek, (c2) moved
    tw, th = 255, 300
    c1x, c1y = 1030, 270
    c2x, c2y = 1315, 270
    out.append(frame(c1x, c1y, tw, th))
    out.append(frame(c2x, c2y, tw, th))

    # peek: the wall edge is x = 452 in the drawing's own box
    pk = Drawer(PEEK, 'a-pk-', seed=11)
    pk_body = pk.draw(with_shadow=False)
    hand = Drawer(PEEK, 'a-pk-hand-', seed=12)
    hand_svg = f'<g id="a-pk-hand">{hand.limb(dict(pts=[(468, 462), (452, 466), (436, 474)], w0=30, w1=30, start=0.0))}</g>'
    ps = 0.40
    ptx, pty = c1x + 172 - 452 * ps, c1y + 262 - 700 * ps
    wall_x = 452
    peek = (f'<clipPath id="a-pk-clip"><rect x="0" y="0" width="{wall_x}" height="800"/></clipPath>'
            f'<clipPath id="a-pk-tile"><rect x="{c1x + 4}" y="{c1y + 4}" width="{tw - 8}" height="{th - 8}" rx="12"/></clipPath>')
    defs.append(peek)
    wall = (f'<rect x="{wall_x}" y="0" width="400" height="800" fill="oklch(91% 0.03 68)"/>'
            f'<rect x="{wall_x}" y="0" width="400" height="800" fill="#000" filter="url(#a-paper)" opacity="0.18"/>')
    edge = pencil_line([(wall_x, 60), (wall_x + 1.5, 400), (wall_x - 1, 760)], 2.4, 0.8)
    out.append(f'<g clip-path="url(#a-pk-tile)"><g transform="translate({fmt(ptx)} {fmt(pty)}) scale({ps})">'
               f'<g clip-path="url(#a-pk-clip)">{pk_body}</g>{wall}{edge}{hand_svg}</g></g>')
    out.append(label(c1x + 4, c1y + th + 24, '好奇探頭：芽先伸出來', 14))

    mv = Drawer(MOVED, 'a-mv-', seed=13)
    mv_body = mv.draw()
    ms = 0.39
    mtx, mty = c2x + tw / 2 - 402 * ms, c2y + 284 - 724 * ms
    e = moved_vibes(mv)
    vib = []
    for (r, a0, a1, op) in [(40, 195, 250, 0.8), (58, 200, 245, 0.55), (40, -70, -15, 0.8), (58, -65, -20, 0.55)]:
        pts = [(e[0] + r * math.cos(math.radians(a0 + (a1 - a0) * i / 8)), e[1] + r * math.sin(math.radians(a0 + (a1 - a0) * i / 8)))
               for i in range(9)]
        vib.append((pencil_stroke(resample(pts, 2, False), 4.2, rng, 0.3, 0.3, 0.3), op))
    out.append(f'<g transform="translate({fmt(mtx)} {fmt(mty)}) scale({ms})">{mv_body}'
               f'<g filter="url(#a-lead)">{poly_paths(vib, "a-ink")}</g></g>')
    out.append(label(c2x + 4, c2y + th + 24, '被感動：芽整個舒展開', 14))

    # ---------------- (b) night paper
    bx, by = 1030, 640
    out.append(paper_rect(bx, by, tw, th, NIGHT_PAPER, 0.3))
    ns = 0.42
    out.append(f'<use href="#a-tingya" style="{night_style()}" transform="translate({fmt(bx + tw / 2 - 405 * ns)} {fmt(by + 282 - 724 * ns)}) scale({ns})"/>')
    out.append(label(bx + 4, by + th + 24, '夜紙（深色模式）', 14))

    # ---------------- notes
    nx, ny = 1315, 646
    notes = [
        ('拆件', '芽・身體・臉（眼、眉、嘴、頰）'),
        ('', '手 ×2・腳 ×2・尾巴・影子'),
        ('情緒', '芽：舒展＝在聽，捲緊＝害羞'),
        ('', '眼：上眼瞼的高低，眉的斜度'),
        ('媒材', '排線＋紙紋＋同一支筆重描'),
        ('色彩', ''),
    ]
    yy = ny + 30
    for k, v in notes:
        if k:
            out.append(label(nx + 4, yy, k, 13, fill=TXT, weight=600))
        out.append(label(nx + 44, yy, v, 13))
        yy += 26
    sw = [DAY['fur'], DAY['fur-hatch'], DAY['fur-shade'], DAY['tip'], DAY['blush'], DAY['eye']]
    for i, c in enumerate(sw):
        cx = nx + 58 + i * 30
        out.append(f'<g filter="url(#a-tooth-dense)"><circle cx="{cx}" cy="{yy - 32}" r="10" fill="{c}"/></g>')

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">\n'
           f'<defs>\n' + '\n'.join(defs) + '\n</defs>\n' + '\n'.join(out) + '\n</svg>\n')
    open(os.path.join(OUT, 'concept.svg'), 'w').write(svg)
    print('concept', os.path.getsize(os.path.join(OUT, 'concept.svg')))


if __name__ == '__main__':
    open(os.path.join(OUT, 'character.svg'), 'w').write(character_svg())
    build()
