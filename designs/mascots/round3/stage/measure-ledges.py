# measure-ledges.py — builds ledges.json from the landing captures (../landing/*.png) and anchors.json.
#   python3 measure-ledges.py
# Every coordinate is in CSS px, page coordinates (the mobile capture is 2x and is read at half scale).
# Kinds the engine understands:
#   line  a surface to walk along that reaches the page's sides (the waves): points [[x, y], ...]
#   edge  a surface with ends to stand or sit on (a card's top, the headline): points, plus `cover` — the element
#         the character climbs up from behind (a rect, and `top`, the element's drawn top contour) — or
#         `enter: "pop"`: no cover, the character unfolds up from the page about its feet (a pop-up book; text has
#         nothing to hide behind)
#   peek  hide behind `cover` and show part of the body past its top / left / right side; `ground` = feet line
#   spot  a stand spot on an invisible floor at `y`, reached by walking in from the side named in `from` (or popping
#         up, when that side is far)
# Optional on any ledge: zone (hero | feed | cta | footer), weight, group (one character per group at a time),
# partner (the ledge across: a meeting there is a greeting from afar), meetChance, ceiling (the highest y a
# character may reach), clear (rects it must not cover), ink ({ light, dark }: the pencil colour props drawn there
# take on each theme — "dark" on a light background, "light" on a dark one).
# Top level per view: page, unitHeight (px for a 420-unit character: 摺摺), content (rects of words and buttons the
# props keep off), ledges.
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LAND = os.path.join(HERE, '..', 'landing')
A = json.load(open(os.path.join(LAND, 'anchors.json')))
UNIT = {'desktop': 120, 'mobile': 80}   # see README, "大小"


def dist(a, b):
    return sum(abs(p - q) for p, q in zip(a, b))


class Cap:
    def __init__(self, name, s):
        self.im = Image.open(os.path.join(LAND, name)).convert('RGB')
        self.s = s
        self.w, self.h = self.im.width / s, self.im.height / s

    def px(self, x, y):
        return self.im.getpixel((max(0, min(int(x * self.s), self.im.width - 1)), max(0, min(int(y * self.s), self.im.height - 1))))

    def first_y(self, x, y0, y1, pred):
        """First y (CSS px, at the capture's resolution) in [y0, y1) whose pixel satisfies pred, else None."""
        s = self.s
        for yy in range(int(y0 * s), int(y1 * s)):
            if pred(self.im.getpixel((int(x * s), yy))):
                return round(yy / s, 1)
        return None

    def patch(self, x, y, r=6):
        """The median colour of a small square: the background there, whatever thin ink crosses it."""
        cs = sorted((self.px(x + dx, y + dy) for dx in range(-r, r + 1, 2) for dy in range(-r, r + 1, 2)), key=sum)
        return cs[len(cs) // 2]


def contour(cap, x0, x1, y0, y1, pred, step=6, smooth=1):
    """Top contour: for each column the first matching y; gaps are filled from neighbours, then lightly smoothed."""
    xs = list(range(int(x0), int(x1) + 1, step))
    if xs[-1] != int(x1):
        xs.append(int(x1))
    ys = [cap.first_y(x, y0, y1, pred) for x in xs]
    known = [(x, y) for x, y in zip(xs, ys) if y is not None]
    if not known:
        raise SystemExit(f'no contour in {x0}-{x1} x {y0}-{y1}')
    out = []
    for x, y in zip(xs, ys):
        if y is None:
            y = min(known, key=lambda k: abs(k[0] - x))[1]
        out.append([x, y])
    if smooth:
        sm = []
        for i in range(len(out)):
            win = [out[j][1] for j in range(max(0, i - smooth), min(len(out), i + smooth + 1))]
            sm.append([out[i][0], round(sum(win) / len(win), 1)])
        out = sm
    return out


def glyph_tops(cap, x0, x1, y0, y1, bg, step=3, reach=40, smooth=4):
    """A surface over a line of big type: the upper envelope of the glyph tops (per column the highest ink within
    +-reach px, more than the gap between two glyphs), lightly smoothed — one clean line the feet rest on, never a
    dip into a gap between glyphs."""
    raw = [(x, cap.first_y(x, y0, y1, lambda p: dist(p, bg) > 120)) for x in range(int(x0), int(x1) + 1, step)]
    env = []
    for x, _ in raw:
        near = [y for xx, y in raw if y is not None and abs(xx - x) <= reach]
        if near:
            env.append([x, min(near)])
    out = []
    for i in range(len(env)):
        win = [env[j][1] for j in range(max(0, i - smooth), min(len(env), i + smooth + 1))]
        out.append([env[i][0], round(min(env[i][1], sum(win) / len(win)), 1)])
    return out[::2]


def ink_box(cap, x0, y0, x1, y1, bg, thr=120, step=2):
    """The bounding box of what differs from `bg` in a region (text, a logo), as a rect."""
    xs, ys = [], []
    for y in range(int(y0), int(y1), step):
        for x in range(int(x0), int(x1), step):
            if dist(cap.px(x, y), bg) > thr:
                xs.append(x); ys.append(y)
    if not xs:
        return None
    return {'x': min(xs), 'y': min(ys), 'w': max(xs) - min(xs) + step, 'h': max(ys) - min(ys) + step}


def ink_clusters(cap, x0, y0, x1, y1, bg, thr=40, gap=26, step=2):
    """What is drawn in a band (a card's author row, its arrow), as one rect per cluster of inked columns."""
    cols = []
    for x in range(int(x0), int(x1), step):
        ys = [y for y in range(int(y0), int(y1), step) if dist(cap.px(x, y), bg) > thr]
        if ys:
            cols.append((x, min(ys), max(ys)))
    out, cur = [], None
    for x, a, b in cols:
        if cur and x - cur['x1'] <= gap:
            cur['x1'] = x; cur['y0'] = min(cur['y0'], a); cur['y1'] = max(cur['y1'], b)
        else:
            if cur:
                out.append(cur)
            cur = {'x0': x, 'x1': x, 'y0': a, 'y1': b}
    if cur:
        out.append(cur)
    return [{'x': c['x0'] - 4, 'y': c['y0'] - 4, 'w': c['x1'] - c['x0'] + 8 + step, 'h': c['y1'] - c['y0'] + 8 + step} for c in out if c['x1'] - c['x0'] >= 6]


def rect(r, pad=0):
    return {'x': r['x'] - pad, 'y': r['y'] - pad, 'w': r['w'] + 2 * pad, 'h': r['h'] + 2 * pad}


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


INK = {'dark': (61, 48, 39), 'light': (240, 233, 221)}   # oklch(32% .02 60), oklch(93% .02 80): the stage's two pencils


def ink_on(c):
    """The pencil that reads best on colour c."""
    def ratio(a, b):
        la, lb = sorted((lum(a), lum(b)), reverse=True)
        return (la + 0.05) / (lb + 0.05)
    return max(INK, key=lambda k: ratio(INK[k], c))


def build(view):
    a = A[view]
    s = 1 if view == 'desktop' else 2
    cap = Cap(f'{view}-light.png', s)
    night = Cap(f'{view}-dark.png', s)
    W, H = a['page']['w'], a['page']['h']
    unit = UNIT[view]
    cream = cap.px(W - 12, a['hero']['h'] - 40)   # the hero's paper, clear of the blobs
    L, content = [], []
    zone = lambda y: 'hero' if y < a['hero']['h'] + 60 else 'feed' if y < a['cta']['y'] else 'cta' if y < a['footer']['y'] else 'footer'

    # --- words and buttons the props keep off ---------------------------------------------------------------------
    h = a['heroHeadline']
    para = [l for l in a['heroLines'] if l['text'].startswith('一個')][0]
    content += [rect(h), rect(para)]
    content += [rect(b) for b in a['badges']] + [rect(q) for q in a['qr']]
    content += [rect(l) for l in a['heroLines'] if l['text'].startswith('成為')]
    avs = [l for l in a['heroLines'] if l['w'] == 30 and l['h'] == 30]
    content.append({'x': min(l['x'] for l in avs), 'y': min(l['y'] for l in avs), 'w': max(l['x'] + l['w'] for l in avs) - min(l['x'] for l in avs), 'h': 30})
    # the eyebrow pill (a peach capsule above the headline's middle)
    py = h['y'] - 60
    peach = lambda p: p[0] > 245 and 190 < p[1] < 215 and 150 < p[2] < 180
    ptop = min(y for y in (cap.first_y(x, py, h['y'], peach) for x in range(int(W / 2) - 20, int(W / 2) + 21, 4)) if y is not None)
    px0 = W / 2
    while peach(cap.px(px0 - 1, ptop + 4)):
        px0 -= 1
    px1 = W / 2
    while peach(cap.px(px1 + 1, ptop + 4)):
        px1 += 1
    pbot = ptop
    while peach(cap.px(px0 + 8, pbot + 1)):   # down its left end, clear of the words
        pbot += 1
    pill = {'x': round(px0), 'y': ptop, 'w': round(px1 - px0), 'h': round(pbot - ptop + 2)}
    content.append(pill)

    def inks(x, y):
        """The pencil props take near (x, y) on the light and on the dark page."""
        return {'light': ink_on(cap.patch(x, y)), 'dark': ink_on(night.patch(x, y))}

    # --- the hero's wave (a pencil line between the cream hero and the feed's paper) ------------------------------
    hy = 930 if view == 'desktop' else 860
    wave = contour(cap, 0, W - 1, hy, hy + 110, lambda p: dist(p, cream) > 8, step=8)
    L.append({'id': 'hero-wave', 'kind': 'line', 'points': wave, 'meet': True,
              'acts': ['wave', 'look', 'stretch', 'hop', 'deco', 'reveal', 'twinkle'], 'label': '首屏的波浪線'})

    # --- the CTA's wavy top edge (terracotta begins) --------------------------------------------------------------
    cy = a['cta']['y']
    terra = lambda p: p[0] - p[1] > 55 and p[0] > 120
    cwave = contour(cap, 0, W - 1, cy, cy + 160, terra, step=8)
    L.append({'id': 'cta-wave', 'kind': 'line', 'points': cwave, 'meet': True,
              'acts': ['wave', 'look', 'stretch', 'hop', 'deco', 'reveal', 'twinkle'], 'label': '行動區的波浪頂'})

    # --- the headline: pop up on the tops of its glyphs, at its two ends (one character at a time) ----------------
    tops = glyph_tops(cap, h['x'] + 4, h['x'] + h['w'] - 4, h['y'] - 4, h['y'] + h['h'], cream)
    spans = [(470, 640), (800, 972)] if view == 'desktop' else [(30, 128), (262, 362)]   # clear of the pill above the middle
    for i, (x0, x1) in enumerate(spans):
        pts = [p for p in tops if x0 <= p[0] <= x1]
        L.append({'id': f'headline-{"lr"[i]}', 'kind': 'edge', 'points': pts, 'stance': 'stand', 'enter': 'pop',
                  'group': 'headline', 'weight': 0.5, 'partner': f'headline-{"rl"[i]}', 'clear': [pill],
                  'acts': ['look', 'wave', 'stretch', 'deco'], 'label': '標題上方'})

    # --- the eyebrow pill: stand on it like a little statue on a pedestal ------------------------------------------
    L.append({'id': 'pill-top', 'kind': 'edge', 'points': [[pill['x'] + 18, pill['y']], [pill['x'] + pill['w'] - 18, pill['y']]],
              'stance': 'stand', 'enter': 'pop', 'ceiling': a['header']['h'] + 4, 'weight': 0.8,
              'acts': ['look', 'wave', 'stretch', 'hop', 'deco', 'reveal'], 'label': '「真實的人生故事」上面'})

    # --- the feed title's two ends: pop up and stand on its glyphs (the pill sits above its middle) -------------
    beige = cap.px(10, a['feedTitle']['y'] + 10)
    ft = a['feedTitle']
    ink = [cap.first_y(x, ft['y'], ft['y'] + ft['h'], lambda p: dist(p, beige) > 120) for x in range(0, W, 2)]
    xs = [x for x, y in zip(range(0, W, 2), ink) if y is not None]
    tx0, tx1 = min(xs), max(xs)
    ttops = glyph_tops(cap, tx0, tx1, ft['y'], ft['y'] + ft['h'], beige)
    ftrect = {'x': tx0, 'y': min(p[1] for p in ttops), 'w': tx1 - tx0, 'h': ft['y'] + ft['h'] - min(p[1] for p in ttops)}
    content.append(ftrect)
    spans = [(tx0 + 4, tx0 + (90 if view == 'desktop' else 40)), (tx1 - (90 if view == 'desktop' else 40), tx1 - 4)]
    for i, (x0, x1) in enumerate(spans):
        pts = [p for p in ttops if x0 <= p[0] <= x1]
        L.append({'id': f'feed-title-{"lr"[i]}', 'kind': 'edge', 'points': pts, 'stance': 'stand', 'enter': 'pop',
                  'group': 'feed-title', 'partner': f'feed-title-{"rl"[i]}',
                  'acts': ['read', 'look', 'wave', 'stretch'], 'label': '「值得閱讀的故事」兩端'})

    # --- the story cards: sit on the top edge (climb up from behind the card) ------------------------------------
    cards = a['cards']
    for c in cards:
        if c.get('title'):
            content.append(rect(c['title']))
    above = {}
    for i, c in enumerate(cards):   # the card right above this one (same column), if any
        ups = [j for j, d in enumerate(cards) if abs(d['x'] - c['x']) < 20 and d['y'] < c['y']]
        if ups:
            above[i] = max(ups, key=lambda j: cards[j]['y'])
    for i, c in enumerate(cards):
        # the first card under the feed's subtitle: anyone sitting there would cover its words
        if (view == 'desktop' and i == 2) or (view == 'mobile' and i == 0):
            continue
        outline = lambda p: dist(p, beige) > 60
        top = contour(cap, c['x'] + 6, c['x'] + c['w'] - 6, c['y'] - 8, c['y'] + 20, outline, step=6)
        inner = [p for p in top if c['x'] + 50 <= p[0] <= c['x'] + c['w'] - 50]
        e = {'id': f'card-{i + 1}-top', 'kind': 'edge', 'points': inner, 'stance': 'sit',
             'cover': {**rect(c), 'top': top, 'radius': 18}, 'acts': ['read', 'swing', 'look', 'wave', 'reveal'],
             'label': f'第 {i + 1} 張卡片上緣', 'card': c['title']['text'] if c.get('title') else None}
        if i in above:
            # a card right above: whoever sits here must not cover its author row or its arrow
            d = cards[above[i]]
            band_bg = cap.patch(d['x'] + d['w'] / 2, d['y'] + d['h'] - 20, 4)
            e['clear'] = ink_clusters(cap, d['x'] + 14, d['y'] + d['h'] - 78, d['x'] + d['w'] - 14, d['y'] + d['h'] - 8, band_bg)
        L.append(e)
    if view == 'desktop':
        # the outer cards' sides: peek from behind (the page margin is 120 px wide)
        for i, c in enumerate(cards):
            side = 'left' if c['x'] < 200 else 'right' if c['x'] + c['w'] > W - 200 else None
            if not side:
                continue
            L.append({'id': f'card-{i + 1}-{side}', 'kind': 'peek', 'side': side, 'cover': {**rect(c), 'radius': 18},
                      'ground': c['y'] + c['h'] - 4, 'acts': ['look', 'wave', 'duck'], 'label': f'第 {i + 1} 張卡片側邊'})

    # --- the QR card and the store badges (desktop) / the store badge (phone) ------------------------------------
    under_para = para['y'] + para['h'] + 4   # nobody's head goes into the paragraph
    if view == 'desktop':
        qr = {'x': 576, 'y': 517, 'w': 116, 'h': 120}   # measured: the hand-drawn card around the code
        content.append(qr)
        # (no peek over the QR card's top: the paragraph above leaves 33 px, not enough to show a pair of eyes)
        L.append({'id': 'qr-left', 'kind': 'peek', 'side': 'left', 'cover': {**qr, 'radius': 16}, 'ground': qr['y'] + qr['h'] - 2,
                  'target': [qr['x'] + qr['w'] / 2, qr['y'] + qr['h'] / 2], 'acts': ['look', 'wave', 'duck'],
                  'label': 'QR code 卡片左側'})
        L.append({'id': 'qr-point', 'kind': 'spot', 'meet': True, 'partner': 'badges', 'x': qr['x'] - 56, 'y': qr['y'] + qr['h'] - 1, 'from': 'left',
                  'clear': [qr], 'ceiling': under_para,
                  'target': [qr['x'] + qr['w'] / 2, qr['y'] + qr['h'] / 2], 'acts': ['point', 'look', 'wave'], 'label': 'QR code 旁邊'})
        b = a['badges'][1]
        L.append({'id': 'badges', 'kind': 'spot', 'meet': True, 'partner': 'qr-point', 'x': b['x'] + b['w'] + 62, 'y': b['y'] + b['h'], 'from': 'right',
                  'clear': [rect(b)], 'ceiling': under_para,
                  'target': [b['x'] + b['w'], b['y'] + b['h'] / 2 - 20], 'acts': ['point', 'look', 'wave'], 'label': '下載徽章旁'})
        av = [l for l in a['heroLines'] if l['text'].startswith('成為')][0]
        L.append({'id': 'avatars-end', 'kind': 'spot', 'meet': True, 'x': av['x'] + av['w'] + 64, 'y': av['y'] + av['h'] + 5, 'from': 'right',
                  'clear': [rect(av), rect(b)],
                  'acts': ['wave', 'look', 'hop', 'deco', 'reveal'], 'label': '早期說故事的人那一排的尾端'})
    else:
        # beside the App Store badge, a little below its foot (the paragraph is 40 px above the badge): point at it.
        # The two sides face each other across the badge — too narrow to walk up to someone, so a meeting here is a
        # greeting from afar (partner)
        b = a['badges'][0]
        fy = b['y'] + b['h'] + 18
        for side in ('l', 'r'):
            L.append({'id': f'badge-{side}', 'kind': 'spot', 'x': b['x'] - 46 if side == 'l' else b['x'] + b['w'] + 46, 'y': fy,
                      'from': 'left' if side == 'l' else 'right', 'clear': [rect(b, 4)], 'ceiling': under_para - 2,
                      'partner': f'badge-{"r" if side == "l" else "l"}',
                      'target': [b['x'] + (6 if side == 'l' else b['w'] - 6), b['y'] + b['h'] / 2], 'acts': ['point', 'look', 'wave', 'hop'],
                      'label': 'App Store 徽章旁'})
        x0 = min(l['x'] for l in avs); x1 = max(l['x'] + l['w'] for l in avs); y0 = min(l['y'] for l in avs); y1 = max(l['y'] + l['h'] for l in avs)
        L.append({'id': 'avatars', 'kind': 'peek', 'side': 'top', 'cover': {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'radius': 15}, 'ground': y1 - 1,
                  'x': x0 + 36, 'show': 0.75, 'acts': ['wave', 'look', 'duck'], 'label': '早期說故事的人那一排後面'})

    # --- 瀏覽所有故事: lean on the button --------------------------------------------------------------------
    fb = a['feedMore'][-1]
    content.append(rect(fb))
    bx = fb['x'] - (52 if view == 'desktop' else 38)
    over = [c['y'] + c['h'] for c in cards if c['x'] < bx + 70 and c['x'] + c['w'] > bx - 70 and c['y'] + c['h'] < fb['y']]
    L.append({'id': 'browse', 'kind': 'spot', 'meet': view == 'desktop', 'x': bx, 'y': fb['y'] + fb['h'], 'from': 'left', 'clear': [rect(fb)],
              'ceiling': max(over) + 6 if over else None,
              'target': [fb['x'] + 8, fb['y'] + fb['h'] / 2], 'lean': 1, 'acts': ['lean', 'look', 'wave', 'point'], 'label': '「瀏覽所有故事」按鈕旁'})

    # --- 寫下你的故事: beckon, pretend to write ----------------------------------------------------------------
    wb = a['ctaButtons'][0]
    content.append(rect(a['ctaTitle']))
    content += [rect(x) for x in a['ctaButtons'][::2]]
    terra_c = cap.px(10, wb['y'])
    sub = ink_box(cap, 0, a['ctaTitle']['y'] + a['ctaTitle']['h'] + 4, W, wb['y'] - 4, terra_c, 150)
    if sub:
        content.append(sub)
    if view == 'desktop':
        # left of the line above the buttons (a head beside the button would cover its words), beckoning over
        L.append({'id': 'write', 'kind': 'spot', 'meet': True, 'x': wb['x'] - 140, 'y': wb['y'] + wb['h'], 'from': 'left', 'clear': [rect(wb), sub],
                  'target': [wb['x'] + 10, wb['y'] + wb['h'] / 2], 'acts': ['beckon', 'write', 'wave'], 'label': '「寫下你的故事」旁'})
    else:
        # a phone has no room beside the full-width button, and the line above it is close: peek over its left end
        L.append({'id': 'write', 'kind': 'peek', 'side': 'top', 'cover': {**rect(wb), 'radius': 25}, 'ground': wb['y'] + wb['h'] - 1, 'show': 0.55,
                  'ceiling': wb['y'] - 49,   # the line above the button ends 51 px over it: show no more than fits
                  'x': wb['x'] + 42, 'target': [wb['x'] + wb['w'] / 2, wb['y'] + wb['h'] / 2], 'acts': ['beckon', 'look', 'wave', 'duck'],
                  'label': '「寫下你的故事」後面'})

    # --- the footer logo: nap beside it -------------------------------------------------------------------------
    fy = a['footer']['y']
    fbg = cap.px(10, fy + 200)
    y0, y1 = (fy + 170, fy + 210) if view == 'desktop' else (fy + 125, fy + 160)   # the logo's line (its tagline is lower)
    ink = lambda p: dist(p, fbg) > 60
    lx = [x for x in range(0, W, 2) if cap.first_y(x, y0, y1, ink) is not None]
    logo = {'x0': min(lx), 'x1': max(lx)}
    ly = min(cap.first_y(x, y0, y1, ink) for x in lx)
    lb = max(max(yy / cap.s for yy in range(int(y0 * cap.s), int(y1 * cap.s)) if ink(cap.im.getpixel((int(x * cap.s), yy)))) for x in lx)
    logo_r = {'x': logo['x0'], 'y': ly, 'w': logo['x1'] - logo['x0'], 'h': lb - ly}
    content.append(logo_r)
    L.append({'id': 'footer-logo', 'kind': 'spot', 'x': logo['x1'] + (54 if view == 'desktop' else 42), 'y': round(lb + 1, 1),
              'from': 'right', 'stance': 'floor', 'prefer': ['night'], 'target': [logo['x1'], ly + 6],
              'clear': [logo_r], 'acts': ['nap', 'look', 'twinkle'], 'label': '頁尾 Logo 旁'})

    # --- per ledge: its zone, the pencil its props take, a first-screen meeting more often --------------------
    for l in L:
        if l['kind'] == 'spot':
            x, y = l['x'], l['y']
        elif l['kind'] == 'peek':
            c = l['cover']
            x = c['x'] + c['w'] / 2 if l['side'] == 'top' else c['x'] - unit * 0.3 if l['side'] == 'left' else c['x'] + c['w'] + unit * 0.3
            y = c['y'] if l['side'] == 'top' else l['ground']
        else:
            pts = l['points']
            x, y = pts[len(pts) // 2]
        if l['kind'] == 'line':   # the background over its whole length, where faces will be
            samples = [(px_, l['points'][min(len(l['points']) - 1, int(i * len(l['points']) / 6))][1] - unit * 0.55) for i, px_ in enumerate(range(int(W / 12), W, int(W / 6)))]
            votes = [(ink_on(cap.patch(sx, sy)), ink_on(night.patch(sx, sy))) for sx, sy in samples]
            l['ink'] = {'light': max(('dark', 'light'), key=lambda k: sum(v[0] == k for v in votes)),
                        'dark': max(('dark', 'light'), key=lambda k: sum(v[1] == k for v in votes))}
        else:
            l['ink'] = inks(x, y - unit * 0.55)
        l['zone'] = zone(y)
        if l['zone'] == 'hero' and (l.get('meet') or l.get('partner')):
            l['meetChance'] = 0.7
        if l.get('ceiling') is None:
            l.pop('ceiling', None)
    return {'page': {'w': W, 'h': H, 'vh': a['page']['vh']}, 'unitHeight': unit, 'content': content, 'ledges': L}


out = {'note': 'CSS px, page coordinates; built by measure-ledges.py from ../landing', 'desktop': build('desktop'), 'mobile': build('mobile')}
with open(os.path.join(HERE, 'ledges.json'), 'w') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
for v in ('desktop', 'mobile'):
    print(v, [(l['id'], l['kind'], l['zone'], l['ink']['light'] + '/' + l['ink']['dark']) for l in out[v]['ledges']])
