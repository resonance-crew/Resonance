"""Check sheet for the v2 revision (not a deliverable): papers, blobs, small sizes and the silhouette comparison."""
import sys, math
sys.path.insert(0, '..')
from tingya import *

CREAM, PEACH = 'oklch(96.5% 0.015 75)', 'rgb(248,225,208)'
NIGHT_P, NIGHT_PEACH = 'oklch(21% 0.012 60)', 'rgb(45,31,21)'
CHALK = 'oklch(88% 0.02 76)'
NS = ';'.join(f'--a-{k}:{v}' for k, v in NIGHT.items())
main = Drawer(MAIN, 'a-', seed=7).draw()
s48 = Drawer(MAIN, 'a-s48-', seed=7, pen=5.0, detail=0.5).draw(with_shadow=False)
s96 = Drawer(MAIN, 'a-s96-', seed=7, pen=3.0, detail=0.5).draw()
sil2 = Drawer(MAIN, 'a-sil-', seed=7).silhouette(cls='sil')
P0 = pose(antenna=dict(L=0.01))
nos = Drawer(MAIN, 'a-ns-', seed=7)
loop = nos.body_loop()
feet = [ellipse(*F[:4], F[4], n=60) for F in (MAIN['foot_l'], MAIN['foot_r'])]
sil_nosprout = (f'<path class="sil" d="{"".join(d_poly(f) for f in feet)}"/>'
                f'<path class="sil" transform="rotate(3 402 694)" d="{d_poly(loop)}"/>')
sil1 = open('v1sil.txt').read()

# a schematic of the reading to avoid: one round body, one spiral antenna rising from the top centre
def spiral_top():
    body = ellipse(400, 520, 170, 185, 0, 90)
    c = turtle((400, 345), -90, 230, -1.35, p=2.2)
    W = [max(10, 20 - 8 * i / len(c)) for i in range(len(c))]
    l, cap, r = tube(resample(c, 2.0, False), [W[min(len(W) - 1, int(i * len(W) / len(resample(c, 2.0, False))))] for i in range(len(resample(c, 2.0, False)))])
    return f'<path class="sil" d="{d_poly(body)}{d_poly(l + cap + r[::-1])}"/>'
ref = spiral_top()

defs = f'<defs>{style_block()}{filters()}<g id="a-main">{main}</g><g id="a-48">{s48}</g><g id="a-96">{s96}</g></defs>'

def svg(inner, w, h, bg, vb='0 0 800 800', style=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{vb}" style="background:{bg};{style}">'
            f'<style>.sil{{fill:oklch(30% 0.03 50)}}</style>{inner}</svg>')

# the character's own box: x 104..605, y 265..725 → a square view around it
VB = '80 230 560 520'
cells = []
def cell(title, body, bg='transparent', color='#5a4a3e'):
    cells.append(f'<figure style="background:{bg}"><div class="c">{body}</div><figcaption style="color:{color}">{title}</figcaption></figure>')

cell('日・奶油紙 240', svg('<use href="#a-main"/>', 240 * 560 / 520, 240, CREAM, VB))
cell('日・桃色色塊 240', svg('<use href="#a-main"/>', 240 * 560 / 520, 240, PEACH, VB))
cell('日 96 / 48', svg('<use href="#a-96"/>', 103, 96, CREAM, VB) + svg('<use href="#a-48"/>', 52, 48, CREAM, VB) + svg('<use href="#a-48"/>', 52, 48, PEACH, VB))
cell('夜・夜紙 240', svg(f'<use href="#a-main" style="{NS}"/>', 240 * 560 / 520, 240, NIGHT_P, VB), NIGHT_P, '#ccc')
cell('夜・夜裡的桃色塊＋大標', '<span class="hl">讓生命</span>' + svg(f'<use href="#a-main" style="{NS}"/>', 240 * 560 / 520, 240, NIGHT_PEACH, VB), NIGHT_P, '#ccc')
cell('夜 96 / 48', svg(f'<use href="#a-96" style="{NS}"/>', 103, 96, NIGHT_P, VB) + svg(f'<use href="#a-48" style="{NS}"/>', 52, 48, NIGHT_P, VB) + svg(f'<use href="#a-48" style="{NS}"/>', 52, 48, NIGHT_PEACH, VB), NIGHT_P, '#ccc')

sils = [('避開的讀法（示意）：圓身＋頭頂正中單捲', ref, '0 120 800 640'), ('v1', sil1, '0 120 800 640'),
        ('v2', sil2, VB), ('v2 拿掉芽', sil_nosprout, VB)]
row = ''
for name, inner, vb in sils:
    x0, y0, w, h = map(float, vb.split())
    row += (f'<figure><div class="c">{svg(inner, 120 * w / h, 120, CREAM, vb)}{svg(inner, 48 * w / h, 48, CREAM, vb)}</div>'
            f'<figcaption>{name}</figcaption></figure>')
html = (f'<!doctype html><meta charset=utf-8><style>body{{margin:0;background:{CREAM};font:13px "PingFang TC",sans-serif;display:flex;flex-wrap:wrap;width:1500px}}'
        f'figure{{margin:6px;padding:8px;border-radius:8px}}.c{{display:flex;align-items:flex-end;gap:10px}}'
        f'.hl{{position:absolute;margin:10px 0 0 120px;font:700 44px "Noto Serif TC","Songti TC",serif;color:{CHALK}}}</style>'
        f'<svg width="0" height="0" style="position:absolute">{defs}</svg>'
        + ''.join(cells) + '<div style="width:100%"></div>' + row)
open('sheet.html', 'w').write(html)
