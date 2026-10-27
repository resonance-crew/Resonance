"""Experiment harness: render several arm angle sets side by side (rotation only, same baked art)."""
import sys, os, importlib.util, json
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('gen', os.path.join(HERE, 'gen.py'))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

def sheet(frames, out, cell=400, sil=False):
    """frames: list of (label, dict of overrides to POSES['hello'])"""
    items = []
    defs_all = []
    for i, (label, over) in enumerate(frames):
        p = f'b2-x{i}-'
        P = dict(g.POSES[over.get('base', 'hello')])
        P.update({k: v for k, v in over.items() if k != 'base'})
        g.POSES['_x'] = P
        defs, shadow, fig, marks = g.character(p, '_x')
        defs_all.append(g.filters(p) + defs)
        x = i * cell
        f = ' filter="url(#sil)"' if sil else ''
        items.append(f'<g transform="translate({x},0) scale({cell/800})"><g{f}>{shadow}{fig}{marks}</g></g>'
                     f'<text x="{x + 10}" y="20" font-size="14" font-family="sans-serif" fill="#554">{label}</text>')
    W = cell * len(frames)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {cell}" width="{W}" height="{cell}">
<defs><filter id="sil" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 14 0" result="a"/>
<feMorphology in="a" operator="dilate" radius="6" result="d"/><feMorphology in="d" operator="erode" radius="6" result="e"/>
<feFlood flood-color="#1d1916"/><feComposite in2="e" operator="in"/></filter>
{''.join(defs_all)}</defs>
<rect width="{W}" height="{cell}" fill="oklch(96.5% 0.015 75)"/>
{''.join(items)}
</svg>'''
    open(out, 'w').write(svg)
    return W, cell

if __name__ == '__main__':
    frames = json.loads(sys.argv[2])
    fr = []
    for f in frames:
        lab = f.pop('label')
        if 'arms' in f:
            f['arms'] = {k: tuple(v) for k, v in f['arms'].items()}
        fr.append((lab, f))
    W, H = sheet(fr, sys.argv[1], int(sys.argv[3]) if len(sys.argv) > 3 else 400, sil=len(sys.argv) > 4)
    print(W, H)
