#!/usr/bin/env python3
"""Three quick silhouette drafts for B×C (pencil on cut paper). Silhouette + a stroke or two of face."""
import math, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'explore.svg')
INK = '#2b2622'
PAPER = '#f8f2ea'
FONT = "font-family=\"'PingFang TC','Noto Sans TC',sans-serif\""

def rr(x, y, w, h, r, rot=0, cx=None, cy=None, fill=INK, extra=''):
    t = f' transform="rotate({rot} {cx} {cy})"' if rot else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{t}{extra}/>'

def arm(sx, sy, ang, L=78, w=20, hand=17, fill=INK):
    a = math.radians(ang)
    ex, ey = sx + L * math.cos(a), sy + L * math.sin(a)
    deg = ang
    s = f'<g transform="rotate({deg} {sx} {sy})"><rect x="{sx-6}" y="{sy-w/2}" width="{L+6}" height="{w}" rx="7" fill="{fill}"/></g>'
    s += f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{hand}" fill="{fill}"/>'
    return s

def legs(cx, y, fill=INK):
    s = ''
    for dx in (-26, 26):
        s += f'<rect x="{cx+dx-11}" y="{y}" width="22" height="30" rx="5" fill="{fill}"/>'
        s += f'<path d="M{cx+dx-21},{y+40} q0,-14 18,-14 q20,0 22,14 z" fill="{fill}"/>'
    return s

def face(cx, cy, k='open'):
    s = f'<circle cx="{cx-22}" cy="{cy}" r="7" fill="{PAPER}"/><circle cx="{cx+22}" cy="{cy}" r="7" fill="{PAPER}"/>'
    s += f'<path d="M{cx-6},{cy+17} q6,7 12,0" stroke="{PAPER}" stroke-width="3" fill="none" stroke-linecap="round"/>'
    return s

def body(cx, top):
    return f'<path d="M{cx-48},{top} Q{cx},{top-8} {cx+48},{top} Q{cx+72},{top+50} {cx+56},{top+92} L{cx-56},{top+92} Q{cx-72},{top+50} {cx-48},{top} z" fill="{INK}"/>'

# ---- draft 1: a hand of story cards tucked behind the head, fanned to one side
def d1(cx, base, wave):
    s = ''
    # cards (behind head), pivot at head centre-top
    px, py = cx + 10, base - 190
    angs = [4, 14, 24] if not wave else [-6, 20, 46]
    for i, a in enumerate(angs):
        s += f'<g transform="rotate({a} {px} {py})">' + rr(px - 28, py - 118, 56, 88, 7, extra=' stroke="#f8f2ea" stroke-width="3"') + '</g>'
    s += body(cx, base - 132)
    s += legs(cx, base - 44)
    if wave:
        s += arm(cx - 50, base - 118, -116, L=165) + arm(cx + 50, base - 116, 70, L=62)
    else:
        s += arm(cx - 50, base - 120, 110, L=62) + arm(cx + 50, base - 120, 70, L=62)
    s += rr(cx - 88, base - 255, 176, 138, 50)
    s += face(cx, base - 190)
    return s

# ---- draft 2: the head is an envelope; its flap flips up open
def d2(cx, base, wave):
    s = ''
    if wave:
        s += f'<path d="M{cx-86},{base-240} L{cx},{base-330} L{cx+86},{base-240} z" fill="{INK}"/>'
    s += body(cx, base - 132)
    s += legs(cx, base - 44)
    if wave:
        s += arm(cx - 50, base - 118, -116, L=165) + arm(cx + 50, base - 116, 70, L=62)
    else:
        s += arm(cx - 50, base - 120, 110, L=62) + arm(cx + 50, base - 120, 70, L=62)
    s += rr(cx - 88, base - 250, 176, 132, 22)
    if not wave:
        s += f'<path d="M{cx-86},{base-246} L{cx},{base-196} L{cx+86},{base-246}" stroke="{PAPER}" stroke-width="3" fill="none"/>'
    s += face(cx, base - 180)
    return s

# ---- draft 3: a quilled paper coil on the head that unrolls into a wave
def d3(cx, base, wave):
    s = ''
    if wave:
        s += f'<path d="M{cx+10},{base-238} C{cx+20},{base-300} {cx+70},{base-300} {cx+60},{base-262} C{cx+52},{base-232} {cx+100},{base-236} {cx+108},{base-282}" stroke="{INK}" stroke-width="20" fill="none" stroke-linecap="round"/>'
    else:
        s += f'<circle cx="{cx+30}" cy="{base-252}" r="34" fill="{INK}"/>'
        s += f'<path d="M{cx+30},{base-252} m-4,0 a6,6 0 1 1 8,4 a12,12 0 1 1 -16,-10 a20,20 0 1 1 22,22" stroke="{PAPER}" stroke-width="2.5" fill="none"/>'
    s += body(cx, base - 132)
    s += legs(cx, base - 44)
    if wave:
        s += arm(cx - 50, base - 118, -116, L=165) + arm(cx + 50, base - 116, 70, L=62)
    else:
        s += arm(cx - 50, base - 120, 110, L=62) + arm(cx + 50, base - 120, 70, L=62)
    s += f'<ellipse cx="{cx}" cy="{base-190}" rx="90" ry="70" fill="{INK}"/>'
    s += face(cx, base - 188)
    return s

W, H = 1500, 640
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
         f'<rect width="{W}" height="{H}" fill="{PAPER}"/>']
labels = [('1 卡扇：腦後插著幾張故事卡，聽故事時扇開', d1), ('2 信封蓋：頭是信封，蓋子會翻起', d2), ('3 衍紙捲：頭上一捲紙，打開成一道浪', d3)]
for i, (lab, fn) in enumerate(labels):
    ox = 60 + i * 490
    parts.append(f'<text x="{ox}" y="50" font-size="22" fill="{INK}" {FONT}>{lab}</text>')
    parts.append(fn(ox + 120, 560, False))
    parts.append(fn(ox + 330, 560, True))
    parts.append(f'<text x="{ox+90}" y="610" font-size="16" fill="#7a6e64" {FONT}>平常</text><text x="{ox+290}" y="610" font-size="16" fill="#7a6e64" {FONT}>聽到故事＋舉手</text>')
parts.append('</svg>')
open(OUT, 'w').write('\n'.join(parts))
print('wrote', OUT)
