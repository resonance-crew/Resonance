"""Form-check page: colour, brightness(0), flips, small sizes, on the landing page's blobs, night."""
import os, importlib.util
d = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('gen', os.path.join(d, 'gen.py')); g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
svg = open(os.path.join(d, 'character.svg')).read()
inner = svg[svg.index('>', svg.index('<svg')) + 1:svg.rindex('</svg>')]
TOP, BOT = 130, 730
def cut(sz, cls=''):
    w = sz * 800 / (BOT - TOP)
    mt, mb = -w * TOP / 800, -w * (800 - BOT) / 800
    if 'up' in cls:
        mt, mb = mb, mt
    return f'<img class="{cls}" src="../character.svg" style="width:{w:.0f}px;height:{w:.0f}px;margin-top:{mt:.0f}px;margin-bottom:{mb:.0f}px">'
html = f'''<!doctype html><html><head><meta charset="utf-8"><style>
body{{margin:0;background:oklch(96.5% 0.015 75);font:13px 'PingFang TC',sans-serif;color:#665;width:1600px}}
.row{{display:flex;align-items:flex-end;gap:26px;padding:18px 24px 8px}}
.cell{{display:flex;flex-direction:column;align-items:center;overflow:hidden;padding-top:6px}}
img{{display:block}}
.sil{{filter:brightness(0)}}
.flip{{transform:scaleX(-1)}}
.up{{transform:scaleY(-1)}}
.cap{{text-align:center;margin-top:6px}}
.blob{{padding:10px 14px;border-radius:40px}}
</style></head><body>
<div class="row">
 <div class="cell">{cut(200)}<div class="cap">彩色 200</div></div>
 <div class="cell">{cut(200, 'sil')}<div class="cap">brightness(0) 200（沒有隱藏任何東西）</div></div>
 <div class="cell">{cut(200, 'sil flip')}<div class="cap">左右翻轉</div></div>
 <div class="cell">{cut(200, 'sil up')}<div class="cap">上下顛倒</div></div>
 <div class="cell">{cut(200, 'up')}<div class="cap">彩色顛倒</div></div>
</div>
<div class="row">
 <div class="cell">{cut(96)}<div class="cap">彩色 96</div></div>
 <div class="cell">{cut(48)}<div class="cap">彩色 48</div></div>
 <div class="cell">{cut(96, 'sil')}<div class="cap">剪影 96</div></div>
 <div class="cell">{cut(48, 'sil')}<div class="cap">剪影 48</div></div>
 <div class="cell blob" style="background:oklch(88% 0.06 55)">{cut(160)}<div class="cap">首頁桃色色塊上</div></div>
 <div class="cell blob" style="background:oklch(88% 0.045 140)">{cut(160)}<div class="cap">鼠尾草色塊上</div></div>
 <div class="cell blob" style="background:oklch(21% 0.012 60)"><svg viewBox="0 {TOP} 800 {BOT - TOP}" width="{160 * 800 / (BOT - TOP):.0f}" height="160" style="{g.NIGHT_VARS}">{inner}</svg><div class="cap" style="color:#bbb">夜紙</div></div>
</div>
</body></html>'''
open(os.path.join(d, 'checks', 'forms.html'), 'w').write(html)
