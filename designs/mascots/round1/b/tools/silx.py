"""Quick silhouette study: a few head/neck gestures in black at 120 and 48 px."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import gen
V = {
 'C 問號前彎': dict(nc=[(300,700),(294,650),(292,600),(298,550),(314,506),(340,470),(370,446),(410,430)], nw=[150,110,76,58,56,64,84,110], head=(470,380,-6,150,104,114), hand=True),
 'C1 細頸': dict(nc=[(300,700),(294,650),(292,600),(298,550),(314,506),(340,470),(370,446),(410,430)], nw=[130,92,60,46,44,50,68,96], head=(470,380,-6,150,104,114), hand=True),
 'C2 歪頭': dict(nc=[(300,700),(294,650),(292,600),(298,550),(314,506),(340,470),(370,446),(410,430)], nw=[140,100,66,50,48,56,76,100], head=(474,372,9,150,104,114), hand=True),
 'C3 前彎更多': dict(nc=[(290,700),(282,650),(280,598),(286,548),(300,506),(326,474),(360,456),(404,452)], nw=[140,100,66,50,48,56,76,100], head=(476,396,4,150,104,114), hand=True),
 'C4 手在後': dict(nc=[(330,700),(324,650),(322,600),(328,550),(344,506),(370,470),(400,446),(440,430)], nw=[140,100,66,50,48,56,76,100], head=(500,380,6,150,104,114), hand='back'),
 'C5 頭小一點': dict(nc=[(300,700),(294,650),(292,600),(298,550),(314,506),(340,470),(370,446),(410,434)], nw=[140,100,66,50,48,56,76,100], head=(466,386,6,134,94,104), hand=True),
}
def sil(v):
    hx, hy, hr, rx, ryt, ryb = v['head']
    hp = gen.head_shape(rx, ryt, ryb, 7)
    hd = gen.cr_closed([(hx + gen.rot(x, y, hr)[0], hy + gen.rot(x, y, hr)[1]) for x, y in hp])
    nd = gen.cr_closed(gen.tube(v['nc'], v['nw']))
    hand = ''
    if v['hand'] == 'back':
        hc=[(206,700),(200,650),(196,610),(188,580),(176,558)]
        hand = f'<path d="{gen.cr_closed(gen.tube(hc,[70,36,28,26,30]))}"/><ellipse cx="166" cy="540" rx="27" ry="21" transform="rotate(50 166 540)"/>'
    elif v['hand']:
        hc=[(566,700),(570,650),(578,610),(590,580),(606,558)]
        hand = f'<path d="{gen.cr_closed(gen.tube(hc,[70,36,28,26,30]))}"/><ellipse cx="618" cy="540" rx="27" ry="21" transform="rotate(-50 618 540)"/>'
    rip = ''.join(f'<ellipse cx="{v["nc"][0][0]}" cy="660" rx="{r}" ry="{r*0.16:.0f}" fill="none" stroke="#000" stroke-width="5"/>' for r in (110, 170))
    return f'<svg viewBox="80 180 640 560" width="WW" height="HH"><defs><clipPath id="c"><rect x="0" y="0" width="800" height="662"/></clipPath></defs><g clip-path="url(#c)"><path d="{nd}"/>{hand}</g><path d="{hd}"/>{rip}</svg>'
html = '<!doctype html><meta charset=utf-8><style>body{margin:0;background:#f8f2ea;font:12px sans-serif;color:#665;display:flex;flex-wrap:wrap;gap:22px;padding:16px}.c{display:flex;flex-direction:column;align-items:center;gap:6px}.r{display:flex;align-items:flex-end;gap:14px}</style>'
for k, v in V.items():
    s = sil(v)
    html += f'<div class="c"><div class="r">{s.replace("WW","137").replace("HH","120")}{s.replace("WW","55").replace("HH","48")}</div>{k}</div>'
open(sys.argv[1], 'w').write(html)
