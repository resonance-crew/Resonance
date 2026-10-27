# python3 measure.py names…: OKLab lightness of the printed lines, the writing and the eyes against the paper beside
# them, read off each variant's exported torso.png / eye-l.png (what ships), so "quieter than the face" is a number.
import json, math, sys
from PIL import Image
def L(rgb):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(x) for x in rgb[:3])
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    return 0.2104542553 * l ** (1/3) + 0.7936177850 * m ** (1/3) - 0.0040720342 * s ** (1/3)
sys.path.insert(0, '.')
import subprocess
V = json.loads(subprocess.check_output(['node', '-e', "import('./variants.mjs').then(m=>console.log(JSON.stringify(m.VARIANTS)))"]))
def med(a): a = sorted(a); return a[len(a)//2]
for n in sys.argv[1:]:
    v = {'tilt': -5, 'rules': [632], 'word': {'line': 0, 'x0': 281, 's': 1.25}, **V[n]}
    m = json.load(open(f'v/{n}/parts/manifest.json'))
    t = next(p for p in m['parts'] if p['name'] == 'torso')
    im = Image.open(f'v/{n}/parts/torso.png').convert('RGB'); S = m['scale']
    px = lambda x, y: im.getpixel((int(round((x - t['x']) * S)), int(round((y - t['y']) * S))))
    th = math.radians(v['tilt']); c = (350, 567)
    at = lambda u, w: (c[0] + u*math.cos(th) - w*math.sin(th), c[1] + u*math.sin(th) + w*math.cos(th))
    out = []
    word_line = v['word']['line'] if v.get('word') else -1
    for i, Y in enumerate(v['rules']):
        w0 = Y - 567 + 0.4
        half = math.sqrt(max(0, 98**2 - w0**2)) - 8
        us = [u for u in range(int(-half), int(half)) if not (i == word_line and -72 < u < -10)]
        core, paper = [], []
        for u in us[::2]:
            core.append(min(L(px(*at(u, w0 + d))) for d in (-1.2, -0.6, 0, 0.6, 1.2)))
            for d in (-7, -8, 7, 8):
                if abs(w0 + d) < 92: paper.append(L(px(*at(u, w0 + d))))
        out.append(round(med(paper) - med(core), 3))
    # writing: darkest tenth of the pixels in its box vs the paper
    wd = v.get('word')
    word = None
    if wd:
        Y = v['rules'][wd['line']] - 567 - 1
        x0 = wd['x0'] - 350; s = wd['s']
        vals = []
        for uu in range(int(x0 - 14*s), int(x0 + 34*s)):
            for ww in range(int(Y - 15*s), int(Y + 12*s)):
                p = at(uu, ww)
                if math.hypot(p[0]-350, p[1]-567) < 92 and min(math.hypot(p[0]-bx, p[1]-by) for bx, by in ((280, 603), (420, 601))) > 10: vals.append(L(px(*p)))
        vals.sort(); word = round(med(vals) - med(vals[:max(1, len(vals)//25)]), 3)
    e = next(p for p in m['parts'] if p['name'] == 'eye-l')
    eim = Image.open(f'v/{n}/parts/eye-l.png').convert('RGBA')
    ec = eim.getpixel((int((317 - e['x'] - 2) * S), int((538 - e['y'] + 3) * S)))
    paperL = L(px(350, 600))
    print(f'{n:3s} lines ΔL {out}  writing ΔL {word}  eye ΔL {round(paperL - L(ec), 3)}  paper L {round(paperL, 3)}')
