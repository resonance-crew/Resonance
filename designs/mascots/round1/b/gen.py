#!/usr/bin/env python3
"""Generator for direction B, 漾漾 Plip: revision 2.

A drop of apricot pastel held up on a thin lavender jet that rises out of the
landing page's own lavender blob. Everything is drawn here as SVG.

What changed from v1 (gen-v1.py) in how it is built:
- The paper tooth is no longer inside each part. One tooth mask sits over the
  whole figure, in the figure's root space, so a part that is stretched or
  squashed keeps its colour and its warped edge but never stretches the grain.
- Under the figure, one underpaint made from the figure's own silhouette,
  eroded 7 units: paper colour by day (nothing behind shows through), the
  figure's own colour dimmed by night. The outer 7 units have none, so the
  crayon edge stays broken on any ground.
- The pool is the hero's blob: the same colour token, opacity and grain.
- One pencil line (the site's one pen) on the head's upper edge, the eyes,
  the mouth and the whorl; the ripples are drawn with it too.

Run: python3 gen.py  -> character.svg, concept.svg and the check pages in checks/.
"""
import math
import os
import random
import re

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- palette (oklch)
C = {
    'head': 'oklch(86.5% 0.058 64)',       # apricot cream: the drop
    'head_shade': 'oklch(76% 0.085 46)',
    'head_deep': 'oklch(68% 0.095 40)',
    'head_hi': 'oklch(95.5% 0.028 88)',    # cream pastel over the lit top
    'neck': 'oklch(79% 0.05 293)',         # the hero blob's lavender (hue 290), as a dusty pastel
    'neck_top': 'oklch(84% 0.04 305)',     # lighter where it runs up into the drop
    'neck_shade': 'oklch(68% 0.058 292)',
    'neck_hi': 'oklch(90% 0.028 300)',
    'blush': 'oklch(74% 0.1 22)',
    'ink': 'oklch(30% 0.035 42)',          # eyes, mouth fill
    'mouth_in': 'oklch(62% 0.11 25)',
    'cream_dot': 'oklch(97% 0.015 85)',
    'pen': 'oklch(50% 0.05 50)',           # the one pen, mid-tone (day)
    'pen_night': 'oklch(64% 0.035 62)',    # the same pen on night paper
    'lavender': 'oklch(80% 0.07 290)',     # tokens: light color-lavender
    'lavender_night': 'oklch(30% 0.045 290)',  # tokens: dark color-lavender
    'paper': 'oklch(96.5% 0.015 75)',
    'night': 'oklch(21% 0.012 60)',
    'label': 'oklch(42% 0.03 55)',
    'label_soft': 'oklch(58% 0.025 60)',
}

# The hero's lavender blob: OrganiBlob variant 3, drawn at opacity 0.25 with grain 0.2.
BLOB3 = ('M38.2,-49.7C50.9,-40.5,63.5,-30.4,68.3,-17.1C73.1,-3.8,70.1,12.7,62.5,26.2C54.9,39.7,42.7,50.2,28.7,57.5'
         'C14.7,64.8,-1.1,68.9,-15.6,65.5C-30.1,62.1,-43.3,51.2,-53.8,37.5C-64.3,23.8,-72.1,7.3,-71.4,-8.8'
         'C-70.7,-24.9,-61.5,-40.6,-48.4,-49.9C-35.3,-59.2,-18.3,-62,-2.8,-58.7C12.7,-55.4,25.5,-58.9,38.2,-49.7Z')
BLOB_OPACITY = 0.25
# Landing size this file is drawn for: the 800 box at 320 px (0.4 px a unit), which makes the pool
# as wide as the hero blob. The site's pens at that size: 1.8 px main, 1.2 px secondary.
LANDING = 0.4
PEN = 1.8 / LANDING        # 4.5 units
PEN2 = 1.2 / LANDING       # 3 units
BLOB_GRAIN_FREQ = 0.9 / (300 / 180) * LANDING   # OrganiBlob's 0.9 a unit at 300 px for 180 units, in our units
ERODE = 7                   # underpaint inset

# ---------------------------------------------------------------- geometry helpers


def cr_closed(pts, k=1.0):
    n = len(pts)
    d = f"M {pts[0][0]:.1f},{pts[0][1]:.1f}"
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6 * k, p1[1] + (p2[1] - p0[1]) / 6 * k)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6 * k, p2[1] - (p3[1] - p1[1]) / 6 * k)
        d += f" C {c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d + " Z"


def cr_sample(pts, per=12, closed=True):
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
    if not closed:
        out.append(pts[-1])
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
        w = width * (pinch + (1 - pinch) * math.sin(math.pi * min(1, t * 1.1)) ** 0.6) * (1.05 - 0.25 * t)
        w *= 1 + r.uniform(-0.12, 0.12)
        left.append((bx + nx * w / 2, by + ny * w / 2))
        right.append((bx - nx * w / 2, by - ny * w / 2))
    pts = left + right[::-1]
    return "M " + " L ".join(f"{px:.1f},{py:.1f}" for px, py in pts) + " Z"


def hatch(poly, count, ang, ang_jit, length, width, weight, seed, bend=6):
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
        L = r.uniform(*length)
        W = r.uniform(*width)
        out.append(taper_stroke(x, y, a, L, W, r.uniform(-bend, bend), r))
    return out


def tube(center, widths):
    """Outline of a soft tube along a centreline (left side forward, right side back)."""
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
    """Signed distance of x,y from the centreline, positive on the normal (-dy, dx) side."""
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
            s = ((x - px) * (-dy / L) + (y - py) * (dx / L))
            best = (dd, s, (i + t) / (len(center) - 1))
    return best[1], best[2]


def paths(ds, fill, opacity=None, extra=''):
    op = f' fill-opacity="{opacity}"' if opacity is not None else ''
    return '\n'.join(f'<path d="{d}" fill="{fill}"{op}{extra}/>' for d in ds)


def rot(x, y, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return x * c - y * s, x * s + y * c


def blob_path(d, cx, cy, sx, sy):
    return re.sub(r'(-?[\d.]+),(-?[\d.]+)',
                  lambda m: f'{cx + float(m.group(1)) * sx:.1f},{cy + float(m.group(2)) * sy:.1f}', d)


def pen_line(pts, width, seed, profile=(0.35, 1.0, 0.4), shift=0.0):
    """A pencil line as a filled outline with a pressure profile: it lands light, holds, lifts off.
    shift moves it sideways (a second pass that does not quite land on the first)."""
    r = random.Random(seed)
    n = len(pts)
    L = [0.0]
    for i in range(1, n):
        L.append(L[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    total = L[-1] or 1
    w0, wm, w1 = profile
    phase = r.uniform(0, 6.28)
    left, right = [], []
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy) or 1
        nx, ny = -dy / l, dx / l
        t = L[i] / total
        if t < 0.18:
            w = w0 + (wm - w0) * (t / 0.18)
        elif t > 0.78:
            w = wm + (w1 - wm) * ((t - 0.78) / 0.22)
        else:
            w = wm * (1 + 0.1 * math.sin(t * 9 + phase))
        w *= width
        off = shift + 0.35 * math.sin(t * 13 + phase)
        cx, cy = pts[i][0] + nx * off, pts[i][1] + ny * off
        left.append((cx + nx * w / 2, cy + ny * w / 2))
        right.append((cx - nx * w / 2, cy - ny * w / 2))
    out = left + right[::-1]
    return "M " + " L ".join(f"{px:.1f},{py:.1f}" for px, py in out) + " Z"


def arc_pts(cx, cy, rx, ry, t0, t1, steps=40, wob=0.0, seed=1):
    r = random.Random(seed)
    return [(cx + rx * math.cos(t0 + (t1 - t0) * i / steps), cy + ry * math.sin(t0 + (t1 - t0) * i / steps) + r.uniform(-wob, wob))
            for i in range(steps + 1)]


def pen_group(ds_main, ds_second, pen_style, filt, op_main=0.92, op_second=0.42):
    """Main pass plus a lighter second pass of the same pencil."""
    a = '\n'.join(f'<path d="{d}" style="{pen_style}" fill-opacity="{op_main}"/>' for d in ds_main)
    b = '\n'.join(f'<path d="{d}" style="{pen_style}" fill-opacity="{op_second}"/>' for d in ds_second)
    return f'<g filter="url(#{filt})">\n{a}\n{b}\n</g>'

# ---------------------------------------------------------------- filters


def filters(p):
    return f'''
  <!-- big hand wobble + fuzzy crayon edge: the only filter inside a part (it moves and stretches with it) -->
  <filter id="{p}f-warp" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="5" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="13" xChannelSelector="R" yChannelSelector="G" result="wob"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="8" result="fuzz"/>
    <feDisplacementMap in="wob" in2="fuzz" scale="7" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <!-- the pencil on a warped edge: the same slow wobble as the fill under it (so it lands on that edge), a little tremor -->
  <filter id="{p}f-wob" x="-12%" y="-20%" width="124%" height="140%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="5" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="13" xChannelSelector="R" yChannelSelector="G" result="wob"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="17" result="tr"/>
    <feDisplacementMap in="wob" in2="tr" scale="1.4" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <!-- the pencil on the paper (ripples, marks): a light tremor and graphite that skips the paper's pits -->
  <filter id="{p}f-pencil" x="-5%" y="-30%" width="110%" height="160%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="1" seed="9" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.85 0.55" numOctaves="2" seed="23" result="g0"/>
    <feColorMatrix in="g0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -5 0 0 0 3.55" result="g"/>
    <feComposite in="d" in2="g" operator="in"/>
  </filter>
  <!-- the dark marks (eyes, mouth): dense pastel, a ragged edge -->
  <filter id="{p}f-ink" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="31" result="fz"/>
    <feDisplacementMap in="SourceGraphic" in2="fz" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <!-- colour that has bled into the paper: soft, no hard edge -->
  <filter id="{p}f-bleed" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feGaussianBlur stdDeviation="5"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.9"/></feComponentTransfer>
    <feComposite in2="SourceGraphic" operator="over"/>
  </filter>
  <!-- ONE paper tooth for the whole figure, in the figure's root space: white keeps the pastel, the pits are holes.
       Fine anisotropic grain + slow hand pressure, the same recipe as v1's first layer. -->
  <filter id="{p}f-toothmask" filterUnits="userSpaceOnUse" x="-400" y="-400" width="1800" height="1800" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.36 0.7" numOctaves="3" seed="21" result="t0"/>
    <feColorMatrix in="t0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="t"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="4" result="p0"/>
    <feColorMatrix in="p0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="pp"/>
    <feComposite in="t" in2="pp" operator="arithmetic" k2="1" k3="0.9" k4="-0.45" result="tp"/>
    <feComponentTransfer in="tp" result="keep"><feFuncA type="linear" slope="-7" intercept="5.34"/></feComponentTransfer>
    <feFlood flood-color="#fff"/>
    <feComposite in2="keep" operator="in"/>
  </filter>
  <mask id="{p}m-tooth" maskUnits="userSpaceOnUse" x="-400" y="-400" width="1800" height="1800">
    <rect x="-400" y="-400" width="1800" height="1800" fill="#fff" filter="url(#{p}f-toothmask)"/>
  </mask>
  <!-- underpaint, day: the figure's own silhouette eroded {ERODE} units, in the paper's colour (opaque: nothing behind shows through) -->
  <filter id="{p}f-under" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    <feMorphology in="SourceAlpha" operator="erode" radius="{ERODE}" result="core"/>
    <feFlood flood-color="{C['paper']}"/>
    <feComposite in2="core" operator="in"/>
  </filter>
  <!-- underpaint, night: the same eroded silhouette in the figure's own colour a step darker, so a pit shows dim pastel, not black -->
  <filter id="{p}f-under-night" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    <feMorphology in="SourceAlpha" operator="erode" radius="{ERODE}" result="core"/>
    <feColorMatrix in="SourceGraphic" type="matrix" values="0.62 0 0 0 0.02  0 0.62 0 0 0.02  0 0 0.62 0 0.03  0 0 0 1 0" result="dim"/>
    <feComposite in="dim" in2="core" operator="in"/>
  </filter>
  <!-- the hero blob's grain (ShapeGrain / OrganiBlob recipe, its frequency scaled to this file's landing size) -->
  <filter id="{p}f-blobgrain" x="0%" y="0%" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="{BLOB_GRAIN_FREQ:.3f}" numOctaves="2" stitchTiles="stitch" seed="4"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.2"/></feComponentTransfer>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>'''

# ---------------------------------------------------------------- the character


def head_shape(rx, ry_top, ry_bot, seed, n=12, wob=0.018, pull=0.05):
    """A wide drop: flatter on top, a little fuller underneath where the jet holds it."""
    r = random.Random(seed)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + r.uniform(-0.05, 0.05)
        f = 1 + r.uniform(-wob, wob)
        s = math.sin(a)
        ry = ry_top if s < 0 else ry_bot
        x = rx * f * math.cos(a)
        y = ry * f * s
        if s > 0:
            y *= 1 + pull * s ** 6
            x *= 1 - pull * 0.6 * s ** 4
        pts.append((x, y))
    return pts


def character(p, pose='main', night=False, stretch=None):
    """Return (defs, body) for one instance; p is the id prefix.
    stretch: scaleY for the neck (a check render): the head rides up with it."""
    P = POSES[pose]
    defs = []
    pen_col = C['pen_night'] if night else C['pen']
    pen_style = f"fill:var(--b-pen, {pen_col})"
    rng = random.Random(P['seed'])

    # ---------- pool: the hero's lavender blob, nothing else (hide it where the page's own blob is under the figure)
    pool_svg = ''
    if P.get('pool'):
        pd = blob_path(BLOB3, *P['pool'])
        lav = C['lavender_night'] if night else C['lavender']
        gscale = 0.4 if night else 1
        pool_svg = f'''<g id="{p}pool" opacity="{BLOB_OPACITY}"><!-- pivot: {P['root'][0]},{P['root'][1]}. The landing hero's lavender blob: same token, opacity and grain. Hide it when the figure sits on the page's own blob -->
<path d="{pd}" style="fill:var(--color-lavender, {lav})"/>
<path d="{pd}" fill="black" filter="url(#{p}f-blobgrain)" style="opacity:var(--grain-scale, {gscale})"/>
</g>'''

    # ---------- ripples: the one pen, behind the figure
    rip_svg = ''
    if P.get('ripples'):
        rcx, rcy = P['ripple_c']
        rings = []
        for i, (rx, ry, w, op, gaps) in enumerate(P['ripples']):
            main = [pen_line(arc_pts(rcx, rcy, rx, ry, t0, t1, wob=0.6, seed=P['seed'] + 40 + i * 7 + j), w, P['seed'] + 60 + i * 7 + j, (0.3, 1, 0.3))
                    for j, (t0, t1) in enumerate(gaps)]
            second = [pen_line(arc_pts(rcx, rcy + 2.2, rx * 0.985, ry, t0 + 0.12, t1 - 0.2, wob=0.6, seed=P['seed'] + 80 + i * 7 + j), w * 0.55, P['seed'] + 90 + i * 7 + j, (0.3, 1, 0.2))
                      for j, (t0, t1) in enumerate(gaps)]
            rings.append(f'<g id="{p}ripple-{i + 1}" opacity="{op}">\n{pen_group(main, second, pen_style, p + "f-pencil")}\n</g>')
        rip_svg = (f'<g id="{p}ripples"><!-- pivot: {rcx},{rcy} (rings scale out from here and fade) -->\n'
                   + '\n'.join(rings) + '\n</g>')

    # ---------- neck: a thin lavender jet with a waist and one side bend
    nc = P['neck_c']
    nw = P['neck_w']
    neck_pts = tube(nc, nw)
    neck_d = cr_closed(neck_pts)
    neck_poly = cr_sample(neck_pts)
    root = nc[0]
    top = nc[-1]
    defs.append(f'<clipPath id="{p}clip-neck"><path d="{neck_d}"/></clipPath>')
    defs.append(f'''<linearGradient id="{p}g-neck" gradientUnits="userSpaceOnUse" x1="{root[0]:.0f}" y1="{root[1]:.0f}" x2="{top[0]:.0f}" y2="{top[1]:.0f}">
  <stop offset="0" stop-color="{C['neck']}"/><stop offset="0.6" stop-color="{C['neck']}"/><stop offset="1" stop-color="{C['neck_top']}"/></linearGradient>''')
    # the root fades to nothing over its first stretch, so it meets whatever is under it (the hero blob, any paper)
    fx, fy = nc[1][0] - root[0], nc[1][1] - root[1]
    fl = math.hypot(fx, fy) or 1
    fade_len = P.get('neck_fade', 70)
    f2 = (root[0] + fx / fl * fade_len, root[1] + fy / fl * fade_len)
    defs.append(f'''<linearGradient id="{p}g-neckfade" gradientUnits="userSpaceOnUse" x1="{root[0]:.0f}" y1="{root[1]:.0f}" x2="{f2[0]:.0f}" y2="{f2[1]:.0f}">
  <stop offset="0.12" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
<mask id="{p}m-neck" maskUnits="userSpaceOnUse" x="-400" y="-400" width="1800" height="1800"><rect x="-400" y="-400" width="1800" height="1800" fill="url(#{p}g-neckfade)"/></mask>''')
    ss = P.get('shade_side', 1)

    def neck_shade(x, y):
        s, _ = side_of(nc, x, y)
        return 0.95 if s * ss > 4 else 0.08

    def neck_hi(x, y):
        s, t = side_of(nc, x, y)
        return 0.9 if s * ss < -6 and t > 0.2 else 0.0
    nsh = hatch(neck_poly, P.get('neck_n', 30), P.get('neck_ang', -1.2), 0.25, (26, 46), (8, 12), neck_shade, P['seed'] + 5, bend=3)
    nhi = hatch(neck_poly, 12, P.get('neck_ang', -1.2) + 0.2, 0.2, (24, 40), (6, 9), neck_hi, P['seed'] + 6, bend=3)
    chin_svg = ''
    if P.get('chin'):
        cx_, cy_ = P['head_at'][0], P['head_at'][1]
        bx_, by_ = rot(P['attach'][0], P['attach'][1] - 4, P['head_at'][2])
        chin_svg = (f'<g filter="url(#{p}f-bleed)"><ellipse cx="{cx_ + bx_:.0f}" cy="{cy_ + by_:.0f}" rx="50" ry="22" '
                    f'transform="rotate({P["head_at"][2]} {cx_ + bx_:.0f} {cy_ + by_:.0f})" fill="{C["neck_shade"]}" opacity="0.55"/></g>')
    neck_inner = f'''<g mask="url(#{p}m-neck)"><g filter="url(#{p}f-warp)">
<path d="{neck_d}" fill="url(#{p}g-neck)"/>
<g clip-path="url(#{p}clip-neck)">
{paths(nsh, C['neck_shade'], 0.5)}
{paths(nhi, C['neck_hi'], 0.75)}
{chin_svg}
</g>
</g></g>'''
    if stretch:
        neck_inner = f'<g transform="translate({root[0]:.0f},{root[1]:.0f}) scale(1,{stretch}) translate({-root[0]:.0f},{-root[1]:.0f})">{neck_inner}</g>'
    neck_svg = f'''<g id="{p}neck"><!-- pivot: {P['root'][0]},{P['root'][1]} (stretch and bend from where it leaves the pool; colour and warped edge only: the grain is the figure's, not the neck's) -->
{neck_inner}
</g>'''

    # ---------- hand: a smaller jet from the pool with a bead of a palm
    hand_svg = ''
    if P.get('hand'):
        hp = P['hand']
        hc = hp['c']
        hpts = tube(hc, hp['w'])
        hd = cr_closed(hpts)
        px_, py_, prx, pry, prot = hp['palm']
        palm_pts = [(px_ + rot(prx * math.cos(a), pry * math.sin(a), prot)[0], py_ + rot(prx * math.cos(a), pry * math.sin(a), prot)[1])
                    for a in [i * 2 * math.pi / 10 + 0.1 * math.sin(i * 3) for i in range(10)]]
        pald = cr_closed(palm_pts)
        hpoly = cr_sample(hpts)
        ppoly = cr_sample(palm_pts)
        defs.append(f'<clipPath id="{p}clip-hand"><path d="{hd}"/><path d="{pald}"/></clipPath>')
        h0, h1 = hc[0], (px_, py_)
        defs.append(f'''<linearGradient id="{p}g-hand" gradientUnits="userSpaceOnUse" x1="{h0[0]:.0f}" y1="{h0[1]:.0f}" x2="{h1[0]:.0f}" y2="{h1[1]:.0f}">
  <stop offset="0" stop-color="{C['neck']}"/><stop offset="0.55" stop-color="{C['neck']}"/><stop offset="1" stop-color="{C['neck_top']}"/></linearGradient>''')
        gx, gy = hc[1][0] - h0[0], hc[1][1] - h0[1]
        gl = math.hypot(gx, gy) or 1
        g2 = (h0[0] + gx / gl * 46, h0[1] + gy / gl * 46)
        defs.append(f'''<linearGradient id="{p}g-handfade" gradientUnits="userSpaceOnUse" x1="{h0[0]:.0f}" y1="{h0[1]:.0f}" x2="{g2[0]:.0f}" y2="{g2[1]:.0f}">
  <stop offset="0.15" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
<mask id="{p}m-hand" maskUnits="userSpaceOnUse" x="-400" y="-400" width="1800" height="1800"><rect x="-400" y="-400" width="1800" height="1800" fill="url(#{p}g-handfade)"/></mask>''')
        hss = hp.get('shade_side', 1)
        hsh = hatch(hpoly + ppoly, 14, hp.get('ang', -1.2), 0.3, (18, 32), (6, 9),
                    lambda x, y: 0.9 if side_of(hc + [h1], x, y)[0] * hss > 3 else 0.1, P['seed'] + 8, bend=2)
        hand_svg = f'''<g id="{p}hand"><!-- pivot: {hp['pivot'][0]},{hp['pivot'][1]} (rises out of the pool here: grow = scaleY, wave = rotate) -->
<g mask="url(#{p}m-hand)"><g filter="url(#{p}f-warp)">
<path d="{hd}" fill="url(#{p}g-hand)"/>
<path d="{pald}" fill="url(#{p}g-hand)"/>
<g clip-path="url(#{p}clip-hand)">{paths(hsh, C['neck_shade'], 0.45)}</g>
</g></g>
</g>'''

    # ---------- head (local frame: centre 0,0; placed by translate + rotate)
    hx, hy, hrot = P['head_at']
    if stretch:
        grow = (stretch - 1) * math.hypot(top[0] - root[0], top[1] - root[1])
        hy -= grow
    hrx, hry_t, hry_b = P['head_r']
    head_pts = head_shape(hrx, hry_t, hry_b, P['seed'] + 9)
    head_d = cr_closed(head_pts)
    head_poly = cr_sample(head_pts, per=16)
    defs.append(f'<clipPath id="{p}clip-head"><path d="{head_d}"/></clipPath>')
    ax, ay = P['attach']
    defs.append(f'''<radialGradient id="{p}g-headtint" gradientUnits="userSpaceOnUse" cx="{ax}" cy="{ay}" r="{P.get('tint_r', 92)}">
  <stop offset="0" stop-color="{C['neck_top']}" stop-opacity="0.6"/><stop offset="0.45" stop-color="{C['neck_top']}" stop-opacity="0.22"/><stop offset="1" stop-color="{C['neck_top']}" stop-opacity="0"/></radialGradient>''')

    def head_shade(x, y):
        rr = math.hypot(x / hrx, y / hry_b)
        dirn = (x * 0.9 + y * 0.42) / math.hypot(x, y) if (x or y) else 0
        return max(0.0, rr - 0.58) * 2.6 * max(0.0, dirn + 0.1)

    def head_deep(x, y):
        rr = math.hypot(x / hrx, y / hry_b)
        dirn = (x * 0.92 + y * 0.38) / math.hypot(x, y) if (x or y) else 0
        return max(0.0, rr - 0.8) * 4 * max(0.0, dirn - 0.35)

    def head_hi(x, y):
        v = (-x * 0.6 - y * 0.9) / (hrx * 0.7)
        return max(0, v - 0.05) * 1.6

    def head_lav(x, y):
        return max(0.0, 1 - math.hypot(x - ax, y - ay) / (P.get('tint_r', 92) * 0.9)) * 1.2

    hs = hatch(head_poly, P.get('head_n', 60), -0.5, 0.3, (34, 70), (9, 14), head_shade, P['seed'] + 10, bend=7)
    hd2 = hatch(head_poly, 24, -0.45, 0.25, (30, 60), (8, 12), head_deep, P['seed'] + 11, bend=5)
    hh = hatch(head_poly, 16, -0.4, 0.35, (30, 60), (7, 11), head_hi, P['seed'] + 12, bend=6)
    hl = hatch(head_poly, 4, -0.9, 0.3, (24, 44), (7, 10), head_lav, P['seed'] + 13, bend=4)

    # the one pen along the head's upper edge (left side, over the top, down the right), a second lighter pass
    a0, a1 = P.get('line_span', (192, 350))
    edge = []
    for (x, y) in head_poly:
        a = math.degrees(math.atan2(y, x)) % 360
        if a0 <= a <= a1:
            edge.append((a, x, y))
    edge.sort()
    epts = [(x * 1.004, y * 1.006) for _, x, y in edge]
    line_main = [pen_line(epts, PEN, P['seed'] + 20, (0.25, 1.0, 0.3))]
    cut = len(epts)
    line_second = [pen_line(epts[int(cut * 0.08):int(cut * 0.62)], PEN * 0.55, P['seed'] + 21, (0.2, 1, 0.2), shift=-2.2)]
    line_svg = f'''<g id="{p}line-head"><!-- the one pen: the head's upper edge only (rides with the head) -->
{pen_group(line_main, line_second, pen_style, p + 'f-wob', 0.9, 0.4)}
</g>'''

    whorl = ''
    if P.get('whorl'):
        wx, wy, ws, wrot, turns = P['whorl']
        sp = []
        for i in range(70):
            t = i / 69
            ang = wrot + t * 2 * math.pi * turns
            rad = ws * (0.1 + 0.9 * t)
            sp.append((wx + rad * math.cos(ang), wy + rad * math.sin(ang) * 0.62))
        wmain = [pen_line(sp, PEN * 1.12, P['seed'] + 30, (0.3, 1.0, 0.55))]
        wsec = [pen_line(sp[18:], PEN * 0.55, P['seed'] + 31, (0.2, 1, 0.2), shift=1.8)]
        whorl = f'''<g id="{p}whorl"><!-- pivot: {wx},{wy} in the head frame (tightens when shy, turns a little when touched; drawn with the same pen) -->
{pen_group(wmain, wsec, pen_style, p + 'f-wob', 0.95, 0.45)}
</g>'''

    face = P['face'](p, pen_style)
    head_inner = f'''<g id="{p}head-fill"><g filter="url(#{p}f-warp)">
<path d="{head_d}" fill="{C['head']}"/>
<path d="{head_d}" fill="url(#{p}g-headtint)"/>
<g clip-path="url(#{p}clip-head)">
{paths(hl, C['neck'], 0.35)}
{paths(hs, C['head_shade'], 0.55)}
{paths(hd2, C['head_deep'], 0.32)}
{paths(hh, C['head_hi'], 0.72)}
</g>
</g></g>
{line_svg}
{whorl}
{face}'''
    jx, jy = rot(ax, ay, hrot)
    BOUNDS[p + pose] = (min(hy + rot(x, y, hrot)[1] for x, y in head_poly),
                        max([P['ripple_c'][1] + rr[1] for rr in P.get('ripples', [])] or [0]))
    head_svg = f'''<g id="{p}head" transform="translate({hx:.0f},{hy:.0f}) rotate({hrot})"><!-- pivot: {hx + jx:.0f},{hy + jy:.0f} (where the jet holds it; in this frame {ax},{ay}) -->
{head_inner}
</g>'''

    # ---------- meniscus: the pen's arc in front of where the neck (and the hand) leave the surface
    men_svg = ''
    if P.get('meniscus'):
        segs, segs2 = [], []
        for i, (mx, my, mrx, mry, t0, t1, w) in enumerate(P['meniscus']):
            segs.append(pen_line(arc_pts(mx, my, mrx, mry, t0, t1, seed=P['seed'] + 96 + i), w, P['seed'] + 97 + i, (0.3, 1, 0.35)))
            segs2.append(pen_line(arc_pts(mx, my + 2, mrx * 0.96, mry, t0 + 0.25, t1 - 0.3, seed=P['seed'] + 98 + i), w * 0.5, P['seed'] + 99 + i, (0.2, 1, 0.2)))
        men_svg = f'''<g id="{p}meniscus"><!-- pivot: {P['root'][0]},{P['root'][1]} (the surface line in front of the jet: rides with the pool, widens as the neck sinks) -->
{pen_group(segs, segs2, pen_style, p + 'f-pencil', 0.9, 0.45)}
</g>'''

    marks_svg = wave_marks(p, pen_style, *P['wave']) if P.get('wave') else ''
    stain_svg = P['stain'](p) if P.get('stain') else ''

    # figure: the parts an animator moves. Order: hand, neck, head (the head sits over the top of the jet)
    parts = []
    if hand_svg and not P.get('hand_front'):
        parts.append(hand_svg)
    parts.append(neck_svg)
    if P.get('sink'):
        y0, y1 = P['sink']
        defs.append(f'''<linearGradient id="{p}g-sink" gradientUnits="userSpaceOnUse" x1="0" y1="{y0}" x2="0" y2="{y1}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="{p}m-sink" maskUnits="userSpaceOnUse" x="-400" y="-400" width="1800" height="1800"><rect x="-400" y="-400" width="1800" height="1800" fill="url(#{p}g-sink)"/></mask>''')
        head_svg = f'<g mask="url(#{p}m-sink)"><!-- sunk: below the surface the head fades into the pool -->\n{head_svg}\n</g>'
    parts.append(head_svg)
    if hand_svg and P.get('hand_front'):
        parts.append(hand_svg)
    under_default = f'url(#{p}f-under-night)' if night else f'url(#{p}f-under)'
    fig_filter = 'brightness(0.92)' if night else 'none'
    body = f'''{pool_svg}
{stain_svg}
{rip_svg}
<g id="{p}underpaint" style="filter:var(--b-under, {under_default})"><!-- the figure's silhouette eroded {ERODE} units: paper colour by day, its own colour dimmed by night. Built from the figure itself, so it follows every move -->
<use href="#{p}figure"/>
</g>
<g id="{p}crayon" mask="url(#{p}m-tooth)" style="filter:var(--b-figure, {fig_filter})"><!-- the one paper tooth, in this root space: it never stretches with a part -->
<g id="{p}figure">
{chr(10).join(parts)}
</g>
</g>
{men_svg}
{marks_svg}'''
    return '\n'.join(defs), body

# ---------------------------------------------------------------- faces


def eye(p, side, cx, cy, rx, ry, pen_style, look=(0, 0), tilt=0.0, seed=1, squint=0.0, tip=0.9, lid_lift=6.5, lid_len=0.56):
    """A dark teardrop of pastel with its tip up and a little in; the pen traces its outer upper edge."""
    k = 0.5523
    top = -ry
    bot = ry * (1 - squint)
    a1 = top * (0.78 - 0.3 * tip)
    b1 = rx * 0.52 * (1 - tip * 0.75)
    c1 = top * (1 + 0.1 * tip)
    tp = top * (1 + 0.16 * tip)
    d = (f"M {-rx:.1f},0 C {-rx:.1f},{bot * k:.1f} {-rx * k:.1f},{bot:.1f} 0,{bot:.1f} "
         f"C {rx * k:.1f},{bot:.1f} {rx:.1f},{bot * k:.1f} {rx:.1f},0 "
         f"C {rx:.1f},{a1:.1f} {b1:.1f},{c1:.1f} 0,{tp:.1f} "
         f"C {-b1:.1f},{c1:.1f} {-rx:.1f},{a1:.1f} {-rx:.1f},0 Z")
    r = random.Random(seed)
    lx, ly = look
    gx, gy = lx - rx * 0.28, ly + top * 0.36
    gap = taper_stroke(gx, gy, math.radians(-62 + r.uniform(-8, 8)), ry * 0.5, rx * 0.5, 1.5, r, pinch=0.45)
    # the pen: along the outer half of the top, from the equator up past the tip
    outer = -1 if side == 'l' else 1

    def bez(p0, p1, p2, p3, t):
        return tuple((1 - t) ** 3 * p0[i] + 3 * (1 - t) ** 2 * t * p1[i] + 3 * (1 - t) * t * t * p2[i] + t ** 3 * p3[i] for i in range(2))
    seg = ((outer * rx, 0), (outer * rx, a1), (outer * b1, c1), (0, tp))
    pts = [bez(*seg, i / 20) for i in range(21)]
    inner = ((0, tp), (-outer * b1, c1), (-outer * rx, a1), (-outer * rx, 0))
    pts += [bez(*inner, i / 20) for i in range(1, int(20 * (lid_len - 0.5) * 2) + 1)] if lid_len > 0.5 else []
    # push outward from the eye's centre
    lid_pts = []
    for (x, y) in pts:
        cxp, cyp = 0, -ry * 0.1
        L = math.hypot(x - cxp, y - cyp) or 1
        lid_pts.append((x + (x - cxp) / L * lid_lift, y + (y - cyp) / L * lid_lift))
    lid_pts = [(x, y) for (x, y) in lid_pts]
    lmain = [pen_line(lid_pts, PEN * 0.95, seed + 3, (0.45, 1.0, 0.25))]
    lsec = [pen_line(lid_pts[3:-4], PEN * 0.5, seed + 4, (0.2, 1, 0.2), shift=outer * 1.4)]
    return f'''<g id="{p}eye-{side}" transform="translate({cx},{cy}) rotate({tilt})"><!-- pivot: {cx},{cy} in the head frame (look = translate {p}pupil-{side}; blink = scaleY from the eye's top) -->
<g id="{p}pupil-{side}" filter="url(#{p}f-ink)">
<path d="{d}" fill="{C['ink']}"/>
<path d="{gap}" fill="{C['cream_dot']}" opacity="0.92"/>
</g>
<g id="{p}lid-{side}"><!-- the pen over the eye: raise it to look keen, lower it to look sleepy -->
{pen_group(lmain, lsec, pen_style, p + 'f-wob', 0.9, 0.4)}
</g>
</g>'''


def closed_eye(p, side, cx, cy, w, pen_style, seed=1):
    pts = [(-w / 2 + w * i / 20, -math.sin(math.pi * i / 20) * w * 0.32) for i in range(21)]
    return f'''<g id="{p}eye-{side}" transform="translate({cx},{cy})"><!-- pivot: {cx},{cy} in the head frame -->
<g filter="url(#{p}f-ink)">{paths([pen_line(pts, 5.4, seed, (0.5, 1, 0.5))], C['ink'])}</g>
</g>'''


def brow(p, side, cx, cy, ang, pen_style, length=24, seed=3, arch=5):
    a = math.radians(ang)
    pts = []
    for i in range(13):
        t = i / 12 - 0.5
        x = cx + math.cos(a) * length * t
        y = cy + math.sin(a) * length * t - arch * (1 - 4 * t * t)
        pts.append((x, y))
    return f'''<g id="{p}brow-{side}"><!-- pivot: {cx},{cy} in the head frame (raise/tilt) -->
{pen_group([pen_line(pts, PEN * 0.95, seed, (0.4, 1, 0.3))], [], pen_style, p + 'f-wob', 0.9)}
</g>'''


def cheek(p, side, cx, cy, s=1.0, seed=5, strength=1.0):
    poly = [(cx + 30 * s * math.cos(a), cy + 15 * s * math.sin(a)) for a in [i * math.pi / 12 for i in range(24)]]
    st = hatch(poly, int(9 * strength) + 2, math.radians(-58), 0.18, (18 * s, 30 * s), (5, 7.5), lambda x, y: 1, seed, bend=1.5)
    return f'''<g id="{p}cheek-{side}"><!-- pivot: {cx},{cy} in the head frame (fade/spread for shy or moved) -->
<g filter="url(#{p}f-bleed)"><ellipse cx="{cx}" cy="{cy}" rx="{26 * s:.1f}" ry="{12 * s:.1f}" fill="{C['blush']}" opacity="{0.28 * strength:.2f}"/></g>
<g filter="url(#{p}f-warp)">{paths(st, C['blush'], 0.55)}</g>
</g>'''


def mouth_smile(p, cx, cy, pen_style, w=26, h=15, tilt=0, seed=7):
    """A small open smile: dark crayon underneath, the pen along the lip with its corners turned up."""
    d = (f"M {-w / 2:.1f},0 C {-w / 4:.1f},{1.6:.1f} {w / 4:.1f},{1.6:.1f} {w / 2:.1f},{-0.6:.1f} "
         f"C {w * 0.46:.1f},{h * 0.72:.1f} {w * 0.2:.1f},{h:.1f} 0,{h:.1f} "
         f"C {-w * 0.22:.1f},{h:.1f} {-w * 0.47:.1f},{h * 0.7:.1f} {-w / 2:.1f},0 Z")
    tongue = (f"M {-w * 0.26:.1f},{h * 0.72:.1f} C {-w * 0.12:.1f},{h * 0.4:.1f} {w * 0.2:.1f},{h * 0.42:.1f} {w * 0.27:.1f},{h * 0.7:.1f} "
              f"C {w * 0.1:.1f},{h * 0.98:.1f} {-w * 0.14:.1f},{h * 0.98:.1f} {-w * 0.26:.1f},{h * 0.72:.1f} Z")
    lip = []
    for i in range(21):
        t = i / 20
        x = -w / 2 - 5 + (w + 10) * t
        y = 1.2 * math.sin(math.pi * t) * 1.4 - 5.5 * (abs(2 * t - 1) ** 3)
        lip.append((x, y))
    return f'''<g id="{p}mouth" transform="translate({cx},{cy}) rotate({tilt})"><!-- pivot: {cx},{cy} in the head frame (open/close = scaleY of {p}mouth-in) -->
<g id="{p}mouth-in" filter="url(#{p}f-ink)"><path d="{d}" fill="{C['ink']}"/><path d="{tongue}" fill="{C['mouth_in']}"/></g>
<g id="{p}lip">{pen_group([pen_line(lip, PEN * 0.9, seed, (0.35, 1, 0.35))], [], pen_style, p + 'f-wob', 0.9)}</g>
</g>'''


def mouth_o(p, cx, cy, pen_style, w=15, h=15, seed=8):
    d = (f"M {-w / 2:.1f},0 C {-w / 2:.1f},{-h * 0.55:.1f} {w / 2:.1f},{-h * 0.55:.1f} {w / 2:.1f},0 "
         f"C {w / 2:.1f},{h * 0.6:.1f} {-w / 2:.1f},{h * 0.6:.1f} {-w / 2:.1f},0 Z")
    return f'''<g id="{p}mouth" transform="translate({cx},{cy})"><!-- pivot: {cx},{cy} in the head frame -->
<g id="{p}mouth-in" filter="url(#{p}f-ink)"><path d="{d}" fill="{C['ink']}"/></g>
</g>'''


def mouth_line(p, cx, cy, pen_style, w=24, curve=8, tilt=0, seed=9):
    pts = [(-w / 2 + w * i / 20, curve * math.sin(math.pi * i / 20) - 1.5 * (i / 20)) for i in range(21)]
    return f'''<g id="{p}mouth" transform="translate({cx},{cy}) rotate({tilt})"><!-- pivot: {cx},{cy} in the head frame -->
<g filter="url(#{p}f-ink)">{paths([pen_line(pts, 4.6, seed, (0.5, 1, 0.5))], C['ink'])}</g>
</g>'''


def wave_marks(p, pen_style, cx, cy):
    segs = [pen_line(arc_pts(cx, cy, 52, 52, math.radians(-70), math.radians(-14), seed=501), PEN * 0.95, 503, (0.3, 1, 0.3)),
            pen_line(arc_pts(cx, cy, 72, 72, math.radians(-60), math.radians(-20), seed=502), PEN * 0.75, 504, (0.3, 1, 0.3))]
    return f'''<g id="{p}wave-marks"><!-- pivot: {cx},{cy} (an effect, not a body part: fades in while the hand waves) -->
{pen_group(segs, [], pen_style, p + 'f-pencil', 0.8)}
</g>'''


def face_main(p, pen_style):
    return '\n'.join([
        cheek(p, 'l', -86, 40, 0.95, seed=51),
        cheek(p, 'r', 88, 34, 0.9, seed=52),
        eye(p, 'l', -45, 6, 16, 24, pen_style, look=(1, 0), tilt=6, seed=1, squint=0.1),
        eye(p, 'r', 45, 2, 15.5, 23.5, pen_style, look=(1, 0), tilt=-4, seed=2, squint=0.1),
        mouth_smile(p, 1, 42, pen_style, w=24, h=14, tilt=-3),
    ])


def face_peek(p, pen_style):
    return '\n'.join([
        cheek(p, 'l', -82, 40, 0.85, seed=53, strength=0.8),
        cheek(p, 'r', 80, 34, 0.8, seed=54, strength=0.8),
        eye(p, 'l', -44, 6, 16, 25, pen_style, look=(-3, -1), tilt=7, seed=3, lid_lift=5.5),
        eye(p, 'r', 42, 2, 15.5, 24, pen_style, look=(-3, -1), tilt=-3, seed=4, lid_lift=5.5),
        brow(p, 'l', -48, -44, 8, pen_style, length=24, seed=63),
        brow(p, 'r', 42, -48, -8, pen_style, length=22, seed=64),
        mouth_o(p, -2, 46, pen_style, w=14, h=15),
    ])


def face_moved(p, pen_style):
    r = random.Random(77)
    tear = "M 0,-14 C 4,-6 10,2 10,8 C 10,15 5,19 0,19 C -5,19 -10,15 -10,8 C -10,2 -4,-6 0,-14 Z"
    runs = []
    for (x0, y0, ln) in [(-82, 56, 76), (-66, 64, 96), (84, 50, 70), (70, 60, 92)]:
        runs.append(taper_stroke(x0 + r.uniform(-3, 3), y0 + ln / 2, math.radians(90 + r.uniform(-6, 6)), ln, 13, r.uniform(-3, 3), r, pinch=0.15))
    return '\n'.join([
        f'''<g id="{p}flush"><!-- pivot: 0,60 in the head frame (the cheeks' colour running down: grows downward as it is moved) -->
<g filter="url(#{p}f-bleed)" opacity="0.5">{paths(runs, C['blush'])}</g></g>''',
        cheek(p, 'l', -80, 34, 1.3, seed=55, strength=2.0),
        cheek(p, 'r', 82, 30, 1.2, seed=56, strength=2.0),
        closed_eye(p, 'l', -44, 8, 34, pen_style, seed=11),
        closed_eye(p, 'r', 46, 4, 32, pen_style, seed=12),
        mouth_line(p, 2, 40, pen_style, w=26, curve=8, tilt=-3),
        f'''<g id="{p}tear" transform="translate(-70,28)"><!-- pivot: -70,28 in the head frame (a bead of the jet's lavender, runs down then drops) -->
<g filter="url(#{p}f-warp)"><path d="{tear}" fill="{C['neck_hi']}"/></g>
<g filter="url(#{p}f-wob)"><path d="{tear}" fill="none" style="stroke:var(--b-pen, {C['pen']})" stroke-width="2.6" opacity="0.8"/></g></g>''',
    ])

# ---------------------------------------------------------------- poses


POSES = {}
BOUNDS = {}

POSES['main'] = dict(
    seed=100,
    pool=(392, 628, 4.1, 2.25),
    root=(300, 660),
    # a jet that rises, then leans forward into the back of the drop: a soft question mark
    neck_c=[(300, 700), (294, 650), (292, 600), (298, 552), (314, 508), (340, 472), (372, 448), (414, 430)],
    neck_w=[140, 100, 66, 50, 47, 54, 74, 100],
    neck_fade=70,
    neck_ang=-1.5,
    head_at=(470, 380, -5),
    head_r=(150, 104, 114),
    attach=(-80, 84),
    tint_r=46,
    chin=True,
    hand=dict(
        c=[(556, 702), (560, 660), (568, 628), (580, 604), (594, 586)],
        w=[64, 36, 27, 25, 30],
        palm=(606, 566, 31, 24, -55),
        pivot=(556, 660),
        ang=-1.1,
    ),
    wave=(604, 560),
    ripple_c=(302, 660),
    ripples=[
        (96, 16, PEN, 0.95, [(0.1, 1.5), (1.66, 3.05)]),
        (150, 24, PEN, 0.75, [(-0.3, 0.85), (1.05, 2.15), (2.3, 3.35)]),
        (206, 33, PEN2, 0.6, [(0.25, 1.3), (1.85, 2.9)]),
    ],
    meniscus=[(300, 660, 48, 9, 0.22, 2.92, PEN), (556, 660, 24, 6, 0.3, 2.8, PEN2)],
    whorl=(10, -62, 30, 0.8, 1.55),
    face=face_main,
    head_n=56,
)

# peeking in from the frame's right edge: a long thin "?" of a jet, the pool off-frame
POSES['peek'] = dict(
    seed=200,
    root=(905, 668),
    neck_c=[(905, 640), (830, 676), (752, 690), (690, 668), (646, 622), (614, 566), (592, 506), (576, 462), (566, 436)],
    neck_w=[210, 150, 104, 74, 58, 54, 62, 84, 104],
    neck_fade=40,
    neck_ang=0.62,
    shade_side=-1,
    head_at=(500, 372, -14),
    head_r=(144, 96, 106),
    attach=(64, 88),
    tint_r=44,
    chin=True,
    neck_n=40,
    whorl=(16, -54, 28, 1.2, 1.5),
    face=face_peek,
    head_n=50,
)

# moved: sunk down to the surface, a hand pressed to its cheek, its colour running into the pool


def _moved_stain(p):
    return f'''<g id="{p}stain"><!-- pivot: 398,606 (the cheeks' colour reaching the pool: spreads, then fades) -->
<g filter="url(#{p}f-bleed)" opacity="0.3"><ellipse cx="398" cy="610" rx="170" ry="26" fill="{C['blush']}"/></g></g>'''


POSES['moved'] = dict(
    seed=300,
    pool=(398, 626, 4.2, 2.25),
    root=(398, 604),
    neck_c=[(398, 668), (398, 632), (398, 598), (398, 572)],
    neck_w=[260, 230, 200, 170],
    neck_fade=64,
    neck_ang=-1.4,
    head_at=(398, 516, -5),
    head_r=(158, 100, 112),
    attach=(0, 110),
    tint_r=70,
    sink=(588, 628),
    hand=dict(
        c=[(222, 650), (216, 610), (220, 580), (232, 560), (246, 548)],
        w=[60, 34, 28, 26, 30],
        palm=(258, 540, 28, 22, -60),
        pivot=(222, 604),
        ang=-1.4,
    ),
    hand_front=True,
    stain=_moved_stain,
    ripple_c=(398, 606),
    ripples=[
        (196, 22, PEN, 0.85, [(0.05, 1.45), (1.62, 3.05)]),
        (250, 31, PEN, 0.65, [(-0.2, 1.0), (1.2, 3.3)]),
        (300, 40, PEN2, 0.5, [(0.3, 1.3), (1.9, 2.9)]),
    ],
    meniscus=[(398, 600, 150, 16, 0.25, 2.9, PEN), (222, 604, 24, 6, 0.3, 2.8, PEN2)],
    whorl=(16, -60, 30, 2.4, 1.55),
    face=face_moved,
)


def shifted(P, dx, dy):
    """The same pose moved by dx, dy (every coordinate in the 800 box; head-frame values stay)."""
    Q = dict(P)
    sp = lambda q: (q[0] + dx, q[1] + dy)
    if 'pool' in Q:
        cx, cy, sx, sy = Q['pool']
        Q['pool'] = (cx + dx, cy + dy, sx, sy)
    for k in ('root', 'ripple_c', 'wave'):
        if k in Q:
            Q[k] = sp(Q[k])
    Q['neck_c'] = [sp(q) for q in Q['neck_c']]
    hx, hy, hr = Q['head_at']
    Q['head_at'] = (hx + dx, hy + dy, hr)
    if 'hand' in Q:
        h = dict(Q['hand'])
        h['c'] = [sp(q) for q in h['c']]
        px_, py_, a, b, c = h['palm']
        h['palm'] = (px_ + dx, py_ + dy, a, b, c)
        h['pivot'] = sp(h['pivot'])
        Q['hand'] = h
    if 'meniscus' in Q:
        Q['meniscus'] = [(mx + dx, my + dy) + tuple(rest) for (mx, my, *rest) in Q['meniscus']]
    return Q


POSES['main'] = shifted(POSES['main'], 0, -84)


def write_character():
    p = 'b-'
    defs, body = character(p, 'main')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<title>漾漾 Plip, direction B (revision 2)</title>
<!-- 漾漾 Plip: a drop of apricot pastel held up on a thin lavender jet that rises out of the hero's lavender blob.
     Layers, back to front: pool (the hero blob itself: hide it where the page's own blob is under the figure),
     ripples (the one pen), underpaint (the figure's silhouette eroded {ERODE} units), crayon (the figure under ONE
     paper-tooth mask in this root space), meniscus and wave marks (the pen).
     The parts an animator moves are inside the figure group: hand, neck, head (head-fill, line-head, whorl,
     cheeks, eyes with pupil and lid, mouth). Each part keeps only its colour and its warped edge, so stretching
     a part never stretches the grain.
     Pivots are in the 800 by 800 viewBox unless a comment says "head frame" (the head group's local space: its
     centre is 0,0; the group is placed with translate({POSES['main']['head_at'][0]},{POSES['main']['head_at'][1]}) rotate({POSES['main']['head_at'][2]})).
     Drawn for the landing at 320 px (0.4 px a unit): the main pen is 4.5 units = 1.8 px, the second 3 units = 1.2 px.
     Night paper: set the custom properties named in the style attributes (underpaint filter to the night one,
     pen to the night pen, figure filter to a slight dimming, colour-lavender and grain-scale come from the site). -->
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
    return svg


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
    crown, foot = BOUNDS['b-m-main']
    left = POSES['main']['ripple_c'][0] - POSES['main']['ripples'][-1][0]
    n_defs, n_body = character('b-n-', 'main', night=True)
    p_defs, p_body = character('b-p-', 'peek')
    v_defs, v_body = character('b-v-', 'moved')

    def label(x, y, text, size=15, color=None, anchor='start', weight=400):
        return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
                f'fill="{color or C["label"]}" text-anchor="{anchor}">{text}</text>')

    def tile(x, y, w, h, seed, fill):
        d = wobbly_rect(x, y, w, h, seed)
        return (f'<path d="{d}" fill="{fill}"/>'
                f'<path d="{d}" fill="none" stroke="{C["label"]}" stroke-opacity="0.55" stroke-width="1.6" filter="url(#b-c-pen)"/>')

    def place(cx0, cy0, cw, x, y, w):
        s = w / cw
        return f'translate({x - cx0 * s:.2f},{y - cy0 * s:.2f}) scale({s:.4f})'

    wav = "M 1000,24 " + " ".join(f"Q {1000 + (7 if i % 2 else -7)},{24 + i * 40 + 20} 1000,{24 + (i + 1) * 40}" for i in range(24))
    H = foot - crown

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
<title>漾漾 Plip, concept (direction B, revision 2)</title>
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
{filters('b-n-')}
{filters('b-p-')}
{filters('b-v-')}
{m_defs}
{n_defs}
{p_defs}
{v_defs}
<g id="b-m-plip">
{m_body}
</g>
<g id="b-n-plip">
{n_body}
</g>
</defs>

<!-- paper -->
<rect width="1600" height="1000" fill="{C['paper']}"/>
<rect x="1000" width="600" height="1000" fill="oklch(95% 0.017 72)"/>
<rect width="1600" height="1000" fill="#fff" filter="url(#b-c-paper)"/>
<path d="{wav}" fill="none" stroke="{C['label']}" stroke-opacity="0.35" stroke-width="1.6" stroke-linecap="round"/>

<!-- stage: the main illustration -->
{label(56, 78, '漾漾', 40, C['label'], weight=600)}{label(150, 78, 'Plip', 26, C['label_soft'])}
{label(58, 108, 'B｜蠟筆流體生命 — 首頁的薰衣草色塊托起的一滴杏桃色', 16, C['label_soft'])}
<use href="#b-m-plip" transform="{place(50, 100, 780, 40, 130, 930)}"/>
{label(58, 958, '主姿勢：從首頁那團色塊裡升起，細細的頸彎一下，托著扁扁的頭歪著看你，另一束濺起來揮手', 14, C['label_soft'])}

<!-- side column -->
{label(1040, 52, '夜紙', 15)}{label(1078, 52, '池子＝首頁夜色塊實際色值', 12, C['label_soft'])}
{tile(1040, 70, 260, 260, 33, C['night'])}
<g clip-path="url(#b-c-nightclip)">
  <use href="#b-n-plip" transform="{place(40, 110, 720, 1046, 70, 252)}"/>
</g>

{label(1330, 52, '縮小測試', 15)}
{tile(1330, 70, 230, 260, 34, C['paper'])}
<!-- exact heights: crown (y {crown:.0f}) to the outer ripple (y {foot:.0f}) = {H:.0f} units -->
<use href="#b-m-plip" transform="translate({1352 - left * 96 / H:.2f},{96 - crown * 96 / H:.2f}) scale({96 / H:.4f})"/>
<use href="#b-m-plip" transform="translate({1352 - left * 48 / H:.2f},{224 - crown * 48 / H:.2f}) scale({48 / H:.4f})"/>
{label(1500, 150, '96 px', 13, C['label_soft'])}{label(1432, 256, '48 px', 13, C['label_soft'])}

{label(1040, 382, '好奇探頭', 15)}{label(1112, 382, '從畫面邊緣伸長細頸', 12, C['label_soft'])}
{tile(1040, 400, 250, 300, 31, C['paper'])}
<g clip-path="url(#b-c-peekclip)">
  <g transform="{place(300, 196, 470, 1040, 400, 250)}">
{p_body}
  </g>
</g>

{label(1310, 382, '被感動', 15)}{label(1366, 382, '沉回水面、顏色暈開', 12, C['label_soft'])}
{tile(1310, 400, 250, 300, 32, C['paper'])}
<g clip-path="url(#b-c-movedclip)">
  <g transform="{place(150, 300, 500, 1310, 400, 250)}">
{v_body}
  </g>
</g>

{label(1040, 772, '標誌：身上不變的三件事', 15)}
{label(1040, 800, '扁圓的頭＋細腰側彎的頸　·　一支筆描的頭頂、水滴眼和頭頂的旋', 13, C['label_soft'])}
{label(1040, 826, '從首頁色塊升起（池子就是那團色塊），走到哪都帶著漣漪', 13, C['label_soft'])}
{label(1040, 852, '其餘都可以伸長、壓扁、長出一隻手、沉回水裡', 13, C['label_soft'])}
</svg>
'''
    with open(os.path.join(HERE, 'concept.svg'), 'w') as f:
        f.write(svg)


# ---------------------------------------------------------------- check pages (rendered by render.sh into checks/)

REF = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'ref')
NIGHT_VARS = ("--b-under:url(#{p}f-under-night);--b-pen:" + C['pen_night'] + ";--b-figure:brightness(0.92);"
              "--color-lavender:" + C['lavender_night'] + ";--grain-scale:0.4")


def _inline(svg, prefix):
    return re.sub(r'<\?xml[^>]*>', '', svg).replace('b-', prefix)


def _figure_div(svg, prefix, left, top, scale, hide_pool=True, style=''):
    box = 800 * scale
    body = _inline(svg, prefix)
    body = re.sub(r'<svg ([^>]*?)width="800" height="800"', lambda m: '<svg ' + m.group(1) + f'width="{box:.1f}" height="{box:.1f}"', body, count=1)
    hide = f'<style>#{prefix}pool{{display:none}}</style>' if hide_pool else ''
    return f'<div style="position:absolute;left:{left:.1f}px;top:{top:.1f}px;{style}">{hide}{body}</div>'


def write_checks(svg):
    out = os.path.join(HERE, 'checks')
    os.makedirs(out, exist_ok=True)
    head = '<!doctype html><meta charset=utf-8><style>body{margin:0;position:relative;overflow:hidden;font:13px PingFang TC,sans-serif}.t{position:absolute;color:#776;background:#f8f2eacc;padding:2px 6px}</style>'
    S = LANDING
    rx, ry = POSES['main']['root']

    # 1. the neck stretched (scaleY 1.35 from its root): the grain must stay the same size, round, not drawn into streaks
    pages = {}
    d0, b0 = character('b-', 'main')
    d1, b1 = character('b-', 'main', stretch=1.35)

    def solo(defs, body, prefix):
        return _inline(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="160 230 360 360" width="720" height="720"><defs>{filters("b-")}{defs}</defs><g>{body}</g></svg>', prefix)
    pages['neck-stretch'] = (head + '<style>body{width:1480px;height:780px;background:#f8f2ea;display:flex;gap:40px;padding:20px}</style>'
                             f'<div>{solo(d0, b0, "s0-")}<div class="t" style="position:static">頸 1.0（原狀）</div></div>'
                             f'<div>{solo(d1, b1, "s1-")}<div class="t" style="position:static">頸 scaleY 1.35（頭跟著升高）：紙紋顆粒大小與方向不變</div></div>', 1480, 790)

    # 2. on the landing's own lavender blob, b-pool hidden (day): the figure placed with its root in the blob
    bg = f'file://{REF}/landing-desktop-light.png'
    L, T = 540 - rx * S, 330 - ry * S
    pages['blob-day'] = (head + f'<style>body{{width:700px;height:420px;background:url({bg}) -740px -1640px/1440px auto no-repeat}}</style>'
                         + _figure_div(svg, 'd-', L, T, S) + '<div class="t" style="left:8px;top:8px">白天：池子隱藏，直接用首頁右下的薰衣草色塊</div>', 700, 420)
    # 3. the same on night paper, the night custom properties set on the wrapper
    bg = f'file://{REF}/landing-desktop-dark.png'
    pages['blob-night'] = (head + f'<style>body{{width:700px;height:420px;background:url({bg}) -740px -1100px/1440px auto no-repeat}}</style>'
                           + _figure_div(svg, 'n-', L, T, S, style=NIGHT_VARS.format(p='n-'))
                           + '<div class="t" style="left:8px;top:8px;background:#000a;color:#ccb">夜紙：首頁夜色塊（實測約 L23%），夜間變數接在外層</div>', 700, 420)
    # 4. over the hero's words (day): the eroded paper underpaint keeps the words from showing through the body
    bg = f'file://{REF}/landing-desktop-light.png'
    pages['over-text'] = (head + f'<style>body{{width:700px;height:420px;background:url({bg}) -380px -1000px/1440px auto no-repeat}}</style>'
                          + _figure_div(svg, 'o-', 262 - rx * S, 300 - ry * S, S)
                          + '<div class="t" style="left:8px;top:8px">白天壓在字上：身體內部不透字，只有外緣 7 單位的蠟筆斷口</div>', 700, 420)
    # 5. night pools side by side: the token as the page draws it (about L23%) and the L28% the motion review asked for
    blob = blob_path(BLOB3, 0, 0, 2.6, 2.2)

    def night_pool(fill, op, tag, x):
        return (f'<svg style="position:absolute;left:{x}px;top:0" width="340" height="340" viewBox="-170 -170 340 340"><path d="{blob}" transform="translate(0,40)" fill="{fill}" opacity="{op}"/></svg>'
                + _figure_div(svg, tag, x + 170 - rx * S, 250 - ry * S, S, style=NIGHT_VARS.format(p=tag)))
    pages['night-pools'] = (head + f'<style>body{{width:700px;height:360px;background:{C["night"]}}}</style>'
                            + night_pool(C['lavender_night'], BLOB_OPACITY, 'p-', 0) + night_pool('oklch(28% 0.04 290)', 1, 'q-', 350)
                            + '<div class="t" style="left:8px;top:8px;background:#000a;color:#ccb">token 30% × 0.25 ≈ L23%（實際）</div>'
                            + '<div class="t" style="left:358px;top:8px;background:#000a;color:#ccb">L28%（動態評審的數值）</div>', 700, 360)
    # 6. sizes and silhouettes: main and peek, against v1
    def window(defs, body, prefix, vb, h, sil=False, hide_pool=True):
        x0, y0, w0, h0 = vb
        w = w0 * h / h0
        hide = f'<style>#{prefix}pool{{display:none}}</style>' if hide_pool else ''
        css = 'filter:brightness(0)' if sil else ''
        return (f'<div class="c"><div style="{css}">{hide}' + _inline(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w0} {h0}" width="{w:.1f}" height="{h}"><defs>{filters("b-")}{defs}</defs>{body}</svg>', prefix)
            + f'</div><span>{"剪影 " if sil else ""}{h}</span></div>')
    crown, foot = BOUNDS['b-main']
    vb_main = (80, crown - 6, 640, foot - crown + 12)
    dm, bm = character('b-', 'main')
    dp, bp = character('b-', 'peek')
    vb_peek = (330, 250, 470, 420)
    v1 = open(os.path.join(HERE, 'character-v1.svg')).read()

    def v1win(prefix, h, sil=False):
        css = 'filter:brightness(0)' if sil else ''
        hide = f'<style>#{prefix}pool{{display:none}}</style>' if sil else ''
        body = re.sub(r'<svg ([^>]*?)viewBox="0 0 800 800" width="800" height="800"', lambda m: '<svg ' + m.group(1) + f'viewBox="20 190 760 520" width="{760 * h / 520:.1f}" height="{h}"', _inline(v1, prefix), count=1)
        return f'<div class="c"><div style="{css}">{hide}{body}</div><span>{"剪影 " if sil else ""}{h}</span></div>'
    row = lambda label, cells: f'<div class="r"><div class="l">{label}</div>{"".join(cells)}</div>'
    k = iter(range(100))
    html = (head + '<style>body{width:1000px;height:520px;background:#f8f2ea;padding:10px 20px}.r{display:flex;align-items:flex-end;gap:28px;padding:14px 0;border-bottom:1px solid #e5ddd2}'
            '.c{display:flex;flex-direction:column;align-items:center;gap:4px;color:#776;font-size:12px}.l{width:110px;align-self:center;color:#665}</style>'
            + row('v2 主姿勢', [window(dm, bm, f'z{next(k)}-', vb_main, h, hide_pool=False) for h in (96, 64, 48, 32)]
                  + [window(dm, bm, f'z{next(k)}-', vb_main, 48, sil=True)])
            + row('v2 探頭', [window(dp, bp, f'z{next(k)}-', vb_peek, h) for h in (96, 48)] + [window(dp, bp, f'z{next(k)}-', vb_peek, 48, sil=True)])
            + row('v1 對照', [v1win(f'z{next(k)}-', h) for h in (96, 48)] + [v1win(f'z{next(k)}-', 48, sil=True)]))
    pages['sizes'] = (html, 1000, 520)
    for k, (html, w, h) in pages.items():
        with open(os.path.join(out, k + '.html'), 'w') as f:
            f.write(html)
    with open(os.path.join(out, 'list.txt'), 'w') as f:
        f.write('\n'.join(f'{k} {w} {h}' for k, (_, w, h) in pages.items()) + '\n')


if __name__ == '__main__':
    svg = write_character()
    import json
    json.dump({'main': BOUNDS['b-main']}, open(os.path.join(HERE, 'tools', 'bounds.json'), 'w'))
    print('bounds', BOUNDS['b-main'])
    write_checks(svg)
    write_concept()
    print('wrote character.svg, concept.svg')
