# python3 work/before_after.py → checks/review-before-after.png: v1 beside the revision at one scale, front and back,
# then the same at true stage size (Tuck = 120 px ⇒ 120/420 px per rig unit, 1×) and at 48 px, on both papers.
import sys; sys.path.insert(0, 'work')
from compose import *
OLD, NEW = 'work/v1parts', 'parts'
INK = (70, 56, 46); MUTE = (112, 94, 80); NIGHT_INK = (205, 195, 182)
k = 0.62
cells = [(OLD, False, 'v1 正面'), (NEW, False, '修訂 正面'), (OLD, True, 'v1 背面：臉留在「給：」上'), (NEW, True, '修訂 背面：沒有臉，手和蝴蝶結在紙後')]
ims = [trim(compose(d, k, b)[0]) for d, b, _ in cells]
cw = 330; top = 64; Hc = max(i.height for i in ims) + 16
W = cw * 4
ks = 120 / 420           # stage scale, 1×
k48 = 48 / 583           # whole figure (bow to sole) 48 px tall
row = [(OLD, False, 'v1'), (NEW, False, '修訂'), (OLD, True, 'v1 背面'), (NEW, True, '修訂 背面')]
st = [trim(compose(d, ks, b)[0]) for d, b, _ in row]
s48 = [trim(compose(d, k48, False)[0]) for d in (OLD, NEW)]
strip_h = max(i.height for i in st) + 64
H = top + Hc + 116 + strip_h * 2
sheet = Image.new('RGB', (W, H), DAY)
dr = ImageDraw.Draw(sheet)
dr.text((24, 18), '牽牽 Twine · 第三輪評審後修改（同一比例：v1 與修訂並排）', fill=INK, font=font(24))
base = top + Hc
for i, (im, (_, _, lab)) in enumerate(zip(ims, cells)):
    sheet.paste(im, (i * cw + (cw - im.width) // 2, base - im.height), im)
    dr.text((i * cw + 18, base + 8), lab, fill=MUTE, font=font(16))
notes = ['① 肩上銅釘往內 9：離紙邊 2.0 → 3.1 顆釘半徑；手長不變，垂得開一點，手套在身體下角旁邊',
         '② 蝴蝶結打正（v1 斜 3°），兩個環扁一點、往外張；繩頭不再翹出吊牌頂端　③ 臉往下 12　④ 腿寬 +3',
         '⑤ 背面 torso-alt 加 data-hides="face arm-l arm-r deco"，背面自己畫出紙後的手套和蝴蝶結']
for j, t in enumerate(notes): dr.text((24, base + 38 + j * 23), t, fill=MUTE, font=font(15))
y0 = base + 116
for r, bg in enumerate((DAY, NIGHT)):
    y = y0 + r * strip_h
    dr.rectangle([0, y, W, y + strip_h], fill=bg)
    col = MUTE if bg == DAY else NIGHT_INK
    dr.text((24, y + 10), ('日紙' if bg == DAY else '夜紙') + '　舞台實際大小（摺摺 120 px，1×）　｜　48 px', fill=col, font=font(15))
    gy = y + strip_h - 30
    for i, (im, (_, _, lab)) in enumerate(zip(st, row)):
        cx = 110 + i * 190
        sheet.paste(im, (cx - im.width // 2, gy - im.height), im)
        dr.text((cx - 30, gy + 6), lab, fill=col, font=font(13))
    for i, im in enumerate(s48):
        cx = 940 + i * 140
        sheet.paste(im, (cx - im.width // 2, gy - im.height), im)
        dr.text((cx - 20, gy + 6), ('v1' if i == 0 else '修訂') + ' 48', fill=col, font=font(13))
        big = im.resize((im.width * 3, im.height * 3), Image.NEAREST)
        sheet.paste(big, (cx + 30, gy - big.height), big)
sheet.save('checks/review-before-after.png')
print(sheet.size)
