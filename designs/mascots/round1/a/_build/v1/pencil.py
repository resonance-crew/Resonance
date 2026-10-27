"""Colored-pencil drawing kit for direction A: seeded geometry, pencil ribbons, hatching.

Everything is plain SVG strings. Every id and class it emits starts with "a-".
"""
import math
import random

TAU = math.tau


def fmt(v):
    s = f"{v:.1f}"
    if s.endswith('.0'):
        s = s[:-2]
    if s in ('-0', '-0.0'):
        s = '0'
    return s


def d_poly(pts, close=True):
    if not pts:
        return ''
    head = f"M{fmt(pts[0][0])} {fmt(pts[0][1])}"
    body = ' '.join(f"{fmt(x)} {fmt(y)}" for x, y in pts[1:])
    return head + ('L' + body if body else '') + ('Z' if close else '')


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def smooth(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def catmull(pts, closed=True, n=14):
    out = []
    N = len(pts)
    rng_i = range(N) if closed else range(N - 1)
    for i in rng_i:
        if closed:
            p0, p1, p2, p3 = pts[(i - 1) % N], pts[i], pts[(i + 1) % N], pts[(i + 2) % N]
        else:
            p0 = pts[max(i - 1, 0)]
            p1 = pts[i]
            p2 = pts[i + 1]
            p3 = pts[min(i + 2, N - 1)]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    if not closed:
        out.append(pts[-1])
    return out


def resample(pts, ds, closed=True):
    seq = list(pts) + ([pts[0]] if closed else [])
    L = [0.0]
    for i in range(1, len(seq)):
        L.append(L[-1] + math.dist(seq[i - 1], seq[i]))
    total = L[-1]
    n = max(2, int(round(total / ds)))
    out = []
    j = 0
    count = n if closed else n + 1
    for k in range(count):
        s = total * k / n
        while j < len(L) - 2 and L[j + 1] < s:
            j += 1
        seg = (L[j + 1] - L[j]) or 1.0
        t = clamp((s - L[j]) / seg)
        out.append((lerp(seq[j][0], seq[j + 1][0], t), lerp(seq[j][1], seq[j + 1][1], t)))
    return out


def signed_area(pts):
    a = 0.0
    N = len(pts)
    for i in range(N):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % N]
        a += x1 * y2 - x2 * y1
    return a / 2


def clockwise(pts):
    """Clockwise on screen (y down) so (ty, -tx) is the outward normal."""
    return pts if signed_area(pts) > 0 else pts[::-1]


def normals(pts, closed):
    N = len(pts)
    out = []
    for i in range(N):
        if closed:
            a, b = pts[(i - 1) % N], pts[(i + 1) % N]
        else:
            a, b = pts[max(i - 1, 0)], pts[min(i + 1, N - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty) or 1.0
        out.append((ty / L, -tx / L))
    return out


class Wobble:
    """Smooth 1-D noise in [-1, 1]; cyclic=True wraps over u in [0, 1]."""

    def __init__(self, rng, octaves=3, cyclic=True, base=1.0):
        self.terms = []
        for k in range(octaves):
            f = (k + 1) * base if cyclic else rng.uniform(0.6, 1.4) * (k + 1) * base
            if cyclic:
                f = round(f)
            self.terms.append((1 / (k + 1), f, rng.uniform(0, TAU)))
        self.norm = sum(a for a, _, _ in self.terms)

    def __call__(self, u):
        return sum(a * math.sin(TAU * f * u + p) for a, f, p in self.terms) / self.norm


def ellipse(cx, cy, rx, ry, rot=0.0, n=72, rng=None, wob=0.0):
    w = Wobble(rng, 3) if (rng and wob) else None
    out = []
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    for i in range(n):
        a = TAU * i / n
        k = 1 + (wob * w(i / n) if w else 0)
        x, y = rx * k * math.cos(a), ry * k * math.sin(a)
        out.append((cx + x * c - y * s, cy + x * s + y * c))
    return clockwise(out)


def offset_loop(loop, d, rng=None, amp=0.0):
    nr = normals(loop, True)
    w = Wobble(rng, 3) if (rng and amp) else None
    N = len(loop)
    return [(p[0] + n[0] * (d + (amp * w(i / N) if w else 0)), p[1] + n[1] * (d + (amp * w(i / N) if w else 0)))
            for i, (p, n) in enumerate(zip(loop, nr))]


def pip(poly, x, y):
    inside = False
    N = len(poly)
    j = N - 1
    for i in range(N):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            xc = xi + (y - yi) * (xj - xi) / (yj - yi)
            if x < xc:
                inside = not inside
        j = i
    return inside


def ribbon(center, widths):
    nr = normals(center, False)
    left = [(p[0] + n[0] * w / 2, p[1] + n[1] * w / 2) for p, n, w in zip(center, nr, widths)]
    right = [(p[0] - n[0] * w / 2, p[1] - n[1] * w / 2) for p, n, w in zip(center, nr, widths)]
    return left, right


def pencil_stroke(center, w, rng, tin=0.12, tout=0.2, pressure=0.4, minw=0.18):
    """A tapered, pressure-varied ribbon polygon along an open centerline."""
    if len(center) < 2:
        return []
    wob = Wobble(rng, 3, cyclic=False, base=1.3)
    N = len(center)
    widths = []
    for i in range(N):
        u = i / (N - 1)
        taper = max(minw, min(smooth(u / tin) if tin else 1, smooth((1 - u) / tout) if tout else 1))
        widths.append(w * (1 - pressure * 0.45 + pressure * 0.45 * wob(u)) * taper)
    left, right = ribbon(center, widths)
    return left + right[::-1]


def outline_passes(loop, rng, pen=1.0, passes=None, skip=None, closed=True, ds=2.4):
    """Several re-traced pencil passes over a closed loop (or an open path).

    skip(x, y) -> True drops those points (splitting a pass), e.g. where a part grows out of another.
    Returns [(polygon, opacity)].
    """
    if passes is None:
        passes = [
            # width, opacity, cover lo, cover hi, normal offset, wobble amp
            (3.0, 0.92, 1.01, 1.06, 0.0, 0.9),
            (1.5, 0.55, 0.55, 0.85, 1.4, 1.3),
            (1.15, 0.42, 0.2, 0.38, -1.6, 1.5),
        ]
    pts = resample(loop, ds, closed)
    N = len(pts)
    nr = normals(pts, closed)
    out = []
    for (w, op, clo, chi, off, amp) in passes:
        if closed:
            start = rng.randrange(N)
            M = int(N * rng.uniform(clo, chi))
        else:
            cov = min(1.0, rng.uniform(clo, chi)) if clo < 1 else 1.0
            M = max(2, int(N * cov))
            start = rng.randrange(0, N - M + 1) if M < N else 0
        wob = Wobble(rng, 3, cyclic=False, base=1.6)
        sgn = rng.choice((-1, 1))
        run = []

        def flush():
            if len(run) >= 4:
                out.append((pencil_stroke(run[:], w * pen, rng, tin=min(0.15, 12 / len(run)),
                                          tout=min(0.22, 16 / len(run))), op))

        for i in range(M):
            k = (start + i) % N if closed else start + i
            p, n = pts[k], nr[k]
            dd = sgn * off * (0.5 + 0.5 * wob(i / max(M, 1))) + amp * wob(i / max(M, 1) + 0.37)
            q = (p[0] + n[0] * dd, p[1] + n[1] * dd)
            if skip and skip(*q):
                flush()
                run = []
                continue
            run.append(q)
        flush()
    return out


def hatch(poly, angle, spacing, rng, keep=None, step=3.0, ext=(-3.5, 2.0), bow=1.4,
          sjit=0.3, min_len=5.0, origin=None, chunk=(26, 64), ajit=0.06):
    """Parallel hatching strokes inside `poly` (even-odd), returned as [(p0, ctrl, p1, density)].

    keep(x, y) -> 0..1 density; each line draws where density beats its own threshold.
    """
    a = math.radians(angle)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    cx, cy = origin or ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    projn = [(p[0] - cx) * nx + (p[1] - cy) * ny for p in poly]
    lo, hi = min(projn), max(projn)
    edges = list(zip(poly, poly[1:] + poly[:1]))
    strokes = []
    o = lo + rng.uniform(0, spacing)
    while o < hi:
        Ox, Oy = cx + nx * o, cy + ny * o
        ts = []
        for (A, B) in edges:
            ex, ey = B[0] - A[0], B[1] - A[1]
            den = dx * ey - dy * ex
            if abs(den) < 1e-9:
                continue
            ax, ay = A[0] - Ox, A[1] - Oy
            t = (ax * ey - ay * ex) / den
            u = (ax * dy - ay * dx) / den
            if 0 <= u < 1:
                ts.append(t)
        ts.sort()
        th = rng.random()
        lw = Wobble(rng, 2, cyclic=False, base=0.02)
        for i in range(0, len(ts) - 1, 2):
            t0, t1 = ts[i], ts[i + 1]
            runs = []
            if keep is None:
                runs.append((t0, t1, 1.0))
            else:
                cur = None
                t = t0
                while t <= t1:
                    x, y = Ox + dx * t, Oy + dy * t
                    v = keep(x, y) + 0.18 * lw(t)
                    if v > th:
                        if cur is None:
                            cur = [t, t, v]
                        cur[1] = t
                        cur[2] = max(cur[2], v)
                    elif cur is not None:
                        runs.append(tuple(cur))
                        cur = None
                    t += step
                if cur is not None:
                    runs.append(tuple(cur))
            for (r0, r1, v) in runs:
                r0 -= rng.uniform(*ext)
                r1 += rng.uniform(*ext)
                if r1 - r0 < min_len:
                    continue
                # a hand lays hatching down in short strokes, not edge-to-edge rules
                chunks = []
                if chunk:
                    a0 = r0
                    while a0 < r1:
                        a1 = min(r1, a0 + rng.uniform(*chunk))
                        if r1 - a1 < chunk[0] * 0.4:
                            a1 = r1
                        chunks.append((a0, a1))
                        a0 = a1 + rng.uniform(-5, 2.5)
                else:
                    chunks.append((r0, r1))
                for (c0, c1) in chunks:
                    if c1 - c0 < min_len:
                        continue
                    jt = rng.uniform(-ajit, ajit)
                    cm = (c0 + c1) / 2
                    h = (c1 - c0) / 2
                    ddx, ddy = math.cos(a + jt), math.sin(a + jt)
                    mx, my = Ox + dx * cm, Oy + dy * cm
                    p0 = (mx - ddx * h, my - ddy * h)
                    p1 = (mx + ddx * h, my + ddy * h)
                    b = rng.uniform(-bow, bow)
                    mid = ((p0[0] + p1[0]) / 2 + nx * b, (p0[1] + p1[1]) / 2 + ny * b)
                    strokes.append((p0, mid, p1, v))
        o += spacing * (1 + rng.uniform(-sjit, sjit))
    return strokes


def stroke_paths(strokes, cls, rng, widths=(1.7, 2.4), ops=(0.38, 0.55, 0.72), extra=''):
    """Bucket hatch strokes into a handful of <path>s by width and opacity."""
    buckets = {}
    for (p0, m, p1, v) in strokes:
        w = rng.choice(widths)
        o = rng.choice(ops)
        key = (w, o)
        buckets.setdefault(key, []).append(
            f"M{fmt(p0[0])} {fmt(p0[1])}Q{fmt(m[0])} {fmt(m[1])} {fmt(p1[0])} {fmt(p1[1])}")
    out = []
    for (w, o), ds in sorted(buckets.items()):
        out.append(f'<path class="a-h {cls}" stroke-width="{fmt(w) if w >= 1 else w}" opacity="{o}" d="{"".join(ds)}"{extra}/>')
    return '\n'.join(out)


def poly_paths(polys, cls):
    """[(polygon, opacity)] → <path>s grouped by opacity."""
    by = {}
    for poly, op in polys:
        if poly:
            by.setdefault(op, []).append(d_poly(poly))
    return '\n'.join(f'<path class="{cls}" opacity="{op}" d="{"".join(ds)}"/>' for op, ds in sorted(by.items()))


def turtle(base, heading_deg, L, turns, ds=2.0, k0frac=0.08, p=2.6):
    """An Euler-spiral-like centerline: nearly straight, then curling ever tighter (a fiddlehead)."""
    total = turns * TAU
    B = k0frac * total / L
    A = (total - B * L) * (p + 1) / L
    x, y = base
    th = math.radians(heading_deg)
    pts = [(x, y)]
    s = 0.0
    while s < L:
        u = s / L
        k = A * u ** p + B
        th += k * ds
        x += math.cos(th) * ds
        y += math.sin(th) * ds
        pts.append((x, y))
        s += ds
    return pts


def arc_cap(c, t, n, r, steps=10):
    """Half circle from c+n*r through c+t*r to c-n*r."""
    out = []
    for i in range(1, steps):
        f = math.pi * i / steps
        out.append((c[0] + n[0] * r * math.cos(f) + t[0] * r * math.sin(f),
                    c[1] + n[1] * r * math.cos(f) + t[1] * r * math.sin(f)))
    return out


def tube(center, widths, cap_end=True):
    """Closed outline of a tube along center: left edge, rounded end, right edge back."""
    left, right = ribbon(center, widths)
    a, b = center[-2], center[-1]
    tx, ty = b[0] - a[0], b[1] - a[1]
    L = math.hypot(tx, ty) or 1
    t = (tx / L, ty / L)
    n = (ty / L, -tx / L)
    cap = arc_cap(center[-1], t, n, widths[-1] / 2) if cap_end else []
    return left, cap, right
