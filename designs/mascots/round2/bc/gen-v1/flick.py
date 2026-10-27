#!/usr/bin/env python3
"""片片 Flick — a little creature cut from pencil-coloured paper, with a hand of story cards tucked
behind its head that fans open when it hears a story.

build(prefix, pose) returns (defs, svg) for one instance. Every id starts with "bc-".
Run: python3 -I gen/flick.py  -> character.svg (main pose, 800x800, transparent)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import (R, spline, poly, tear, ellipse_pts, rot, d_of, smooth_d, inside, edge_dist,
                 taper_stroke, hatch, pencil_line, scribble, paths, filters)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')

# ---------------------------------------------------------------- palette (oklch). Day values; each
# paper colour is also a CSS custom property so a theme / night paper can recolour without regenerating.
PAL = {
    'paper': 'oklch(96.8% 0.012 85)',        # the cream drawing paper under the pencil
    'head': 'oklch(85% 0.034 296)',          # lavender pencil on the head's paper
    'head_shade': 'oklch(72% 0.05 292)',
    'head_deep': 'oklch(59% 0.06 288)',
    'head_mix': 'oklch(78% 0.04 245)',       # a mist-blue pencil worked into the shadows
    'body': 'oklch(75% 0.045 290)',          # the body's paper: the same family, a shade deeper
    'body_shade': 'oklch(64% 0.055 288)',
    'body_deep': 'oklch(51% 0.06 284)',
    'body_mix': 'oklch(70% 0.05 250)',
    'body_hi': 'oklch(97% 0.012 85)',
    'mitt': 'oklch(95.5% 0.022 88)',         # cream mitten
    'mitt_shade': 'oklch(86% 0.035 78)',
    'mitt_deep': 'oklch(76% 0.04 70)',
    'ink': 'oklch(31% 0.04 282)',            # what shows through the punched holes
    'ink_deep': 'oklch(19% 0.03 282)',       # under the hole's top edge
    'ink_lip': 'oklch(86% 0.03 290)',        # the punched hole's lit lower lip (paper thickness)
    'glint': 'oklch(97.5% 0.01 85)',
    'tongue': 'oklch(64% 0.1 32)',
    'graphite': 'oklch(36% 0.02 60)',
    'lid': 'oklch(38% 0.04 285)',
    'brass': 'oklch(76% 0.085 82)',
    'brass_dark': 'oklch(58% 0.08 70)',
    'brass_hi': 'oklch(93% 0.05 92)',
    'mark': 'oklch(58% 0.06 285)',           # wave marks, sparks: mid-tone, holds on cream and on night paper
    'shadow_ground': 'oklch(42% 0.03 285)',
}
CARDS = {  # (wash, shade) per card family
    'wheat': ('oklch(89% 0.06 88)', 'oklch(78% 0.08 80)'),
    'sage': ('oklch(86% 0.05 140)', 'oklch(72% 0.06 145)'),
    'peach': ('oklch(88% 0.05 52)', 'oklch(77% 0.07 42)'),
    'lav': ('oklch(86% 0.04 295)', 'oklch(73% 0.055 290)'),
}
VAR = {'paper': 'paper', 'head': 'head', 'head_shade': 'head-shade', 'head_deep': 'head-deep', 'head_mix': 'head-mix',
       'body': 'body', 'body_shade': 'body-shade', 'body_deep': 'body-deep', 'body_mix': 'body-mix',
       'mitt': 'mitt', 'ink': 'ink'}


def col(k):
    if k in VAR:
        return f'var(--bc-{VAR[k]}, {PAL[k]})'
    return PAL[k]


def fill(k):
    return f'style="fill:{col(k)}"'


# ---------------------------------------------------------------- pencil-on-paper piece

def piece(pfx, pid, pts, *, base='body', shade='body_shade', deep='body_deep', mix='body_mix', hi='body_hi',
          light=(-0.55, -0.83), density=1.0, seed=1, rim='bc-paper', edge_line=True, ang=-0.62, mix_amt=1.0,
          extra=''):
    """One cut piece of cream paper, coloured in with pencil: a grainy first layer, hatched shade toward
    the side away from the light and along the edge, a second hue worked into the shadow, a little
    pencil lifted out where the light falls, and a broken pencil line just inside the cut."""
    d = d_of(pts)
    cid = f'{pfx}clip-{pid}'
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    rx, ry = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
    area = math.pi * rx * ry
    n = max(10, int(area / 300 * density))
    lx, ly = light
    sw = max(4.0, min(8.0, min(rx, ry) / 11))  # stroke width scales with the piece

    def sidew(x, y):
        u, v = (x - cx) / rx, (y - cy) / ry
        s = -(u * lx + v * ly)  # +1 on the side away from the light
        return s, math.hypot(u, v)

    def w_shade(x, y):
        s, r = sidew(x, y)
        e = edge_dist(pts, x, y)
        return min(1.0, max(0.0, 0.08 + 0.75 * max(0, s) * r ** 1.2) + max(0, 1 - e / (sw * 3.2)) * 0.55)

    def w_deep(x, y):
        s, r = sidew(x, y)
        e = edge_dist(pts, x, y)
        return min(1.0, max(0.0, (s - 0.25) * 1.3) * max(0, 1 - e / (sw * 4)) + max(0, s - 0.55) * r * 0.5)

    def w_mix(x, y):
        s, r = sidew(x, y)
        return max(0.0, 0.15 + s * 0.6) * min(1, r * 1.2) * mix_amt

    def w_hi(x, y):
        s, r = sidew(x, y)
        e = edge_dist(pts, x, y)
        return max(0.0, -s - 0.2) * 1.4 * (1 if e > sw * 2 else 0.2)

    L = (sw * 3.2, sw * 6.5)
    W = (sw * 0.75, sw * 1.15)
    sh = hatch(pts, int(n * 1.0), ang, 0.28, L, W, w_shade, seed + 1, bend=sw * 0.5)
    dp = hatch(pts, int(n * 0.45), ang + 0.08, 0.25, L, W, w_deep, seed + 2, bend=sw * 0.4)
    mx = hatch(pts, int(n * 0.35 * mix_amt), ang + 0.2, 0.3, L, W, w_mix, seed + 3, bend=sw * 0.5) if mix else []
    hh = hatch(pts, int(n * 0.18), ang - 0.1, 0.3, L, (sw * 0.6, sw * 0.9), w_hi, seed + 4, bend=sw * 0.5)

    edge = ''
    if edge_line:
        r = R(seed + 9)
        segs = []
        m = len(pts)
        i = 0
        while i < m:
            run = r.randint(6, 14)
            if r.random() < 0.72:
                seg = []
                for k in range(run):
                    a, b, c = pts[(i + k - 1) % m], pts[(i + k) % m], pts[(i + k + 1) % m]
                    tx, ty = c[0] - a[0], c[1] - a[1]
                    ln = math.hypot(tx, ty) or 1
                    nx, ny = ty / ln, -tx / ln  # outward for a clockwise outline
                    inset = sw * 0.55
                    seg.append((b[0] - nx * inset, b[1] - ny * inset))
                segs.append(smooth_d(seg))
            i += run + r.randint(1, 4)
        edge = (f'<g style="stroke:{col(deep)}" stroke-width="{sw * 0.32:.2f}" stroke-opacity="0.55" fill="none" '
                f'stroke-linecap="round" filter="url(#bc-graphite)">' + ''.join(f'<path d="{s}"/>' for s in segs) + '</g>')

    gid = f'{pfx}grad-{pid}'
    gx1, gy1 = cx + lx * rx * 0.9, cy + ly * ry * 0.9
    gx2, gy2 = cx - lx * rx * 1.0, cy - ly * ry * 1.0
    defs = (f'<clipPath id="{cid}"><path d="{d}"/></clipPath>'
            f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{gx1:.0f}" y1="{gy1:.0f}" x2="{gx2:.0f}" y2="{gy2:.0f}">'
            f'<stop offset="0" style="stop-color:{col(hi)}"/><stop offset="0.38" style="stop-color:{col(base)}"/>'
            f'<stop offset="0.8" style="stop-color:{col(base)}"/><stop offset="1" style="stop-color:{col(shade)}"/></linearGradient>')
    svg = f'''<g filter="url(#{rim})">
  <path d="{d}" {fill('paper')}/>
  <path d="{d}" fill="url(#{gid})" filter="url(#bc-tooth1)"/>
  <g clip-path="url(#{cid})"><g filter="url(#bc-tooth2)">
    {paths(mx, col(mix), 0.45) if mix else ''}
    {paths(sh, col(shade), 0.5)}
    {paths(dp, col(deep), 0.42)}
    {paths(hh, col(hi), 0.3)}
  </g>{edge}{extra}</g>
</g>'''
    return defs, svg


# ---------------------------------------------------------------- small parts

def brad(x, y, r=8.5):
    """A brass paper fastener: the joint the part turns on."""
    return f'''<g class="bc-brad">
  <ellipse cx="{x + 1.6:.1f}" cy="{y + 2.6:.1f}" rx="{r * 1.05:.1f}" ry="{r:.1f}" fill="{PAL['shadow_ground']}" fill-opacity="0.28"/>
  <circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{PAL['brass_dark']}"/>
  <circle cx="{x - 0.8:.1f}" cy="{y - 0.9:.1f}" r="{r * 0.8:.1f}" fill="{PAL['brass']}"/>
  <ellipse cx="{x - r * 0.35:.1f}" cy="{y - r * 0.4:.1f}" rx="{r * 0.34:.1f}" ry="{r * 0.24:.1f}" fill="{PAL['brass_hi']}" transform="rotate(-30 {x - r * 0.35:.1f} {y - r * 0.4:.1f})"/>
</g>'''


def strip(a, b, w, ext=14, seed=1, wobble=1.0, w_end=None, bow=0.0):
    """A torn paper strip from joint a to joint b, rounded past both joints."""
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    ux, uy = math.cos(ang), math.sin(ang)
    nx, ny = -uy, ux
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    h = w / 2
    he = (w_end if w_end is not None else w) / 2
    r = R(seed)
    # simpler explicit build
    keys = []
    cap = 7
    for k in range(cap + 1):
        t = math.pi / 2 + math.pi * k / cap  # 90..270 deg: the back cap
        keys.append((a[0] + ux * math.cos(t) * ext + nx * math.sin(t) * h, a[1] + uy * math.cos(t) * ext + ny * math.sin(t) * h))
    for k in range(1, 4):
        t = k / 4
        hh = h + (he - h) * t
        bw = math.sin(math.pi * t) * bow
        keys.append((a[0] + nx * bw + ux * L * t - nx * hh * (1 + r.uniform(-0.05, 0.05) * wobble), a[1] + uy * L * t - ny * hh * (1 + r.uniform(-0.05, 0.05) * wobble) + ny * bw))
    for k in range(cap + 1):
        t = -math.pi / 2 + math.pi * k / cap  # -90..90: the front cap
        keys.append((b[0] + ux * math.cos(t) * ext + nx * math.sin(t) * he, b[1] + uy * math.cos(t) * ext + ny * math.sin(t) * he))
    for k in range(3, 0, -1):
        t = k / 4
        hh = h + (he - h) * t
        bw = math.sin(math.pi * t) * bow
        keys.append((a[0] + nx * bw + ux * L * t + nx * hh * (1 + r.uniform(-0.05, 0.05) * wobble), a[1] + uy * L * t + ny * hh * (1 + r.uniform(-0.05, 0.05) * wobble) + ny * bw))
    return tear(poly(keys, 4.5), seed, jag=0.9, wander=2.5)


MITT = [(-14, 3), (-21, -6), (-31, -9), (-40, -17), (-40, -28), (-31, -33), (-28, -45), (-20, -59), (-5, -66),
        (11, -65), (25, -56), (32, -40), (30, -22), (21, -7), (11, 2), (-2, 5)]


def mitt_pts(wx, wy, ang_deg, flip=False, scale=1.0, seed=1):
    """A round cream mitten with a small thumb, its wrist at (wx, wy), pointing along ang_deg."""
    phi = ang_deg + 90
    out = []
    for x, y in MITT:
        x = -x if flip else x
        x, y = x * scale, y * scale
        p = rot((wx + x, wy + y), (wx, wy), phi)
        out.append(p)
    if flip:
        out = out[::-1]
    return tear(spline(out, 4), seed, jag=0.35, wander=1.2)


def arm(pfx, side, S, ang, L=188, w=40, w_end=32, flip=False, seed=10, hand_ang=None, bow=0.0):
    """One paper strip pinned to the body by a brass brad at the shoulder, a cream mitten glued on the
    end. Rotating the group about S turns the whole arm; the mitten can turn on its own at the wrist."""
    Wr = (S[0] + L * math.cos(math.radians(ang)), S[1] + L * math.sin(math.radians(ang)))
    st = strip(S, Wr, w, ext=w * 0.5, seed=seed, w_end=w_end, bow=bow)
    ha = hand_ang if hand_ang is not None else ang
    mp = mitt_pts(Wr[0] - 4 * math.cos(math.radians(ha)), Wr[1] - 4 * math.sin(math.radians(ha)), ha, flip=flip, seed=seed + 2)
    d1, s1 = piece(pfx, f'strip-{side}', st, seed=seed + 3, density=1.4, mix_amt=0.6, ang=-0.7)
    d3, s3 = piece(pfx, f'mitt-{side}', mp, base='mitt', shade='mitt_shade', deep='mitt_deep', mix=None, hi='paper',
                   seed=seed + 5, density=1.5, rim='bc-thin')
    svg = f'''<g id="{pfx}arm-{side}"><!-- pivot: {S[0]:.0f},{S[1]:.0f} (shoulder brad; the whole arm turns here, now at {ang:.0f} deg). A pull-tab strip: it also slides out along its own axis, 124 at rest to 188 raised (translate the hand by the difference) -->
  {s1}
  <g id="{pfx}hand-{side}"><!-- pivot: {Wr[0]:.0f},{Wr[1]:.0f} (wrist; wave = rotate ±18 here) -->{s3}</g>
  {brad(*S)}
</g>'''
    return d1 + d3, svg, S, Wr


def hole(cx, cy, r, lower=0.0, upper=0.0, tilt=0.0, look=(0, 0), glint=True, sx=1.0):
    """A punched hole: matte dark behind it, deepest under the top edge where the paper overhangs,
    one small glint. lower > 0 pushes the bottom up into a smile; upper > 0 flattens the top (a lid)."""
    k = 0.5523
    rx, ry = r * sx, r
    top = -ry * (1 - upper)
    bot = ry * (1 - 2 * lower)
    d = (f'M{-rx:.1f},0 C{-rx:.1f},{top * k:.1f} {-rx * k:.1f},{top:.1f} 0,{top:.1f} '
         f'C{rx * k:.1f},{top:.1f} {rx:.1f},{top * k:.1f} {rx:.1f},0 '
         f'C{rx:.1f},{ry * 0.6:.1f} {rx * 0.5:.1f},{bot:.1f} 0,{bot:.1f} '
         f'C{-rx * 0.5:.1f},{bot:.1f} {-rx:.1f},{ry * 0.6:.1f} {-rx:.1f},0Z')
    shade = (f'M{-rx:.1f},0 C{-rx:.1f},{top * k:.1f} {-rx * k:.1f},{top:.1f} 0,{top:.1f} '
             f'C{rx * k:.1f},{top:.1f} {rx:.1f},{top * k:.1f} {rx:.1f},0 '
             f'C{rx * 0.6:.1f},{top * 0.45:.1f} {-rx * 0.6:.1f},{top * 0.45:.1f} {-rx:.1f},0Z')
    gx, gy = look
    g = ''
    if glint:
        g = f'<ellipse cx="{-rx * 0.3 + gx:.1f}" cy="{top * 0.42 + gy:.1f}" rx="{r * 0.2:.1f}" ry="{r * 0.17:.1f}" fill="{PAL["glint"]}" opacity="0.95"/>'
    return f'''<g transform="translate({cx:.1f},{cy:.1f}) rotate({tilt})" filter="url(#bc-punch)">
  <path d="{d}" {fill('ink')}/>
  <path d="{shade}" fill="{PAL['ink_deep']}" opacity="0.7"/>
  {g}
</g>'''


def slit(cx, cy, w, up=True, tilt=0.0, thick=5.5):
    """A closed eye: a thin crescent cut, arching up (happy) or down (calm)."""
    s = -1 if up else 1
    h = w * 0.36 * s
    d = (f'M{-w / 2:.1f},0 C{-w / 4:.1f},{h:.1f} {w / 4:.1f},{h:.1f} {w / 2:.1f},0 '
         f'C{w / 4:.1f},{h - s * -thick:.1f} {-w / 4:.1f},{h - s * -thick:.1f} {-w / 2:.1f},0Z')
    return f'''<g transform="translate({cx:.1f},{cy:.1f}) rotate({tilt})" filter="url(#bc-punch)"><path d="{d}" {fill('ink')}/></g>'''


def mouth(cx, cy, w=26, h=15, tilt=0.0, tongue=True):
    """A small half-moon punched out under the eyes: flat top, round bottom."""
    d = (f'M{-w / 2:.1f},{-h * 0.15:.1f} C{-w * 0.2:.1f},{-h * 0.32:.1f} {w * 0.2:.1f},{-h * 0.32:.1f} {w / 2:.1f},{-h * 0.15:.1f} '
         f'C{w * 0.46:.1f},{h * 0.55:.1f} {w * 0.2:.1f},{h * 0.85:.1f} 0,{h * 0.85:.1f} '
         f'C{-w * 0.2:.1f},{h * 0.85:.1f} {-w * 0.46:.1f},{h * 0.55:.1f} {-w / 2:.1f},{-h * 0.15:.1f}Z')
    t = ''
    if tongue:
        t = (f'<path d="M{-w * 0.26:.1f},{h * 0.55:.1f} C{-w * 0.12:.1f},{h * 0.22:.1f} {w * 0.18:.1f},{h * 0.24:.1f} {w * 0.28:.1f},{h * 0.52:.1f} '
             f'C{w * 0.12:.1f},{h * 0.84:.1f} {-w * 0.12:.1f},{h * 0.84:.1f} {-w * 0.26:.1f},{h * 0.55:.1f}Z" fill="{PAL["tongue"]}"/>')
    return f'''<g transform="translate({cx:.1f},{cy:.1f}) rotate({tilt})" filter="url(#bc-punch)"><path d="{d}" {fill('ink')}/>{t}</g>'''


def mouth_line(cx, cy, w=22, curve=6, tilt=0.0):
    pts = [(cx - w / 2, cy), (cx - w / 4, cy + curve * 0.9), (cx + w / 4, cy + curve * 0.9), (cx + w / 2, cy - curve * 0.1)]
    ds = pencil_line(spline(pts, 3, closed=False), 41, passes=3, spread=0.6)
    return (f'<g transform="rotate({tilt} {cx} {cy})" style="stroke:{col("ink")}" stroke-width="3.6" fill="none" stroke-linecap="round" filter="url(#bc-graphite)">'
            + ''.join(f'<path d="{d}"/>' for d in ds) + '</g>')


def pencil_marks(segs, color, width=3.0, seed=50, opacity=0.9):
    out = []
    for i, pts in enumerate(segs):
        out += pencil_line(spline(pts, 3, closed=False), seed + i, passes=2, spread=0.7)
    return (f'<g style="stroke:{color}" stroke-width="{width}" fill="none" stroke-linecap="round" opacity="{opacity}" filter="url(#bc-graphite)">'
            + ''.join(f'<path d="{d}"/>' for d in out) + '</g>')


# ---------------------------------------------------------------- cards

def card(pfx, idx, piv, ang, family, w=92, h=128, gap=112, lift=0.0, seed=70, wave_doodle=False):
    """A story card tucked behind the head. All cards turn about the same pivot (piv), like a hand of
    cards; lift slides one further out of the head."""
    wash, shade = CARDS[family]
    x0, x1 = piv[0] - w / 2, piv[0] + w / 2
    yb = piv[1] - gap - lift
    yt = yb - h
    rr = 11
    keys = [(x0 + rr, yt), (x1 - rr, yt), (x1, yt + rr), (x1, yb - rr), (x1 - rr, yb), (x0 + rr, yb), (x0, yb - rr), (x0, yt + rr)]
    r = R(seed)
    keys = [(x + r.uniform(-1.2, 1.2), y + r.uniform(-1.2, 1.2)) for x, y in keys]
    pts = tear(spline(keys, 5), seed, jag=0.4, wander=1.2)
    pts = [rot(p, piv, ang) for p in pts]

    def rp(x, y):
        return rot((x, y), piv, ang)

    band = 0.38  # the coloured header of the card, as the app's story cards carry their colour family

    def along(x, y):
        ux, uy = math.sin(math.radians(ang)), -math.cos(math.radians(ang))
        return ((x - piv[0]) * ux + (y - piv[1]) * uy - gap - lift) / h  # 0 bottom .. 1 top

    st = hatch(pts, 40, math.radians(ang) - 0.7, 0.25, (14, 28), (3.6, 5.4),
               lambda x, y: 0.9 if along(x, y) > 1 - band else 0.0, seed + 1, bend=2.5)
    st2 = hatch(pts, 22, math.radians(ang) - 0.6, 0.25, (12, 22), (3.2, 4.6),
                lambda x, y: max(0, 1 - edge_dist(pts, x, y) / 10) * 0.7, seed + 2, bend=2)
    cid = f'{pfx}clip-card-{idx}'
    hb = yt + h * band
    bandpoly = [rot(q, piv, ang) for q in [(x0 - 4, yt - 4), (x1 + 4, yt - 4), (x1 + 4, hb + 1.5), (piv[0] + 10, hb - 1.2), (x0 - 4, hb + 1)]]
    # pencil writing (loops, not letters) under the header, and a wobbly hand-drawn rule
    lines = []
    for k in range(3):
        yy = hb + 17 + k * 15
        ww = (w - 28) * (0.92 if k < 2 else 0.5)
        for dd in scribble(x0 + 14, yy, ww, seed + 10 + k, h=3.4):
            lines.append(dd)
    doodle = ''
    if wave_doodle:
        # three little waves, as on the Resonance mark
        wv = []
        for k in range(3):
            yy = yt + 15 + k * 9
            wv.append([(x0 + 26 + j * 5.5, yy + (2.6 if j % 2 else -2.6)) for j in range(9)])
        doodle = pencil_marks(wv, PAL['graphite'], width=2.2, seed=seed + 30, opacity=0.65)
    g = (f'<g transform="rotate({ang} {piv[0]} {piv[1]})">'
         f'<g style="stroke:{PAL["graphite"]}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.62" filter="url(#bc-graphite)">'
         + ''.join(f'<path d="{d}"/>' for d in lines) + '</g>' + doodle + '</g>')
    defs = f'<clipPath id="{cid}"><path d="{d_of(pts)}"/></clipPath>'
    svg = f'''<g id="{pfx}card-{idx}"><!-- pivot: {piv[0]},{piv[1]} (all cards share it: fan = rotate each card; lift = translate along its own axis) -->
<g filter="url(#bc-thin)">
  <path d="{d_of(pts)}" {fill('paper')}/>
  <g clip-path="url(#{cid})">
    <path d="{d_of(bandpoly)}" fill="{wash}" filter="url(#bc-tooth1)"/>
    <g filter="url(#bc-tooth2)">{paths(st, shade, 0.4)}{paths(st2, shade, 0.35)}</g>{g}
  </g>
</g>
</g>'''
    return defs, svg


# ---------------------------------------------------------------- poses

GROUND = 742


def superellipse(cx, cy, rx, ry, n=2.5, k=72, top_flat=0.0, bottom_wide=0.0):
    out = []
    for i in range(k):
        t = 2 * math.pi * i / k - math.pi / 2  # start at the top, go clockwise (y down)
        c, sn = math.cos(t), math.sin(t)
        x = rx * math.copysign(abs(c) ** (2 / n), c)
        y = ry * math.copysign(abs(sn) ** (2 / n), sn)
        if y < 0:
            y *= 1 - top_flat * (x / rx) ** 2 * 0
            y *= 1 - top_flat
        if y > 0:
            x *= 1 + bottom_wide * (y / ry)
        out.append((cx + x, cy + y))
    return out


HEAD_C, HEAD_R = (400, 380), (168, 116)
BODY_C, BODY_R = (400, 572), (114, 78)
HEAD_KEYS = [(310, 280), (370, 263), (436, 261), (496, 274), (536, 306), (552, 358), (544, 420), (516, 466), (462, 492),
             (400, 499), (338, 493), (286, 468), (258, 424), (250, 366), (266, 314)]
BODY_KEYS = [(322, 490), (400, 482), (478, 490), (506, 524), (516, 584), (500, 632), (452, 654), (398, 658), (346, 654),
             (300, 632), (284, 584), (294, 524)]
FAN_PIVOT = (466, 350)
NECK = (400, 498)
SHOULDER_L, SHOULDER_R = (312, 506), (488, 506)

POSES = {
    'main': dict(
        head_tilt=-5, cards=[(-12, 4, 'wheat'), (24, 22, 'sage'), (60, 6, 'peach')],
        arm_l=dict(ang=-119, bow=-8, len=188), arm_r=dict(ang=68, bow=6, len=124), legs=dict(l=4, r=-3),
        eyes=dict(l=(356, 388, 23, 0.13, 0.06, -3), r=(448, 384, 22, 0.13, 0.06, 3)),
        lids='bright', mouth=('open', 402, 436), marks='wave', look=(1.5, -1),
    ),
    'shy': dict(
        head_tilt=5, cards=[(14, -58, 'wheat'), (17, -54, 'sage'), (20, -58, 'peach')],
        arm_l=dict(ang=99, bow=4, len=118), arm_r=dict(ang=81, bow=-4, len=118),
        eyes=dict(l=(356, 394, 21, 0.0, 0.24, 0), r=(448, 390, 20, 0.0, 0.24, 0)),
        lids='shy', mouth=('line', 402, 440), marks='shy', look=(-5, 3),
    ),
    'moved': dict(
        head_tilt=-3, cards=[(-26, 22, 'wheat'), (22, 40, 'sage'), (68, 22, 'peach')],
        arm_l=dict(ang=-146, bow=-6, len=160), arm_r=dict(ang=-34, bow=6, len=160),
        eyes='closed', lids=None, mouth=('open-small', 402, 432), marks='moved', look=(0, 0),
    ),
}


def lid_marks(kind, eyes):
    """Short pencil strokes over the eyes: where the feeling is."""
    if not kind:
        return ''
    segs = []
    (lx, ly, lr, *_), (rx_, ry_, rr, *_) = eyes['l'], eyes['r']
    if kind == 'calm':     # a lash line along each eye's lidded top, flicking outward: a gentle, listening look
        segs = [[(lx + lr * 0.8, ly - lr * 0.86), (lx, ly - lr * 0.92), (lx - lr * 0.9, ly - lr * 0.8), (lx - lr * 1.25, ly - lr * 0.98)],
                [(rx_ - rr * 0.8, ry_ - rr * 0.86), (rx_, ry_ - rr * 0.92), (rx_ + rr * 0.9, ry_ - rr * 0.8), (rx_ + rr * 1.25, ry_ - rr * 0.98)]]
    if kind == 'bright':   # lifted, a little apart: curious and glad
        segs = [[(lx - 14, ly - lr - 14), (lx, ly - lr - 19), (lx + 12, ly - lr - 15)],
                [(rx_ - 12, ry_ - rr - 15), (rx_, ry_ - rr - 19), (rx_ + 14, ry_ - rr - 14)]]
    if kind == 'shy':      # tipped up in the middle: unsure
        segs = [[(lx - 14, ly - lr - 8), (lx + 2, ly - lr - 12), (lx + 14, ly - lr - 17)],
                [(rx_ - 14, ry_ - rr - 17), (rx_ - 2, ry_ - rr - 12), (rx_ + 14, ry_ - rr - 8)]]
    return pencil_marks(segs, PAL['lid'], width=4.2, seed=33, opacity=0.85)


def build(pfx, pose='main'):
    P = POSES[pose]
    defs, out = [], []

    # ground shadow (an effect, not a part)
    gp = ellipse_pts(400, GROUND - 2, 150, 14, 30)
    gs = hatch(gp, 60, -0.15, 0.15, (24, 50), (5, 8), lambda x, y: max(0, 1 - abs(x - 400) / 160), 6, bend=2)
    out.append(f'<g id="{pfx}ground"><!-- an effect: shrinks as it hops --><g filter="url(#bc-tooth2)" opacity="0.3">{paths(gs, PAL["shadow_ground"])}</g></g>')

    # legs + feet
    for side, hx, toe in (('l', 366, -1), ('r', 434, 1)):
        leg = tear(spline([(hx - 22, 616), (hx + 22, 616), (hx + 18, 700), (hx + 1, 711), (hx - 17, 701)], 5), 30 + toe, jag=0.8, wander=2)
        dl, sl = piece(pfx, f'leg-{side}', leg, seed=40 + toe, density=1.8, mix_amt=0.4, base='body_shade', shade='body_deep')
        fx, fy = hx + toe * 10, GROUND - 16
        fk = [(fx + toe * 44, fy + 14), (fx + toe * 42, fy - 1), (fx + toe * 28, fy - 13), (fx, fy - 17), (fx - toe * 26, fy - 12),
              (fx - toe * 36, fy + 2), (fx - toe * 33, fy + 15), (fx, fy + 16)]
        if toe < 0:
            fk = fk[::-1]
        foot = tear(spline(fk, 4), 60 + toe, jag=0.8, wander=2)
        df, sf = piece(pfx, f'foot-{side}', foot, seed=70 + toe, density=1.6, mix_amt=0.5, base='body_shade', shade='body_deep')
        defs += [dl, df]
        lt = P.get('legs', {}).get(side, 0)
        tr = f' transform="rotate({lt} {hx} 618)"' if lt else ''
        out.append(f"""<g id="{pfx}leg-{side}"{tr}><!-- pivot: {hx},618 (hip, hidden under the body; step = rotate ±12) -->
{sl}
<g id="{pfx}foot-{side}"><!-- pivot: {fx},{GROUND} (sole; tilts to plant flat) -->{sf}</g>
</g>""")

    # body
    bp = tear(spline(BODY_KEYS, 6), 21, jag=1.2, wander=4)
    db, sb = piece(pfx, 'body', bp, seed=22, density=1.1)
    defs.append(db)
    pk = tear(spline([(408, 540), (436, 536), (464, 540), (463, 572), (452, 587), (436, 590), (419, 587), (409, 573)], 4), 501, jag=0.6, wander=1.5)
    dpk, spk = piece(pfx, 'pocket', pk, base='mitt', shade='mitt_shade', deep='mitt_deep', mix=None, hi='paper', seed=502,
                     density=2.0, rim='bc-thin')
    stitch = pencil_line(spline([(414, 549), (436, 546), (458, 549)], 3, closed=False), 503, passes=1, spread=0.3)
    tip = tear(poly([(421, 543), (419, 520), (447, 513), (452, 541)], 3), 504, jag=0.25, wander=0.6)
    defs += [dpk]
    pocket = (f'<g id="{pfx}pocket"><!-- rides with the body: a paper pocket on the chest, a card\'s corner peeking out (the front) -->'
              f'<g filter="url(#bc-thin)"><path d="{d_of(tip)}" {fill("paper")}/><path d="{d_of(tip)}" fill="{CARDS["wheat"][0]}" filter="url(#bc-tooth1)"/>'
              f'<path d="M424,529 L446,524" stroke="{PAL["graphite"]}" stroke-width="1.4" opacity="0.5" filter="url(#bc-graphite)"/></g>'
              f'{spk}<g style="stroke:{PAL["mitt_deep"]}" stroke-width="1.8" stroke-dasharray="4 4" fill="none" filter="url(#bc-graphite)">'
              + ''.join(f'<path d="{d}"/>' for d in stitch) + '</g></g>')
    out.append(f'<g id="{pfx}body"><!-- pivot: 400,{GROUND - 30} (squash and stretch from the feet; breathe = scaleY 1 to 1.02) -->{sb}{pocket}</g>')

    ar, al = P['arm_r'], P['arm_l']
    da, sa, E_r, W_r = arm(pfx, 'r', SHOULDER_R, ar['ang'], L=ar.get('len', 124), flip=False, seed=110, bow=ar.get('bow', 0))
    dl_, sl_, E_l, W_l = arm(pfx, 'l', SHOULDER_L, al['ang'], L=al.get('len', 124), flip=True, seed=150, bow=al.get('bow', 0))
    defs += [da, dl_]

    # head with the cards behind it and the face on it
    hp = tear(superellipse(401, 381, 151, 118, n=2.2, k=96, bottom_wide=0.05), 11, jag=1.3, wander=4)
    dh, sh = piece(pfx, 'head', hp, base='head', shade='head_shade', deep='head_deep', mix='head_mix',
                   seed=12, density=0.95, light=(-0.5, -0.86))
    defs.append(dh)
    cards = []
    for i, (ang, lift, fam) in enumerate(P['cards']):
        dc, sc = card(pfx, i + 1, FAN_PIVOT, ang, fam, w=74, h=128, gap=40, lift=lift, seed=300 + i * 17,
                      wave_doodle=(fam == 'sage'))
        defs.append(dc)
        cards.append(sc)

    face = []
    if P['eyes'] == 'closed':
        face.append(f'<g id="{pfx}eye-l"><!-- pivot: 356,388 -->{slit(356, 392, 42, up=True, tilt=-4)}</g>')
        face.append(f'<g id="{pfx}eye-r"><!-- pivot: 448,384 -->{slit(448, 388, 40, up=True, tilt=4)}</g>')
    else:
        for sd in ('l', 'r'):
            x, y, rad, lower, upper, tilt = P['eyes'][sd]
            face.append(f'<g id="{pfx}eye-{sd}"><!-- pivot: {x},{y} (blink = scaleY 1 to 0.1 here; look = translate ±4) -->{hole(x, y, rad, lower=lower, upper=upper, tilt=tilt, look=P["look"], sx=0.86)}</g>')
        face.append(f'<g id="{pfx}lids"><!-- pivot: 400,360 (raise/tilt with the feeling) -->{lid_marks(P["lids"], P["eyes"])}</g>')
    mk, mx_, my_ = P['mouth']
    if mk == 'open':
        m = mouth(mx_, my_, 30, 18, tilt=-3)
    elif mk == 'open-small':
        m = mouth(mx_, my_, 20, 13, tilt=0)
    else:
        m = mouth_line(mx_, my_, 20, 5)
    face.append(f'<g id="{pfx}mouth"><!-- pivot: {mx_},{my_} (talk = scaleY 0.4 to 1.2) -->{m}</g>')
    if P['marks'] in ('shy', 'moved'):
        face.append(f'<g id="{pfx}cheeks"><!-- pivot: 400,420 (fade in) -->'
                    + pencil_marks([[(306 + k * 9, 428), (300 + k * 9, 441)] for k in range(3)]
                                   + [[(480 + k * 9, 424), (474 + k * 9, 437)] for k in range(3)],
                                   PAL['head_deep'], width=3.2, seed=80, opacity=0.8) + '</g>')

    tilt = P['head_tilt']
    out.append(f"""<g id="{pfx}head" transform="rotate({tilt} {NECK[0]} {NECK[1]})"><!-- pivot: {NECK[0]},{NECK[1]} (where the head sits on the body; nod/tilt ±8) -->
<g id="{pfx}cards"><!-- pivot: {FAN_PIVOT[0]},{FAN_PIVOT[1]} (the fan; rides with the head) -->
{''.join(cards)}
</g>
<g id="{pfx}head-paper">{sh}</g>
<g id="{pfx}face"><!-- pivot: 400,400 (the whole face slides ±6 to look around) -->
{''.join(face)}
</g>
</g>""")

    # arms: the right one under the head, the left (waving) one over everything
    out.insert(len(out) - 1, sa)
    out.append(sl_)

    if P['marks'] == 'wave':
        cxw, cyw = W_l[0] - 6, W_l[1] - 30
        segs = [[(cxw - 54, cyw - 22), (cxw - 61, cyw + 2), (cxw - 55, cyw + 24)],
                [(cxw - 72, cyw - 32), (cxw - 81, cyw + 2), (cxw - 73, cyw + 34)]]
        out.append(f'<g id="{pfx}wave-marks"><!-- an effect: fades in while the hand waves -->{pencil_marks(segs, PAL["mark"], width=4, seed=90)}</g>')
    if P['marks'] == 'moved':
        segs = []
        for ang in (-38, -14, 10, 34, 58, 82):
            a = math.radians(ang - 90)
            r0, r1 = 222, 248
            segs.append([(FAN_PIVOT[0] + math.cos(a) * r0, FAN_PIVOT[1] + math.sin(a) * r0),
                         (FAN_PIVOT[0] + math.cos(a) * r1, FAN_PIVOT[1] + math.sin(a) * r1)])
        out.append(f'<g id="{pfx}sparks" transform="rotate({tilt} {NECK[0]} {NECK[1]})"><!-- an effect: pops out as the fan opens -->{pencil_marks(segs, PAL["mark"], width=4, seed=95)}</g>')

    return '\n'.join(defs), '\n'.join(out)


def character_svg(pose='main'):
    d, s = build('bc-', pose)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<!-- 片片 Flick (B x C: pencil on cut paper). Every part is its own named group; pivots are in the comments. -->
<defs>{filters()}
{d}
</defs>
<g id="bc-flick">
{s}
</g>
</svg>'''


if __name__ == '__main__':
    pose = sys.argv[1] if len(sys.argv) > 1 else 'main'
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'character.svg')
    open(out, 'w').write(character_svg(pose))
    print('wrote', out)
