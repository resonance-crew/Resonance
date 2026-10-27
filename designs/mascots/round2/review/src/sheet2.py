import sys
R=sys.argv[1]; k=sys.argv[2]
bbox={'b2':(196,82,645,718),'c2':(118,112,644,712),'bc':(170,150,621,749)}
def fig(k,h,cls='',tf='',cap=''):
    x0,y0,x1,y1=bbox[k]; bh=y1-y0; bw=x1-x0
    s=h/bh; W=bw*s; size=800*s
    return (f'<div class="cell"><div class="fig {cls}" style="width:{W:.1f}px;height:{h}px;{tf}">'
            f'<img src="{R}/review/src/{k}-noeffects.svg" style="width:{size:.1f}px;height:{size:.1f}px;left:{-x0*s:.1f}px;top:{-y0*s:.1f}px"></div><div class="cap">{cap}</div></div>')
cells=[fig(k,330,'',cap='彩色'),fig(k,330,'sil',cap='剪影'),fig(k,330,'sil','transform:scaleX(-1)',cap='左右翻轉'),fig(k,330,'sil','transform:rotate(180deg)',cap='上下顛倒'),fig(k,330,'','transform:rotate(180deg)',cap='彩色顛倒')]
html=f'''<!doctype html><html><head><meta charset=utf-8><style>
html,body{{margin:0;background:#f8f2ea;font:14px -apple-system,sans-serif;color:#333}}
.row{{display:flex;align-items:flex-start;gap:34px;padding:24px 28px}}
.cell{{flex:none;display:flex;flex-direction:column;align-items:center;gap:8px}}
.fig{{position:relative}} .fig img{{position:absolute;max-width:none}}
.sil img{{filter:url(#sil)}}
</style></head><body>
<svg width=0 height=0 style="position:absolute"><filter id="sil" color-interpolation-filters="sRGB" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.6"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 10 -2.5"/></filter></svg>
<div class="row">{"".join(cells)}</div></body></html>'''
open(f'{R}/review/src/sheet-{k}.html','w',encoding='utf-8').write(html)
# small sizes sheet: 48 and 96, color & sil, rendered at 1x for later nearest upscale
cells=[fig(k,48),fig(k,48,'sil'),fig(k,96),fig(k,96,'sil'),fig(k,48,'sil','transform:rotate(180deg)'),fig(k,48,'sil','transform:scaleX(-1)')]
html2=html.replace(f'<div class="row">{"".join([fig(k,330,"",cap="彩色"),fig(k,330,"sil",cap="剪影"),fig(k,330,"sil","transform:scaleX(-1)",cap="左右翻轉"),fig(k,330,"sil","transform:rotate(180deg)",cap="上下顛倒"),fig(k,330,"","transform:rotate(180deg)",cap="彩色顛倒")])}</div>',
  '<div class="row" style="gap:16px;padding:8px">'+"".join(cells)+'</div>')
open(f'{R}/review/src/small-{k}.html','w',encoding='utf-8').write(html2)
