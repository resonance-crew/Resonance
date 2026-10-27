#!/usr/bin/env python3
"""B' 漾漾 Tint: a small creature drawn in coloured pencil (round 2 of direction B).

The drawing method is round 1 B's first version (../../b/gen-v1.py, copied in part and rewritten):
crayon fills = a gradient fill with paper-tooth holes + hand-generated tapered strokes hatched
two or three colours deep, all warped by one slow hand wobble; plus a same-hue pencil line
that is heavier on the shadow side and skips on the lit side.

The form is new: a big soft head with a pencil shaving for a crest, a short bell of a body with
a blank (unpainted) patch on its chest, long arms with cream mittens, short legs, flat feet.

Run: python3 -I gen.py  -> character.svg, concept.svg, checks/*.svg
"""
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = "'PingFang TC','Noto Sans TC',sans-serif"

# ---------------------------------------------------------------- palette (oklch)
C = {
    # the creature's own pencil: lavender laid over mist blue (card hues 290 and 215/245)
    'lav_hi': 'oklch(88% 0.032 300)',      # lit top of the head
    'lav': 'oklch(82% 0.045 293)',         # body colour
    'lav_lo': 'oklch(77% 0.05 280)',       # lower, leaning blue
    'blue': 'oklch(75% 0.048 248)',        # mist blue layered in underneath
    'shade': 'oklch(68% 0.058 285)',       # violet shading
    'shade_blue': 'oklch(65% 0.058 252)',  # blue shading
    'deep': 'oklch(56% 0.062 275)',         # the deepest strokes
    'hi': 'oklch(96% 0.018 95)',           # cream pencil over the lit side
    'pen': 'oklch(49% 0.065 280)',         # the same pencil pressed hard: its outline
    'ink': 'oklch(28% 0.045 282)',         # eyes, mouth: indigo graphite, not black
    'cream': 'oklch(95.5% 0.02 88)',       # mittens and the blank on the chest: paper left unpainted
    'cream_shade': 'oklch(86% 0.035 78)',
    'cream_pen': 'oklch(57% 0.045 62)',
    'wood': 'oklch(88% 0.045 80)',         # the shaving's wood
    'wood_shade': 'oklch(77% 0.06 70)',
    'wood_grain': 'oklch(62% 0.065 62)',
    'rim': 'oklch(68% 0.075 290)',         # the shaving's painted edge = this creature's own pencil
    'core': 'oklch(48% 0.085 288)',        # the pencil's core at the shaving's tip
    'feet': 'oklch(63% 0.062 262)',
    'feet_shade': 'oklch(53% 0.07 265)',
    'blush': 'oklch(72% 0.09 55)',         # three short strokes, not a disc
    'warm': 'oklch(85% 0.09 85)',          # a story's colour: mustard
    'warm2': 'oklch(78% 0.1 60)',          # and apricot where it is strongest
    'tear': 'oklch(86% 0.04 230)',
    'mouth_in': 'oklch(60% 0.1 28)',
    'paper': 'oklch(96.5% 0.015 75)',
    'paper_side': 'oklch(95% 0.017 72)',
    'night': 'oklch(21% 0.012 60)',
    'label': 'oklch(40% 0.03 55)',
    'label_soft': 'oklch(56% 0.025 60)',
    'shadow': 'oklch(80% 0.025 280)',
}

# night underpaint (only used on night paper, through CSS variables): each part's own colour, dimmed
NIGHT_VARS = ('--b2-under-lav:oklch(89% 0.025 290);--b2-under-cream:oklch(92% 0.02 85);'
              '--b2-under-wood:oklch(90% 0.03 80);--b2-under-feet:oklch(80% 0.035 262);'
              '--b2-pen:oklch(70% 0.05 285);--b2-cream-pen:oklch(72% 0.03 70)')

# ---------------------------------------------------------------- geometry helpers


def cr_closed(pts, k=1.0):
    """Closed Catmull-Rom spline through pts -> cubic Bezier path."""
    n = len(pts)
    d = f"M {pts[0][0]:.1f},{pts[0][1]:.1f}"
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6 * k, p1[1] + (p2[1] - p0[1]) / 6 * k)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6 * k, p2[1] - (p3[1] - p1[1]) / 6 * k)
        d += f" C {c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d + " Z"


def cr_sample(pts, per=12):
    """Polygon approximation of the closed Catmull-Rom spline."""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        for s in range(per):
            t = s / per
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    return out


def poly_d(pts):
    return "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"


def inside(poly, x, y):
    c = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
            c = not c
        j = i
    return c


def rot(x, y, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return x * c - y * s, x * s + y * c


def taper_stroke(x, y, ang, length, width, bend, r, pinch=0.3):
    """A pencil mark: lands, presses, lifts off; slightly bowed."""
    dx, dy = math.cos(ang), math.sin(ang)
    nx, ny = -dy, dx
    p0 = (x - dx * length / 2, y - dy * length / 2)
    p2 = (x + dx * length / 2, y + dy * length / 2)
    p1 = (x + nx * bend, y + ny * bend)
    left, right = [], []
    steps = 9
    for i in range(steps + 1):
        t = i / steps
        bx = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        by = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        w = width * (pinch + (1 - pinch) * math.sin(math.pi * min(1, t * 1.1)) ** 0.6) * (1.05 - 0.25 * t)
        w *= 1 + r.uniform(-0.12, 0.12)
        left.append((bx + nx * w / 2, by + ny * w / 2))
        right.append((bx - nx * w / 2, by - ny * w / 2))
    return poly_d(left + right[::-1])


def hatch(poly, count, ang, ang_jit, length, width, weight, seed, bend=5):
    """Strokes scattered inside poly, kept with probability weight(x, y)."""
    r = random.Random(seed)
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    out = []
    tries = 0
    while len(out) < count and tries < count * 80:
        tries += 1
        x = r.uniform(x0, x1)
        y = r.uniform(y0, y1)
        if not inside(poly, x, y):
            continue
        if r.random() > weight(x, y):
            continue
        a = ang + r.uniform(-ang_jit, ang_jit)
        out.append(taper_stroke(x, y, a, r.uniform(*length), r.uniform(*width), r.uniform(-bend, bend), r))
    return out


def tube(center, widths):
    """Outline of a soft tube along a centreline (one side forward, the other back)."""
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


def side_of(center, x, y):
    """(signed distance from the centreline, positive on the (-dy, dx) side; t along it 0..1; that normal)."""
    best = None
    for i in range(len(center) - 1):
        ax, ay = center[i]
        bx, by = center[i + 1]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy or 1
        t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
        px, py = ax + dx * t, ay + dy * t
        dd = math.hypot(x - px, y - py)
        if best is None or dd < best[0]:
            L = math.sqrt(L2)
            nx, ny = -dy / L, dx / L
            s = (x - px) * nx + (y - py) * ny
            best = (dd, s, (i + t) / (len(center) - 1), (nx, ny))
    return best[1], best[2], best[3]


def paths(ds, fill, opacity=None):
    op = f' fill-opacity="{opacity}"' if opacity is not None else ''
    return '\n'.join(f'<path d="{d}" fill="{fill}"{op}/>' for d in ds)


def pen_var(pts, widths, seed, shift=0.0):
    """A pencil line as a filled outline whose width follows widths[i] (pressure)."""
    r = random.Random(seed)
    phase = r.uniform(0, 6.28)
    n = len(pts)
    left, right = [], []
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy) or 1
        nx, ny = -dy / l, dx / l
        off = shift + 0.4 * math.sin(i * 0.7 + phase)
        w = widths[i] * (1 + 0.08 * math.sin(i * 1.3 + phase))
        cx, cy = pts[i][0] + nx * off, pts[i][1] + ny * off
        left.append((cx + nx * w / 2, cy + ny * w / 2))
        right.append((cx - nx * w / 2, cy - ny * w / 2))
    return poly_d(left + right[::-1])


def pen_line(pts, width, seed, profile=(0.35, 1.0, 0.4), shift=0.0):
    """A pencil line with a pressure profile: lands light, holds, lifts off."""
    n = len(pts)
    L = [0.0]
    for i in range(1, n):
        L.append(L[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    total = L[-1] or 1
    w0, wm, w1 = profile
    ws = []
    for i in range(n):
        t = L[i] / total
        if t < 0.18:
            w = w0 + (wm - w0) * (t / 0.18)
        elif t > 0.78:
            w = wm + (w1 - wm) * ((t - 0.78) / 0.22)
        else:
            w = wm
        ws.append(w * width)
    return pen_var(pts, ws, seed, shift)


def contour(poly, seed, width=4.6, light=(-0.62, -0.78), base=0.18, lit_gap=0.55, push=1.5, second=True):
    """The pencil line around a shape: heavy where the shape turns away from the light, thin and
    broken where the light hits it. Returns (main strokes, second-pass strokes)."""
    r = random.Random(seed)
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sgn = 1 if area > 0 else -1   # outward normal orientation
    press = []
    pts = []
    for i in range(n):
        a = poly[i - 1]
        b = poly[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy) or 1
        nx, ny = dy / l * sgn, -dx / l * sgn
        lit = -(nx * light[0] + ny * light[1])     # 1 where the normal faces away from the light
        p = base + (1 - base) * max(0.0, lit) ** 0.9
        press.append(p)
        pts.append((poly[i][0] + nx * push, poly[i][1] + ny * push))
    # smooth the pressure, then add the hand's unevenness
    sm = []
    for i in range(n):
        s = sum(press[(i + k) % n] for k in range(-4, 5)) / 9
        sm.append(s * (1 + 0.18 * math.sin(i * 0.31 + seed)))
    # gaps: on the lit side the pencil lifts off now and then
    keep = []
    gap_left = 0
    for i in range(n):
        if gap_left > 0:
            gap_left -= 1
            keep.append(False)
            continue
        if sm[i] < lit_gap * 0.5 and r.random() < 0.05:
            gap_left = r.randint(5, 14)
            keep.append(False)
            continue
        keep.append(True)
    # rotate so the list starts in a gap (or anywhere), then split into runs
    start = next((i for i in range(n) if not keep[i]), 0)
    order = [(start + k) % n for k in range(n)]
    runs, cur = [], []
    for i in order:
        if keep[i]:
            cur.append(i)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    main, sec = [], []
    for j, run in enumerate(runs):
        if len(run) < 3:
            continue
        rp = [pts[i] for i in run]
        m = len(run)
        ws = []
        for k, i in enumerate(run):
            t = k / (m - 1)
            ends = min(1.0, t / 0.12, (1 - t) / 0.12) if m > 8 else 1.0
            ws.append(width * max(0.18, sm[i]) * (0.35 + 0.65 * ends))
        main.append(pen_var(rp, ws, seed + j * 7))
        if second and m > 10:
            a0 = int(m * r.uniform(0.05, 0.3))
            a1 = int(m * r.uniform(0.6, 0.95))
            sp = rp[a0:a1]
            if len(sp) > 3:
                sec.append(pen_var(sp, [width * 0.42 * max(0.3, sm[run[a0 + k]]) for k in range(len(sp))], seed + j * 7 + 3,
                                   shift=r.uniform(-2.2, 2.2)))
    return main, sec


def arc_pts(cx, cy, rx, ry, t0, t1, steps=40):
    return [(cx + rx * math.cos(t0 + (t1 - t0) * i / steps), cy + ry * math.sin(t0 + (t1 - t0) * i / steps)) for i in range(steps + 1)]


# ---------------------------------------------------------------- filters


def tooth_mask(tag, thresh, slope=7.0, edge=0.5, press=0.9):
    """Alpha mask of paper tooth: fine grain + slow hand pressure + edges lighter (less pencil)."""
    return f"""<feTurbulence type="fractalNoise" baseFrequency="0.3 0.82" numOctaves="3" seed="21" result="{tag}t0"/>
    <feColorMatrix in="{tag}t0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="{tag}t"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="4" result="{tag}p0"/>
    <feColorMatrix in="{tag}p0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="{tag}p"/>
    <feComposite in="{tag}t" in2="{tag}p" operator="arithmetic" k2="1" k3="{press}" k4="-{press / 2}" result="{tag}tp"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="{tag}e"/>
    <feComposite in="{tag}tp" in2="{tag}e" operator="arithmetic" k2="1" k3="-{edge}" k4="{edge}" result="{tag}x"/>
    <feComponentTransfer in="{tag}x" result="{tag}m"><feFuncA type="linear" slope="-{slope}" intercept="{slope * thresh + 1:.3f}"/></feComponentTransfer>"""


def filters(p):
    return f'''
  <!-- one slow hand wobble + a fuzzy pencil edge, shared by every fill and its outline so they stay registered -->
  <filter id="{p}f-warp" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="5" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="11" xChannelSelector="R" yChannelSelector="G" result="wob"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="8" result="fuzz"/>
    <feDisplacementMap in="wob" in2="fuzz" scale="5" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <!-- the same wobble, smaller, for the small parts (mittens, legs, feet), so they keep their shape -->
  <filter id="{p}f-warp-s" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="5" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="5" xChannelSelector="R" yChannelSelector="G" result="wob"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="8" result="fuzz"/>
    <feDisplacementMap in="wob" in2="fuzz" scale="4" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <!-- the first, light layer of pencil: the paper's tooth leaves small gaps, more where the hand pressed lightly and at the edge -->
  <filter id="{p}f-tooth1" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    {tooth_mask('a', 0.6, slope=8.0, edge=0.2, press=0.55)}
    <feComposite in="SourceGraphic" in2="am" operator="in"/>
  </filter>
  <!-- the hatched layers on top only catch the tops of the tooth: more paper shows between them -->
  <filter id="{p}f-tooth2" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="13" result="fz"/>
    <feDisplacementMap in="SourceGraphic" in2="fz" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"/>
    {tooth_mask('b', 0.52, slope=6.0, edge=0.1, press=0.5)}
    <feComposite in="d" in2="bm" operator="in"/>
  </filter>
  <!-- the pencil line: a small tremor, and graphite that skips the paper's pits -->
  <filter id="{p}f-grain" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="17" result="tr"/>
    <feDisplacementMap in="SourceGraphic" in2="tr" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.85 0.55" numOctaves="2" seed="23" result="g0"/>
    <feColorMatrix in="g0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4.5 0 0 0 3.3" result="g"/>
    <feComposite in="d" in2="g" operator="in"/>
  </filter>
  <!-- the dark marks (eyes, mouth): dense pencil, a ragged edge, a few skips -->
  <filter id="{p}f-ink" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="31" result="fz"/>
    <feDisplacementMap in="SourceGraphic" in2="fz" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.3 0.82" numOctaves="3" seed="21" result="t0"/>
    <feColorMatrix in="t0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -6 0 0 0 4.6" result="m"/>
    <feComposite in="d" in2="m" operator="in"/>
  </filter>
  <!-- colour that has soaked into the paper: soft, no hard edge -->
  <filter id="{p}f-bleed" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">
    <feGaussianBlur stdDeviation="6"/>
    <feComposite in2="SourceGraphic" operator="over" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.3 0.82" numOctaves="3" seed="21" result="t2"/>
    <feColorMatrix in="t2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -5 0 0 0 3.6" result="m"/>
    <feComposite in="b" in2="m" operator="in"/>
  </filter>
  <!-- underpaint (night paper only, colour from a CSS variable): the part eroded 6 units, so the paper's pits show a dim tint, not black -->
  <filter id="{p}f-under" x="-5%" y="-5%" width="110%" height="110%">
    <feMorphology operator="erode" radius="6"/>
  </filter>'''


# ---------------------------------------------------------------- a part = crayon fill + hatching + pencil line


def part(p, pid, pts, fill, layers, seed, line=None, under='lav', defs=None, extra_in='', extra_top='', per=12, warp='f-warp'):
    """One coloured-pencil shape. layers: list of (count, ang, jit, length, width, weight, colour, opacity[, bend]).
    line: dict(width, color, light, base, lit_gap) or None. Returns the inner SVG (no group of its own)."""
    d = cr_closed(pts)
    poly = cr_sample(pts, per=per)
    defs.append(f'<clipPath id="{p}clip-{pid}"><path d="{d}"/></clipPath>')
    strokes = []
    for i, L in enumerate(layers):
        cnt, ang, jit, length, width, weight, col, op = L[:8]
        bend = L[8] if len(L) > 8 else 5
        strokes.append(paths(hatch(poly, cnt, ang, jit, length, width, weight, seed + 11 * i + 1, bend=bend), col, op))
    line_svg = ''
    if line:
        m, s = contour(poly, seed + 500, width=line.get('width', 4.6), light=line.get('light', (-0.62, -0.78)),
                       base=line.get('base', 0.18), lit_gap=line.get('lit_gap', 0.55))
        col = line['color']
        line_svg = (f'<g filter="url(#{p}f-grain)" opacity="{line.get("opacity", 0.8)}">'
                    + ''.join(f'<path d="{x}" style="fill:{col}"/>' for x in m)
                    + ''.join(f'<path d="{x}" style="fill:{col}" fill-opacity="0.45"/>' for x in s) + '</g>')
    under_svg = f'<path d="{d}" style="fill:var(--b2-under-{under}, none)" filter="url(#{p}f-under)"/>' if under else ''
    return f'''<g filter="url(#{p}{warp})">
{under_svg}
<path d="{d}" fill="{fill}" filter="url(#{p}f-tooth1)"/>
<g filter="url(#{p}f-tooth2)"><g clip-path="url(#{p}clip-{pid})">
{chr(10).join(strokes)}
{extra_in}
</g></g>
{line_svg}
{extra_top}
</g>'''


# ---------------------------------------------------------------- shapes


def head_pts(rx, ry, seed, n=2.45, widen=0.07, flat_top=0.07):
    """A soft rounded square-ish bun: a little fuller at the cheeks, a little flatter on top."""
    r = random.Random(seed)
    pts = []
    N = 18
    for i in range(N):
        a = 2 * math.pi * i / N + r.uniform(-0.03, 0.03)
        c, s = math.cos(a), math.sin(a)
        x = rx * math.copysign(abs(c) ** (2 / n), c)
        y = ry * math.copysign(abs(s) ** (2 / n), s)
        if y > 0:
            x *= 1 + widen * math.sin(math.pi * min(1, y / ry * 1.1))
        else:
            y *= 1 - flat_top * abs(s) ** 3
        f = 1 + r.uniform(-0.012, 0.012)
        pts.append((x * f, y * f))
    return pts


def mitt_pts(r, thumb_deg, squash=1.04, seed=1, thumb=0.5):
    """A mitten: an oval with a thumb on one side and a little notch where the thumb parts from it."""
    rr = random.Random(seed)
    ta = math.radians(thumb_deg)
    pts = []
    N = 28
    for i in range(N):
        a = 2 * math.pi * i / N
        da = math.atan2(math.sin(a - ta), math.cos(a - ta))
        bump = thumb * math.exp(-(da / 0.27) ** 2) - 0.14 * math.exp(-((da - 0.46) / 0.13) ** 2) - 0.06 * math.exp(-((da + 0.5) / 0.15) ** 2)
        R = r * (1 + bump) * (1 + rr.uniform(-0.015, 0.015))
        pts.append((R * math.cos(a), R * squash * math.sin(a)))
    return pts


def foot_pts(w, h, toe):
    """A flat little foot: a long, low bean with a flat sole; toe = +1 points right, -1 left."""
    pts = []
    N = 16
    for i in range(N):
        a = 2 * math.pi * i / N
        c, s = math.cos(a), math.sin(a)
        x = w / 2 * c
        y = h / 2 * s
        if s > 0:
            y *= 0.55          # flat sole
        if c * toe > 0:
            x *= 1.08           # a rounder, longer toe
            y *= 1.05
        else:
            y *= 0.92
        pts.append((x, y - h * 0.1))
    return pts


def crest_pts(R, a0, a1, scallops, amp=0.07, base_w=12, seed=3):
    """The pencil shaving: a fan, pinched at its base, its painted edge waving (a hexagonal pencil cuts
    six waves per turn). Angles in degrees, 0 = right, -90 = straight up."""
    r = random.Random(seed)
    pts = [(-base_w * 0.6, 6)]
    N = 46
    for i in range(N + 1):
        t = i / N
        a = math.radians(a0 + (a1 - a0) * t)
        w = abs(math.sin(math.pi * scallops * t)) ** 0.55
        rad = R * (1 - amp + amp * 1.6 * w) * (1 + r.uniform(-0.01, 0.01))
        if t < 0.06 or t > 0.94:
            rad *= 0.94
        pts.append((rad * math.cos(a), rad * math.sin(a)))
    pts.append((base_w * 0.6, 6))
    return pts


# ---------------------------------------------------------------- the creature


BODY = [(340, 446), (370, 436), (400, 433), (430, 436), (460, 446), (478, 470), (492, 510), (500, 555), (500, 600),
        (490, 632), (466, 652), (434, 662), (400, 665), (366, 662), (334, 652), (310, 632), (300, 600), (300, 555),
        (308, 510), (322, 470)]
BODY_C = (400, 555)


def character(p, pose):
    P = POSES[pose]
    defs = []
    out = []

    # ---------- ground shadow: a few soft strokes of the creature's own pencil
    gx, gy = P.get('shadow', (400, 718))
    sh_poly = [(gx + 150 * math.cos(a), gy + 15 * math.sin(a)) for a in [i * math.pi / 16 for i in range(32)]]
    sh = hatch(sh_poly, 26, -0.08, 0.06, (40, 90), (5, 8), lambda x, y: max(0, 1 - abs(x - gx) / 150) ** 0.6, 901, bend=1)
    shadow = f'''<g id="{p}shadow"><!-- pivot: {gx},{gy} (stays on the ground: scaleX with the jump height) -->
<g filter="url(#{p}f-tooth2)">{paths(sh, C['shadow'], 0.55)}</g>
</g>'''

    # ---------- legs + feet (each leg holds its foot)
    for side, sx in (('l', -1), ('r', 1)):
        lc = P['legs'][side]
        lpts = tube(lc, [46, 42, 40])
        hip = lc[0]

        def leg_w(x, y, lc=lc):
            s, t, n = side_of(lc, x, y)
            return max(0.05, min(1, (s * (n[0] * 0.6 + n[1] * 0.8)) / 20 + 0.4))
        leg = part(p, f'leg-{side}', lpts, C['lav_lo'], [
            (10, -1.0, 0.25, (16, 30), (5, 8), leg_w, C['shade_blue'], 0.6, 2),
            (5, -1.0, 0.25, (14, 24), (4, 6), lambda x, y: 0.6, C['blue'], 0.5, 2),
        ], 300 + sx, line=dict(width=4.0, color='var(--b2-pen, %s)' % C['pen'], base=0.25), under='lav', defs=defs, per=8, warp='f-warp-s')
        fx, fy, frot = P['feet'][side]
        fpts = [(fx + rot(x, y, frot)[0], fy + rot(x, y, frot)[1]) for x, y in foot_pts(84, 38, sx)]
        foot = part(p, f'foot-{side}', fpts, C['feet'], [
            (12, -0.95, 0.25, (16, 34), (5, 8), lambda x, y, fy=fy: 0.3 + max(0, (y - fy + 6) / 18), C['feet_shade'], 0.6, 2),
            (6, -0.95, 0.25, (14, 26), (4, 6), lambda x, y, fy=fy: max(0, (fy - y) / 14), C['lav'], 0.6, 2),
        ], 320 + sx, line=dict(width=4.2, color='var(--b2-pen, %s)' % C['pen'], base=0.35), under='feet', defs=defs, per=8, warp='f-warp-s')
        out.append(f'''<g id="{p}leg-{side}"><!-- pivot: {hip[0]},{hip[1]} (the hip: swing for a step) -->
{leg}
<g id="{p}foot-{side}"><!-- pivot: {fx},{fy - 10} (the ankle: lift the toe, plant the heel) -->
{foot}
</g>
</g>''')

    # ---------- body (with the blank on its chest)
    hb = P.get('head_shadow_y', 462)

    def b_shade(x, y):
        u = (x - BODY_C[0]) / 105
        v = (y - BODY_C[1]) / 115
        return max(0.0, min(1.0, 0.75 * u + 0.45 * v + 0.12))

    def b_cast(x, y):
        return max(0.0, min(1.0, (hb + 32 - y) / 34))

    def b_hi(x, y):
        u = (x - BODY_C[0]) / 105
        v = (y - BODY_C[1]) / 115
        return max(0.0, -0.9 * u - 0.2 * v - 0.25) * 1.4

    def b_blue(x, y):
        return max(0.0, min(1, (y - 520) / 130))

    body_g = f'<linearGradient id="{p}g-body" gradientUnits="userSpaceOnUse" x1="0" y1="430" x2="0" y2="670"><stop offset="0" stop-color="{C["lav"]}"/><stop offset="0.4" stop-color="{C["lav_lo"]}"/><stop offset="0.85" stop-color="{C["blue"]}"/></linearGradient>'
    defs.append(body_g)
    chest = chest_svg(p, P, defs)
    body = part(p, 'body', BODY, f'url(#{p}g-body)', [
        (55, -1.0, 0.25, (30, 64), (6, 10), b_blue, C['blue'], 0.65),
        (60, -1.0, 0.22, (30, 70), (6, 10), b_shade, C['shade'], 0.5),
        (26, -0.95, 0.2, (26, 54), (5, 8), lambda x, y: b_shade(x, y) ** 2, C['shade_blue'], 0.55),
        (34, -1.05, 0.2, (40, 90), (7, 11), b_cast, C['deep'], 0.38),
        (18, -1.0, 0.3, (26, 50), (5, 8), b_hi, C['lav_hi'], 0.75),
    ], 200, line=dict(width=5.2, color='var(--b2-pen, %s)' % C['pen'], base=0.22, opacity=0.85), under='lav', defs=defs, extra_top=chest)
    out.append(f'''<g id="{p}body"><!-- pivot: 400,668 (squash and stretch from the ground; breathe = scaleY 1 to 1.02) -->
{body}
</g>''')

    # ---------- arms (each arm holds its mitten; the far one first)
    arms = {}
    for side in ('l', 'r'):
        A = P['arms'][side]
        arms[side] = arm_svg(p, side, A, defs)
    for side in P.get('arm_order', ('l', 'r')):
        if side not in P.get('arms_front', ()):
            out.append(arms[side])

    # ---------- head (local frame: its centre is 0,0)
    out.append(head_svg(p, P, defs))
    if P.get('prop'):
        out.append(P['prop'](p))
    for side in P.get('arm_order', ('l', 'r')):
        if side in P.get('arms_front', ()):
            out.append(arms[side])
    marks = P['marks'](p) if P.get('marks') else ''
    return '\n'.join(defs), shadow, '\n'.join(out), marks


def chest_svg(p, P, defs):
    """The mark on the chest: a drop of blank paper the pencil went around. A story fills it from the
    bottom with its colour (fill 0..1); when it is full the colour runs over and spreads into the body (bloom)."""
    cx, cy = P.get('chest_c', (398, 526))
    fill = P.get('fill', 0.3)
    bloom = P.get('bloom', 0.0)
    tilt = P.get('chest_tilt', -6)
    base = [(x * 1.2, y * 1.2) for x, y in [(0, -31), (9, -19), (18, -4), (22, 10), (17, 23), (0, 29), (-17, 23), (-22, 10), (-18, -4), (-9, -19)]]
    pts = [(cx + rot(x, y, tilt)[0], cy + rot(x, y, tilt)[1]) for x, y in base]
    d = cr_closed(pts)
    poly = cr_sample(pts, per=8)
    defs.append(f'<clipPath id="{p}clip-drop"><path d="{d}"/></clipPath>')
    blank = f'var(--b2-blank, {C["cream"]})'
    # the level: warm strokes below a gently waving surface
    top_y, bot_y = cy - 37, cy + 35
    lvl = bot_y - (bot_y - top_y) * min(1.0, fill)
    r = random.Random(43)
    surf = [(cx - 32 + 64 * i / 12, lvl + 2.4 * math.sin(i * 1.3 + 0.5)) for i in range(13)]
    level_poly = surf + [(cx + 32, bot_y + 4), (cx - 32, bot_y + 4)]
    lw = hatch(level_poly, int(6 + 18 * fill), -1.0, 0.25, (12, 26), (5, 8), lambda x, y: 1.0, 44, bend=2)
    lw2 = hatch(level_poly, int(2 + 8 * fill), -0.9, 0.25, (10, 20), (5, 7), lambda x, y: max(0, (y - lvl) / 30), 45, bend=2)
    surf_line = pen_line(surf[1:-1], 2.6, 46, (0.3, 1, 0.3)) if fill < 0.98 else ''
    m, sec = contour(poly, 47, width=3.4, base=0.35, lit_gap=0.5)
    line = ''.join(f'<path d="{x}" style="fill:var(--b2-pen, {C["pen"]})"/>' for x in m)
    warm_svg = ''
    if bloom > 0:
        rw = 30 + 80 * bloom
        wy = cy + 4
        wpoly = [(cx + rw * 1.3 * math.cos(a), wy + rw * math.sin(a)) for a in [i * math.pi / 14 for i in range(28)]]
        fall = lambda x, y, k=1.0: max(0, 1 - math.hypot((x - cx) / 1.3, y - wy) / (rw * k))
        w1 = hatch(wpoly, int(10 + 90 * bloom), -1.0, 0.3, (20, 46), (6, 10), lambda x, y: fall(x, y) ** 0.5, 47, bend=3)
        w2 = hatch(wpoly, int(4 + 40 * bloom), -0.9, 0.3, (18, 36), (6, 9), lambda x, y: fall(x, y, 0.6) ** 0.7, 48, bend=3)
        warm_svg = f'''<g id="{p}bloom"><!-- pivot: {cx},{cy + 14} (the colour running over and spreading into the body: grow from here, 0 to 1) -->
<g filter="url(#{p}f-bleed)" opacity="{0.55 * bloom:.2f}"><ellipse cx="{cx}" cy="{wy}" rx="{rw * 1.15:.0f}" ry="{rw * 0.8:.0f}" fill="{C['warm']}"/></g>
<g filter="url(#{p}f-tooth2)">{paths(w1, C['warm'], 0.9)}
{paths(w2, C['warm2'], 0.7)}</g>
</g>'''
    return f'''{warm_svg}
<g id="{p}chest"><!-- pivot: {cx},{cy} (the drop of blank on the chest: its warm level rises with a story; scale 1.15 for a heartbeat) -->
<g filter="url(#{p}f-warp)">
<path d="{d}" style="fill:{blank}"/>
<g id="{p}chest-level" clip-path="url(#{p}clip-drop)"><!-- the level: translate up/down to fill or empty -->
<g filter="url(#{p}f-tooth2)">{paths(lw, C['warm'], 0.85)}
{paths(lw2, C['warm2'], 0.6)}</g>
{f'<g filter="url(#{p}f-grain)"><path d="{surf_line}" fill="{C["warm2"]}" fill-opacity="0.8"/></g>' if surf_line else ''}
</g>
<g filter="url(#{p}f-grain)" opacity="0.75">{line}</g>
</g>
</g>'''


def arm_svg(p, side, A, defs):
    c = A['c']
    w = A.get('w', [40, 36, 33, 31][:len(c)])
    pts = tube(c, w)
    sh = c[0]

    def a_shade(x, y):
        s, t, n = side_of(c, x, y)
        facing = s * (n[0] * 0.62 + n[1] * 0.78)   # >0 on the side turned from the light
        return max(0.05, min(1.0, facing / 16 + 0.35))

    def a_hi(x, y):
        s, t, n = side_of(c, x, y)
        facing = s * (n[0] * 0.62 + n[1] * 0.78)
        return max(0.0, -facing / 14 - 0.2)

    def a_root(x, y):
        s, t, n = side_of(c, x, y)
        return max(0.0, 1 - t / 0.25)

    seed = 400 if side == 'l' else 450
    arm = part(p, f'arm-{side}', pts, C['lav'], [
        (16, -1.0, 0.25, (20, 40), (5, 8), a_shade, C['shade'], 0.55, 3),
        (10, -1.0, 0.25, (18, 34), (5, 7), lambda x, y: a_shade(x, y) ** 2, C['shade_blue'], 0.55, 3),
        (8, -1.05, 0.2, (18, 30), (6, 9), a_root, C['deep'], 0.4, 2),
        (6, -1.0, 0.3, (16, 28), (4, 6), a_hi, C['hi'], 0.7, 2),
    ], seed, line=dict(width=4.2, color='var(--b2-pen, %s)' % C['pen'], base=0.22), under='lav', defs=defs, per=8)
    hx, hy, hrot = A['hand']
    thumb = A.get('thumb', 180)
    mpts = [(hx + rot(x, y, hrot)[0], hy + rot(x, y, hrot)[1]) for x, y in mitt_pts(33, thumb, seed=seed)]

    def m_shade(x, y):
        u, v = (x - hx) / 33, (y - hy) / 34
        return max(0.0, min(1, 0.7 * u + 0.6 * v + 0.05)) ** 1.2
    hand = part(p, f'hand-{side}', mpts, C['cream'], [
        (14, -1.0, 0.25, (14, 26), (4, 7), m_shade, C['cream_shade'], 0.75, 2),
        (4, -1.0, 0.25, (10, 18), (3, 5), lambda x, y: m_shade(x, y) ** 2, C['wood_shade'], 0.35, 2),
    ], seed + 20, line=dict(width=4.0, color='var(--b2-cream-pen, %s)' % C['cream_pen'], base=0.32, opacity=0.85),
        under='cream', defs=defs, per=6, warp='f-warp-s')
    wr = A.get('wrist', c[-1])
    return f'''<g id="{p}arm-{side}"><!-- pivot: {sh[0]},{sh[1]} (the shoulder: arm and mitten turn together; a soft elbow near {c[len(c) // 2][0]},{c[len(c) // 2][1]} for a bone or mesh bend) -->
{arm}
<g id="{p}hand-{side}"><!-- pivot: {wr[0]:.0f},{wr[1]:.0f} (the wrist: wave = rotate +-20) -->
{hand}
</g>
</g>'''


def crest_svg(p, P, defs):
    K = P['crest']
    bx, by, tilt = K['at']
    R = K.get('R', 96)
    a0, a1 = K['open']
    sc = K.get('scallops', 6)
    pts = crest_pts(R, a0, a1, sc, amp=K.get('amp', 0.07), seed=7)
    ptsw = [(bx + rot(x, y, tilt)[0], by + rot(x, y, tilt)[1]) for x, y in pts]
    # the turn of the shaving behind it (the spiral's previous turn), peeking out at the trailing end
    # the curled edge: along the trailing side the shaving rolls over on itself (a narrow strip, darker wood)
    curl = []
    for k in range(9):
        q = k / 8
        rr = R * (0.14 + 0.8 * q)
        a_in = math.radians(a0 + 2 + 9 * math.sin(math.pi * q) ** 0.7 + 3)
        curl.append((rr * math.cos(a_in), rr * math.sin(a_in)))
    for k in range(8, -1, -1):
        q = k / 8
        rr = R * (0.14 + 0.8 * q)
        a_out = math.radians(a0 + 1)
        curl.append((rr * math.cos(a_out), rr * math.sin(a_out)))
    curlw = [(bx + rot(x, y, tilt)[0], by + rot(x, y, tilt)[1]) for x, y in curl]
    poly = cr_sample(ptsw, per=6)

    def wood_shade(x, y):
        dd = math.hypot(x - bx, y - by) / R
        return max(0.0, 1 - dd * 1.6) * 1.3

    def rim_w(x, y):
        dd = math.hypot(x - bx, y - by) / R
        return 1.0 if dd > 0.8 else 0.0
    # the painted edge: a band along the waving rim, in the creature's own pencil
    rim = []
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        L = math.hypot(x, y) or 1
        rim.append((x, y, x / L, y / L))
    outer = [(bx + rot(x, y, tilt)[0], by + rot(x, y, tilt)[1]) for x, y, _, _ in rim]
    inner = [(bx + rot(x - ux * 15, y - uy * 15, tilt)[0], by + rot(x - ux * 15, y - uy * 15, tilt)[1]) for x, y, ux, uy in rim]
    band = poly_d(outer + inner[::-1])
    # wood grain: thin radial lines from the base towards the rim
    grain = []
    r = random.Random(11)
    n_g = K.get('grain', 9)
    for i in range(n_g):
        t = (i + 0.5) / n_g
        a = math.radians(a0 + (a1 - a0) * t + r.uniform(-3, 3))
        r0 = R * r.uniform(0.18, 0.3)
        r1 = R * r.uniform(0.62, 0.76)
        line = []
        for k in range(9):
            q = k / 8
            rr = r0 + (r1 - r0) * q
            wob = math.sin(q * 5 + i) * 1.4
            x, y = rr * math.cos(a) - wob * math.sin(a), rr * math.sin(a) + wob * math.cos(a)
            line.append((bx + rot(x, y, tilt)[0], by + rot(x, y, tilt)[1]))
        grain.append(pen_line(line, 2.6, 60 + i, (0.2, 1, 0.3)))
    core = [(bx + rot(x, y, tilt)[0], by + rot(x, y, tilt)[1]) for x, y in
            [(-7, 4), (-6, -6), (0, -15), (6, -6), (7, 4), (0, 9)]]
    defs.append(f'<clipPath id="{p}clip-crestrim"><path d="{cr_closed(ptsw)}"/></clipPath>')
    rimtint = K.get('rim', C['rim'])
    front = part(p, 'crest', ptsw, C['wood'], [
        (18, -1.0, 0.3, (14, 30), (4, 7), wood_shade, C['wood_shade'], 0.6, 2),
        (40, -1.0, 0.3, (14, 28), (5, 8), rim_w, rimtint, 0.75, 2),
    ], 600, line=dict(width=3.8, color='var(--b2-pen, %s)' % C['pen'], base=0.3, opacity=0.8), under='wood', defs=defs, per=6,
        extra_in=f'<path d="{band}" fill="{rimtint}" fill-opacity="0.85"/>\n{paths(grain, C["wood_grain"], 0.55)}\n<path d="{poly_d(curlw)}" fill="{C["wood_shade"]}" fill-opacity="0.85"/>',
        extra_top='')
    return f'''<g id="{p}crest"><!-- pivot: {bx},{by} in the head frame (the shaving's base: it opens like a fan when a story lands, folds shut when shy) -->
{front}
<g filter="url(#{p}f-ink)"><path d="{cr_closed(core)}" fill="{C['core']}" fill-opacity="0.9"/></g>
</g>'''


def head_svg(p, P, defs):
    hx, hy, hrot = P['head']
    rx, ry = 156, 128
    pts = head_pts(rx, ry, 77)

    def h_shade(x, y):
        rr = math.hypot(x / rx, y / ry)
        dirn = (x * 0.7 + y * 0.72) / (math.hypot(x, y) or 1)
        return max(0.0, rr - 0.5) * 2.2 * max(0.0, dirn + 0.15)

    def h_deep(x, y):
        rr = math.hypot(x / rx, y / ry)
        dirn = (x * 0.72 + y * 0.7) / (math.hypot(x, y) or 1)
        return max(0.0, rr - 0.78) * 4 * max(0.0, dirn - 0.25)

    def h_blue(x, y):
        return max(0.0, (y / ry) - 0.25) * 1.3

    def h_hi(x, y):
        v = (-x * 0.62 - y * 0.78) / (rx * 0.8)
        return max(0.0, v - 0.05) * 1.6

    def h_tex(x, y):
        return 0.5

    defs.append(f'''<linearGradient id="{p}g-head" gradientUnits="userSpaceOnUse" x1="-90" y1="-130" x2="70" y2="130">
  <stop offset="0" stop-color="{C['lav_hi']}"/><stop offset="0.5" stop-color="{C['lav']}"/><stop offset="1" stop-color="{C['lav_lo']}"/></linearGradient>''')
    head = part(p, 'head', pts, f'url(#{p}g-head)', [
        (16, -1.0, 0.3, (30, 64), (6, 10), h_tex, C['lav'], 0.3),
        (36, -0.95, 0.25, (30, 66), (6, 10), h_blue, C['blue'], 0.5),
        (95, -1.0, 0.25, (30, 72), (6, 10), h_shade, C['shade'], 0.55),
        (44, -1.0, 0.22, (28, 60), (5, 9), h_deep, C['deep'], 0.45),
        (24, -1.0, 0.3, (24, 50), (5, 9), h_hi, C['lav_hi'], 0.75),
        (8, -1.0, 0.3, (18, 34), (4, 7), lambda x, y: h_hi(x, y) ** 2, C['hi'], 0.5),
    ], 100, line=dict(width=5.6, color='var(--b2-pen, %s)' % C['pen'], base=0.22, opacity=0.85), under='lav', defs=defs, per=10)
    crest = crest_svg(p, P, defs)
    face = P['face'](p)
    pivot = rot(0, ry - 14, hrot)
    return f'''<g id="{p}head" transform="translate({hx},{hy}) rotate({hrot})"><!-- pivot: {hx + pivot[0]:.0f},{hy + pivot[1]:.0f} (where the head sits on the body; in this frame 0,{ry - 14}). Parts below give pivots in this frame -->
{crest}
<g id="{p}head-fill">
{head}
</g>
{face}
</g>'''


# ---------------------------------------------------------------- the face


def eye(p, side, cx, cy, rx, ry, look=(0, 0), tilt=0.0, seed=1, smile=0.0, lid=0.0, flick=1.0):
    """A dark pencil bean, a little narrower at the top, with a skip of paper for its light; over it, one
    pencil stroke for the lid that runs past the outer corner and flicks up. smile lifts the lower edge."""
    k = 0.5523
    top = -ry * (1 - lid)
    bot = ry * (1 - smile)
    tx = rx * (0.82 + 0.3 * lid)
    d = (f"M {-rx:.1f},0 C {-rx:.1f},{bot * k:.1f} {-rx * k:.1f},{bot:.1f} 0,{bot:.1f} "
         f"C {rx * k:.1f},{bot:.1f} {rx:.1f},{bot * k:.1f} {rx:.1f},0 "
         f"C {rx:.1f},{top * k:.1f} {tx * k:.1f},{top:.1f} 0,{top:.1f} "
         f"C {-tx * k:.1f},{top:.1f} {-rx:.1f},{top * k:.1f} {-rx:.1f},0 Z")
    r = random.Random(seed)
    lx, ly = look
    gap = taper_stroke(lx - rx * 0.3, ly + top * 0.42, math.radians(-64 + r.uniform(-6, 6)), ry * 0.5, rx * 0.55, 1.2, r, pinch=0.45)
    gap2 = taper_stroke(lx + rx * 0.35, ly + bot * 0.5, math.radians(-40), ry * 0.2, rx * 0.25, 0.5, r, pinch=0.5)
    outer = -1 if side == 'l' else 1
    lid_pts = []
    # an arc just over the eye's top, from the inner side round to the outer corner ...
    for i in range(15):
        t = i / 14
        ang = math.radians(-118 + 104 * t)       # for the right eye; mirrored for the left
        x = (rx + 4.5) * math.cos(ang)
        y = (ry * (1 - lid) + 3.5) * math.sin(ang)
        lid_pts.append((x * outer, y))
    # ... then on past the corner, lifting a little (the flick)
    ex, ey = lid_pts[-1]
    for i in range(1, 6):
        t = i / 5
        lid_pts.append((ex + outer * 9 * t, ey - flick * 7 * t ** 1.6))
    lid_svg = pen_line(lid_pts, 4.0, seed + 3, (0.25, 1.0, 0.45))
    return f'''<g id="{p}eye-{side}" transform="translate({cx},{cy}) rotate({tilt})"><!-- pivot: {cx},{cy} in the head frame (blink = scaleY of {p}pupil-{side} from its centre; look = translate it) -->
<g id="{p}pupil-{side}" filter="url(#{p}f-ink)">
<path d="{d}" fill="{C['ink']}"/>
<path d="{gap}" fill="{C['cream']}" opacity="0.95"/>
<path d="{gap2}" fill="{C['cream']}" opacity="0.55"/>
</g>
<g id="{p}lid-{side}" filter="url(#{p}f-grain)"><!-- the lid stroke: raise it for wonder, lower and tilt it for worry -->
<path d="{lid_svg}" style="fill:{C['ink']}" fill-opacity="0.9"/>
</g>
</g>'''


def closed_eye(p, side, cx, cy, w, curve=0.36, seed=1, down=False):
    s = 1 if down else -1
    pts = [(-w / 2 + w * i / 20, s * math.sin(math.pi * i / 20) * w * curve) for i in range(21)]
    return f'''<g id="{p}eye-{side}" transform="translate({cx},{cy})"><!-- pivot: {cx},{cy} in the head frame -->
<g filter="url(#{p}f-ink)"><path d="{pen_line(pts, 5.4, seed, (0.5, 1, 0.45))}" fill="{C['ink']}"/></g>
</g>'''


def cheek(p, side, cx, cy, s=1.0, strength=1.0, seed=5):
    """Blush as three short pencil strokes, not a disc."""
    r = random.Random(seed)
    strokes = []
    for i in range(3):
        x = cx + (i - 1) * 10 * s + r.uniform(-1.5, 1.5)
        strokes.append(taper_stroke(x, cy + r.uniform(-1.5, 1.5), math.radians(-62), 22 * s, 5.2, 1.0, r, pinch=0.35))
    return f'''<g id="{p}cheek-{side}"><!-- pivot: {cx},{cy} in the head frame (more strokes, longer, when shy or moved) -->
<g filter="url(#{p}f-bleed)" opacity="{0.16 * strength:.2f}"><ellipse cx="{cx}" cy="{cy}" rx="{22 * s:.0f}" ry="{10 * s:.0f}" fill="{C['blush']}"/></g>
<g filter="url(#{p}f-grain)">{paths(strokes, C['blush'], min(0.95, 0.7 * strength))}</g>
</g>'''


def mouth_open(p, cx, cy, w=22, h=16, tilt=0, lean=0.18):
    """A small open mouth, lopsided: one corner higher, like a word on its way out."""
    d = (f"M {-w / 2:.1f},{-h * 0.1:.1f} C {-w * 0.2:.1f},{-h * (0.3 + lean):.1f} {w * 0.25:.1f},{-h * 0.32:.1f} {w / 2:.1f},{-h * (0.38 + lean):.1f} "
         f"C {w * 0.52:.1f},{h * 0.3:.1f} {w * 0.2:.1f},{h * 0.62:.1f} {-w * 0.04:.1f},{h * 0.6:.1f} "
         f"C {-w * 0.3:.1f},{h * 0.58:.1f} {-w * 0.55:.1f},{h * 0.32:.1f} {-w / 2:.1f},{-h * 0.1:.1f} Z")
    tongue = (f"M {-w * 0.26:.1f},{h * 0.42:.1f} C {-w * 0.1:.1f},{h * 0.12:.1f} {w * 0.22:.1f},{h * 0.1:.1f} {w * 0.3:.1f},{h * 0.36:.1f} "
              f"C {w * 0.12:.1f},{h * 0.6:.1f} {-w * 0.14:.1f},{h * 0.62:.1f} {-w * 0.26:.1f},{h * 0.42:.1f} Z")
    return f'''<g id="{p}mouth" transform="translate({cx},{cy}) rotate({tilt})"><!-- pivot: {cx},{cy} in the head frame (talk = scaleY 0.3 to 1) -->
<g filter="url(#{p}f-ink)"><path d="{d}" fill="{C['ink']}"/><path d="{tongue}" fill="{C['mouth_in']}"/></g>
</g>'''


def mouth_line(p, cx, cy, w=22, curve=6, tilt=0, seed=9):
    pts = [(-w / 2 + w * i / 20, curve * math.sin(math.pi * i / 20) - 2.5 * (i / 20)) for i in range(21)]
    return f'''<g id="{p}mouth" transform="translate({cx},{cy}) rotate({tilt})"><!-- pivot: {cx},{cy} in the head frame -->
<g filter="url(#{p}f-ink)"><path d="{pen_line(pts, 4.6, seed, (0.45, 1, 0.45))}" fill="{C['ink']}"/></g>
</g>'''


def tear(p, cx, cy):
    d = "M 0,-13 C 4,-5 9,2 9,8 C 9,14 5,18 0,18 C -5,18 -9,14 -9,8 C -9,2 -4,-5 0,-13 Z"
    return f'''<g id="{p}tear" transform="translate({cx},{cy})"><!-- pivot: {cx},{cy} in the head frame (runs down, then drops) -->
<g filter="url(#{p}f-tooth2)"><path d="{d}" fill="{C['tear']}"/></g>
<g filter="url(#{p}f-grain)"><path d="{d}" fill="none" stroke="{C['shade_blue']}" stroke-width="2.4"/></g>
</g>'''


def face_hello(p):
    return '\n'.join([
        cheek(p, 'l', -78, 50, 1.0, seed=51),
        cheek(p, 'r', 80, 48, 0.95, seed=52),
        eye(p, 'l', -38, 16, 14, 21, look=(1, 0), tilt=-5, seed=1, smile=0.12),
        eye(p, 'r', 40, 14, 14, 21, look=(1, 0), tilt=5, seed=2, smile=0.12),
        mouth_open(p, 3, 56, w=21, h=15, tilt=-4),
    ])


def face_moved(p):
    return '\n'.join([
        cheek(p, 'l', -76, 40, 1.15, strength=1.6, seed=53),
        cheek(p, 'r', 78, 38, 1.1, strength=1.6, seed=54),
        closed_eye(p, 'l', -38, 18, 32, curve=0.3, seed=55),
        closed_eye(p, 'r', 40, 16, 32, curve=0.3, seed=56),
        mouth_line(p, 2, 50, w=20, curve=6, tilt=-3),
        tear(p, -62, 34),
    ])


def face_read(p):
    return '\n'.join([
        cheek(p, 'l', -78, 52, 0.9, strength=0.8, seed=57),
        cheek(p, 'r', 80, 50, 0.9, strength=0.8, seed=58),
        eye(p, 'l', -38, 28, 13, 17, look=(0, 6), tilt=-4, seed=3, smile=0.0, lid=0.45, flick=0.3),
        eye(p, 'r', 40, 26, 13, 17, look=(0, 6), tilt=4, seed=4, smile=0.0, lid=0.45, flick=0.3),
        mouth_line(p, 3, 58, w=12, curve=2.5),
    ])


def wave_marks(p, cx, cy):
    segs = [pen_line(arc_pts(cx, cy, 58, 58, math.radians(-78), math.radians(-24)), 4.6, 503, (0.3, 1, 0.3)),
            pen_line(arc_pts(cx, cy, 80, 80, math.radians(-68), math.radians(-30)), 3.8, 504, (0.3, 1, 0.3))]
    return f'''<g id="{p}wave-marks"><!-- pivot: {cx},{cy} (an effect, not a body part: fades in while the hand waves) -->
<g filter="url(#{p}f-grain)" opacity="0.8">{paths(segs, 'var(--b2-pen, %s)' % C['pen'])}</g>
</g>'''


def card_in_hands(p, cx, cy, tilt):
    w, h = 104, 74
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    ptsw = [(cx + rot(x, y, tilt)[0], cy + rot(x, y, tilt)[1]) for x, y in pts]
    lines = []
    for i in range(3):
        y = -h / 2 + 18 + i * 14
        l0 = [(cx + rot(x, y, tilt)[0], cy + rot(x, y, tilt)[1]) for x in [-w / 2 + 10 + k * (w - 24 - (i == 2) * 18) / 6 for k in range(7)]]
        lines.append(pen_line(l0, 2.6, 70 + i, (0.3, 1, 0.3)))
    return f'''<g id="{p}card"><!-- a story card (a prop, not a part) -->
<g filter="url(#{p}f-warp)"><path d="{poly_d(ptsw)}" fill="{C['cream']}"/>
<path d="{poly_d(ptsw)}" fill="none" stroke="{C['cream_pen']}" stroke-width="3" stroke-linejoin="round" filter="url(#{p}f-grain)"/></g>
<g filter="url(#{p}f-grain)">{paths(lines, C['label_soft'], 0.6)}</g>
</g>'''


# ---------------------------------------------------------------- poses
# l / r are the viewer's left and right.

POSES = {}

POSES['hello'] = dict(
    head=(402, 335, -4),
    crest=dict(at=(26, -120, 12), open=(-142, -40), R=124, scallops=3, amp=0.09),
    face=face_hello,
    legs=dict(l=[(372, 646), (368, 672), (364, 696)], r=[(428, 646), (432, 672), (436, 696)]),
    feet=dict(l=(350, 705, -6), r=(450, 705, 6)),
    arms=dict(
        l=dict(c=[(326, 468), (272, 504), (238, 556), (232, 600)], hand=(232, 628, 14), thumb=-20),
        r=dict(c=[(474, 468), (550, 420), (592, 342), (604, 278)], hand=(608, 245, -6), thumb=200),
    ),
    arms_front=('r',),
    fill=0.3,
    marks=lambda p: wave_marks(p, 614, 245),
)

POSES['moved'] = dict(
    head=(400, 340, 5),
    crest=dict(at=(24, -120, 4), open=(-184, 4), R=132, scallops=5, amp=0.09, rim=C['warm2'], grain=13),
    face=face_moved,
    legs=dict(l=[(372, 646), (370, 672), (368, 696)], r=[(428, 646), (430, 672), (432, 696)]),
    feet=dict(l=(352, 705, -4), r=(448, 705, 4)),
    arms=dict(
        l=dict(c=[(326, 468), (280, 478), (258, 446), (268, 410)], hand=(286, 390, -24), thumb=-10),
        r=dict(c=[(474, 468), (520, 478), (542, 446), (532, 410)], hand=(514, 390, 24), thumb=190),
    ),
    arms_front=('l', 'r'),
    fill=1.0,
    bloom=1.0,
)

POSES['read'] = dict(
    head=(398, 346, 7),
    crest=dict(at=(28, -120, 30), open=(-124, -66), R=112, scallops=2, amp=0.08),
    face=face_read,
    legs=dict(l=[(372, 646), (370, 672), (368, 696)], r=[(428, 646), (430, 672), (432, 696)]),
    feet=dict(l=(352, 705, -4), r=(448, 705, 4)),
    arms=dict(
        l=dict(c=[(326, 468), (290, 524), (296, 584), (326, 612)], hand=(348, 616, 10), thumb=-70),
        r=dict(c=[(474, 468), (510, 524), (504, 584), (474, 612)], hand=(452, 612, -10), thumb=-110),
    ),
    arms_front=('l', 'r'),
    fill=0.55,
    prop=lambda p: card_in_hands(p, 400, 606, -4),
)


def write_character():
    p = 'b2-'
    defs, shadow, fig, marks = character(p, 'hello')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<title>漾漾 Tint (B prime)</title>
<!-- 漾漾 Tint: a small creature drawn in coloured pencil. Every movable part is its own named group;
     l / r are the viewer's left and right. Pivots are in the 800 x 800 viewBox unless a comment says
     "head frame" (the head group's own space: its centre is 0,0, placed with the head's translate and rotate).
     Night paper: set the CSS variables listed in NIGHT_VARS (gen.py) on any ancestor; by day they are unset. -->
<defs>
{filters(p)}
{defs}
</defs>
<g id="b2-tint">
{shadow}
<g id="b2-figure">
{fig}
</g>
{marks}
</g>
</svg>
'''
    with open(os.path.join(HERE, 'character.svg'), 'w') as f:
        f.write(svg)


# ---------------------------------------------------------------- concept sheet

BOUNDS = (226, 84, 700, 730)   # x0, y0, x1, y1 of the hello pose in the 800 box (crest top to the ground shadow)


def wobbly_rect(x, y, w, h, seed, j=2.0):
    r = random.Random(seed)
    pts = []
    for (ax, ay, bx, by) in [(x, y, x + w, y), (x + w, y, x + w, y + h), (x + w, y + h, x, y + h), (x, y + h, x, y)]:
        for s_ in range(4):
            t = s_ / 4
            pts.append((ax + (bx - ax) * t + r.uniform(-j, j), ay + (by - ay) * t + r.uniform(-j, j)))
    return cr_closed(pts, k=0.6)


def ground_shaving(p, x, y, R, tilt, seed=5):
    """A real pencil shaving lying on the paper: the creature's crest, without the creature."""
    pts = crest_pts(R, -160, -20, 2, amp=0.1, seed=seed)
    ptsw = [(x + rot(a, b, tilt)[0], y + rot(a, b, tilt)[1]) for a, b in pts]
    rim = []
    for i in range(1, len(pts) - 1):
        a, b = pts[i]
        L = math.hypot(a, b) or 1
        rim.append((a, b, a / L, b / L))
    outer = [(x + rot(a, b, tilt)[0], y + rot(a, b, tilt)[1]) for a, b, _, _ in rim]
    inner = [(x + rot(a - u * R * 0.16, b - v * R * 0.16, tilt)[0], y + rot(a - u * R * 0.16, b - v * R * 0.16, tilt)[1]) for a, b, u, v in rim]
    grain = []
    for i in range(6):
        a = math.radians(-160 + 140 * (i + 0.5) / 6)
        line = [(x + rot(rr * math.cos(a), rr * math.sin(a), tilt)[0], y + rot(rr * math.cos(a), rr * math.sin(a), tilt)[1])
                for rr in [R * (0.22 + 0.5 * k / 6) for k in range(7)]]
        grain.append(pen_line(line, 1.8, 80 + i, (0.2, 1, 0.3)))
    core = [(x + rot(a, b, tilt)[0], y + rot(a, b, tilt)[1]) for a, b in [(-4, 3), (-3, -4), (0, -9), (3, -4), (4, 3), (0, 6)]]
    return f'''<g filter="url(#{p}f-warp)">
<path d="{cr_closed(ptsw)}" fill="{C['wood']}" filter="url(#{p}f-tooth1)"/>
<path d="{poly_d(outer + inner[::-1])}" fill="{C['rim']}" fill-opacity="0.85" filter="url(#{p}f-tooth2)"/>
<g filter="url(#{p}f-grain)">{paths(grain, C['wood_grain'], 0.6)}</g>
<path d="{cr_closed(core)}" fill="{C['core']}"/>
<path d="{cr_closed(ptsw)}" fill="none" stroke="{C['pen']}" stroke-opacity="0.6" stroke-width="2.4" filter="url(#{p}f-grain)"/>
</g>'''


def pencil_prop(p, x, y):
    """The scene: the creature's own pencil lying on the paper, a shaving beside it (scene, not a part)."""
    L, W = 150, 22
    ang = -8
    def T(a, b):
        q = rot(a, b, ang)
        return (x + q[0], y + q[1])
    body = [T(0, -W / 2), T(L, -W / 2), T(L, W / 2), T(0, W / 2)]
    facet = [T(0, -W / 2 + 7), T(L, -W / 2 + 7), T(L, -W / 2 + 10), T(0, -W / 2 + 10)]
    wood = [T(0, -W / 2), T(0, W / 2), T(-34, 2), T(-34, -2)]
    lead = [T(-24, -4), T(-24, 4), T(-36, 0.5), T(-36, -0.5)]
    end = [T(L, -W / 2), T(L + 5, -W / 2 + 2), T(L + 5, W / 2 - 2), T(L, W / 2)]
    return f'''<g id="{p}scene-pencil">
<g filter="url(#{p}f-warp)">
<path d="{poly_d(body)}" fill="{C['lav']}" filter="url(#{p}f-tooth1)"/>
<path d="{poly_d(facet)}" fill="{C['shade']}" fill-opacity="0.7" filter="url(#{p}f-tooth2)"/>
<path d="{poly_d(wood)}" fill="{C['wood']}" filter="url(#{p}f-tooth1)"/>
<path d="{poly_d(lead)}" fill="{C['core']}" filter="url(#{p}f-tooth1)"/>
<path d="{poly_d(end)}" fill="{C['cream_shade']}"/>
<path d="{poly_d(body)} {poly_d(wood)}" fill="none" stroke="{C['pen']}" stroke-opacity="0.55" stroke-width="2.6" stroke-linejoin="round" filter="url(#{p}f-grain)"/>
</g>
{ground_shaving(p, x - 70, y + 2, 40, -12)}
</g>'''


def write_concept():
    insts = {}
    for key, pose in (('m', 'hello'), ('v', 'moved'), ('r', 'read')):
        p = f'b2-{key}-'
        insts[key] = (p,) + character(p, pose)

    def label(x, y, text, size=15, color=None, anchor='start', weight=400):
        return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
                f'fill="{color or C["label"]}" text-anchor="{anchor}">{text}</text>')

    def tile(x, y, w, h, seed, fill):
        d = wobbly_rect(x, y, w, h, seed)
        return (f'<path d="{d}" fill="{fill}"/>'
                f'<path d="{d}" fill="none" stroke="{C["label"]}" stroke-opacity="0.5" stroke-width="1.5" filter="url(#b2-c-pen)"/>')

    def place(cx0, cy0, s, x, y):
        """Put 800-box point (cx0, cy0) at (x, y), scaled by s."""
        return f'translate({x - cx0 * s:.2f},{y - cy0 * s:.2f}) scale({s:.4f})'

    x0, y0, x1, y1 = BOUNDS
    H = y1 - y0
    pm, dm, shm, figm, markm = insts['m']
    pv, dv, shv, figv, markv = insts['v']
    pr, dr, shr, figr, markr = insts['r']
    wav = "M 1000,30 " + " ".join(f"Q {1000 + (6 if i % 2 else -6)},{30 + i * 40 + 20} 1000,{30 + (i + 1) * 40}" for i in range(24))

    s_main = 1.12
    s96, s48 = 96 / H, 48 / H
    s_night = 214 / H
    s_th = 250 / H

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
<title>漾漾 Tint, concept (B prime)</title>
<defs>
  <filter id="b2-c-paper" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="2" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.18  0 0 0 0.09 0"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="b2-c-pen" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="6" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/>
  </filter>
  <!-- the black silhouette: every pencil pit closed, one flat shape -->
  <filter id="b2-c-sil" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 14 0" result="a"/>
    <feMorphology in="a" operator="dilate" radius="6" result="d"/>
    <feMorphology in="d" operator="erode" radius="6" result="e"/>
    <feFlood flood-color="oklch(20% 0.01 60)"/>
    <feComposite in2="e" operator="in"/>
  </filter>
  <clipPath id="b2-c-nightclip"><path d="{wobbly_rect(1040, 262, 250, 250, 33)}"/></clipPath>
  <clipPath id="b2-c-vclip"><path d="{wobbly_rect(1040, 596, 250, 300, 31)}"/></clipPath>
  <clipPath id="b2-c-rclip"><path d="{wobbly_rect(1314, 596, 250, 300, 32)}"/></clipPath>
{filters(pm)}
{filters(pv)}
{filters(pr)}
{dm}
{dv}
{dr}
<g id="{pm}figure">
{figm}
</g>
<g id="{pm}marks">{markm}</g>
<g id="{pm}shadowg">{shm}</g>
</defs>

<!-- paper -->
<rect width="1600" height="1000" fill="{C['paper']}"/>
<rect x="1000" width="600" height="1000" fill="{C['paper_side']}"/>
<rect width="1600" height="1000" fill="#fff" filter="url(#b2-c-paper)"/>
<path d="{wav}" fill="none" stroke="{C['label']}" stroke-opacity="0.32" stroke-width="1.5" stroke-linecap="round"/>

<!-- stage: the main illustration -->
{label(56, 80, '漾漾', 40, C['label'], weight=600)}{label(150, 80, 'Tint', 26, C['label_soft'])}
{label(58, 112, 'B′｜色鉛筆小生物 — 頭頂一片削鉛筆的木屑，胸口一滴等著被故事塗上顏色的白', 16, C['label_soft'])}
<g transform="{place(0, 0, s_main, -6, 52)}">
  <use href="#{pm}shadowg"/>
  {pencil_prop(pm, 700, 712)}
  <use href="#{pm}figure"/>
  <use href="#{pm}marks"/>
</g>
{label(58, 962, '主姿勢：舉手打招呼。木屑冠半開、胸口那滴白只塗了一點點，像剛讀完一個小故事', 14, C['label_soft'])}

<!-- side column -->
{label(1040, 52, 'a　縮小測試', 15)}
<g transform="{place(x0, y1, s96, 1046, 196)}"><use href="#{pm}shadowg"/><use href="#{pm}figure"/><use href="#{pm}marks"/></g>
<g transform="{place(x0, y1, s48, 1170, 196)}"><use href="#{pm}shadowg"/><use href="#{pm}figure"/><use href="#{pm}marks"/></g>
<g transform="{place(x0, y1, s96, 1262, 196)}"><use href="#{pm}figure" filter="url(#b2-c-sil)"/></g>
<g transform="{place(x0, y1, s48, 1386, 196)}"><use href="#{pm}figure" filter="url(#b2-c-sil)"/></g>
{label(1078, 224, '96 px', 12, C['label_soft'], 'middle')}{label(1186, 224, '48 px', 12, C['label_soft'], 'middle')}
{label(1296, 224, '剪影 96', 12, C['label_soft'], 'middle')}{label(1402, 224, '剪影 48', 12, C['label_soft'], 'middle')}

{label(1040, 252, 'b　夜紙', 15)}
{tile(1040, 262, 250, 250, 33, C['night'])}
<g clip-path="url(#b2-c-nightclip)" style="{NIGHT_VARS}">
  <g transform="{place(x0, y1, s_night, 1094, 494)}"><use href="#{pm}figure"/><use href="#{pm}marks"/></g>
</g>
{label(1318, 300, '標誌只有兩個', 15)}
{label(1318, 330, '頭頂：一片削鉛筆刨下的木屑。', 13, C['label_soft'])}
{label(1318, 352, '故事一來就整片張開，害羞時收攏。', 13, C['label_soft'])}
{label(1318, 384, '胸口：一滴鉛筆繞過去的空白。', 13, C['label_soft'])}
{label(1318, 406, '讀到的故事會從底部把它塗滿，', 13, C['label_soft'])}
{label(1318, 428, '滿了就漾開到全身。', 13, C['label_soft'])}
{label(1318, 466, '頭身分開、沒有脖子；手末端是', 13, C['label_soft'])}
{label(1318, 488, '奶油色的連指手套。', 13, C['label_soft'])}

{label(1040, 584, 'c　被故事打動', 15)}{label(1150, 584, '木屑冠全開，顏色漾開', 12, C['label_soft'])}
{tile(1040, 596, 250, 300, 31, C['paper'])}
<g clip-path="url(#b2-c-vclip)">
  <g transform="{place(400, y1, s_th, 1165, 880)}">
{shv}
{figv}
{markv}
  </g>
</g>
{label(1314, 584, '讀故事', 15)}{label(1370, 584, '木屑冠收攏，胸口塗到一半', 12, C['label_soft'])}
{tile(1314, 596, 250, 300, 32, C['paper'])}
<g clip-path="url(#b2-c-rclip)">
  <g transform="{place(400, y1, s_th, 1439, 880)}">
{shr}
{figr}
{markr}
  </g>
</g>
</svg>
'''
    with open(os.path.join(HERE, 'concept.svg'), 'w') as f:
        f.write(svg)


def write_checks():
    """Form checks: black silhouette at 200 and 48 px, flipped, upside down; colour at 48 px."""
    p = 'b2-k-'
    defs, shadow, fig, marks = character(p, 'hello')
    x0, y0, x1, y1 = BOUNDS
    H = y1 - y0
    def at(s, x, y, extra=''):
        return f'translate({x - x0 * s:.2f},{y - y1 * s:.2f}) scale({s:.4f}){extra}'
    items = []
    s2 = 200 / H
    w2 = (x1 - x0) * s2
    for i, (name, fl) in enumerate([('剪影', ''), ('左右翻轉', 'flip'), ('上下顛倒', 'up')]):
        X = 40 + i * 230
        if fl == 'flip':
            tr = f'translate({X + w2:.1f},{230 - y1 * s2:.2f}) scale({-s2:.4f},{s2:.4f}) translate({-x0},0)'
        elif fl == 'up':
            tr = f'translate({X - x0 * s2:.1f},{30 + y1 * s2:.2f}) scale({s2:.4f},{-s2:.4f})'
        else:
            tr = at(s2, X, 230)
        items.append(f'<g transform="{tr}"><use href="#{p}fig" filter="url(#b2-k-sil)"/></g>')
        items.append(f'<text x="{X + w2 / 2:.0f}" y="262" font-family="{FONT}" font-size="14" fill="#665" text-anchor="middle">{name} 200</text>')
    s48 = 48 / H
    items.append(f'<g transform="{at(s48, 740, 230)}"><use href="#{p}fig" filter="url(#b2-k-sil)"/></g>')
    items.append(f'<g transform="{at(s48, 810, 230)}"><use href="#{p}all"/></g>')
    items.append(f'<g transform="{at(s48, 880, 230)}" style="{NIGHT_VARS}"><rect x="{x0 - 40}" y="{y0 - 40}" width="{x1 - x0 + 80}" height="{H + 80}" fill="{C["night"]}"/><use href="#{p}all"/></g>')
    items.append(f'<text x="840" y="262" font-family="{FONT}" font-size="14" fill="#665" text-anchor="middle">48 px</text>')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 290" width="1000" height="290">
<defs>
  <filter id="b2-k-sil" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 14 0" result="a"/>
    <feMorphology in="a" operator="dilate" radius="6" result="d"/>
    <feMorphology in="d" operator="erode" radius="6" result="e"/>
    <feFlood flood-color="#1d1916"/>
    <feComposite in2="e" operator="in"/>
  </filter>
{filters(p)}
{defs}
<g id="{p}fig">{fig}</g>
<g id="{p}all">{shadow}<use href="#{p}fig"/>{marks}</g>
</defs>
<rect width="1000" height="290" fill="{C['paper']}"/>
{chr(10).join(items)}
</svg>'''
    with open(os.path.join(HERE, 'checks', 'silhouette.svg'), 'w') as f:
        f.write(svg)


if __name__ == '__main__':
    write_character()
    write_concept()
    write_checks()
    print('wrote character.svg, concept.svg')
