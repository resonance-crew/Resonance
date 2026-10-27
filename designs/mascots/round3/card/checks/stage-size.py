# Nod at stage size (same scale as Tuck = 120 px desktop / 88 phone) and at 48 px tall, day and night paper,
# first pass (v1) beside the revision and Tuck for reference. Writes checks/stage-sizes.png (and a 2x pixel zoom).
from PIL import Image, ImageDraw, ImageFont
R = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3'
DAY, NIGHT = (250, 242, 233), (29, 23, 19)
def load(p):
    im = Image.open(p).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    return im.crop(a.getbbox())
srcs = [('摺摺 Tuck', f'{R}/tuck/parts/rest.png'), ('聆聆 v1', f'{R}/card/v1/parts/rest.png'), ('聆聆 修改後', f'{R}/card/parts/rest.png')]
ims = [(n, load(p)) for n, p in srcs]
font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 15)
def scaled(im, k):
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
k120 = 120 / (420 * 0.8); k88 = 88 / (420 * 0.8)
cols = []
for n, im in ims:
    cols.append((n, [scaled(im, k120), scaled(im, k88), scaled(im, 48 / im.height)]))
W = 40 + sum(max(c[0].width for c in [cs]) + 50 for _, cs in cols) + 260
H = 2 * (40 + 170 + 20)
out = Image.new('RGB', (900, 2 * 230 + 30), DAY)
d = ImageDraw.Draw(out)
for row, bg in enumerate([DAY, NIGHT]):
    y0 = 30 + row * 230
    d.rectangle([0, y0 - 30 if row == 0 else y0, 900, y0 + 230], fill=bg)
    ink = (60, 50, 40) if bg == DAY else (220, 210, 200)
    x = 20
    for n, (a, b, c) in cols:
        base = y0 + 175
        out.paste(a, (x, base - a.height), a); 
        d.text((x, base + 10), f'{n} {a.width}×{a.height}', font=font, fill=ink)
        x += a.width + 24
    x += 10
    for n, (a, b, c) in cols:
        base = y0 + 175
        out.paste(c, (x, base - c.height), c)
        x += c.width + 18
    d.text((x - 3 * 70, y0 + 185), '48 px 高', font=font, fill=ink)
out.save(f'{R}/card/checks/stage-sizes.png')
# 2x pixel zoom of the 48 px figures on both papers (what is left of the beret, the face, the arms)
z = Image.new('RGB', (3 * 160 + 40, 2 * 130), DAY)
for row, bg in enumerate([DAY, NIGHT]):
    tile = Image.new('RGB', (3 * 80 + 20, 65), bg)
    x = 5
    for n, (a, b, c) in cols:
        tile.paste(c, (x, 60 - c.height), c); x += 80
    z.paste(tile.resize((tile.width * 2, tile.height * 2), Image.NEAREST), (0, row * 130))
z.save(f'{R}/card/checks/stage-48-zoom.png')
print('ok')
