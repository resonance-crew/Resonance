"""聽芽 Tingya — direction A. Draws the character as separated, named, colored-pencil parts."""
import copy
import math
import random
from pencil import *

# Colour roles. Each has a day default; a night paper overrides them by custom properties
# (they inherit into <use> clones), so one drawing serves both papers.
DAY = {
    'ink': 'oklch(36% 0.04 50)',        # the pencil outline against the paper
    'face': 'oklch(33% 0.045 45)',      # features drawn on the fur (stay dark on both papers)
    'fur': 'oklch(86% 0.05 68)',        # light pressure wash
    'fur-hatch': 'oklch(78% 0.08 60)',  # the main colour, hatched
    'fur-shade': 'oklch(65% 0.095 44)', # cross-hatch in the shade (warm, towards terracotta)
    'fur-deep': 'oklch(53% 0.085 40)',  # rim of the shade
    'tip': 'oklch(70% 0.1 30)',         # the curled tip of the sprout
    'blush': 'oklch(72% 0.11 20)',
    'eye': 'oklch(28% 0.035 45)',
    'eye-warm': 'oklch(58% 0.1 58)',
    'glint': 'oklch(97.5% 0.012 80)',
    'mouth': 'oklch(52% 0.1 28)',
    'tear': 'oklch(82% 0.06 225)',
    'shadow': 'oklch(52% 0.025 60)',
    'under': 'oklch(96.5% 0.015 75)',   # opaque underlayer: the paper itself, so nothing shows through the creature
}
NIGHT = {
    'ink': 'oklch(88% 0.03 75)',        # a cream pencil on the night paper
    'fur': 'oklch(80% 0.05 68)',
    'fur-hatch': 'oklch(80% 0.07 60)',
    'fur-shade': 'oklch(60% 0.085 46)',
    'fur-deep': 'oklch(50% 0.07 42)',
    'tip': 'oklch(72% 0.1 30)',
    'shadow': 'oklch(72% 0.02 70)',
    'under': 'oklch(66% 0.06 60)',      # a toned underlayer, as for pencil on dark paper
}


def night_style():
    return ';'.join(f'--a-{k}:{v}' for k, v in NIGHT.items())


def style_block():
    def f(role):
        return f'var(--a-{role},{DAY[role]})'
    return f"""<style>
.a-h{{fill:none;stroke-linecap:round}}
.a-ink{{fill:{f('ink')}}}
.a-under{{fill:{f('under')}}}
.a-face-ink{{fill:{f('face')}}}
.a-fur{{fill:{f('fur')}}}
.a-fur-s{{stroke:{f('fur-hatch')}}}
.a-shade-s{{stroke:{f('fur-shade')}}}
.a-deep-s{{stroke:{f('fur-deep')}}}
.a-tip{{fill:{f('tip')}}}
.a-tip-s{{stroke:{f('tip')}}}
.a-blush-s{{stroke:{f('blush')}}}
.a-eye{{fill:{f('eye')}}}
.a-eye-s{{stroke:{f('eye')}}}
.a-eye-warm-s{{stroke:{f('eye-warm')}}}
.a-glint{{fill:{f('glint')}}}
.a-mouth{{fill:{f('mouth')}}}
.a-tear{{fill:{f('tear')}}}
.a-tear-s{{stroke:{f('tear')}}}
.a-shadow-s{{stroke:{f('shadow')}}}
</style>"""


def filters():
    return """<filter id="a-tooth" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
  <!-- paper tooth: the pigment sits on the ridges, the valleys stay paper -->
  <feTurbulence type="fractalNoise" baseFrequency="0.72 0.95" numOctaves="2" seed="11" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.7 0 0 0 -0.62" result="tm"/>
  <feComposite in="SourceGraphic" in2="tm" operator="in" result="g"/>
  <!-- uneven hand: a slow wobble pushes the colour off the ideal edge -->
  <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="5" result="w"/>
  <feDisplacementMap in="g" in2="w" scale="4" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<filter id="a-tooth-dense" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
  <!-- heavier pressure: the tooth fills in, a few specks of paper remain -->
  <feTurbulence type="fractalNoise" baseFrequency="0.8 1" numOctaves="2" seed="11" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -0.35" result="tm"/>
  <feComposite in="SourceGraphic" in2="tm" operator="in" result="g"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="5" result="w"/>
  <feDisplacementMap in="g" in2="w" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<filter id="a-lead" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
  <!-- graphite grain on the lines, and a fuzzy edge -->
  <feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="4" result="t"/>
  <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.3 0 0 0 -0.32" result="m"/>
  <feComposite in="SourceGraphic" in2="m" operator="in" result="g"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1" seed="9" result="d"/>
  <feDisplacementMap in="g" in2="d" scale="1.8" xChannelSelector="R" yChannelSelector="G"/>
</filter>"""


BODY_PTS = [(402, 318), (444, 326), (492, 352), (532, 400), (559, 466), (569, 545), (563, 618),
            (533, 666), (472, 690), (400, 696), (330, 692), (272, 670), (240, 628), (234, 548),
            (245, 470), (274, 404), (314, 354), (360, 327)]

MAIN = dict(
    body=BODY_PTS,
    body_rot=-4.0,         # degrees, about the feet: a slight lean, listening
    tufts=[],
    antenna=dict(base=(402, 352), heading=-80, L=400, turns=-1.32, w0=29, w1=19, wmid=18, wcoil=29, p=2.1),
    tail=dict(base=(536, 652), heading=-12, L=62, turns=-0.12, w0=30, w1=17, p=1.6),
    arm_l=dict(pts=[(272, 566), (254, 594), (248, 624)], w0=36, w1=34, start=0.06),
    arm_r=dict(pts=[(520, 576), (553, 565), (580, 543)], w0=37, w1=36, start=0.2),
    foot_l=(334, 702, 41, 19, -6),
    foot_r=(470, 704, 41, 19, 6),
    face=dict(dx=0, dy=0, rot=0),
    eye_l=(345, 512), eye_r=(455, 510), eye_rx=15, eye_ry=20,
    eye_mode='open', lid=0.07, look=(0, -0.25),
    brow_l=dict(c=(344, 466), len=18, ang=-6, bend=-2.5),
    brow_r=dict(c=(457, 464), len=18, ang=6, bend=-2.5),
    mouth=dict(c=(401, 546), mode='small', w=15),
    cheek_l=(304, 545), cheek_r=(497, 542), blush=1.0,
    tear=None,
    shadow=(404, 720, 182, 15),
    hand_extra=None,
    vibes=None,
)


def pose(**kw):
    p = copy.deepcopy(MAIN)
    for k, v in kw.items():
        if isinstance(v, dict) and isinstance(p.get(k), dict):
            p[k].update(v)
        else:
            p[k] = v
    return p


def add_tufts(loop, tufts, ds=2.5):
    loop = list(loop)
    nr = normals(loop, True)
    N = len(loop)
    disp = [0.0] * N
    for (at, n, amp, width) in tufts:
        i0 = min(range(N), key=lambda i: math.dist(loop[i], at))
        half = int(width / ds / 2)
        for j in range(-half, half + 1):
            u = (j + half) / (2 * half)
            ph = (u * n) % 1.0
            spike = (1 - ph) ** 1.8 if ph > 0.02 else 0
            disp[(i0 + j) % N] += amp * spike * math.sin(math.pi * u)
    return [(p[0] + q[0] * d, p[1] + q[1] * d) for p, q, d in zip(loop, nr, disp)]


class Drawer:
    def __init__(self, P, prefix='a-', seed=7, pen=1.0, detail=1.0):
        self.P = P
        self.pre = prefix
        self.rng = random.Random(seed)
        self.pen = pen
        self.detail = detail

    def gid(self, name):
        return f'{self.pre}{name}'

    # ---------- shapes ----------
    def body_loop(self):
        loop = clockwise(resample(catmull(self.P['body'], True, 12), 2.5, True))
        return add_tufts(loop, self.P['tufts'])

    def antenna_geo(self):
        A = self.P['antenna']
        c = resample(turtle(A['base'], A['heading'], A['L'], A['turns'], p=A.get('p', 2.6)), 2.0, False)
        N = len(c)
        W = []
        wm, wc = A.get('wmid', 18), A.get('wcoil', 27)
        for i in range(N):
            u = i / (N - 1)
            # a slim stalk that swells into the rolled-up coil, like a fern's fiddlehead
            if u < 0.5:
                w = lerp(A['w0'], wm, smooth(u / 0.5))
            elif u < 0.84:
                w = lerp(wm, wc, smooth((u - 0.5) / 0.34))
            else:
                w = lerp(wc, A['w1'], smooth((u - 0.84) / 0.16))
            if u < 0.12:
                w += (0.12 - u) / 0.12 * 14
            W.append(w)
        return c, W

    def tail_geo(self):
        T = self.P['tail']
        c = resample(turtle(T['base'], T['heading'], T['L'], T['turns'], p=T.get('p', 2.4)), 2.0, False)
        N = len(c)
        W = [lerp(T['w0'], T['w1'], (i / (N - 1)) ** 0.9) for i in range(N)]
        return c, W

    def limb_geo(self, L):
        c = resample(catmull(L['pts'], False, 12), 2.0, False)
        N = len(c)
        W = [lerp(L['w0'], L['w1'], i / (N - 1)) for i in range(N)]
        return c, W

    # ---------- painting ----------
    def fill_group(self, inner):
        return f'<g filter="url(#a-tooth)">\n{inner}\n</g>'

    def line_group(self, inner):
        return f'<g filter="url(#a-lead)">\n{inner}\n</g>'

    def shade_fn(self, cx, cy, rx, ry, lx=-0.5, ly=-0.55):
        def shade(x, y):
            u, v = (x - cx) / rx, (y - cy) / ry
            return clamp(0.18 - 1.0 * (lx * u + ly * v))
        return shade

    def paint_volume(self, loop, shade, light=None, angle=58, cross=-28, spacing=4.8, rim=None):
        rng = self.rng
        inset = offset_loop(loop, -1.8, rng, 1.4)
        under = f'<path class="a-under" d="{d_poly(inset)}"/>\n'
        parts = [f'<path class="a-fur" opacity="{0.62 if self.detail >= 1 else 0.92}" d="{d_poly(inset)}"/>']
        k1 = (lambda x, y: 1 - light(x, y)) if light else None
        parts.append(stroke_paths(hatch(inset, angle, spacing, rng, keep=k1), 'a-fur-s', rng,
                                  widths=(1.8, 2.3, 2.8), ops=(0.36, 0.5, 0.64)))
        parts.append(stroke_paths(hatch(inset, cross, spacing * 1.05, rng, keep=lambda x, y: shade(x, y) * 1.15),
                                  'a-shade-s', rng, widths=(1.7, 2.2), ops=(0.38, 0.52, 0.66)))
        if rim:
            parts.append(stroke_paths(hatch(inset, angle + 6, spacing * 1.35, rng, keep=rim),
                                      'a-deep-s', rng, widths=(1.5, 2.0), ops=(0.3, 0.42)))
        return under + self.fill_group('\n'.join(parts))

    def ink(self, polys, cls='a-ink'):
        return self.line_group(poly_paths(polys, cls))

    # ---------- parts ----------
    def body(self):
        loop = self.body_loop()
        self._body_loop = loop
        cx, cy, rx, ry = 400, 530, 168, 180
        shade = self.shade_fn(cx, cy, rx, ry)

        def light(x, y):
            hl = math.exp(-(((x - 332) / 70) ** 2 + ((y - 430) / 62) ** 2))
            belly = math.exp(-(((x - 398) / 90) ** 2 + ((y - 620) / 46) ** 2))
            return 0.85 * hl + 0.38 * belly

        def rim(x, y):
            u, v = (x - cx) / rx, (y - cy) / ry
            return clamp((u * u + v * v - 0.55) / 0.4) * shade(x, y) * 1.1

        fill = self.paint_volume(loop, shade, light, rim=rim)
        c, W = self._ant
        k0 = self._ant_k0
        gap_c, gap_r = c[k0], W[k0] / 2 - 2.5
        lines = outline_passes(loop, self.rng, self.pen, skip=lambda x, y: math.dist((x, y), gap_c) < gap_r)
        return fill + '\n' + self.ink(lines)

    def antenna(self):
        c, W = self.antenna_geo()
        body = self.body_loop()
        k0 = next((i for i in range(len(c)) if not pip(body, *c[i])), 0)
        self._ant, self._ant_k0 = (c, W), k0
        left, cap, right = tube(c, W)
        poly = left + cap + right[::-1]
        rng = self.rng
        nr = normals(c, False)
        N = len(c)
        under = f'<path class="a-under" d="{d_poly(poly)}"/>\n'
        fill = [f'<path class="a-fur" opacity="0.66" d="{d_poly(poly)}"/>']
        strokes_fur, strokes_tip, strokes_shade = [], [], []
        for i in range(max(0, k0 - 8), N, 2):
            u = i / (N - 1)
            p, n, w = c[i], nr[i], W[i] / 2 - 1.2
            a, b = (p[0] - n[0] * w, p[1] - n[1] * w), (p[0] + n[0] * w, p[1] + n[1] * w)
            f = rng.uniform(0.6, 1.0)
            b2 = (lerp(a[0], b[0], f), lerp(a[1], b[1], f))
            mid = ((a[0] + b2[0]) / 2 + rng.uniform(-1, 1), (a[1] + b2[1]) / 2 + rng.uniform(-1, 1))
            tipness = smooth((u - 0.7) / 0.18)
            (strokes_tip if rng.random() < tipness else strokes_fur).append((a, mid, b2, 1))
            # shade on the inner side of the curl
            fs = rng.uniform(0.25, 0.5)
            s2 = (lerp(a[0], b[0], fs), lerp(a[1], b[1], fs))
            strokes_shade.append((a, ((a[0] + s2[0]) / 2, (a[1] + s2[1]) / 2), s2, 1))
        fill.append(stroke_paths(strokes_fur, 'a-fur-s', rng, widths=(2.0, 2.6), ops=(0.45, 0.6)))
        fill.append(stroke_paths(strokes_shade, 'a-shade-s', rng, widths=(1.8, 2.3), ops=(0.4, 0.55)))
        fill.append(stroke_paths(strokes_tip, 'a-tip-s', rng, widths=(2.0, 2.6), ops=(0.55, 0.75)))
        # the knot at the very tip
        e = c[-1]
        fill.append(f'<circle class="a-tip" opacity="0.8" cx="{fmt(e[0])}" cy="{fmt(e[1])}" r="{fmt(W[-1] * 0.5)}"/>')
        out_path = left[k0:] + cap + right[k0:][::-1]
        lines = outline_passes(out_path, rng, self.pen, closed=False, passes=[
            (2.6, 0.92, 1, 1, 0.0, 0.8), (1.4, 0.5, 0.5, 0.85, 1.3, 1.2), (1.1, 0.4, 0.25, 0.45, -1.4, 1.2)])
        # a few ridges, like the rolled edge of a fern frond
        ridges = []
        for i in range(k0 + 10, N - 6, 13):
            p, n, w = c[i], nr[i], W[i] / 2
            a = (p[0] - n[0] * w * 0.95, p[1] - n[1] * w * 0.95)
            b = (p[0] - n[0] * w * 0.35, p[1] - n[1] * w * 0.35)
            ridges.append((pencil_stroke([a, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), b], 1.4 * self.pen, rng,
                                         0.3, 0.5, 0.2), 0.45))
        return under + self.fill_group('\n'.join(fill)) + '\n' + self.ink(lines + ridges)

    def tail(self):
        c, W = self.tail_geo()
        left, cap, right = tube(c, W)
        # round the root too (it hides behind the body)
        poly = left + cap + right[::-1]
        rng = self.rng
        nr = normals(c, False)
        under = f'<path class="a-under" d="{d_poly(poly)}"/>\n'
        fill = [f'<path class="a-fur" opacity="0.62" d="{d_poly(poly)}"/>']
        sf, ss = [], []
        for i in range(0, len(c), 2):
            p, n, w = c[i], nr[i], W[i] / 2 - 1
            a, b = (p[0] - n[0] * w, p[1] - n[1] * w), (p[0] + n[0] * w, p[1] + n[1] * w)
            sf.append((a, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), b, 1))
            f = rng.uniform(0.3, 0.6)
            s2 = (lerp(a[0], b[0], f), lerp(a[1], b[1], f))
            ss.append((a, ((a[0] + s2[0]) / 2, (a[1] + s2[1]) / 2), s2, 1))
        fill.append(stroke_paths(sf, 'a-fur-s', rng, widths=(2.0, 2.5), ops=(0.45, 0.6)))
        fill.append(stroke_paths(ss, 'a-shade-s', rng, widths=(1.8, 2.2), ops=(0.45, 0.6)))
        lines = outline_passes(left + cap + right[::-1], rng, self.pen, closed=False, passes=[
            (2.5, 0.9, 1, 1, 0, 0.8), (1.3, 0.5, 0.5, 0.8, 1.2, 1.0)])
        return under + self.fill_group('\n'.join(fill)) + '\n' + self.ink(lines)

    def limb(self, L, under=1):
        c, W = self.limb_geo(L)
        left, cap, right = tube(c, W)
        a0, a1 = c[1], c[0]
        tx, ty = a1[0] - a0[0], a1[1] - a0[1]
        ln = math.hypot(tx, ty) or 1
        t, n = (tx / ln, ty / ln), (ty / ln, -tx / ln)
        root_cap = arc_cap(c[0], t, n, W[0] / 2)
        ks = int(len(c) * L['start'] * 0.55)
        a0, a1 = c[ks + 1], c[ks]
        tx, ty = a1[0] - a0[0], a1[1] - a0[1]
        ln = math.hypot(tx, ty) or 1
        root_cap = arc_cap(c[ks], (tx / ln, ty / ln), (ty / ln, -tx / ln), W[ks] / 2)
        poly = left[ks:] + cap + right[ks:][::-1] + root_cap
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        rx, ry = (max(xs) - min(xs)) / 2 + 1, (max(ys) - min(ys)) / 2 + 1
        shade = self.shade_fn(cx, cy, rx, ry)
        fill = self.paint_volume(clockwise(poly), lambda x, y: shade(x, y) * 0.8,
                                 light=lambda x, y: 0.25 * math.exp(-(((x - cx + rx * 0.4) / rx) ** 2 + ((y - cy + ry * 0.4) / ry) ** 2)),
                                 angle=58, cross=-28, spacing=4.8)
        k = int(len(c) * L['start'])
        out_path = left[k:] + cap + right[k:][::-1]
        lines = outline_passes(out_path, self.rng, self.pen, closed=False, passes=[
            (2.6, 0.92, 1, 1, 0, 0.8), (1.4, 0.5, 0.55, 0.85, 1.3, 1.1)])
        return fill + '\n' + self.ink(lines)

    def foot(self, F):
        cx, cy, rx, ry, rot = F
        loop = ellipse(cx, cy, rx, ry, rot, n=80, rng=self.rng, wob=0.03)
        shade = self.shade_fn(cx, cy, rx, ry, lx=-0.3, ly=-0.8)
        fill = self.paint_volume(loop, shade, light=None, angle=40, cross=-20, spacing=4.4)
        lines = outline_passes(loop, self.rng, self.pen, passes=[
            (2.6, 0.92, 1.0, 1.05, 0, 0.7), (1.4, 0.5, 0.4, 0.7, 1.2, 1.0)])
        toes = []
        for dx in (-11, 11):
            x0 = cx + dx + rot * 0.6
            a = (x0, cy + ry * 0.35)
            b = (x0 + dx * 0.08, cy + ry * 0.92)
            toes.append((pencil_stroke(resample([a, b], 2, False), 2.0 * self.pen, self.rng, 0.3, 0.2, 0.3), 0.8))
        return fill + '\n' + self.ink(lines + toes)

    def eye(self, E, side):
        P = self.P
        cx, cy = E
        lx, ly = P['look']
        cx += lx * 3
        cy += ly * 2
        rx, ry = P['eye_rx'], P['eye_ry']
        rng = self.rng
        mode = P['eye_mode']
        outer = -1 if side == 'l' else 1
        if mode in ('soft', 'happy'):
            sgn = 1 if mode == 'soft' else -1
            pts = []
            for i in range(25):
                x = -rx - 3 + (2 * rx + 6) * i / 24
                y = sgn * 7 * (1 - (x / (rx + 3)) ** 2)
                pts.append((cx + x, cy + 4 + y))
            lid = pencil_stroke(pts, 3.6 * self.pen, rng, 0.2, 0.2, 0.25, 0.3)
            lash_root = pts[0] if outer < 0 else pts[-1]
            lash = [lash_root, (lash_root[0] + outer * 6, lash_root[1] - 4 * sgn + 2)]
            lash = pencil_stroke(resample(lash, 1.5, False), 2.2 * self.pen, rng, 0.1, 0.6, 0.2)
            return self.line_group(poly_paths([(lid, 0.92), (lash, 0.75)], 'a-face-ink'))
        lidy = cy - ry + P['lid'] * 2 * ry
        loop = []
        for p in ellipse(cx, cy, rx, ry, 0, n=64, rng=rng, wob=0.02):
            x, y = p
            ylid = lidy + 4 * ((x - cx) / rx) ** 2 + outer * 1.5 * (x - cx) / rx
            loop.append((x, max(y, ylid)))
        warm = lambda x, y: smooth(((y - cy) / ry - 0.1) / 0.6) * 0.9
        fill = [f'<path class="a-eye" opacity="0.9" d="{d_poly(loop)}"/>',
                stroke_paths(hatch(loop, 70, 2.3, rng, ext=(-1, 0.5), min_len=2), 'a-eye-s', rng,
                             widths=(1.8, 2.2), ops=(0.6, 0.8)),
                stroke_paths(hatch(loop, 18, 2.6, rng, keep=warm, ext=(-1, 0), min_len=2), 'a-eye-warm-s', rng,
                             widths=(1.4, 1.8), ops=(0.55, 0.75))]
        gx = cx + (-0.34 + lx * 0.3) * rx
        gy = max(cy + (-0.4 + ly * 0.2) * ry, lidy + 6)
        glint = (f'<ellipse class="a-glint" cx="{fmt(gx)}" cy="{fmt(gy)}" rx="3.9" ry="4.8" transform="rotate(-20 {fmt(gx)} {fmt(gy)})"/>'
                 f'<circle class="a-glint" opacity="0.7" cx="{fmt(cx + (0.36 + lx * 0.2) * rx)}" cy="{fmt(cy + 0.48 * ry)}" r="1.7"/>')
        rim = outline_passes(loop, rng, self.pen, passes=[(1.8, 0.85, 1.0, 1.04, 0, 0.4)])
        # the upper lid: a heavier stroke over the top, running a little past the outer corner
        lidpts = []
        for i in range(21):
            f = i / 20
            x = cx - rx * 1.05 + 2.1 * rx * f
            y = lidy + 4 * ((x - cx) / rx) ** 2 + outer * 1.5 * (x - cx) / rx - 1.6
            lidpts.append((x, y))
        if outer < 0:
            lidpts.insert(0, (lidpts[0][0] - 4, lidpts[0][1] + 3.5))
        else:
            lidpts.append((lidpts[-1][0] + 4, lidpts[-1][1] + 3.5))
        lid = pencil_stroke(resample(lidpts, 1.5, False), 3.2 * self.pen, rng, 0.25 if outer > 0 else 0.1,
                            0.1 if outer > 0 else 0.25, 0.25, 0.3)
        return (f'<g filter="url(#a-tooth-dense)">' + '\n'.join(fill) + '</g>\n' + self.line_group(glint) + '\n'
                + self.line_group(poly_paths(rim, 'a-eye') + poly_paths([(lid, 0.92)], 'a-face-ink')))

    def brow(self, B):
        cx, cy = B['c']
        a = math.radians(B['ang'])
        L = B['len']
        pts = []
        for i in range(13):
            f = i / 12 - 0.5
            x, y = f * L, B['bend'] * (1 - (2 * f) ** 2)
            pts.append((cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)))
        return self.line_group(poly_paths([(pencil_stroke(resample(pts, 1.5, False), 3.0 * self.pen, self.rng,
                                                           0.35, 0.45, 0.3), 0.85)], 'a-face-ink'))

    def mouth(self):
        M = self.P['mouth']
        cx, cy = M['c']
        w = M['w'] / 2
        rng = self.rng
        mode = M['mode']
        if mode == 'smile':
            top = [(cx - w + 2 * w * i / 12, cy - 1.5 * (1 - ((i - 6) / 6) ** 2) - 0.6 * (i / 12)) for i in range(13)]
            bot = [(cx + w - 2 * w * i / 12, cy + 7.5 * (1 - ((i - 6) / 6) ** 2) ** 0.8) for i in range(13)]
            shape = top + bot
            ends = [(top[0][0] - 2.5, top[0][1] - 2.2), (top[-1][0] + 2.5, top[-1][1] - 2.4)]
            fill = f'<path class="a-mouth" opacity="0.85" d="{d_poly(shape)}"/>'
            lines = outline_passes(shape, rng, self.pen, passes=[(2.2, 0.9, 1.0, 1.03, 0, 0.3)])
            lines += [(pencil_stroke(resample([top[0], ends[0]], 1, False), 2 * self.pen, rng, 0.2, 0.6, 0.2), 0.8),
                      (pencil_stroke(resample([top[-1], ends[1]], 1, False), 2 * self.pen, rng, 0.2, 0.6, 0.2), 0.8)]
            return self.fill_group(fill) + self.line_group(poly_paths(lines, 'a-face-ink'))
        if mode == 'o':
            loop = ellipse(cx, cy + 2, w * 0.45, w * 0.55, 0, 40, rng, 0.05)
            fill = f'<path class="a-mouth" opacity="0.85" d="{d_poly(loop)}"/>'
            lines = outline_passes(loop, rng, self.pen, passes=[(2.2, 0.9, 1.0, 1.05, 0, 0.3)])
            return self.fill_group(fill) + self.line_group(poly_paths(lines, 'a-face-ink'))
        if mode == 'wobble':
            pts = [(cx - w + 2 * w * i / 30, cy + 1.6 * math.sin(i / 30 * math.tau * 1.5) + 3 * (1 - ((i - 15) / 15) ** 2))
                   for i in range(31)]
            return self.line_group(poly_paths([(pencil_stroke(pts, 2.6 * self.pen, rng, 0.2, 0.2, 0.3), 0.9)], 'a-face-ink'))
        # 'small'
        pts = [(cx - w + 2 * w * i / 20, cy + 3.5 * (1 - ((i - 10) / 10) ** 2)) for i in range(21)]
        return self.line_group(poly_paths([(pencil_stroke(pts, 2.6 * self.pen, rng, 0.25, 0.25, 0.3), 0.9)], 'a-face-ink'))

    def cheek(self, C):
        cx, cy = C
        loop = ellipse(cx, cy, 21, 11, -8, 40, self.rng, 0.06)
        k = self.P['blush']
        s = hatch(loop, 64, 3.4, self.rng, keep=lambda x, y: k * (1 - ((x - cx) / 23) ** 2 - ((y - cy) / 13) ** 2) * 1.6,
                  ext=(-1, 2.5), min_len=3)
        return self.fill_group(stroke_paths(s, 'a-blush-s', self.rng, widths=(2.0, 2.6), ops=(0.4, 0.55, 0.7)))

    def tear(self):
        T = self.P['tear']
        if not T:
            return ''
        x, y = T
        drop = [(x, y - 9)]
        for i in range(1, 24):
            a = math.pi * (-0.15 + 1.3 * i / 24)
            drop.append((x + 6 * math.cos(a), y + 4 + 6 * math.sin(a)))
        drop = clockwise(catmull(drop, True, 4))
        fill = f'<path class="a-tear" opacity="0.9" d="{d_poly(drop)}"/>'
        lines = outline_passes(drop, self.rng, self.pen, passes=[(1.4, 0.7, 0.75, 0.9, 0, 0.2)])
        return (self.fill_group(fill) + self.line_group(poly_paths(lines, 'a-ink'))
                + f'<circle class="a-glint" cx="{fmt(x - 2)}" cy="{fmt(y + 3)}" r="1.5"/>')

    def shadow(self):
        cx, cy, rx, ry = self.P['shadow']
        loop = ellipse(cx, cy, rx, ry, 0, 60, self.rng, 0.05)
        s = hatch(loop, -6, 3.6, self.rng, keep=lambda x, y: 1.25 - ((x - cx) / rx) ** 2 * 1.4 - ((y - cy) / ry) ** 2 * 0.5,
                  ext=(-6, 3))
        return self.line_group(stroke_paths(s, 'a-shadow-s', self.rng, widths=(1.4, 1.9), ops=(0.22, 0.32, 0.42)))

    def vibes(self):
        V = self.P['vibes']
        if not V:
            return ''
        out = []
        for (cx, cy, r, a0, a1) in V:
            pts = [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / 16)),
                    cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / 16))) for i in range(17)]
            out.append((pencil_stroke(pts, 2.0 * self.pen, self.rng, 0.3, 0.3, 0.3), 0.7))
        return self.line_group(poly_paths(out, 'a-ink'))

    # ---------- assembly ----------
    def draw(self, with_shadow=True):
        P = self.P
        g = self.gid
        ant = self.antenna()      # computed first: the body's outline leaves a gap where it grows out
        tail = self.tail()
        body = self.body()
        F = P['face']
        fcx, fcy = 400, 520
        face_t = f'translate({F["dx"]} {F["dy"]}) rotate({F["rot"]} {fcx} {fcy})'
        ex = P['eye_l'], P['eye_r']
        br = P['brow_l']['c'], P['brow_r']['c']
        rot = P['body_rot']
        torso_t = f' transform="rotate({rot} 402 694)"' if rot else ''
        bc = self._ant[0][0]
        k0 = self._ant_k0
        ep = self._ant[0][k0]
        tb = P['tail']['base']
        al, ar = P['arm_l']['pts'][0], P['arm_r']['pts'][0]
        fl, fr = P['foot_l'], P['foot_r']
        parts = []
        if with_shadow:
            parts.append(f'<g id="{g("shadow")}"><!-- pivot: {P["shadow"][0]},{P["shadow"][1]} (scale with jumps) -->\n{self.shadow()}\n</g>')
        parts.append(f'<g id="{g("foot-l")}"><!-- pivot: {fl[0]},{fl[1] - fl[3]} (step: lift and rotate) -->\n{self.foot(fl)}\n</g>')
        parts.append(f'<g id="{g("foot-r")}"><!-- pivot: {fr[0]},{fr[1] - fr[3]} -->\n{self.foot(fr)}\n</g>')
        parts.append(f'<g id="{g("torso")}"{torso_t}><!-- pivot: 402,694 (squash and stretch, lean) -->')
        parts.append(f'<g id="{g("tail")}"><!-- pivot: {fmt(tb[0])},{fmt(tb[1])} (wag, curl tighter when shy) -->\n{tail}\n</g>')
        parts.append(f'<g id="{g("body")}"><!-- pivot: 402,694 -->\n{body}\n</g>')
        parts.append(f'<g id="{g("antenna")}"><!-- pivot: {fmt(ep[0])},{fmt(ep[1])} where it leaves the head (lean, bob; unfurl = redraw the curl) -->\n{ant}\n{self.vibes()}\n</g>')
        if not P.get('arm_l_hidden'):
            parts.append(f'<g id="{g("arm-l")}"><!-- pivot: {fmt(al[0])},{fmt(al[1])} shoulder -->\n{self.limb(P["arm_l"])}\n</g>')
        if not P.get('arm_r_outside'):
            parts.append(f'<g id="{g("arm-r")}"><!-- pivot: {fmt(ar[0])},{fmt(ar[1])} shoulder -->\n{self.limb(P["arm_r"])}\n</g>')
        face = [f'<g id="{g("face")}" transform="{face_t}"><!-- pivot: {fcx},{fcy} (slide across the body to look around, tilt) -->',
                f'<g id="{g("cheek-l")}"><!-- pivot: {P["cheek_l"][0]},{P["cheek_l"][1]} (fade in for shy) -->\n{self.cheek(P["cheek_l"])}\n</g>',
                f'<g id="{g("cheek-r")}"><!-- pivot: {P["cheek_r"][0]},{P["cheek_r"][1]} -->\n{self.cheek(P["cheek_r"])}\n</g>',
                f'<g id="{g("eye-l")}"><!-- pivot: {ex[0][0]},{ex[0][1]} (blink: scaleY) -->\n{self.eye(ex[0], "l")}\n</g>',
                f'<g id="{g("eye-r")}"><!-- pivot: {ex[1][0]},{ex[1][1]} (blink: scaleY) -->\n{self.eye(ex[1], "r")}\n</g>',
                f'<g id="{g("brow-l")}"><!-- pivot: {br[0][0]},{br[0][1]} -->\n{self.brow(P["brow_l"])}\n</g>',
                f'<g id="{g("brow-r")}"><!-- pivot: {br[1][0]},{br[1][1]} -->\n{self.brow(P["brow_r"])}\n</g>',
                f'<g id="{g("mouth")}"><!-- pivot: {P["mouth"]["c"][0]},{P["mouth"]["c"][1]} -->\n{self.mouth()}\n</g>',
                f'<g id="{g("tear")}">{self.tear()}</g>' if P['tear'] else '',
                '</g>']
        parts.extend(face)
        if P['hand_extra']:
            parts.append(P['hand_extra'](self))
        parts.append('</g>')
        return '\n'.join(parts)

    def silhouette(self, cls='a-ink'):
        """The whole outline filled solid — the small-size recognition test."""
        P = self.P
        feet = [ellipse(*F[:4], F[4], n=60) for F in (P['foot_l'], P['foot_r'])]
        shapes = [self.body_loop()]
        c, W = self.antenna_geo()
        l, cap, r = tube(c, W)
        shapes.append(l + cap + r[::-1])
        c, W = self.tail_geo()
        l, cap, r = tube(c, W)
        shapes.append(l + cap + r[::-1])
        for L in (P['arm_l'], P['arm_r']):
            c, W = self.limb_geo(L)
            l, cap, r = tube(c, W)
            shapes.append(l + cap + r[::-1])
        rot = P['body_rot']
        return (f'<path class="{cls}" d="{"".join(d_poly(s) for s in feet)}"/>'
                f'<path class="{cls}" transform="rotate({rot} 402 694)" d="{"".join(d_poly(s) for s in shapes)}"/>')
