# Regenerates the small self-check renders from the current parts/rest.png, parts/recomposed.png, rig-2x.png and
# concept.png: rest at 120 / 48 px tall on the day and night papers, concept at 120 / 48 px tall, rest vs recomposed,
# and a 2x crop of the beret.
from PIL import Image
R = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots/r3/card'
DAY, NIGHT = (250, 242, 233), (29, 23, 19)
def tight(im):
    a = im.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    return im.crop(a.getbbox())
rest = tight(Image.open(f'{R}/parts/rest.png').convert('RGBA'))
for h in (120, 48):
    s = rest.resize((round(rest.width * h / rest.height), h), Image.LANCZOS)
    for name, bg in (('day', DAY), ('night', NIGHT)):
        t = Image.new('RGB', (s.width + 16, h + 16), bg); t.paste(s, (8, 8), s); t.save(f'{R}/checks/rest-{h}-{name}.png')
c = Image.open(f'{R}/concept.png')
for h in (120, 48):
    c.resize((round(c.width * h / c.height), h), Image.LANCZOS).save(f'{R}/checks/concept-{h}.png')
a = Image.open(f'{R}/parts/rest.png').convert('RGBA'); b = Image.open(f'{R}/parts/recomposed.png').convert('RGBA')
o = Image.new('RGB', (a.width * 2, a.height), DAY); o.paste(a, (0, 0), a); o.paste(b, (a.width, 0), b); o.save(f'{R}/checks/rest-vs-recomposed.png')
Image.open(f'{R}/checks/rig-2x.png').crop((540, 640, 1140, 900)).save(f'{R}/checks/beret-crop.png')
print('ok')
