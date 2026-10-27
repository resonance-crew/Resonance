# python3 work/refresh_checks.py → refreshes checks/ images that come from the exported parts:
# landing-stage-size.png (day and night landing, Tuck = 120 px), rest-vs-recomposed.png, parts-sheet.png, concept-small.png
import sys, json; sys.path.insert(0, 'work')
from compose import *
L = '../landing'
k = 120 / 420
out = []
for theme in ('light', 'dark'):
    page = Image.open(f'{L}/desktop-{theme}.png').convert('RGBA').crop((300, 380, 1140, 900))
    for back, gx in ((False, 580), (True, 760)):
        fig, m = compose('parts', k, back)
        gx0, gy0 = m['ground']
        page.alpha_composite(fig, (round(gx - gx0 * k), round(358 - gy0 * k)))
    out.append(page)
sheet = Image.new('RGBA', (840, 1040)); sheet.paste(out[0], (0, 0)); sheet.paste(out[1], (0, 520))
sheet.convert('RGB').save('checks/landing-stage-size.png')
a, b = Image.open('parts/rest.png').convert('RGBA'), Image.open('parts/recomposed.png').convert('RGBA')
s = Image.new('RGBA', (a.width + b.width, a.height), DAY + (255,)); s.alpha_composite(a, (0, 0)); s.alpha_composite(b, (a.width, 0))
dr = ImageDraw.Draw(s); dr.text((12, 10), 'rest.png（直接渲染）', fill=(90, 74, 62), font=font(16)); dr.text((a.width + 12, 10), 'recomposed.png（照 manifest 拼回）', fill=(90, 74, 62), font=font(16))
s.convert('RGB').save('checks/rest-vs-recomposed.png')
m = json.load(open('parts/manifest.json'))
ps = [p for p in m['parts'] if p.get('w')]
cols = 8; cw, ch = 162, 300
sh = Image.new('RGBA', (cols * cw, ((len(ps) + cols - 1) // cols) * ch), DAY + (255,)); dr = ImageDraw.Draw(sh)
for i, p in enumerate(ps):
    im = Image.open(f"parts/{p['img']}").convert('RGBA'); im.thumbnail((cw - 16, ch - 60))
    x, y = (i % cols) * cw, (i // cols) * ch
    sh.alpha_composite(im, (x + (cw - im.width) // 2, y + 40 + (ch - 60 - im.height) // 2))
    t = p['name'] + (f" ← {p['variantOf']}" if p.get('variantOf') else '')
    dr.text((x + 8, y + 8), t, fill=(70, 56, 46), font=font(14))
    if p.get('hides'): dr.text((x + 8, y + 24), 'hides: ' + p['hides'], fill=(150, 80, 60), font=font(11))
sh.convert('RGB').save('checks/parts-sheet.png')
Image.open('concept.png').convert('RGB').resize((480, 300), Image.LANCZOS).save('checks/concept-small.png')
print('ok')
