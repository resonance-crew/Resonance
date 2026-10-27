# checks/review-before-after.png: the first pass (v1) beside the revision at the same scale (rest.png, 0.8 px per rig
# unit, the same ground), then both at stage size (Tuck = 120 px) on the day and night papers, with short labels.
from PIL import Image, ImageDraw, ImageFont
R = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3'
DAY, NIGHT, INK, MUTED = (250, 242, 233), (29, 23, 19), (58, 46, 36), (120, 104, 90)
F = '/System/Library/Fonts/STHeiti Medium.ttc'
f22, f15, f13 = ImageFont.truetype(F, 22), ImageFont.truetype(F, 15), ImageFont.truetype(F, 13)
v1 = Image.open(f'{R}/card/v1/parts/rest.png').convert('RGBA')
v2 = Image.open(f'{R}/card/parts/rest.png').convert('RGBA')
tk = Image.open(f'{R}/tuck/parts/rest.png').convert('RGBA')
W, H = 1240, 820
out = Image.new('RGB', (W, H), DAY)
d = ImageDraw.Draw(out)
# top: same scale (crop the 560 × 608 canvas to y 190…600; ground y 700 → 560 in rest px)
crop = (20, 190, 540, 590)
for i, (im, title) in enumerate([(v1, '第一輪（v1）'), (v2, '修改後')]):
    x0 = 30 + i * 600
    out.paste(im.crop(crop), (x0, 40), im.crop(crop))
    d.text((x0 + 10, 8), title, font=f22, fill=INK)
    d.line([(x0, 40 + 560 - 190 + 1), (x0 + 520, 40 + 560 - 190 + 1)], fill=(200, 188, 175), width=1)
notes = [
    '卡片 420 × 268 → 378 × 241（×0.9，腿不變）；臉保持原大小，所以在卡上看起來大一點',
    '手臂紙條改藏到卡片後面，銅釘頭畫在卡面上，離側邊 18 → 24（約 2.7 個釘半徑）',
    '貝雷帽小了將近一半、扁一點、調亮；右邊軟軟塌在卡角上，懸出卡片 42 → 18；帽頂三道縫線',
    '同比例面積 1.50 → 1.18 倍摺摺；舞台寬 154 → 144 px（手機 113 → 106）',
]
for k, t in enumerate(notes):
    d.text((40, 448 + k * 22), '· ' + t, font=f15, fill=INK)
# bottom: stage size, day and night, Tuck for scale
k = 120 / (420 * 0.8)
def stage(im):
    c = im.crop((0, 150, 560, 590))
    return c.resize((round(c.width * k), round(c.height * k)), Image.LANCZOS)
row_y = 560
for j, bg in enumerate([DAY, NIGHT]):
    x0 = 30 + j * 600
    d.rectangle([x0, row_y, x0 + 580, row_y + 230], fill=bg)
    ink = INK if bg == DAY else (225, 214, 200)
    x = x0 + 14
    for im, t in [(tk, '摺摺'), (v1, 'v1'), (v2, '修改後')]:
        s = stage(im)
        out.paste(s, (x - 20, row_y + 30), s)
        bb = s.getchannel('A').getbbox(); cx = x - 20 + (bb[0] + bb[2]) // 2
        tw = d.textlength(t, font=f13)
        d.text((cx - tw / 2, row_y + 200), t, font=f13, fill=ink)
        x += 190
    d.text((x0 + 12, row_y + 8), ('日紙' if j == 0 else '夜紙') + '，舞台大小（摺摺 = 120 px）', font=f13, fill=ink)
out.save(f'{R}/card/checks/review-before-after.png')
print('ok')
