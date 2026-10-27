#!/usr/bin/env python3
"""片片 Flick (round 2, revision 2): a little creature cut from pencil-coloured paper. Three story cards
are pinned behind its head by one brass brad and fan open about it when it hears a story.

Revision 2 (after both critics):
- the fan: three square-cornered cards on one visible brad, fanned 72 deg (main) / 104 deg (moved),
  a narrow colour band (17 % of the card) and straight pencil lines of writing; closing = rotating the
  three cards behind the head about the same brad (no sliding).
- the face: small round punched holes, matte, no glint: the top wall in shadow, the bottom wall catching
  light (the paper's cream core), a ragged fibrous rim; at rest the mouth is a pencil arc.
- the chest: no pocket. A slit cut in the body's paper with a story card tucked into it.
- the arms: a paper sleeve pinned to the shoulder by the brad; the forearm strip slides out from under
  it. Every arm part is drawn once in the arm's own frame (brad at 0,0, arm along +x); a pose only
  rotates the arm and translates the forearm. Both arms sit in front of the head.
- the body's lavender moved toward violet (hue 300-305), the mist-blue second pencil replaced.

build(prefix, pose) returns (defs, svg) for one instance. Every id starts with "bc-".
Run: python3 -I gen/flick.py [pose] [out.svg]  -> character.svg (main pose, 800x800, transparent)
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
    'head': 'oklch(85% 0.034 304)',          # lavender pencil on the head's paper (violet side, not periwinkle)
    'head_shade': 'oklch(72% 0.05 302)',
    'head_deep': 'oklch(59% 0.058 300)',
    'head_mix': 'oklch(76% 0.03 335)',       # a grey-mauve second pencil worked into the shadows
    'body': 'oklch(75% 0.045 303)',          # the body's paper: the same family, a shade deeper
    'body_shade': 'oklch(64% 0.055 301)',
    'body_deep': 'oklch(51% 0.058 298)',
    'body_mix': 'oklch(68% 0.035 335)',
    'body_hi': 'oklch(97% 0.012 85)',
    'mitt': 'oklch(95.5% 0.022 88)',         # cream mitten
    'mitt_shade': 'oklch(86% 0.035 78)',
    'mitt_deep': 'oklch(76% 0.04 70)',
    'ink': 'oklch(31% 0.03 300)',            # what shows through the punched holes: matte, flat
    'ink_deep': 'oklch(16% 0.02 300)',       # under the hole's top wall (the paper's thickness in shadow)
    'ink_lip': 'oklch(91% 0.02 300)',        # the hole's bottom wall: the cut shows the paper's pale core
    'tongue': 'oklch(64% 0.1 32)',
    'graphite': 'oklch(36% 0.02 60)',
    'lid': 'oklch(38% 0.04 300)',
    'brass': 'oklch(76% 0.085 82)',
    'brass_dark': 'oklch(58% 0.08 70)',
    'brass_hi': 'oklch(93% 0.05 92)',
    'mark': 'oklch(58% 0.06 300)',           # wave marks, sparks: mid-tone, holds on cream and on night paper
    'shadow_ground': 'oklch(42% 0.03 300)',
}
CARDS = {  # (card wash, band, shade) per card family — the app's card colours
    'wheat': ('oklch(94% 0.035 88)', 'oklch(84% 0.08 84)', 'oklch(78% 0.08 80)'),
    'sage': ('oklch(93% 0.03 140)', 'oklch(80% 0.065 142)', 'oklch(72% 0.06 145)'),
    'peach': ('oklch(94% 0.028 55)', 'oklch(83% 0.07 48)', 'oklch(77% 0.07 42)'),
    'mist': ('oklch(93.5% 0.02 215)', 'oklch(81% 0.045 215)', 'oklch(74% 0.05 220)'),
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
          hi_amt=0.5, extra=''):
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
    # the lifted-out highlights: half as many as before, so the soft gradient shows between them
    hh = hatch(pts, int(n * 0.18 * hi_amt), ang - 0.1, 0.3, L, (sw * 0.6, sw * 0.9), w_hi, seed + 4, bend=sw * 0.5)

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

def brad(x, y, r=8.5, cls='bc-brad'):
    """A brass paper fastener: the joint the part turns on."""
    return f'''<g class="{cls}">
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


# ---------------------------------------------------------------- the arm rig
# Every arm part lives in the arm's own frame: the shoulder brad at (0, 0), the arm along +x.
# A pose is three numbers: the arm's angle about the brad, how far the forearm has slid out from under
# the sleeve (0 at rest, SLIDE when raised: translate only, never scaled), and the hand's turn at the wrist.
SLEEVE = 50          # the sleeve's open end, measured from the brad
REACH = 124          # brad to wrist at rest
SLIDE = 64           # how far the forearm slides out: brad to wrist 188 when raised
STRIP_W = 40


def arm_local(pfx, side, seed, flip):
    """The three pieces of one arm in its own frame (drawn once; poses never redraw them)."""
    light = (-0.35, 0.94)  # in the arm's frame: lights the edge that faces the body when it hangs down
    # forearm: its near end tucked well under the sleeve even fully slid out (near end -22 at rest, +42 out)
    st = strip((-2, 0), (REACH, 0), STRIP_W, ext=20, seed=seed, w_end=34)
    mp = mitt_pts(REACH - 4, 0, 0, flip=flip, seed=seed + 2)
    # sleeve: a short cuff of the body's paper, rounded behind the brad, cut square at its open end
    r = R(seed + 7)
    hw = 24
    keys = []
    for k in range(9):
        t = math.pi / 2 + math.pi * k / 8
        keys.append((math.cos(t) * 24, math.sin(t) * hw))
    keys += [(SLEEVE * 0.5, -hw - 0.6), (SLEEVE - 2, -hw - 2.2), (SLEEVE + 1, -hw * 0.3),
             (SLEEVE + 1.5, hw * 0.3), (SLEEVE - 2, hw + 2.2), (SLEEVE * 0.5, hw + 0.6)]
    keys = [(x + r.uniform(-0.6, 0.6), y + r.uniform(-0.6, 0.6)) for x, y in keys]
    # keys run counter-clockwise on screen from the back cap; reverse for the clockwise outline piece() expects
    sl = tear(poly(keys[::-1], 4), seed + 8, jag=0.8, wander=2.0)
    d1, s1 = piece(pfx, f'forearm-{side}', st, seed=seed + 3, density=1.4, mix_amt=0.5, ang=-0.2, light=light,
                   base='body_shade', shade='body_deep', rim='bc-paper-l')
    d3, s3 = piece(pfx, f'mitt-{side}', mp, base='mitt', shade='mitt_shade', deep='mitt_deep', mix=None, hi='paper',
                   seed=seed + 5, density=1.5, rim='bc-thin-l', light=(-0.6, 0.8 if not flip else -0.8))
    d2, s2 = piece(pfx, f'sleeve-{side}', sl, seed=seed + 9, density=1.6, mix_amt=0.5, ang=-0.2, light=light,
                   rim='bc-paper-l')
    # the sleeve's open end: a pencil line where the forearm goes in, shaded just inside the cuff
    cuff = pencil_line([(SLEEVE - 3, -hw + 3), (SLEEVE - 1.5, 0), (SLEEVE - 3, hw - 3)], seed + 11, passes=2, spread=0.5)
    cuff_svg = (f'<g style="stroke:{col("body_deep")}" stroke-width="2.2" stroke-opacity="0.7" fill="none" stroke-linecap="round" '
                f'filter="url(#bc-graphite)">' + ''.join(f'<path d="{d}"/>' for d in cuff) + '</g>')
    return d1 + d2 + d3, s1, s2 + cuff_svg, s3


def arm(pfx, side, S, ang, slide=0.0, wave=0.0, flip=False, seed=110):
    """One arm placed by a pose: rotate about the brad, slide the forearm, turn the hand."""
    defs, forearm, sleeve, mitt = arm_local(pfx, side, seed, flip)
    wx = REACH
    svg = f'''<g id="{pfx}arm-{side}-lift" filter="url(#bc-lift)">
<g id="{pfx}arm-{side}" transform="translate({S[0]} {S[1]}) rotate({ang})"><!-- pivot: {S[0]},{S[1]} (shoulder brad; the whole arm turns here, now {ang} deg). Parts are drawn in the arm's frame: brad at 0,0, arm along +x -->
  <g id="{pfx}forearm-{side}" transform="translate({slide} 0)"><!-- slides out from under the sleeve along the arm: translate x 0 (rest, wrist 124 from the brad) to {SLIDE} (raised, wrist 188); never scaled -->
    {forearm}
    <g id="{pfx}hand-{side}" transform="rotate({wave} {wx} 0)"><!-- pivot: wrist, {wx},0 in the arm's frame (wave = rotate ±18 here) -->{mitt}</g>
  </g>
  <g id="{pfx}sleeve-{side}"><!-- fixed to the brad: the forearm slides in and out under it -->{sleeve}</g>
  {brad(0, 0)}
</g>
</g>'''
    # world position of the wrist, for effects
    a = math.radians(ang)
    W = (S[0] + (wx + slide) * math.cos(a), S[1] + (wx + slide) * math.sin(a))
    return defs, svg, W


def hole(pfx, name, cx, cy, r, upper=0.0, tilt=0.0):
    """A punched hole, matte and flat: the dark behind the paper shows through. The paper's thickness
    shows as a ring: the top wall in shadow, the bottom wall catching light (the cut shows the paper's
    pale core, as the torn edges do), the rim a little ragged and fibrous. upper > 0: a half-moon punch."""
    k = 0.5523
    top = -r * (1 - upper)

    def shape(dy=0.0):
        t = top
        b = r
        return (f'M{-r:.2f},{dy:.2f} C{-r:.2f},{t * k + dy:.2f} {-r * k:.2f},{t + dy:.2f} 0,{t + dy:.2f} '
                f'C{r * k:.2f},{t + dy:.2f} {r:.2f},{t * k + dy:.2f} {r:.2f},{dy:.2f} '
                f'C{r:.2f},{b * k + dy:.2f} {r * k:.2f},{b + dy:.2f} 0,{b + dy:.2f} '
                f'C{-r * k:.2f},{b + dy:.2f} {-r:.2f},{b * k + dy:.2f} {-r:.2f},{dy:.2f}Z')
    cid = f'{pfx}clip-{name}'
    wall = r * 0.34            # top wall: how far the shadow reaches down
    lip = r * 0.15             # bottom wall: a thin light crescent
    rr = R(int(cx * 7 + cy))
    fib = []
    for i in range(7):          # a few torn fibres standing on the rim along the lit lower edge
        a = math.radians(rr.uniform(20, 160))
        x0, y0 = math.cos(a) * r * 0.98, math.sin(a) * (r if math.sin(a) > 0 else -top) * 0.98
        ln = rr.uniform(1.2, 2.4)
        x1, y1 = x0 - math.cos(a) * ln, y0 - math.sin(a) * ln
        fib.append(f'M{x0:.2f},{y0:.2f}L{x1:.2f},{y1:.2f}')
    defs = f'<clipPath id="{cid}"><path d="{shape()}"/></clipPath>'
    svg = f'''<g transform="translate({cx:.1f},{cy:.1f}) rotate({tilt})">
  <path d="{shape()}" fill="none" style="stroke:{col('head_deep')}" stroke-width="2.4" stroke-opacity="0.35" filter="url(#bc-punch)"/>
  <g filter="url(#bc-punch)">
    <path d="{shape()}" {fill('ink')}/>
    <g clip-path="url(#{cid})">
      <path d="{shape()} {shape(wall)}" fill="{PAL['ink_deep']}" fill-rule="evenodd" opacity="0.85"/>
      <path d="{shape()} {shape(-lip)}" fill="{PAL['ink_lip']}" fill-rule="evenodd" opacity="0.9"/>
    </g>
  </g>
  <path d="{' '.join(fib)}" fill="none" stroke="{PAL['ink_lip']}" stroke-width="0.8" stroke-linecap="round" opacity="0.7"/>
</g>'''
    return defs, svg


def slit(cx, cy, w, up=True, tilt=0.0, thick=5.5):
    """A closed eye: a thin crescent cut, arching up (happy) or down (calm)."""
    s = -1 if up else 1
    h = w * 0.36 * s
    d = (f'M{-w / 2:.1f},0 C{-w / 4:.1f},{h:.1f} {w / 4:.1f},{h:.1f} {w / 2:.1f},0 '
         f'C{w / 4:.1f},{h - s * -thick:.1f} {-w / 4:.1f},{h - s * -thick:.1f} {-w / 2:.1f},0Z')
    return f'''<g transform="translate({cx:.1f},{cy:.1f}) rotate({tilt})" filter="url(#bc-punch)"><path d="{d}" {fill('ink')}/></g>'''


def mouth(cx, cy, w=26, h=15, tilt=0.0):
    """A small open mouth punched out (kept for the excited faces only): flat top, round bottom, no tongue."""
    d = (f'M{-w / 2:.1f},{-h * 0.15:.1f} C{-w * 0.2:.1f},{-h * 0.32:.1f} {w * 0.2:.1f},{-h * 0.32:.1f} {w / 2:.1f},{-h * 0.15:.1f} '
         f'C{w * 0.46:.1f},{h * 0.55:.1f} {w * 0.2:.1f},{h * 0.85:.1f} 0,{h * 0.85:.1f} '
         f'C{-w * 0.2:.1f},{h * 0.85:.1f} {-w * 0.46:.1f},{h * 0.55:.1f} {-w / 2:.1f},{-h * 0.15:.1f}Z')
    return f'''<g transform="translate({cx:.1f},{cy:.1f}) rotate({tilt})" filter="url(#bc-punch)"><path d="{d}" {fill('ink')}/></g>'''


def mouth_line(cx, cy, w=22, curve=6, tilt=0.0, seed=41, width=3.4):
    """The resting mouth: one soft pencil arc."""
    pts = [(cx - w / 2, cy - curve * 0.15), (cx - w / 4, cy + curve * 0.85), (cx + w / 4, cy + curve * 0.85), (cx + w / 2, cy - curve * 0.15)]
    ds = pencil_line(spline(pts, 3, closed=False), seed, passes=3, spread=0.55)
    return (f'<g transform="rotate({tilt} {cx} {cy})" style="stroke:{col("ink")}" stroke-width="{width}" fill="none" stroke-linecap="round" filter="url(#bc-graphite)">'
            + ''.join(f'<path d="{d}"/>' for d in ds) + '</g>')


def pencil_marks(segs, color, width=3.0, seed=50, opacity=0.9):
    out = []
    for i, pts in enumerate(segs):
        out += pencil_line(spline(pts, 3, closed=False), seed + i, passes=2, spread=0.7)
    return (f'<g style="stroke:{color}" stroke-width="{width}" fill="none" stroke-linecap="round" opacity="{opacity}" filter="url(#bc-graphite)">'
            + ''.join(f'<path d="{d}"/>' for d in out) + '</g>')


# ---------------------------------------------------------------- cards

def card_face(pfx, cid_name, family, w, h, below, seed, band=0.17, lines=True, shade_amt=1.0):
    """A story card drawn upright in its own frame, the brad hole at (0, 0) near its bottom edge:
    square corners, the family's colour washed over it, a narrow band of deeper colour along the top
    (17 % of the card) and straight pencil lines of writing under it. Returns (defs, svg, outline)."""
    wash, bandc, shade = CARDS[family]
    x0, x1 = -w / 2, w / 2
    yb, yt = below, below - h
    c = 3.5
    keys = [(x0 + c, yt), (x1 - c, yt), (x1, yt + c), (x1, yb - c), (x1 - c, yb), (x0 + c, yb), (x0, yb - c), (x0, yt + c)]
    r = R(seed)
    keys = [(x + r.uniform(-0.8, 0.8), y + r.uniform(-0.8, 0.8)) for x, y in keys]
    pts = tear(poly(keys, 4), seed, jag=0.35, wander=0.9)
    d = d_of(pts)
    cid = f'{pfx}clip-{cid_name}'
    hb = yt + h * band
    bandpoly = [(x0 - 4, yt - 4), (x1 + 4, yt - 4), (x1 + 4, hb + 0.8), (x0 * 0.2, hb - 0.8), (x0 - 4, hb + 0.6)]
    st2 = hatch(pts, int(26 * shade_amt), -0.55, 0.25, (10, 20), (3.0, 4.2),
                lambda x, y: max(0, 1 - edge_dist(pts, x, y) / 9) * 0.7, seed + 2, bend=2)
    stb = hatch(bandpoly, 16, -0.6, 0.25, (10, 18), (3.0, 4.0), lambda x, y: 0.8 if yt < y < hb else 0, seed + 3, bend=2)
    rows = []
    if lines:
        yy = hb + 15
        k = 0
        while yy < yb - 12:
            L = (w - 22) * (0.55 if k % 4 == 3 else r.uniform(0.82, 0.97))
            xs = x0 + 11
            seg = [(xs + L * t / 5, yy + r.uniform(-0.5, 0.5)) for t in range(6)]
            rows += pencil_line(seg, seed + 20 + k, passes=1, spread=0.35)
            yy += 13
            k += 1
    rows_svg = (f'<g style="stroke:{PAL["graphite"]}" stroke-width="1.7" fill="none" stroke-linecap="round" opacity="0.5" '
                f'filter="url(#bc-graphite)">' + ''.join(f'<path d="{q}"/>' for q in rows) + '</g>')
    defs = f'<clipPath id="{cid}"><path d="{d}"/></clipPath>'
    svg = f'''<path d="{d}" {fill('paper')}/>
  <g clip-path="url(#{cid})">
    <path d="{d}" fill="{wash}" filter="url(#bc-tooth1)"/>
    <path d="{d_of(bandpoly)}" fill="{bandc}" filter="url(#bc-tooth1)"/>
    <g filter="url(#bc-tooth2)">{paths(stb, shade, 0.35)}{paths(st2, shade, 0.32)}</g>{rows_svg}
  </g>'''
    return defs, svg, pts


def card(pfx, idx, piv, ang, family, w=76, h=150, below=22, seed=70):
    """A story card pinned behind the head: all three share one brad (piv), as a hand of cards or a
    swatch fan; fanning, closing and tucking away are all rotations about it."""
    defs, face, _ = card_face(pfx, f'card-{idx}', family, w, h, below, seed)
    svg = f'''<g id="{pfx}card-{idx}" transform="translate({piv[0]} {piv[1]}) rotate({ang})"><!-- pivot: {piv[0]},{piv[1]} (the fan's brad; drawn upright in its own frame with the brad at 0,0: fan / close = rotate only) -->
<g filter="url(#bc-thin-l)">
  {face}
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
            y *= 1 - top_flat
        if y > 0:
            x *= 1 + bottom_wide * (y / ry)
        out.append((cx + x, cy + y))
    return out


BODY_KEYS = [(322, 490), (400, 482), (478, 490), (506, 524), (516, 584), (500, 632), (452, 654), (398, 658), (346, 654),
             (300, 632), (284, 584), (294, 524)]
FAN_PIVOT = (500, 306)
NECK = (400, 498)
SHOULDER_L, SHOULDER_R = (312, 506), (488, 506)
CARD_W = 58
FAN = [('wheat', 164), ('sage', 182), ('peach', 164)]   # family, card length (the middle card stands a little taller)
CLOSED = -116                                           # the closed fan: all three turned into the head, a corner left showing

POSES = {
    'main': dict(
        head_tilt=-5, fan=(-34, 10, 54),
        arm_l=dict(ang=-124, slide=SLIDE, wave=-6), arm_r=dict(ang=80, slide=0, wave=4), legs=dict(l=4, r=-3),
        eyes=dict(l=(358, 390, 17, 0.0, 0), r=(446, 386, 17, 0.0, 0)),
        lids='bright', mouth=('line', 402, 432), marks='wave',
    ),
    'shy': dict(
        head_tilt=5, fan=(CLOSED - 6, CLOSED, CLOSED + 6),
        arm_l=dict(ang=99, slide=0, wave=6), arm_r=dict(ang=81, slide=0, wave=-6),
        eyes=dict(l=(358, 396, 16, 0.22, 0), r=(446, 392, 16, 0.22, 0)),
        lids='shy', mouth=('line-small', 402, 438), marks='shy',
    ),
    'moved': dict(
        head_tilt=-3, fan=(-52, 0, 52),
        arm_l=dict(ang=-150, slide=36, wave=-10), arm_r=dict(ang=-30, slide=36, wave=10),
        eyes='closed', lids=None, mouth=('open-small', 402, 430), marks='moved',
    ),
    # rig test frames (checks/rig.png): the same parts, only rotated and slid
    'rig-down': dict(
        head_tilt=0, fan=(-34, 10, 54),
        arm_l=dict(ang=100, slide=0, wave=0), arm_r=dict(ang=80, slide=0, wave=0),
        eyes=dict(l=(358, 390, 17, 0.0, 0), r=(446, 386, 17, 0.0, 0)), lids='bright', mouth=('line', 402, 432), marks=None,
    ),
    'rig-up': dict(
        head_tilt=0, fan=(-34, 10, 54),
        arm_l=dict(ang=-120, slide=SLIDE, wave=0), arm_r=dict(ang=-60, slide=SLIDE, wave=0),
        eyes=dict(l=(358, 390, 17, 0.0, 0), r=(446, 386, 17, 0.0, 0)), lids='bright', mouth=('line', 402, 432), marks=None,
    ),
    'rig-wave-l': dict(
        head_tilt=-5, fan=(-34, 10, 54),
        arm_l=dict(ang=-124, slide=SLIDE, wave=-18), arm_r=dict(ang=80, slide=0, wave=0),
        eyes=dict(l=(358, 390, 17, 0.0, 0), r=(446, 386, 17, 0.0, 0)), lids='bright', mouth=('line', 402, 432), marks='wave',
    ),
    'rig-wave-r': dict(
        head_tilt=5, fan=(-34, 10, 54),
        arm_l=dict(ang=100, slide=0, wave=0), arm_r=dict(ang=-56, slide=SLIDE, wave=18),
        eyes=dict(l=(358, 390, 17, 0.0, 0), r=(446, 386, 17, 0.0, 0)), lids='bright', mouth=('line', 402, 432), marks='wave-r',
    ),
}


def lid_marks(kind, eyes):
    """Short pencil strokes over the eyes: where the feeling is."""
    if not kind:
        return ''
    segs = []
    (lx, ly, lr, *_), (rx_, ry_, rr, *_) = eyes['l'], eyes['r']
    if kind == 'bright':   # lifted, a little apart: curious and glad
        segs = [[(lx - 14, ly - lr - 14), (lx, ly - lr - 19), (lx + 12, ly - lr - 15)],
                [(rx_ - 12, ry_ - rr - 15), (rx_, ry_ - rr - 19), (rx_ + 14, ry_ - rr - 14)]]
    if kind == 'shy':      # tipped up in the middle: unsure
        segs = [[(lx - 14, ly - lr - 8), (lx + 2, ly - lr - 12), (lx + 14, ly - lr - 17)],
                [(rx_ - 14, ry_ - rr - 17), (rx_ - 2, ry_ - rr - 12), (rx_ + 14, ry_ - rr - 8)]]
    return pencil_marks(segs, PAL['lid'], width=4.2, seed=33, opacity=0.85)


def chest(pfx):
    """The front: a slit cut in the body's paper, a story card tucked into it (the fan's vocabulary,
    not a pocket). The card is drawn whole and clipped at the cut, so only what stands above the slit shows."""
    a, b = (408, 568), (472, 560)              # the cut, tilted a little, longer than the card is wide
    ang = -17
    cx, cy = 440, 559                           # the card's centre in the body's frame: most of it below the cut
    w, h = 44, 64
    defs, face, _ = card_face(pfx, 'chest-card', 'mist', w, h, h / 2, 611, band=0.2, shade_amt=0.6)
    cid = f'{pfx}clip-chest-slit'
    # everything above the cut line (extended well past the card)
    ux, uy = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(ux, uy)
    ux, uy = ux / ln, uy / ln
    nx, ny = uy, -ux                             # points up (away from the body below the cut)
    A0 = (a[0] - ux * 60, a[1] - uy * 60)
    B0 = (b[0] + ux * 60, b[1] + uy * 60)
    above = [A0, B0, (B0[0] + nx * 200, B0[1] + ny * 200), (A0[0] + nx * 200, A0[1] + ny * 200)]
    defs += f'<clipPath id="{cid}"><path d="{d_of(above)}"/></clipPath>'
    cut = pencil_line(spline([a, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1.2), b], 3, closed=False), 612, passes=2, spread=0.45)
    lip = [(a[0] + 2, a[1] + 3.4), ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 4.4), (b[0] - 2, b[1] + 3.4)]
    svg = f'''<g id="{pfx}chest"><!-- rides with the body: a slit cut in the paper with a story card tucked in (the front) -->
<g clip-path="url(#{cid})"><g filter="url(#bc-thin)">
  <g transform="translate({cx} {cy}) rotate({ang})">{face}</g>
</g></g>
<g style="stroke:{PAL['ink_deep']}" stroke-width="2.2" stroke-opacity="0.7" fill="none" stroke-linecap="round" filter="url(#bc-graphite)">{''.join(f'<path d="{q}"/>' for q in cut)}</g>
<path d="{smooth_d(lip)}" fill="none" stroke="{PAL['ink_lip']}" stroke-width="1.6" stroke-linecap="round" opacity="0.8" filter="url(#bc-graphite)"/>
</g>'''
    return defs, svg


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

    # body, with the slit and its card on the chest
    bp = tear(spline(BODY_KEYS, 6), 21, jag=1.2, wander=4)
    db, sb = piece(pfx, 'body', bp, seed=22, density=1.1)
    dch, sch = chest(pfx)
    defs += [db, dch]
    out.append(f'<g id="{pfx}body"><!-- pivot: 400,{GROUND - 30} (squash and stretch from the feet; breathe = scaleY 1 to 1.02) -->{sb}{sch}</g>')

    # head with the cards behind it and the face on it
    hp = tear(superellipse(401, 381, 151, 118, n=2.2, k=96, bottom_wide=0.05), 11, jag=1.3, wander=4)
    dh, sh = piece(pfx, 'head', hp, base='head', shade='head_shade', deep='head_deep', mix='head_mix',
                   seed=12, density=0.95, light=(-0.5, -0.86), mix_amt=0.7)
    defs.append(dh)
    cards = []
    for i, ((fam, ln), ang) in enumerate(zip(FAN, P['fan'])):
        dc, sc = card(pfx, i + 1, FAN_PIVOT, ang, fam, w=CARD_W, h=ln, below=22, seed=300 + i * 17)
        defs.append(dc)
        cards.append(sc)

    face = []
    if P['eyes'] == 'closed':
        face.append(f'<g id="{pfx}eye-l"><!-- pivot: 358,390 -->{slit(358, 394, 36, up=True, tilt=-4)}</g>')
        face.append(f'<g id="{pfx}eye-r"><!-- pivot: 446,386 -->{slit(446, 390, 34, up=True, tilt=4)}</g>')
    else:
        for sd in ('l', 'r'):
            x, y, rad, upper, tilt = P['eyes'][sd]
            de, se = hole(pfx, f'eye-{sd}', x, y, rad, upper=upper, tilt=tilt)
            defs.append(de)
            face.append(f'<g id="{pfx}eye-{sd}"><!-- pivot: {x},{y} (blink = scaleY 1 to 0.1 here; a punched hole has no pupil: look by sliding the face) -->{se}</g>')
        face.append(f'<g id="{pfx}lids"><!-- pivot: 402,360 (the brows: raise/tilt with the feeling) -->{lid_marks(P["lids"], P["eyes"])}</g>')
    mk, mx_, my_ = P['mouth']
    if mk == 'open-small':
        m = mouth(mx_, my_, 18, 12, tilt=0)
    elif mk == 'line-small':
        m = mouth_line(mx_, my_, 14, 3)
    else:
        m = mouth_line(mx_, my_, 24, 7)
    face.append(f'<g id="{pfx}mouth"><!-- pivot: {mx_},{my_} (a pencil arc at rest; swap for the small punched mouth when excited) -->{m}</g>')
    if P['marks'] in ('shy', 'moved'):
        face.append(f'<g id="{pfx}cheeks"><!-- pivot: 400,420 (fade in) -->'
                    + pencil_marks([[(306 + k * 9, 428), (300 + k * 9, 441)] for k in range(3)]
                                   + [[(480 + k * 9, 424), (474 + k * 9, 437)] for k in range(3)],
                                   PAL['head_deep'], width=3.2, seed=80, opacity=0.8) + '</g>')

    tilt = P['head_tilt']
    out.append(f"""<g id="{pfx}head" transform="rotate({tilt} {NECK[0]} {NECK[1]})"><!-- pivot: {NECK[0]},{NECK[1]} (where the head sits on the body; nod/tilt ±8) -->
<g id="{pfx}cards" filter="url(#bc-lift)"><!-- pivot: {FAN_PIVOT[0]},{FAN_PIVOT[1]} (the fan's brad; rides with the head) -->
{''.join(cards)}
</g>
<g id="{pfx}head-paper">{sh}</g>
<g id="{pfx}fan-brad"><!-- pivot: {FAN_PIVOT[0]},{FAN_PIVOT[1]} (the one brad the three cards turn on, through the head's paper) -->{brad(*FAN_PIVOT, r=8)}</g>
<g id="{pfx}face"><!-- pivot: 402,400 (the whole face slides ±6 to look around) -->
{''.join(face)}
</g>
</g>""")

    # arms: both in front of the head
    ar, al = P['arm_r'], P['arm_l']
    da, sa, W_r = arm(pfx, 'r', SHOULDER_R, ar['ang'], slide=ar.get('slide', 0), wave=ar.get('wave', 0), flip=False, seed=110)
    dl_, sl_, W_l = arm(pfx, 'l', SHOULDER_L, al['ang'], slide=al.get('slide', 0), wave=al.get('wave', 0), flip=True, seed=150)
    defs += [da, dl_]
    out.append(sa)
    out.append(sl_)

    if P['marks'] in ('wave', 'wave-r'):
        W = W_l if P['marks'] == 'wave' else W_r
        s = -1 if P['marks'] == 'wave' else 1
        cxw, cyw = W[0] + s * 6, W[1] - 30
        segs = [[(cxw + s * 54, cyw - 22), (cxw + s * 61, cyw + 2), (cxw + s * 55, cyw + 24)],
                [(cxw + s * 72, cyw - 32), (cxw + s * 81, cyw + 2), (cxw + s * 73, cyw + 34)]]
        out.append(f'<g id="{pfx}wave-marks"><!-- an effect: fades in while the hand waves -->{pencil_marks(segs, PAL["mark"], width=4, seed=90)}</g>')
    if P['marks'] == 'moved':
        segs = []
        for ang in (-62, -34, -6, 22, 50, 78):
            a = math.radians(ang - 90)
            r0, r1 = 182, 208
            segs.append([(FAN_PIVOT[0] + math.cos(a) * r0, FAN_PIVOT[1] + math.sin(a) * r0),
                         (FAN_PIVOT[0] + math.cos(a) * r1, FAN_PIVOT[1] + math.sin(a) * r1)])
        out.append(f'<g id="{pfx}sparks" transform="rotate({tilt} {NECK[0]} {NECK[1]})"><!-- an effect: pops out as the fan opens -->{pencil_marks(segs, PAL["mark"], width=4, seed=95)}</g>')

    return '\n'.join(defs), '\n'.join(out)


def character_svg(pose='main'):
    d, s = build('bc-', pose)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<!-- 片片 Flick (B x C: pencil on cut paper), revision 2. Every part is its own named group; pivots are in the comments.
     Arms and cards are drawn in their own frames and placed by rotate / translate only. -->
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
