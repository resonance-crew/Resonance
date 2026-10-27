"""Rig check: the character through <img src>, its sprout turned about the pivots in its own comments."""
import re, sys
sys.path.insert(0, '..')
from tingya import NIGHT as NV
base = open('../../character.svg').read()
S = '{}px {}px'.format(*re.search(r'a-antenna-stem"><!-- pivot: ([0-9.]+),([0-9.]+)', base).groups())
C = '{}px {}px'.format(*re.search(r'a-antenna-curl"><!-- pivot: ([0-9.]+),([0-9.]+)', base).groups())
NIGHT = ';'.join(f'--a-{k}:{v}' for k, v in NV.items())
poses = {
    'rest': '',
    'lean': f'#a-antenna-stem{{transform-origin:{S};transform:rotate(10deg)}}#a-antenna-curl{{transform-origin:{C};transform:rotate(-20deg)}}#a-face{{transform:translate(-14px,2px)}}',
    'tight': f'#a-antenna-stem{{transform-origin:{S};transform:rotate(-10deg)}}#a-antenna-curl{{transform-origin:{C};transform:rotate(16deg) scale(0.92)}}#a-eye-l{{transform-origin:345px 512px;transform:scaleY(0.12)}}#a-eye-r{{transform-origin:455px 510px;transform:scaleY(0.12)}}',
    'open': f'#a-antenna-stem{{transform-origin:{S};transform:rotate(6deg)}}#a-antenna-curl{{transform-origin:{C};transform:rotate(30deg) scale(1.05)}}#a-arm-r{{transform-origin:520px 576px;transform:rotate(-22deg)}}',
}
cells, zooms = [], []
for name, css in poses.items():
    s = base.replace('</style>', css + '</style>', 1)
    open(f'pose-{name}.svg', 'w').write(s)
    cells.append(f'<figure><img src="pose-{name}.svg" width="360" height="360"><figcaption>{name}</figcaption></figure>')
    z = s.replace('viewBox="0 0 800 800" width="800" height="800"', 'viewBox="90 120 330 330" width="660" height="660"', 1)
    open(f'pz-{name}.svg', 'w').write(z)
    zooms.append(f'<img src="pz-{name}.svg" width="440" height="440">')
s = base.replace('<svg xmlns="http://www.w3.org/2000/svg"', f'<svg xmlns="http://www.w3.org/2000/svg" style="{NIGHT}"', 1)
open('pose-night.svg', 'w').write(s)
cells.append('<figure style="background:oklch(21% 0.012 60)"><img src="pose-night.svg" width="360" height="360"><figcaption style="color:#ccc">night (img src)</figcaption></figure>')
css = '<!doctype html><meta charset=utf-8><style>body{margin:0;background:#f8f2ea;display:flex;flex-wrap:wrap;font:14px sans-serif}figure{margin:0;padding:6px}</style>'
open('poses10.html', 'w').write(css + ''.join(cells))
open('pz10.html', 'w').write(css + ''.join(zooms[1:]))
