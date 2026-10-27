# sheet.py <dir> — a contact sheet of a tour's clips, labelled
import sys, os
from PIL import Image, ImageDraw
d = sys.argv[1]
fs = sorted(f for f in os.listdir(d) if f.endswith('.png') and f != 'sheet.png')
ims = [(f[:-4], Image.open(os.path.join(d, f)).convert('RGB')) for f in fs]
if not ims: sys.exit()
cw = 420; ch = max(int(im.height * cw / im.width) for _, im in ims) + 18
cols = 4; rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cw, rows * ch), 'white')
dr = ImageDraw.Draw(sheet)
for i, (n, im) in enumerate(ims):
    im = im.resize((cw, int(im.height * cw / im.width)))
    x, y = (i % cols) * cw, (i // cols) * ch
    sheet.paste(im, (x, y + 18)); dr.text((x + 4, y + 3), n, fill='black')
sheet.save(os.path.join(d, 'sheet.png'))
print(os.path.join(d, 'sheet.png'), sheet.size)
