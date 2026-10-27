"""Geometry + pencil kit for B x C (pencil on cut paper). Seeded, deterministic.

Torn edges are ported from round-1 C (gen/lib.mjs: spline + tear), pencil strokes and paper-tooth
filters from round-1 B (gen-v1.py: taper_stroke, hatch, tooth masks). Every id starts with "bc-".
"""
import math
import random


def R(seed):
    return random.Random(seed)


# ---------------------------------------------------------------- shapes

def spline(keys, step=6.0, closed=True):
    out = []
    n = len(keys)
    segs = n if closed else n - 1
    for i in range(segs):
        p0, p1, p2, p3 = keys[(i - 1) % n], keys[i], keys[(i + 1) % n], keys[(i + 2) % n]
        if not closed and i == 0:
            p0 = p1
        if not closed and i == segs - 1:
            p3 = p2
        ln = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        m = max(2, round(ln / step))
        for k in range(m):
            t = k / m
            t2, t3 = t * t, t * t * t
            f = lambda a, b, c, d: 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
            out.append((f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])))
    if not closed:
        out.append(keys[-1])
    return out


def poly(keys, step=6.0, closed=True):
    out = []
    n = len(keys)
    segs = n if closed else n - 1
    for i in range(segs):
        a, b = keys[i], keys[(i + 1) % n]
        m = max(1, round(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(m):
            out.append((a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m))
    if not closed:
        out.append(keys[-1])
    return out


def tear(pts, seed, jag=1.6, wander=6.0, amp=3.0):
    """Push each sample along its normal: a slow wander plus a jaggy bite (a hand-torn edge)."""
    r = R(seed)
    n = len(pts)
    w = 0.0
    slow = []
    for _ in range(n):
        w += (r.random() - 0.5) * 0.9
        w *= 0.93
        slow.append(w)
    out = []
    for i in range(n):
        a, b = pts[(i - 1) % n], pts[(i + 1) % n]
        tx, ty = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, ty) or 1
        tx, ty = tx / ln, ty / ln
        nx, ny = ty, -tx
        d = slow[i] * wander * 0.35 + (r.random() - 0.5) * 2 * jag + ((r.random() - 0.6) * amp * 2.2 if r.random() < 0.08 else 0)
        out.append((pts[i][0] + nx * d, pts[i][1] + ny * d))
    return out


def ellipse_pts(cx, cy, rx, ry, n=40, rot=0.0):
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        out.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    return out


def rot(p, c, deg):
    a = math.radians(deg)
    x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(a) - y * math.sin(a), c[1] + x * math.sin(a) + y * math.cos(a))


def d_of(pts, closed=True):
    return 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ('Z' if closed else '')


def smooth_d(pts, closed=False):
    if len(pts) < 3:
        return d_of(pts, closed)
    d = f'M{pts[0][0]:.1f},{pts[0][1]:.1f}'
    for i in range(1, len(pts) - 1):
        mx, my = (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2
        d += f'Q{pts[i][0]:.1f},{pts[i][1]:.1f} {mx:.1f},{my:.1f}'
    d += f'L{pts[-1][0]:.1f},{pts[-1][1]:.1f}'
    return d + ('Z' if closed else '')


def inside(pl, x, y):
    c = False
    n = len(pl)
    j = n - 1
    for i in range(n):
        xi, yi = pl[i]
        xj, yj = pl[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
            c = not c
        j = i
    return c


def edge_dist(pl, x, y):
    return min(math.hypot(px - x, py - y) for px, py in pl[::2])


# ---------------------------------------------------------------- pencil

def taper_stroke(x, y, ang, length, width, bend, r, pinch=0.3):
    """A pencil mark: heavier at the start, lifting off at the end, slightly bowed."""
    dx, dy = math.cos(ang), math.sin(ang)
    nx, ny = -dy, dx
    p0 = (x - dx * length / 2, y - dy * length / 2)
    p2 = (x + dx * length / 2, y + dy * length / 2)
    p1 = (x + nx * bend, y + ny * bend)
    left, right = [], []
    steps = 8
    for i in range(steps + 1):
        t = i / steps
        bx = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        by = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        w = width * (pinch + (1 - pinch) * math.sin(math.pi * min(1, t * 1.1)) ** 0.6) * (1.05 - 0.25 * t)
        w *= 1 + r.uniform(-0.12, 0.12)
        left.append((bx + nx * w / 2, by + ny * w / 2))
        right.append((bx - nx * w / 2, by - ny * w / 2))
    pts = left + right[::-1]
    return 'M' + 'L'.join(f'{px:.1f},{py:.1f}' for px, py in pts) + 'Z'


def hatch(pl, count, ang, ang_jit, length, width, weight, seed, bend=5.0):
    """Strokes scattered inside pl, each kept with probability weight(x, y)."""
    r = R(seed)
    xs = [p[0] for p in pl]
    ys = [p[1] for p in pl]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    out = []
    tries = 0
    while len(out) < count and tries < count * 80:
        tries += 1
        x = r.uniform(x0, x1)
        y = r.uniform(y0, y1)
        if not inside(pl, x, y):
            continue
        if r.random() > weight(x, y):
            continue
        a = ang + r.uniform(-ang_jit, ang_jit)
        out.append(taper_stroke(x, y, a, r.uniform(*length), r.uniform(*width), r.uniform(-bend, bend), r))
    return out


def pencil_line(pts, seed, passes=2, spread=0.8):
    r = R(seed)
    out = []
    for _ in range(passes):
        ox, oy = (r.random() - 0.5) * spread * 2, (r.random() - 0.5) * spread * 2
        q = [(p[0] + ox + (r.random() - 0.5) * spread, p[1] + oy + (r.random() - 0.5) * spread) for p in pts]
        out.append(smooth_d(q))
    return out


def scribble(x0, y0, w, seed, h=4.0, step=(2.0, 3.4)):
    """Cursive-looking pencil loops (not letters)."""
    r = R(seed)
    pts = []
    x, t = x0, 0.0
    while x < x0 + w:
        loop = 1.8 if r.random() < 0.25 else 1.0
        pts.append((x + math.cos(t) * 2.0, y0 - abs(math.sin(t)) * h * loop + (r.random() - 0.5) * 1.1))
        t += 0.9 + r.random() * 0.5
        x += r.uniform(*step)
        if r.random() < 0.12:
            x += 6
            pts.append(None)
    runs, cur = [], []
    for p in pts:
        if p is None:
            if len(cur) > 2:
                runs.append(cur)
            cur = []
        else:
            cur.append(p)
    if len(cur) > 2:
        runs.append(cur)
    return [smooth_d(run) for run in runs]


def paths(ds, fill, opacity=None):
    op = f' fill-opacity="{opacity}"' if opacity is not None else ''
    return ''.join(f'<path d="{d}" fill="{fill}"{op}/>' for d in ds)


# ---------------------------------------------------------------- filters

def tooth_mask(tag, thresh, slope=7.0, edge=0.5, press=0.9, seed_t=21, seed_p=4):
    return f'''<feTurbulence type="fractalNoise" baseFrequency="0.3 0.85" numOctaves="3" seed="{seed_t}" result="{tag}t0"/>
    <feColorMatrix in="{tag}t0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="{tag}t"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="{seed_p}" result="{tag}p0"/>
    <feColorMatrix in="{tag}p0" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="{tag}p"/>
    <feComposite in="{tag}t" in2="{tag}p" operator="arithmetic" k2="1" k3="{press}" k4="-{press / 2}" result="{tag}tp"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="{tag}e"/>
    <feComposite in="{tag}tp" in2="{tag}e" operator="arithmetic" k2="1" k3="-{edge}" k4="{edge}" result="{tag}x"/>
    <feComponentTransfer in="{tag}x" result="{tag}m"><feFuncA type="linear" slope="-{slope}" intercept="{slope * thresh + 1:.3f}"/></feComponentTransfer>'''


RIM = 'oklch(98.5% 0.008 85)'
SHADOW = 'oklch(26% 0.03 55)'


def filters():
    B = 'x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB"'
    return f'''
  <!-- cut paper: the piece's edge torn a little, the white fibre rim the tear exposes, a soft glue-and-lift shadow, paper fibre mottle -->
  <filter id="bc-paper" {B}>
    <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="4.2" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="5" xChannelSelector="R" yChannelSelector="G" result="fibre"/>
    <feFlood flood-color="{RIM}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fibre" stdDeviation="4.5" result="blur"/><feOffset dx="2.5" dy="5" result="off"/>
    <feFlood flood-color="{SHADOW}" flood-opacity="0.2"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.96  0.3 0 0 0 -0.12" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.33  0 0 0 0 0.36  4 0 0 0 -2.9" result="speck"/>
    <feComposite in="speck" in2="torn" operator="in" result="specks"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/><feMergeNode in="specks"/></feMerge>
  </filter>
  <!-- thinner paper (cards, mittens): the same tear, a narrower rim, a fainter shadow -->
  <filter id="bc-thin" {B}>
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="2.6" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="1" seed="4" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="3" result="fibre"/>
    <feFlood flood-color="{RIM}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fibre" stdDeviation="3" result="blur"/><feOffset dx="1.8" dy="3.5" result="off"/>
    <feFlood flood-color="{SHADOW}" flood-opacity="0.18"/><feComposite in2="off" operator="in" result="shadow"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08" numOctaves="3" seed="15" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.97  0.35 0 0 0 -0.15" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <!-- the same cut paper for parts drawn in their own rotating frame (arms, cards): rim and a soft
       all-round contact shade only, so nothing turns with the part; the wrapper adds the drop shadow (bc-lift) -->
  <filter id="bc-paper-l" {B}>
    <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="4.2" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="3" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="5" xChannelSelector="R" yChannelSelector="G" result="fibre"/>
    <feFlood flood-color="{RIM}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fibre" stdDeviation="2.6" result="blur"/>
    <feFlood flood-color="{SHADOW}" flood-opacity="0.2"/><feComposite in2="blur" operator="in" result="halo"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08" numOctaves="3" seed="5" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.96  0.3 0 0 0 -0.12" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="halo"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <filter id="bc-thin-l" {B}>
    <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="9" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="torn"/>
    <feMorphology in="torn" operator="dilate" radius="2.6" result="fat"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="1" seed="4" result="fn"/>
    <feDisplacementMap in="fat" in2="fn" scale="3" result="fibre"/>
    <feFlood flood-color="{RIM}"/><feComposite in2="fibre" operator="in" result="rim"/>
    <feGaussianBlur in="fibre" stdDeviation="2.4" result="blur"/>
    <feFlood flood-color="{SHADOW}" flood-opacity="0.26"/><feComposite in2="blur" operator="in" result="halo"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08" numOctaves="3" seed="15" result="m"/>
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.97  0.35 0 0 0 -0.15" result="mottle"/>
    <feComposite in="mottle" in2="torn" operator="in" result="mottles"/>
    <feMerge><feMergeNode in="halo"/><feMergeNode in="rim"/><feMergeNode in="torn"/><feMergeNode in="mottles"/></feMerge>
  </filter>
  <!-- the drop shadow of a whole jointed part, cast in the page's frame whatever the part's rotation -->
  <filter id="bc-lift" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="4.2" result="b"/><feOffset dx="2.5" dy="5" result="o"/>
    <feFlood flood-color="{SHADOW}" flood-opacity="0.2"/><feComposite in2="o" operator="in" result="sh"/>
    <feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <!-- first pencil layer: the paper's tooth leaves small gaps, more where the hand pressed lightly and at the edge -->
  <filter id="bc-tooth1" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    {tooth_mask('a', 0.7, slope=8.0, edge=0.14, press=0.55)}
    <feComposite in="SourceGraphic" in2="am" operator="in"/>
  </filter>
  <!-- later pencil layers only catch the tops of the tooth -->
  <filter id="bc-tooth2" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="13" result="fz"/>
    <feDisplacementMap in="SourceGraphic" in2="fz" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="d"/>
    {tooth_mask('b', 0.52, slope=6.0, edge=0.1, press=0.5)}
    <feComposite in="d" in2="bm" operator="in"/>
  </filter>
  <!-- graphite: a pencil line that skips over the tooth -->
  <filter id="bc-graphite" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.6" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="6" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.2 0 0 0 2.1" result="tooth"/>
    <feComposite in="d" in2="tooth" operator="in"/>
  </filter>
  <!-- a punched hole: its edge a touch fibrous -->
  <filter id="bc-punch" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="31" result="fz"/>
    <feDisplacementMap in="SourceGraphic" in2="fz" scale="1.8" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <!-- the whole character as one flat black shape (silhouette test) -->
  <filter id="bc-sil" x="-10%" y="-10%" width="120%" height="120%">
    <feComponentTransfer in="SourceAlpha" result="a"><feFuncA type="linear" slope="10" intercept="-4"/></feComponentTransfer>
    <feFlood flood-color="#1d1a17"/><feComposite in2="a" operator="in"/>
  </filter>'''
