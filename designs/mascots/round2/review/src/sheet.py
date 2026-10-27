import sys
R=sys.argv[1]
bbox={'b2':(196,82,645,718),'c2':(118,112,644,712),'bc':(170,150,621,749)}
names={'b2':'b2 漾漾 Tint','c2':'c2 摺摺 Tuck','bc':'bc 片片 Flick'}
def fig(k,h,cls='',tf=''):
    x0,y0,x1,y1=bbox[k]; bh=y1-y0; bw=x1-x0
    s=h/bh
    W=bw*s; size=800*s
    return (f'<div class="cell"><div class="fig {cls}" style="width:{W:.1f}px;height:{h}px;{tf}">'
            f'<img src="{R}/review/src/{k}-noeffects.svg" style="width:{size:.1f}px;height:{size:.1f}px;left:{-x0*s:.1f}px;top:{-y0*s:.1f}px"></div></div>')
rows=[]
for k in ['b2','c2','bc']:
    cells=[fig(k,200),fig(k,200,'sil'),fig(k,200,'blk'),fig(k,96),fig(k,48),fig(k,96,'sil'),fig(k,48,'sil'),
           fig(k,200,'sil','transform:scaleX(-1)'),fig(k,200,'sil','transform:rotate(180deg)'),fig(k,48,'sil','transform:rotate(180deg)')]
    rows.append(f'<div class="row"><div class="lab">{names[k]}</div>{"".join(cells)}</div>')
hdr='<div class="row hdr"><div class="lab"></div>'+''.join(f'<div class="cell">{t}</div>' for t in ['彩色200','剪影200(閾值)','brightness(0)','彩色96','彩色48','剪影96','剪影48','左右翻轉','上下顛倒','顛倒48'])+'</div>'
html=f'''<!doctype html><html><head><meta charset=utf-8><style>
html,body{{margin:0;background:#f8f2ea;font:13px -apple-system,sans-serif;color:#333}}
.row{{display:flex;align-items:flex-end;gap:18px;padding:14px 18px;border-bottom:1px solid #ddd}}
.hdr{{align-items:center;padding:6px 18px}} .hdr .cell{{text-align:center}}
.lab{{width:110px;flex:none;font-weight:600}}
.cell{{flex:none;min-width:60px;display:flex;justify-content:center}}
.fig{{position:relative;overflow:visible}}
.fig img{{position:absolute;max-width:none}}
.sil img{{filter:url(#sil)}} .blk img{{filter:brightness(0)}}
</style></head><body>
<svg width=0 height=0 style="position:absolute"><filter id="sil" color-interpolation-filters="sRGB" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.6"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 10 -2.5"/></filter></svg>
{hdr}{"".join(rows)}</body></html>'''
open(f'{R}/review/src/sheet.html','w',encoding='utf-8').write(html)
