"""Render several MAIN variants side by side (not a deliverable)."""
import sys, os, json
sys.path.insert(0, '..')
from tingya import *

def variant_svg(P, x, y, s, prefix):
    d = Drawer(P, prefix, seed=7)
    return f'<g transform="translate({x} {y}) scale({s})">{d.draw()}</g>'

VARS = json.loads(sys.argv[1])
out = []
for i, kw in enumerate(VARS):
    P = pose(**{k: (tuple(v) if isinstance(v, list) and k != 'body' else v) for k, v in kw.items()})
    if 'body' in kw:
        P['body'] = [tuple(p) for p in kw['body']]
    out.append(variant_svg(P, i * 420 - 60, -60, 0.6, f'a-t{i}-'))
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {420*len(VARS)} 440" width="{420*len(VARS)}" height="440">'
       f'<defs>{style_block()}{filters()}</defs>{"".join(out)}</svg>')
open('trial.svg', 'w').write(svg)
