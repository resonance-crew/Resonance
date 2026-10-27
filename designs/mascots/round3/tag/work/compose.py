# python3 work/compose.py → checks/review-before-after.png and work/stage-*.png
# Composes a rig from its exported parts (manifest.json) the way the stage does: default parts in paint order,
# variants hidden; the back view swaps torso → torso-alt and hides what torso-alt's `hides` names ('face' = every
# part whose parent is face). v1 has no hides, so its back shows what the stage showed: the face over 「給：」.
import json, sys
from PIL import Image, ImageDraw, ImageFont
DAY = (250, 242, 233); NIGHT = (29, 23, 19)
def load(d):
    m = json.load(open(f'{d}/manifest.json'))
    return m, {p['name']: Image.open(f"{d}/{p['img']}").convert('RGBA') for p in m['parts'] if p.get('w')}
def compose(d, k, back=False, eyes='open'):
    m, imgs = load(d)
    W, H = m['viewBox']; S = m['scale']
    canvas = Image.new('RGBA', (round(W * k), round(H * k)), (0, 0, 0, 0))
    alt = next((p for p in m['parts'] if p['name'] == 'torso-alt'), None)
    hides = set((alt.get('hides') or '').split()) if back and alt else set()
    for p in sorted(m['parts'], key=lambda p: p['z']):
        n = p['name']
        if not p.get('w') or p.get('only'): continue
        if back:
            if n == 'torso': continue
            if p.get('variantOf') and n != 'torso-alt': continue
            if n in hides or ('face' in hides and p['parent'] == 'face'): continue
        else:
            if p.get('variantOf'): continue
        im = imgs[n].resize((max(1, round(p['w'] * k)), max(1, round(p['h'] * k))), Image.LANCZOS)
        canvas.alpha_composite(im, (round(p['x'] * k), round(p['y'] * k)))
    return canvas, m
def trim(im):
    return im.crop(im.getbbox())
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
def font(sz):
    try: return ImageFont.truetype(FONT, sz)
    except Exception: return ImageFont.load_default()
