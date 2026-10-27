#!/usr/bin/env python3
"""Generator for direction B — 漾漾 Plip, a drop of pastel rising out of its own pool.

Everything is drawn here as SVG: crayon fills (displacement + paper-tooth holes),
hand-generated tapered pastel strokes, layered two or three colours deep.
Run: python3 -I gen.py  → writes character.svg and concept.svg next to this file.
"""
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- palette (oklch)
C = {
    'head': 'oklch(86.5% 0.058 64)',       # apricot cream
    'head_shade': 'oklch(76% 0.085 46)',   # warm terracotta-peach
    'head_deep': 'oklch(68% 0.095 40)',
    'head_hi': 'oklch(95.5% 0.028 88)',    # cream pastel laid over the top
    'pool': 'oklch(80% 0.042 304)',        # dusty lavender
    'pool_shade': 'oklch(68% 0.055 298)',
    'pool_hi': 'oklch(90% 0.03 310)',
    'mix': 'oklch(80% 0.06 18)',           # rose where the two colours meet
    'blush': 'oklch(74% 0.1 22)',
    'ink': 'oklch(30% 0.035 42)',          # eyes, mouth: warm brown-black
    'ink_soft': 'oklch(50% 0.06 38)',      # brows, lid accents
    'mark': 'oklch(66% 0.075 45)',          # marks on the paper (wave lines): mid-tone, so they hold on cream and on night paper
    'mouth_in': 'oklch(62% 0.11 25)',
    'ripple': 'oklch(70% 0.05 300)',
    'ripple2': 'oklch(74% 0.06 50)',
    'cream_dot': 'oklch(97% 0.015 85)',
    'paper': 'oklch(96.5% 0.015 75)',
    'night': 'oklch(21% 0.012 60)',
    'label': 'oklch(42% 0.03 55)',
    'label_soft': 'oklch(58% 0.025 60)',
}

# ---------------------------------------------------------------- geometry helpers

def cr_closed(pts, k=1.0):
    """Closed Catmull-Rom spline through pts → cubic Bezier path."""
    n = len(pts)
    d = f"M {pts[0][0]:.1f},{pts[0][1]:.1f}"
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6 * k, p1[1] + (p2[1] - p0[1]) / 6 * k)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6 * k, p2[1] - (p3[1] - p1[1]) / 6 * k)
        d += f" C {c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d + " Z"


def cr_sample(pts, per=12, closed=True):
    """Polygon approximation of the Catmull-Rom spline (for inside tests)."""
    n = len(pts)
    out = []
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[i - 1] if (closed or i > 0) else pts[0]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else pts[-1]
        for s in range(per):
            t = s / per
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    return out


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


def blob(cx, cy, rx, ry, seed, wob=0.05, n=9, rot=0.0, squash_bottom=0.0):
    r = random.Random(seed)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + r.uniform(-0.08, 0.08)
        f = 1 + r.uniform(-wob, wob)
        x = rx * f * math.cos(a)
        y = ry * f * math.sin(a)
        if y > 0:
            y *= 1 - squash_bottom * (y / ry) ** 2
        cr, sr = math.cos(rot), math.sin(rot)
        pts.append((cx + x * cr - y * sr, cy + x * sr + y * cr))
    return pts


def taper_stroke(x, y, ang, length, width, bend, r, pinch=0.3):
    """A pastel mark: thick in the middle, thinning to both ends, slightly bowed."""
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
        # pressure: heavier at the start, lifting off at the end
        w = width * (pinch + (1 - pinch) * math.sin(math.pi * min(1, t * 1.1)) ** 0.6) * (1.05 - 0.25 * t)
        w *= 1 + r.uniform(-0.12, 0.12)
        left.append((bx + nx * w / 2, by + ny * w / 2))
        right.append((bx - nx * w / 2, by - ny * w / 2))
    pts = left + right[::-1]
    return "M " + " L ".join(f"{px:.1f},{py:.1f}" for px, py in pts) + " Z"


def hatch(poly, count, ang, ang_jit, length, width, weight, seed, bend=6):
    """Strokes scattered inside poly, kept with probability weight(x, y)."""
    r = random.Random(seed)
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    out = []
    tries = 0
    while len(out) < count and tries < count * 60:
        tries += 1
        x = r.uniform(x0, x1)
        y = r.uniform(y0, y1)
        if not inside(poly, x, y):
            continue
        if r.random() > weight(x, y):
            continue
        a = ang + r.uniform(-ang_jit, ang_jit)
        L = r.uniform(*length)
        W = r.uniform(*width)
        out.append(taper_stroke(x, y, a, L, W, r.uniform(-bend, bend), r))
    return out


def arc_stroke(cx, cy, rx, ry, t0, t1, w0, w1, seed, wob=2.0):
    """A crayon line along an ellipse arc, width swelling then fading."""
    r = random.Random(seed)
    steps = 28
    left, right = [], []
    for i in range(steps + 1):
        u = i / steps
        t = t0 + (t1 - t0) * u
        x = cx + rx * math.cos(t)
        y = cy + ry * math.sin(t) + r.uniform(-wob, wob) * 0.3
        tx, ty = -rx * math.sin(t), ry * math.cos(t)
        L = math.hypot(tx, ty) or 1
        nx, ny = -ty / L, tx / L
        w = (w0 + (w1 - w0) * u) * (0.25 + 0.75 * math.sin(math.pi * u) ** 0.5)
        left.append((x + nx * w / 2, y + ny * w / 2))
        right.append((x - nx * w / 2, y - ny * w / 2))
    pts = left + right[::-1]
    return "M " + " L ".join(f"{px:.1f},{py:.1f}" for px, py in pts) + " Z"



def tube(center, widths):
    """Outline points of a soft tube along a centreline (left side up, right side back)."""
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


def paths(ds, fill, opacity=None, extra=''):
    op = f' fill-opacity="{opacity}"' if opacity is not None else ''
    return '\n'.join(f'<path d="{d}" fill="{fill}"{op}{extra}/>' for d in ds)


def rot_pt(x, y, ang):
    c, s = math.cos(ang), math.sin(ang)
    return x * c - y * s, x * s + y * c

# ---------------------------------------------------------------- filters


def tooth_mask(tag, thresh, slope=7.0, edge=0.5, press=0.9):
    """Alpha mask of paper tooth: fine grain + coarse hand pressure + the edges lighter (less pastel)."""
    return f"""<feTurbulence type="fractalNoise" baseFrequency="0.26 0.78" numOctaves="3" seed="21" result="{tag}t0"/>
    <feColorMatrix in="{tag}t0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="{tag}t"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="4" result="{tag}p0"/>
    <feColorMatrix in="{tag}p0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="{tag}p"/>
    <feComposite in="{tag}t" in2="{tag}p" operator="arithmetic" k2="1" k3="{press}" k4="-{press / 2}" result="{tag}tp"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="{tag}e"/>
    <feComposite in="{tag}tp" in2="{tag}e" operator="arithmetic" k2="1" k3="-{edge}" k4="{edge}" result="{tag}x"/>
    <feComponentTransfer in="{tag}x" result="{tag}m"><feFuncA type="linear" slope="-{slope}" intercept="{slope * thresh + 1:.3f}"/></feComponentTransfer>"""


def filters(p):
    """p = id prefix, e.g. 'b-' or 'b-m-'."""
    return f'''
  <!-- big hand wobble + fuzzy crayon edge, shared by every fill so layers stay registered -->
  <filter id="{p}f-warp" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="5" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="13" xChannelSelector="R" yChannelSelector="G" result="wob"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="8" result="fuzz"/>
    <feDisplacementMap in="wob" in2="fuzz" scale="7" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <!-- first, light layer: paper tooth leaves small gaps, more of them where the hand pressed lightly and at the edge -->
  <filter id="{p}f-tooth1" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    {tooth_mask('a', 0.6, slope=8.0, edge=0.22, press=0.55)}
    <feComposite in="SourceGraphic" in2="am" operator="in"/>
  </filter>
  <!-- later layers only catch the tops of the tooth: more paper shows through -->
  <filter id="{p}f-tooth2" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="13" result="fz"/>
    <feDisplacementMap in="SourceGraphic" in2="fz" scale="4" xChannelSelector="R" yChannelSelector="G" result="d"/>
    {tooth_mask('b', 0.53, slope=6.0, edge=0.12, press=0.5)}
    <feComposite in="d" in2="bm" operator="in"/>
  </filter>
  <!-- the dark marks (eyes, mouth): dense pastel, a ragged edge, a few skips -->
  <filter id="{p}f-ink" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="31" result="fz"/>
    <feDisplacementMap in="SourceGraphic" in2="fz" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.26 0.78" numOctaves="3" seed="21" result="t0"/>
    <feColorMatrix in="t0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -6 0 0 0 4.4" result="m"/>
    <feComposite in="d" in2="m" operator="in"/>
  </filter>
  <!-- colour that has bled into the paper: soft, no hard edge -->
  <filter id="{p}f-bleed" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feGaussianBlur stdDeviation="5"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.9"/></feComponentTransfer>
    <feComposite in2="SourceGraphic" operator="over" result="b"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.26 0.78" numOctaves="3" seed="21" result="t2"/>
    <feColorMatrix in="t2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -5 0 0 0 3.6" result="m"/>
    <feComposite in="b" in2="m" operator="in"/>
  </filter>'''

# ---------------------------------------------------------------- the character


def character(p, pose='main'):
    """Return (defs, body) for one instance; p is the id prefix."""
    P = POSES[pose]
    defs = []
    body = []

    # ---------- pool (the puddle it rises from)
    pool_pts = P['pool']
    pool_d = cr_closed(pool_pts)
    pool_poly = cr_sample(pool_pts)
    pcx = sum(x for x, _ in pool_pts) / len(pool_pts)
    pys = [y for _, y in pool_pts]
    ptop, pbot = min(pys), max(pys)
    defs.append(f'<clipPath id="{p}clip-pool"><path d="{pool_d}"/></clipPath>')

    def pool_shade(x, y):
        v = min(1.0, max(0.0, (y - ptop) / (pbot - ptop)))
        return min(1, max(0.04, v ** 1.4 * 1.15 + (0.25 if x > pcx + 60 else 0)))

    def pool_hi(x, y):
        v = 1 - (y - ptop) / (pbot - ptop)
        return max(0, v - 0.35) * 1.6 * (1 if x < pcx + 40 else 0.3)

    sh = hatch(pool_poly, P.get('pool_n', 120), -0.18, 0.22, (40, 90), (9, 15), pool_shade, P['seed'] + 1, bend=5)
    hi = hatch(pool_poly, 30, -0.12, 0.2, (40, 80), (7, 11), pool_hi, P['seed'] + 2, bend=4)
    rose = hatch(pool_poly, 26, -0.25, 0.3, (30, 60), (8, 12),
                 lambda x, y: max(0, 1 - abs(x - P['neck_base'][0]) / 110) * (1 - (y - ptop) / (pbot - ptop)) * 1.6,
                 P['seed'] + 3)

    ripples = []
    if P.get('ripples', True):
        rcx, rcy = P['ripple_c']
        for i, (rx, ry, w, col, op, gaps) in enumerate(P['ripple_rings']):
            segs = []
            for j, (t0, t1) in enumerate(gaps):
                segs.append(arc_stroke(rcx, rcy, rx, ry, t0, t1, w, w * 0.7, P['seed'] + 40 + i * 7 + j))
            ripples.append(f'<g id="{p}ripple-{i + 1}" opacity="{op}">\n{paths(segs, col)}\n</g>')
    body.append(f'<g id="{p}ripples"><!-- pivot: {P["ripple_c"][0]},{P["ripple_c"][1]} (scale out from here as rings spread) -->\n'
                f'<g filter="url(#{p}f-tooth2)">\n' + '\n'.join(ripples) + '\n</g>\n</g>')

    body.append(f'''<g id="{p}pool"><!-- pivot: {P["ripple_c"][0]},{P["ripple_c"][1]} (squash/stretch from the ground) -->
<g filter="url(#{p}f-warp)">
<path d="{pool_d}" style="fill:var(--b-under-pool, none)"/><!-- underpaint: only on night paper, so the tooth shows a dim pool, not black -->
<path d="{pool_d}" fill="{C['pool']}" filter="url(#{p}f-tooth1)"/>
<g filter="url(#{p}f-tooth2)"><g clip-path="url(#{p}clip-pool)">
{paths(rose, C['mix'], 0.55)}
{paths(sh, C['pool_shade'], 0.62)}
{paths(hi, C['pool_hi'], 0.7)}
</g></g>
</g>
</g>''')

    # ---------- neck (from the pool up into the head) — gradient + both colours hatched over each other
    neck_pts = P['neck']
    neck_d = cr_closed(neck_pts)
    neck_poly = cr_sample(neck_pts)
    nys = [y for _, y in neck_pts]
    ntop, nbot = min(nys), max(nys)
    defs.append(f'<clipPath id="{p}clip-neck"><path d="{neck_d}"/></clipPath>')
    defs.append(f'''<linearGradient id="{p}g-neck" gradientUnits="userSpaceOnUse" x1="0" y1="{ntop:.0f}" x2="0" y2="{nbot:.0f}">
  <stop offset="0" stop-color="{C['head']}"/><stop offset="{P.get('neck_hold', 0.42)}" stop-color="{C['head']}"/><stop offset="{P.get('neck_mix', 0.74)}" stop-color="{C['mix']}"/><stop offset="1" stop-color="{C['pool']}"/></linearGradient>''')
    defs.append(f'''<linearGradient id="{p}g-neckfade" gradientUnits="userSpaceOnUse" x1="0" y1="{nbot - 50:.0f}" x2="0" y2="{nbot:.0f}">
  <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="{p}m-neck" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000"><rect x="0" y="0" width="1000" height="1000" fill="url(#{p}g-neckfade)"/></mask>''')
    nb = P['neck_base']
    nsh = hatch(neck_poly, P.get('neck_n', 26), P.get('neck_ang', -0.95), 0.25, (30, 56), (9, 13),
                lambda x, y: 0.95 if x > P['neck_mid_x'](y) else 0.12, P['seed'] + 5, bend=4)
    nmix = hatch(neck_poly, 22, P.get('neck_ang', -0.95) + 0.15, 0.2, (30, 56), (8, 12),
                 lambda x, y: max(0, 1 - abs((y - ntop) / (nbot - ntop) - 0.55) * 2.2), P['seed'] + 6, bend=4)
    nlav = hatch(neck_poly, 8, P.get('neck_ang', -0.95) + 0.35, 0.2, (30, 56), (8, 12),
                 lambda x, y: max(0, (y - ntop) / (nbot - ntop) - 0.45) * 2, P['seed'] + 7, bend=4)
    body.append(f'''<g id="{p}neck"><!-- pivot: {nb[0]},{nb[1]} (bend/stretch upward from where it leaves the pool) -->
<g mask="url(#{p}m-neck)"><g filter="url(#{p}f-warp)">
<path d="{neck_d}" style="fill:var(--b-under-neck, none)"/>
<path d="{neck_d}" fill="url(#{p}g-neck)" filter="url(#{p}f-tooth1)"/>
<g filter="url(#{p}f-tooth2)"><g clip-path="url(#{p}clip-neck)">
{paths(nmix, C['mix'], 0.6)}
{paths(nlav, C['pool_shade'], 0.3)}
{paths(nsh, C['head_shade'], 0.5)}
</g></g>
</g></g>
</g>''')

    # ---------- hand (a splash tendril with a bead at its tip)
    hand_svg = ''
    if P.get('hand'):
        hp = P['hand']
        hd = cr_closed(hp['pts'])
        hpoly = cr_sample(hp['pts'])
        defs.append(f'<clipPath id="{p}clip-hand"><path d="{hd}"/></clipPath>')
        hsh = hatch(hpoly, 16, hp.get('ang', -1.1), 0.3, (20, 40), (7, 11),
                    lambda x, y: 0.9 if x > hp['mid_x'](y) else 0.15, P['seed'] + 8, bend=3)
        hy = [y for _, y in hp['pts']]
        defs.append(f'''<linearGradient id="{p}g-hand" gradientUnits="userSpaceOnUse" x1="0" y1="{min(hy):.0f}" x2="0" y2="{max(hy):.0f}">
  <stop offset="0" stop-color="{C['head']}"/><stop offset="0.6" stop-color="{C['mix']}"/><stop offset="1" stop-color="{C['pool']}"/></linearGradient>
<linearGradient id="{p}g-handfade" gradientUnits="userSpaceOnUse" x1="0" y1="{max(hy) - 34:.0f}" x2="0" y2="{max(hy):.0f}">
  <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="{p}m-hand" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000"><rect x="0" y="0" width="1000" height="1000" fill="url(#{p}g-handfade)"/></mask>''')
        hand_svg = (f'''<g id="{p}hand"><!-- pivot: {hp['pivot'][0]},{hp['pivot'][1]} (rises out of the pool here; grow = scaleY, wave = rotate) -->
<g mask="url(#{p}m-hand)"><g filter="url(#{p}f-warp)">
<path d="{hd}" style="fill:var(--b-under-neck, none)"/>
<path d="{hd}" fill="url(#{p}g-hand)" filter="url(#{p}f-tooth1)"/>
<g filter="url(#{p}f-tooth2)"><g clip-path="url(#{p}clip-hand)">
{paths(hsh, C['head_shade'], 0.5)}
</g></g>
</g></g>
</g>''')
        if not P.get('hand_front'):
            body.append(hand_svg)

    # ---------- meniscus: the lit lip of the pool hugging the neck (and the hand) in front
    if P.get('meniscus'):
        segs = [arc_stroke(mx, my, mrx, mry, t0, t1, w, w * 0.8, P['seed'] + 90 + i)
                for i, (mx, my, mrx, mry, t0, t1, w) in enumerate(P['meniscus'])]
        body.append(f'''<g id="{p}meniscus"><!-- pivot: {P['neck_base'][0]},{P['neck_base'][1]} (rides with the pool; widens as the neck sinks) -->
<g filter="url(#{p}f-tooth2)">{paths(segs, C['pool_hi'], 0.95)}</g>
<g filter="url(#{p}f-tooth2)" opacity="0.5">{paths([arc_stroke(mx, my + 5, mrx * 0.96, mry, t0 + 0.15, t1 - 0.15, w * 0.7, w * 0.5, P['seed'] + 95 + i) for i, (mx, my, mrx, mry, t0, t1, w) in enumerate(P['meniscus'])], C['pool_shade'])}</g>
</g>''')

    # ---------- head (local frame: centre at 0,0; placed by translate + rotate)
    hx, hy, hrot = P['head_at']
    hrx, hry = P['head_r']
    head_pts = blob(0, 0, hrx, hry, P['seed'] + 9, wob=0.05, n=10, squash_bottom=-0.06)
    head_d = cr_closed(head_pts)
    head_poly = cr_sample(head_pts)
    defs.append(f'<clipPath id="{p}clip-head"><path d="{head_d}"/></clipPath>')
    fx1, fy1, fx2, fy2 = P.get('head_fade', (0, hry * 0.42, 0, hry * 1.02))
    defs.append(f'''<linearGradient id="{p}g-headfade" gradientUnits="userSpaceOnUse" x1="{fx1:.0f}" y1="{fy1:.0f}" x2="{fx2:.0f}" y2="{fy2:.0f}">
  <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="{p}m-head" maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800"><rect x="-400" y="-400" width="800" height="800" fill="url(#{p}g-headfade)"/></mask>''')

    def head_shade(x, y):
        rr = math.hypot(x / hrx, y / hry)
        dirn = (x * 0.9 + y * 0.42) / math.hypot(x, y) if (x or y) else 0
        return max(0.0, rr - 0.6) * 2.6 * max(0.0, dirn + 0.1)

    def head_deep(x, y):
        rr = math.hypot(x / hrx, y / hry)
        dirn = (x * 0.92 + y * 0.38) / math.hypot(x, y) if (x or y) else 0
        return max(0.0, rr - 0.8) * 4 * max(0.0, dirn - 0.35)

    def head_hi(x, y):
        v = (-x * 0.6 - y * 0.8) / (hrx * 0.8)
        return max(0, v - 0.05) * 1.6

    hs = hatch(head_poly, P.get('head_n', 70), -0.62, 0.3, (34, 70), (9, 14), head_shade, P['seed'] + 10, bend=7)
    hd2 = hatch(head_poly, 26, -0.55, 0.25, (30, 60), (8, 12), head_deep, P['seed'] + 11, bend=5)
    hh = hatch(head_poly, 18, -0.7, 0.35, (26, 52), (7, 11), head_hi, P['seed'] + 12, bend=6)

    face = P['face'](p)
    jr = math.radians(hrot)
    pivot = (round(hx - (hry - 8) * math.sin(jr)), round(hy + (hry - 8) * math.cos(jr)))
    whorl = ''
    if P.get('whorl'):
        wx, wy, ws, wrot = P['whorl']
        pts = []
        for i in range(60):
            t = i / 59
            ang = wrot + t * 2 * math.pi * 1.55
            rad = ws * (0.12 + 0.88 * t)
            pts.append((wx + rad * math.cos(ang), wy + rad * math.sin(ang) * 0.62))
        wd = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        whorl = f'''<g id="{p}whorl"><!-- pivot: {wx},{wy} in the head frame (spins a quarter turn when it is moved; never changes shape) -->
<g filter="url(#{p}f-ink)"><path d="{wd}" fill="none" stroke="{C['head_deep']}" stroke-width="5" stroke-linecap="round" opacity="0.9"/></g>
</g>'''

    body.append(f'''<g id="{p}head" transform="translate({hx},{hy}) rotate({hrot})"><!-- pivot: {pivot[0]},{pivot[1]} (the neck joint; in this local frame 0,{hry - 8}) -->
<g id="{p}head-fill" mask="url(#{p}m-head)"><g filter="url(#{p}f-warp)">
<path d="{head_d}" style="fill:var(--b-under-head, none)"/>
<path d="{head_d}" fill="{C['head']}" filter="url(#{p}f-tooth1)"/>
<g filter="url(#{p}f-tooth2)"><g clip-path="url(#{p}clip-head)">
{paths(hs, C['head_shade'], 0.55)}
{paths(hd2, C['head_deep'], 0.45)}
{paths(hh, C['head_hi'], 0.85)}
</g></g>
</g></g>
{whorl}
{face}
</g>''')

    if P.get('hand_front') and hand_svg:
        body.append(hand_svg)
    if P.get('extra'):
        body.append(P['extra'](p))

    return '\n'.join(defs), '\n'.join(body)

# ---------------------------------------------------------------- faces


def eye(p, side, cx, cy, rx, ry, look=(0, 0), lid=0.18, tilt=0.0, seed=1, lidline=False, squint=0.0, tip=0.0):
    """An eye: a dense dark pastel bean, its top flattened by the lid, its bottom lifted a little by
    the cheek when it smiles (squint), one irregular gap where the pastel skipped the paper."""
    k = 0.5523
    top = -ry * (1 - lid)
    bot = ry * (1 - squint)
    d = (f"M {-rx:.1f},0 C {-rx:.1f},{bot * k:.1f} {-rx * k:.1f},{bot:.1f} 0,{bot:.1f} "
         f"C {rx * k:.1f},{bot:.1f} {rx:.1f},{bot * k:.1f} {rx:.1f},0 "
         f"C {rx:.1f},{top * (0.78 - 0.3 * tip):.1f} {rx * 0.52 * (1 - tip * 0.75):.1f},{top * (1 + 0.1 * tip):.1f} 0,{top * (1 + 0.16 * tip):.1f} "
         f"C {-rx * 0.52 * (1 - tip * 0.75):.1f},{top * (1 + 0.1 * tip):.1f} {-rx:.1f},{top * (0.78 - 0.3 * tip):.1f} {-rx:.1f},0 Z")
    lx, ly = look
    r = random.Random(seed)
    # the catchlight is a skip in the pastel, not a sticker: a short slanted dab with a ragged end
    gx, gy = lx - rx * 0.28, ly + top * 0.38
    gap = taper_stroke(gx, gy, math.radians(-62 + r.uniform(-8, 8)), ry * 0.5, rx * 0.5, 1.5, r, pinch=0.45)
    lid_d = (f"M {-rx * 1.16:.1f},{top * 0.7:.1f} C {-rx * 0.62:.1f},{top * 1.12:.1f} "
             f"{rx * 0.62:.1f},{top * 1.12:.1f} {rx * 1.16:.1f},{top * 0.7:.1f}")
    lid_el = (f'<path d="{lid_d}" fill="none" stroke="{C["ink"]}" stroke-width="4.2" stroke-linecap="round"/>'
              if lidline else '')
    return f'''<g id="{p}eye-{side}" transform="translate({cx},{cy}) rotate({tilt})"><!-- pivot: {cx},{cy} in the head frame (look = translate {p}pupil-{side}; blink = scaleY of the eye from its top) -->
<g id="{p}pupil-{side}" filter="url(#{p}f-ink)">
<path d="{d}" fill="{C['ink']}"/>
<path d="{gap}" fill="{C['cream_dot']}" opacity="0.92"/>
</g>
<g id="{p}lid-{side}" filter="url(#{p}f-ink)">{lid_el}</g>
</g>'''


def closed_eye(p, side, cx, cy, w, seed=1, up=True):
    s = -1 if up else 1
    d = f"M {-w / 2:.1f},0 C {-w / 4:.1f},{s * w * 0.42:.1f} {w / 4:.1f},{s * w * 0.42:.1f} {w / 2:.1f},0"
    return f'''<g id="{p}eye-{side}" transform="translate({cx},{cy})"><!-- pivot: {cx},{cy} in the head frame -->
<g filter="url(#{p}f-ink)"><path d="{d}" fill="none" stroke="{C['ink']}" stroke-width="5.2" stroke-linecap="round"/></g>
</g>'''


def brow(p, side, cx, cy, ang, length=26, seed=3):
    r = random.Random(seed)
    d = taper_stroke(cx, cy, math.radians(ang), length, 6.5, 2.5 if side == 'l' else -2.5, r, pinch=0.35)
    return f'''<g id="{p}brow-{side}"><!-- pivot: {cx},{cy} in the head frame (raise/tilt) -->
<g filter="url(#{p}f-ink)"><path d="{d}" fill="{C['ink_soft']}" opacity="0.85"/></g>
</g>'''


def cheek(p, side, cx, cy, s=1.0, seed=5, strength=1.0):
    r = random.Random(seed)
    poly = [(cx + 30 * s * math.cos(a), cy + 15 * s * math.sin(a)) for a in [i * math.pi / 12 for i in range(24)]]
    st = hatch(poly, int(9 * strength) + 2, math.radians(-58), 0.18, (18 * s, 30 * s), (5, 7.5), lambda x, y: 1, seed, bend=1.5)
    return f'''<g id="{p}cheek-{side}"><!-- pivot: {cx},{cy} in the head frame (fade/spread for shy or moved) -->
<g filter="url(#{p}f-bleed)"><ellipse cx="{cx}" cy="{cy}" rx="{26 * s:.1f}" ry="{12 * s:.1f}" fill="{C['blush']}" opacity="{0.28 * strength:.2f}"/></g>
<g filter="url(#{p}f-tooth2)">{paths(st, C['blush'], 0.6)}</g>
</g>'''


def mouth_open(p, cx, cy, w=24, h=17, tilt=0):
    d = (f"M {-w / 2:.1f},{-h * 0.25:.1f} C {-w * 0.3:.1f},{-h * 0.42:.1f} {w * 0.3:.1f},{-h * 0.45:.1f} {w / 2:.1f},{-h * 0.2:.1f} "
         f"C {w * 0.5:.1f},{h * 0.45:.1f} {w * 0.18:.1f},{h * 0.62:.1f} 0,{h * 0.6:.1f} "
         f"C {-w * 0.22:.1f},{h * 0.6:.1f} {-w * 0.52:.1f},{h * 0.42:.1f} {-w / 2:.1f},{-h * 0.25:.1f} Z")
    tongue = f"M {-w * 0.28:.1f},{h * 0.38:.1f} C {-w * 0.1:.1f},{h * 0.05:.1f} {w * 0.22:.1f},{h * 0.08:.1f} {w * 0.3:.1f},{h * 0.36:.1f} C {w * 0.1:.1f},{h * 0.6:.1f} {-w * 0.15:.1f},{h * 0.6:.1f} {-w * 0.28:.1f},{h * 0.38:.1f} Z"
    return f'''<g id="{p}mouth" transform="translate({cx},{cy}) rotate({tilt})"><!-- pivot: {cx},{cy} in the head frame (open/close = scaleY) -->
<g filter="url(#{p}f-ink)"><path d="{d}" fill="{C['ink']}"/><path d="{tongue}" fill="{C['mouth_in']}"/></g>
</g>'''


def mouth_line(p, cx, cy, w=20, curve=6, tilt=0):
    d = f"M {-w / 2:.1f},0 C {-w / 4:.1f},{curve:.1f} {w / 4:.1f},{curve:.1f} {w / 2:.1f},{-curve * 0.15:.1f}"
    return f'''<g id="{p}mouth" transform="translate({cx},{cy}) rotate({tilt})"><!-- pivot: {cx},{cy} in the head frame -->
<g filter="url(#{p}f-ink)"><path d="{d}" fill="none" stroke="{C['ink']}" stroke-width="4.4" stroke-linecap="round"/></g>
</g>'''


def wave_marks(p, cx, cy):
    """Two short pastel arcs beside the raised hand: it is waving."""
    segs = [arc_stroke(cx, cy, 64, 64, math.radians(-62), math.radians(-8), 6, 4, 501),
            arc_stroke(cx, cy, 86, 86, math.radians(-52), math.radians(-14), 5, 3.5, 502)]
    return f"""<g id="{p}wave-marks"><!-- pivot: {cx},{cy} (an effect, not a body part: fades in while the hand waves) -->
<g filter="url(#{p}f-tooth2)" opacity="0.85">{paths(segs, C['mark'])}</g></g>"""


def face_main(p):
    return '\n'.join([
        cheek(p, 'l', -68, 50, 1.0, seed=51),
        cheek(p, 'r', 74, 44, 0.92, seed=52),
        eye(p, 'l', -40, 14, 17, 25, look=(1, 1), lid=0.0, tilt=10, seed=1, squint=0.16, tip=0.9),
        eye(p, 'r', 43, 9, 16, 24, look=(1, 1), lid=0.0, tilt=-6, seed=2, squint=0.16, tip=0.9),
        mouth_open(p, 4, 56, w=19, h=14, tilt=-6),
    ])


def face_peek(p):
    return '\n'.join([
        cheek(p, 'l', -66, 44, 0.9, seed=53, strength=0.8),
        cheek(p, 'r', 62, 38, 0.8, seed=54, strength=0.8),
        eye(p, 'l', -42, 8, 17, 26, look=(-3, 1), lid=0.0, tilt=12, seed=3, squint=0.04, tip=0.9),
        eye(p, 'r', 38, 3, 16, 25, look=(-3, 1), lid=0.0, tilt=-4, seed=4, squint=0.04, tip=0.9),
        brow(p, 'l', -46, -36, -20, length=22, seed=63),
        brow(p, 'r', 40, -42, 14, length=20, seed=64),
        mouth_open(p, -2, 50, w=14, h=14, tilt=0),
    ])


def face_moved(p):
    r = random.Random(77)
    # a bead of tear in the pool's own colour, at the outer corner
    tear = ("M 0,-14 C 4,-6 10,2 10,8 C 10,15 5,19 0,19 C -5,19 -10,15 -10,8 C -10,2 -4,-6 0,-14 Z")
    runs = []
    for (x0, y0, ln) in [(-74, 62, 70), (-58, 70, 92), (78, 56, 64), (64, 66, 84)]:
        runs.append(taper_stroke(x0 + r.uniform(-3, 3), y0 + ln / 2, math.radians(90 + r.uniform(-6, 6)), ln, 13, r.uniform(-3, 3), r, pinch=0.15))
    return '\n'.join([
        f'''<g id="{p}flush"><!-- pivot: 0,60 in the head frame (the cheeks' colour running down: grows downward as it is moved) -->
<g filter="url(#{p}f-bleed)" opacity="0.5">{paths(runs, C['blush'])}</g></g>''',
        cheek(p, 'l', -64, 34, 1.3, seed=55, strength=2.0),
        cheek(p, 'r', 70, 30, 1.2, seed=56, strength=2.0),
        closed_eye(p, 'l', -40, 10, 36),
        closed_eye(p, 'r', 44, 6, 34),
        mouth_line(p, 4, 42, w=24, curve=8, tilt=-4),
        f'''<g id="{p}tear" transform="translate(-66,30)"><!-- pivot: -66,30 in the head frame (a bead of the pool's colour, runs down then drops) -->
<g filter="url(#{p}f-tooth2)"><path d="{tear}" fill="{C['pool_hi']}"/></g>
<g filter="url(#{p}f-ink)"><path d="{tear}" fill="none" stroke="{C['pool_shade']}" stroke-width="2.4"/></g></g>''',
    ])

# ---------------------------------------------------------------- poses

POSES = {}

POSES['main'] = dict(
    seed=100,
    pool=[(160, 642), (176, 606), (220, 580), (290, 561), (370, 552), (452, 555), (530, 568), (590, 592), (626, 620),
          (632, 648), (566, 662), (456, 667), (336, 667), (228, 661)],
    neck=[(266, 604), (312, 574), (336, 540), (342, 505), (334, 470), (314, 436), (294, 402), (330, 372), (400, 362),
          (470, 372), (506, 402), (486, 436), (466, 470), (460, 505), (466, 540), (494, 574), (538, 604), (400, 618)],
    neck_base=(400, 592),
    neck_mid_x=lambda y: 422,
    head_at=(400, 332, 7),
    head_r=(142, 119),
    head_pivot=(398, 438),
    hand=dict(
        pts=tube([(536, 626), (544, 580), (554, 534), (564, 496), (574, 466), (590, 442), (612, 420), (628, 406)],
                 [48, 36, 30, 28, 36, 50, 48, 22]),
        pivot=(540, 612),
        mid_x=lambda y: 576 + (520 - y) * 0.3,
    ),
    extra=lambda p: wave_marks(p, 612, 420),
    ripple_c=(400, 650),
    ripple_rings=[
        (264, 30, 9, C['ripple'], 0.9, [(0.05, 1.45), (1.62, 3.05)]),
        (320, 40, 7.5, C['ripple'], 0.75, [(-0.25, 0.9), (1.08, 2.15), (2.32, 3.4)]),
        (374, 50, 6, C['ripple2'], 0.65, [(0.25, 1.25), (1.9, 2.85)]),
    ],
    head_n=56,
    meniscus=[(402, 594, 96, 15, 0.12, 3.0, 8), (540, 616, 32, 7, 0.2, 2.9, 6)],
    whorl=(26, -86, 20, 0.6),
    face=face_main,
)

# peeking in from the frame's right edge: a long "?" of a neck, the pool off-frame
_peek_c = [(930, 640), (820, 616), (726, 576), (662, 516), (618, 464), (580, 430)]
POSES['peek'] = dict(
    seed=200,
    pool=[(900, 700), (930, 660), (1000, 640), (1080, 650), (1100, 720), (1000, 760), (920, 750)],
    neck=tube(_peek_c, [190, 150, 134, 126, 136, 112]),
    neck_ang=0.62,
    head_fade=(40, 40, 135, 118),
    neck_base=(860, 630),
    neck_mid_x=lambda y: 640 + (560 - y) * 0.3,
    neck_hold=0.32, neck_mix=0.7,
    head_at=(522, 374, -16),
    head_r=(130, 111),
    head_pivot=(590, 440),
    pool_n=60,
    neck_n=40,
    ripples=False,
    ripple_c=(800, 760),
    whorl=(30, -84, 19, 1.4),
    face=lambda p: face_peek(p),
)

# moved: sunk low into its pool, a tendril pressed to its cheek, its colour running
POSES['moved'] = dict(
    seed=300,
    pool=[(150, 640), (166, 602), (214, 574), (290, 552), (370, 544), (452, 548), (530, 562), (590, 590), (622, 620),
          (626, 648), (560, 662), (450, 666), (330, 666), (222, 660)],
    neck=tube([(396, 630), (396, 584), (396, 520)], [300, 236, 250]),
    neck_base=(396, 600),
    neck_mid_x=lambda y: 440,
    neck_hold=0.2, neck_mix=0.62,
    head_at=(396, 446, -6),
    head_r=(146, 118),
    head_pivot=(396, 560),
    hand=dict(
        pts=tube([(250, 632), (238, 576), (236, 526), (248, 490), (274, 468), (296, 462)], [48, 36, 30, 34, 46, 30]),
        pivot=(248, 622),
        mid_x=lambda y: 252,
        ang=-1.3,
    ),
    hand_front=True,
    ripple_c=(396, 650),
    ripple_rings=[
        (268, 30, 9, C['mix'], 0.85, [(0.05, 1.45), (1.62, 3.05)]),
        (326, 40, 7.5, C['ripple'], 0.6, [(-0.2, 1.0), (1.2, 3.3)]),
        (380, 50, 6, C['mix'], 0.45, [(0.3, 1.3), (1.9, 2.9)]),
    ],
    meniscus=[(400, 606, 120, 14, 0.5, 2.5, 6)],
    whorl=(22, -88, 20, 2.6),
    face=face_moved,
)


def svg_character(prefix='b-', pose='main'):
    defs, body = character(prefix, pose)
    return defs, body


def write_character():
    p = 'b-'
    defs, body = character(p, 'main')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<title>漾漾 Plip — direction B</title>
<!-- 漾漾 Plip: a drop of pastel that rose out of its own pool. Every movable part is its own named group.
     Pivots are in the 800×800 viewBox unless a comment says "head frame" (the head group's local space:
     its centre is 0,0; the group is placed with translate(400,332) rotate(7)). -->
<defs>
{filters(p)}
{defs}
</defs>
<g id="b-plip">
{body}
</g>
</svg>
'''
    with open(os.path.join(HERE, 'character.svg'), 'w') as f:
        f.write(svg)


def wobbly_rect(x, y, w, h, seed, j=2.2):
    r = random.Random(seed)
    pts = []
    for (ax, ay, bx, by) in [(x, y, x + w, y), (x + w, y, x + w, y + h), (x + w, y + h, x, y + h), (x, y + h, x, y)]:
        for s in range(4):
            t = s / 4
            pts.append((ax + (bx - ax) * t + r.uniform(-j, j), ay + (by - ay) * t + r.uniform(-j, j)))
    return cr_closed(pts, k=0.6)


def write_concept():
    FONT = "'PingFang TC','Noto Sans TC',sans-serif"
    m_defs, m_body = character('b-m-', 'main')
    p_defs, p_body = character('b-p-', 'peek')
    v_defs, v_body = character('b-v-', 'moved')
    night_vars = ("--b-under-head:oklch(77% 0.055 60);--b-under-neck:oklch(73% 0.055 25);"
                  "--b-under-pool:oklch(68% 0.045 300)")

    def label(x, y, text, size=15, color=None, anchor='start', weight=400):
        return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
                f'fill="{color or C["label"]}" text-anchor="{anchor}">{text}</text>')

    def tile(x, y, w, h, seed, fill):
        d = wobbly_rect(x, y, w, h, seed)
        return (f'<path d="{d}" fill="{fill}"/>'
                f'<path d="{d}" fill="none" stroke="{C["label"]}" stroke-opacity="0.55" stroke-width="1.6" filter="url(#b-c-pen)"/>')

    # crop helpers: place an 800-space window (cx0, cy0, cw) into a tile at (x, y) of width w
    def place(cx0, cy0, cw, x, y, w):
        s = w / cw
        return f'translate({x - cx0 * s:.2f},{y - cy0 * s:.2f}) scale({s:.4f})'

    # divider between the stage and the side column: one wavy pen line
    wav = "M 1000,24 " + " ".join(f"Q {1000 + (7 if i % 2 else -7)},{24 + i * 40 + 20} 1000,{24 + (i + 1) * 40}" for i in range(24))

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
<title>漾漾 Plip — concept (direction B)</title>
<defs>
  <filter id="b-c-paper" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="2" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.18  0 0 0 0.10 0"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
  <filter id="b-c-pen" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="6" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/>
  </filter>
  <clipPath id="b-c-peekclip"><path d="{wobbly_rect(1040, 400, 250, 300, 31)}"/></clipPath>
  <clipPath id="b-c-movedclip"><path d="{wobbly_rect(1310, 400, 250, 300, 32)}"/></clipPath>
  <clipPath id="b-c-nightclip"><path d="{wobbly_rect(1040, 70, 260, 260, 33)}"/></clipPath>
{filters('b-m-')}
{filters('b-p-')}
{filters('b-v-')}
{m_defs}
{p_defs}
{v_defs}
<g id="b-m-plip">
{m_body}
</g>
</defs>

<!-- paper -->
<rect width="1600" height="1000" fill="{C['paper']}"/>
<rect x="1000" width="600" height="1000" fill="oklch(95% 0.017 72)"/>
<rect width="1600" height="1000" fill="#fff" filter="url(#b-c-paper)"/>
<path d="{wav}" fill="none" stroke="{C['label']}" stroke-opacity="0.35" stroke-width="1.6" stroke-linecap="round"/>

<!-- stage: the main illustration -->
{label(56, 78, '漾漾', 40, C['label'], weight=600)}{label(150, 78, 'Plip', 26, C['label_soft'])}
{label(58, 108, 'B｜蠟筆流體生命 — 一滴從自己的池子裡升起來的顏色', 16, C['label_soft'])}
<use href="#b-m-plip" transform="{place(10, 110, 780, 30, 140, 950)}"/>
{label(58, 958, '主姿勢：從池子裡升起來、歪頭看你、舉起一隻從水面長出來的手', 14, C['label_soft'])}

<!-- side column -->
{label(1040, 52, '夜紙', 15)}
{tile(1040, 70, 260, 260, 33, C['night'])}
<g clip-path="url(#b-c-nightclip)" style="{night_vars}">
  <g style="filter:brightness(0.93)"><use href="#b-m-plip" transform="{place(30, 150, 740, 1046, 76, 248)}"/></g>
</g>

{label(1330, 52, '縮小測試', 15)}
{tile(1330, 70, 230, 260, 34, C['paper'])}
<!-- exact heights: the figure runs from the crown (y≈205) to the outer ripple (y≈700) = 495 units -->
<use href="#b-m-plip" transform="translate({1350 - 30 * 96 / 495:.2f},{98 - 205 * 96 / 495:.2f}) scale({96 / 495:.4f})"/>
<use href="#b-m-plip" transform="translate({1350 - 30 * 48 / 495:.2f},{226 - 205 * 48 / 495:.2f}) scale({48 / 495:.4f})"/>
{label(1506, 152, '96 px', 13, C['label_soft'])}{label(1432, 256, '48 px', 13, C['label_soft'])}

{label(1040, 382, '好奇探頭', 15)}{label(1112, 382, '從畫面邊緣伸長脖子', 12, C['label_soft'])}
{tile(1040, 400, 250, 300, 31, C['paper'])}
<g clip-path="url(#b-c-peekclip)">
  <g transform="{place(300, 172, 460, 1040, 400, 250)}">
{p_body}
  </g>
</g>

{label(1310, 382, '被感動', 15)}{label(1366, 382, '沉進池裡、顏色暈開', 12, C['label_soft'])}
{tile(1310, 400, 250, 300, 32, C['paper'])}
<g clip-path="url(#b-c-movedclip)">
  <g transform="{place(110, 168, 580, 1310, 400, 250)}">
{v_body}
  </g>
</g>

{label(1040, 772, '標誌：身上不變的三件事', 15)}
{label(1040, 800, '水滴形的眼睛　·　頭頂一個自己的「旋」　·　走到哪都帶著的池子和漣漪', 13, C['label_soft'])}
{label(1040, 826, '其餘的身體都可以伸長、壓扁、長出一隻手、沉回水裡', 13, C['label_soft'])}
</svg>
'''
    with open(os.path.join(HERE, 'concept.svg'), 'w') as f:
        f.write(svg)


if __name__ == '__main__':
    write_character()
    write_concept()
    print('wrote character.svg, concept.svg')
