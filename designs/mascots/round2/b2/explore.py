#!/usr/bin/env python3
"""Three quick silhouette ideas for B' (one direction: a colored-pencil creature), each standing and waving.
Run: python3 -I explore.py -> explore.svg"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
INK = '#2b2622'
EYE = '#f6efe4'


def cr_closed(pts, k=1.0):
    n = len(pts)
    d = f"M {pts[0][0]:.1f},{pts[0][1]:.1f}"
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6 * k, p1[1] + (p2[1] - p0[1]) / 6 * k)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6 * k, p2[1] - (p3[1] - p1[1]) / 6 * k)
        d += f" C {c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d + " Z"


def tube(center, widths):
    n = len(center)
    left, right = [], []
    for i in range(n):
        a = center[max(0, i - 1)]
        b = center[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        w = widths[i] / 2
        left.append((center[i][0] + nx * w, center[i][1] + ny * w))
        right.append((center[i][0] - nx * w, center[i][1] - ny * w))
    return left + right[::-1]


def head_pts(cx, cy, rx, ry, n=2.4, widen=0.05):
    pts = []
    for i in range(16):
        a = 2 * math.pi * i / 16
        c, s = math.cos(a), math.sin(a)
        x = rx * math.copysign(abs(c) ** (2 / n), c)
        y = ry * math.copysign(abs(s) ** (2 / n), s)
        if y > 0:
            x *= 1 + widen * math.sin(math.pi * y / ry)
        pts.append((cx + x, cy + y))
    return pts


def fan(cx, cy, R, a0, a1, scal=9, amp=0.07, base_w=10):
    pts = [(cx - base_w, cy)]
    N = 40
    for i in range(N + 1):
        t = i / N
        a = math.radians(a0 + (a1 - a0) * t)
        r = R * (1 + amp * math.cos(t * scal * 2 * math.pi))
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    pts.append((cx + base_w, cy))
    return "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"


def mitt(cx, cy, r, thumb_ang):
    pts = []
    for i in range(14):
        a = 2 * math.pi * i / 14
        rr = r * (1 + 0.28 * max(0, math.cos(a - math.radians(thumb_ang))) ** 6)
        pts.append((cx + rr * math.cos(a), cy + rr * 1.06 * math.sin(a)))
    return cr_closed(pts)


def figure(ox, oy, s, kind, wave):
    """A silhouette. ox, oy: the feet's ground point; s: scale."""
    out = []

    def P(x, y):
        return (ox + x * s, oy + y * s)

    hx, hy = 0, -330
    # body
    body = [P(-80, -270), P(-98, -200), P(-108, -120), P(-100, -70), P(-60, -58), P(0, -55), P(60, -58), P(100, -70), P(108, -120), P(98, -200), P(80, -270), P(0, -285)]
    out.append(f'<path d="{cr_closed(body)}"/>')
    # legs + flat feet
    for sx in (-1, 1):
        out.append(f'<path d="{cr_closed(tube([P(sx * 32, -70), P(sx * 36, -20)], [44 * s, 40 * s]))}"/>')
        fx, fy = P(sx * 46, -14)
        out.append(f'<ellipse cx="{fx:.1f}" cy="{fy:.1f}" rx="{44 * s:.1f}" ry="{16 * s:.1f}" transform="rotate({sx * 6} {fx:.1f} {fy:.1f})"/>')
    # arms
    sh_l, sh_r = P(-92, -268), P(92, -268)
    out.append(f'<path d="{cr_closed(tube([sh_l, P(-128, -200), P(-140, -120)], [40 * s, 36 * s, 32 * s]))}"/>')
    out.append(f'<path d="{mitt(*P(-142, -100), 30 * s, 20)}"/>')
    if wave:
        out.append(f'<path d="{cr_closed(tube([sh_r, P(170, -340), P(186, -460)], [40 * s, 36 * s, 32 * s]))}"/>')
        out.append(f'<path d="{mitt(*P(190, -492), 32 * s, 200)}"/>')
        # wave marks
        for k, rr in enumerate((54, 74)):
            cxw, cyw = P(190, -492)
            a0, a1 = math.radians(-70), math.radians(-20)
            d = f"M {cxw + rr * s * math.cos(a0):.1f},{cyw + rr * s * math.sin(a0):.1f} A {rr * s:.1f} {rr * s:.1f} 0 0 1 {cxw + rr * s * math.cos(a1):.1f},{cyw + rr * s * math.sin(a1):.1f}"
            out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{4 * s:.1f}" stroke-linecap="round"/>')
    else:
        out.append(f'<path d="{cr_closed(tube([sh_r, P(128, -200), P(140, -120)], [40 * s, 36 * s, 32 * s]))}"/>')
        out.append(f'<path d="{mitt(*P(142, -100), 30 * s, 160)}"/>')
    # head + signature
    if kind == 'shaving':
        cx, cy = P(hx, hy)
        out.append(f'<path d="{cr_closed(head_pts(cx, cy, 150 * s, 128 * s))}"/>')
        bx, by = P(22, -452)
        out.append(f'<path d="{fan(bx, by, 96 * s, -172, -18)}" transform="rotate(8 {bx:.1f} {by:.1f})"/>')
        ex = [(-38, -318), (40, -318)]
    elif kind == 'tip':
        cx, cy = P(hx, hy)
        pts = []
        for i in range(18):
            a = 2 * math.pi * i / 18
            x = 140 * math.cos(a)
            y = 128 * math.sin(a)
            if y < 0:
                k = (-y / 128) ** 1.6
                x *= 1 - 0.62 * k
                y *= 1 + 0.55 * k
            pts.append((cx + x * s, cy + y * s))
        out.append(f'<path d="{cr_closed(pts)}"/>')
        tx, ty = P(0, -530)
        out.append(f'<ellipse cx="{tx:.1f}" cy="{ty:.1f}" rx="{16 * s:.1f}" ry="{20 * s:.1f}"/>')
        ex = [(-36, -312), (36, -312)]
    else:  # scribble loop
        cx, cy = P(hx, hy)
        out.append(f'<path d="{cr_closed(head_pts(cx, cy, 146 * s, 128 * s, n=2.1))}"/>')
        pts = []
        for i in range(90):
            t = i / 89
            a = math.radians(200 + t * 560)
            r = (30 + 34 * t) * s
            pts.append((ox + (20 + t * 30) * s + r * math.cos(a), oy - 480 * s - t * 40 * s + r * 0.8 * math.sin(a)))
        d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{18 * s:.1f}" stroke-linecap="round"/>')
        ex = [(-40, -316), (40, -316)]
    eyes = ''.join(f'<ellipse cx="{P(x, y)[0]:.1f}" cy="{P(x, y)[1]:.1f}" rx="{11 * s:.1f}" ry="{17 * s:.1f}" fill="{EYE}"/>' for x, y in ex)
    return f'<g fill="{INK}">{"".join(out)}</g>{eyes}'


def main():
    FONT = "'PingFang TC','Noto Sans TC',sans-serif"
    items = []
    titles = [('shaving', '甲｜木屑冠', '頭頂一片削鉛筆刨下來的木屑花邊'),
              ('tip', '乙｜筆尖頭', '頭頂收成一個鈍鈍的筆尖'),
              ('loop', '丙｜試色圈', '頭頂一圈試色時畫出來的塗鴉線')]
    for i, (k, t, sub) in enumerate(titles):
        x0 = 40 + i * 520
        items.append(f'<text x="{x0}" y="56" font-family="{FONT}" font-size="22" font-weight="600" fill="#4a3f36">{t}</text>')
        items.append(f'<text x="{x0}" y="84" font-family="{FONT}" font-size="15" fill="#7a6d61">{sub}</text>')
        items.append(figure(x0 + 130, 620, 0.62, k, False))
        items.append(figure(x0 + 360, 620, 0.62, k, True))
        # small 48 px check
        items.append(figure(x0 + 470, 690, 0.075, k, True))
        items.append(f'<text x="{x0 + 410}" y="714" font-family="{FONT}" font-size="12" fill="#7a6d61">48 px</text>')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 740" width="1600" height="740">
<rect width="1600" height="740" fill="oklch(96.5% 0.015 75)"/>
{chr(10).join(items)}
</svg>'''
    with open(os.path.join(HERE, 'explore.svg'), 'w') as f:
        f.write(svg)


main()
