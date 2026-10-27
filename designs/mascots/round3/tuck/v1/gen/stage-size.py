# checks/stage-size.png: the exported parts (parts/rest.png) and the "hi" pose shrunk to the stage's sizes —
# 120 px tall (desktop) and 88 px (phone) — and to 48 px, on the day and night papers, at 1×.
import sys
from PIL import Image
def fig(path):
    im = Image.open(path).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v > 24 else 0)
    return im.crop(a.getbbox())
rest = fig('parts/rest.png'); hi = fig('work/hi-big.png')
DAY, NIGHT = (248, 243, 236, 255), (36, 33, 30, 255)
W, H = 1160, 280
out = Image.new('RGBA', (W, H), DAY)
out.paste(Image.new('RGBA', (W // 2, H), NIGHT), (W // 2, 0))
x0 = 20
for half, bg in ((0, DAY), (1, NIGHT)):
    x = half * W // 2 + 20
    for im, h in ((hi, 120), (rest, 120), (hi, 88), (rest, 88), (hi, 48), (rest, 48)):
        w = round(im.width * h / im.height)
        s = im.resize((w, h), Image.LANCZOS)
        out.alpha_composite(s, (x, 240 - h)); x += w + 12
out.save('checks/stage-size.png')
