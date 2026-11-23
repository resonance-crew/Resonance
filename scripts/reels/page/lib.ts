/**
 * The reels' own pieces, on top of the tour's kit (scripts/promo/page/kit.ts):
 * paper with grain, a torn sheet that slides over the frame, big type that
 * rises line by line, a pen strike, a paper phone with a camera that zooms in,
 * the 小紙團 stickers played frame by frame, and the end card.
 *
 * The look (2026-11, from Instagram references: mymind's big serif words on
 * quiet backgrounds, Slowly's calm pacing, Letterboxd's app cards floating over
 * the picture, and the season's paper-reveal trend): every beat is one idea in
 * very large type, a cut every 1.5–3 s, the app shown at a phone's own
 * proportions, and the puppets reacting. No shadows, one pen — as in the app.
 */
import { wavyLine } from '@/lib/design/wavyPath';
import { css, drawable, html, place, svg } from '../../promo/page/dom';
import { autoRect, C, face, icon, INK, makePrng, measure, wobRect } from '../../promo/page/kit';
import { ease, lerp, prog, spring } from '../../promo/page/time';
import type { StickerName } from './stickers';

export const W = 1080;
export const H = 1920;
/** Instagram's caption and buttons may cover the frame below this, and its header above TOP_SAFE. */
export const SAFE_BOTTOM = 1460;
export const TOP_SAFE = 250;
export const SAFE_X = 80;

/** A sound the mix lays at a moment (scripts/reels/make.ts). */
export interface Cue {
  t: number;
  sfx: 'tap' | 'paper' | 'flip' | 'chime' | 'scribble' | 'whoosh';
  /** dB, 0 = as made. */
  gain?: number;
}

export interface Built {
  root: HTMLElement;
  update(t: number): void;
}

export interface Reel {
  id: string;
  duration: number;
  /** When the end card starts (the music's close is laid from here). */
  endAt: number;
  /** The frame used for the cover (Instagram's grid crops it to its middle 3:4). */
  coverAt: number;
  /** Every character the reel shows, so the faces' glyphs are loaded before anything is measured. */
  text: string;
  cues: Cue[];
  build(): Built;
}

// ── Paper ─────────────────────────────────────────────────────────────

/** A full-frame sheet of paper in `fill`, with the grain multiplied over it. */
export function paper(fill: string, o: { z?: number } = {}) {
  const grain = html('div', { class: 'abs grain' });
  const el = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, height: H, background: fill, zIndex: o.z ?? 0 } }, [grain]);
  return el;
}

/** The torn top edge of a sheet, as a clip-path polygon over a W × (H + 80) box. */
function tornEdge(seed: number, depth = 26): string {
  const rnd = makePrng(seed);
  const pts: string[] = [];
  const steps = 54;
  let y = depth / 2;
  for (let i = 0; i <= steps; i++) {
    y = Math.max(0, Math.min(depth, y + (rnd() - 0.5) * depth * 0.9));
    pts.push(`${((i / steps) * W).toFixed(1)}px ${y.toFixed(1)}px`);
  }
  pts.push(`${W}px ${H + 80}px`, `0px ${H + 80}px`);
  return `polygon(${pts.join(', ')})`;
}

/**
 * A sheet torn from a pad that slides up over the frame: its torn edge shows
 * the paper's white core a few pixels above the colour, as torn paper does.
 * `set(p)`: 0 below the frame, 1 covering it.
 */
export function tornSheet(fill: string, seed: number, z: number) {
  const core = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, height: H + 80, background: 'oklch(98.5% 0.008 85)', clipPath: tornEdge(seed, 30) } });
  const colour = html('div', { class: 'abs', style: { left: 0, top: 9, width: W, height: H + 80, background: fill, clipPath: tornEdge(seed + 7, 26) } }, [
    html('div', { class: 'abs grain', style: { height: H + 80 } }),
  ]);
  const el = html('div', { class: 'abs', style: { left: 0, top: -40, width: W, height: H + 80, zIndex: z } }, [core, colour]);
  const set = (p: number) => place(el, { y: lerp(H + 60, 0, p), opacity: p > 0 ? 1 : 0 });
  set(0);
  return { el, set };
}

// ── Type ──────────────────────────────────────────────────────────────

/**
 * Big words that rise into place line by line, each line out of its own mask
 * (`\n` breaks a line). `set(p)` 0 → 1 brings it in, `out(q)` 0 → 1 lifts it away.
 */
export function words(text: string, o: { size: number; weight?: number; color?: string; serif?: boolean; align?: 'left' | 'center'; lineHeight?: number; tracking?: string; stagger?: number }) {
  const lines = text.split('\n').map((line) => {
    const inner = html('span', { text: line, style: { display: 'inline-block', whiteSpace: 'pre' } });
    const mask = html('div', { style: { overflow: 'hidden', paddingBottom: Math.round(o.size * 0.12), marginBottom: -Math.round(o.size * 0.12) } }, [inner]);
    return { mask, inner };
  });
  const el = html('div', {
    style: {
      fontFamily: o.serif === false ? 'var(--font-body)' : 'var(--font-heading)',
      fontWeight: o.weight ?? 800,
      fontSize: o.size,
      lineHeight: o.lineHeight ?? 1.28,
      letterSpacing: o.tracking ?? '0.02em',
      color: o.color ?? C.text,
      textAlign: o.align ?? 'left',
    },
  }, lines.map((l) => l.mask));
  const stagger = o.stagger ?? 0.09;
  /** p is time since the words start coming in (s); q the same for going out. */
  const update = (sinceIn: number, sinceOut = -1) => {
    lines.forEach((l, i) => {
      const a = ease.outQuart(prog(sinceIn, i * stagger, i * stagger + 0.5));
      const b = sinceOut < 0 ? 0 : ease.inCubic(prog(sinceOut, i * 0.04, i * 0.04 + 0.28));
      place(l.inner, { y: o.size * 1.15 * (1 - a) - o.size * 1.15 * b });
    });
    place(el, { opacity: sinceIn < 0 ? 0 : 1 });
  };
  update(-1);
  return { el, update, lines };
}

/** A pen stroke drawn across a line of words (the struck-out kind): wavy, terracotta, a little tilted. */
export function strike(width: number, seed: number) {
  const d = wavyLine(width, seed, 5, 5);
  const path = svg('path', { d, transform: 'translate(0,12)', fill: 'none', stroke: C.terracotta, 'stroke-width': 9, 'stroke-linecap': 'round' });
  const el = svg('svg', { width, height: 24, viewBox: `0 0 ${width} 24`, class: 'abs', style: 'overflow:visible;pointer-events:none' }, [path]);
  return { el, draw: drawable(path) };
}

/** A pen underline drawn under words (the marked kind). */
export function underline(width: number, seed: number, color: string = C.terracotta) {
  const d = wavyLine(width, seed, 3.2, 6);
  const path = svg('path', { d, transform: 'translate(0,8)', fill: 'none', stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round' });
  const el = svg('svg', { width, height: 16, viewBox: `0 0 ${width} 16`, style: 'display:block;overflow:visible' }, [path]);
  return { el, draw: drawable(path) };
}

/** A small tonal pill above a beat's words (what the beat is about). */
export function eyebrow(text: string, iconName: Parameters<typeof icon>[0] | null, seed = 17) {
  const kids = [iconName ? icon(iconName, 30, C.onTonal).el : null, html('span', { text })];
  const pill = html('div', { class: 'reel-eyebrow' }, kids);
  const { w, h } = measure(pill);
  pill.prepend(face(autoRect(w, h, h / 2, seed), w, h, { fill: C.buttonTonal }).el);
  css(pill, { width: w, height: h });
  return pill;
}

// ── The phone ─────────────────────────────────────────────────────────

/**
 * A phone cut from paper: a dark pen outline round a cream screen (the app's
 * own page colour), the island and the time drawn in. The screen holds
 * `content` at `zoom` (the app's 1× at the phone's width). Placed with its top
 * at `top`, centred, it runs on past the frame's foot as a phone held up does.
 *
 * `camera(s, fx, fy)` zooms the whole phone by `s` about the stage point
 * (fx, fy), the way a screen recording zooms into what's tapped.
 */
export function phone(content: HTMLElement, o: { width: number; top: number; zoom: number; seed?: number }) {
  const w = o.width;
  const h = Math.round(w * 2.16);
  const r = w * 0.15;
  const bezel = Math.round(w * 0.035);
  const d = wobRect(w, h, r, o.seed ?? 913, w * 0.006, { segmentsH: [3, 4], segmentsV: [7, 8], curve: 0.5, cornerJitter: 0.8, cornerOffset: 3 });
  const body = face(d, w, h, { fill: 'oklch(30% 0.02 60)', chalkSeed: 3 });
  const sw = w - bezel * 2;
  const sh = h - bezel * 2;
  const sd = wobRect(sw, sh, r - bezel, (o.seed ?? 913) + 5, w * 0.004, { segmentsH: [3, 4], segmentsV: [7, 8], curve: 0.5, cornerJitter: 0.6, cornerOffset: 2 });
  const clipId = `phone-${o.seed ?? 913}`;
  const clip = svg('svg', { width: 0, height: 0, class: 'abs' }, [svg('defs', {}, [svg('clipPath', { id: clipId }, [svg('path', { d: sd })])])]);
  const status = html('div', { class: 'abs phone-status', style: { left: 0, top: 0, width: sw, height: Math.round(62 * (o.zoom / 1.7)), background: C.cream } }, [
    html('span', { text: '9:41', style: { marginLeft: Math.round(sw * 0.12) } }),
    html('span', { class: 'phone-island', style: { width: Math.round(sw * 0.3), height: Math.round(sw * 0.085) } }),
    html('span', { style: { width: Math.round(sw * 0.12) + 40 } }),
  ]);
  const holder = html('div', { class: 'abs', style: { left: 0, top: 0, zoom: o.zoom } }, [content]);
  const scroller = html('div', { class: 'abs', style: { left: 0, top: Math.round(62 * (o.zoom / 1.7)), width: sw, height: sh } }, [holder]);
  // Over the page, not scrolled with it: the dim and the dialogs, at the page's own 1×.
  const dim = html('div', { class: 'abs', style: { left: 0, top: 0, width: sw, height: sh, background: 'oklch(30% 0.02 75 / 0.2)', opacity: 0 } });
  const overlay = html('div', { class: 'abs', style: { left: 0, top: 0, width: sw / o.zoom, height: sh / o.zoom, zoom: o.zoom } });
  const screen = html('div', { class: 'abs', style: { left: bezel, top: bezel, width: sw, height: sh, background: C.cream, clipPath: `url(#${clipId})`, overflow: 'hidden' } }, [
    scroller,
    status,
    dim,
    overlay,
  ]);
  const left = Math.round((W - w) / 2);
  const el = html('div', { class: 'abs', style: { left, top: o.top, width: w, height: h } }, [clip, body.el, screen]);
  const cam = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, height: H, transformOrigin: '0 0' } }, [el]);
  /** The stage point of a point in the content's own 1× px (before the camera). */
  const at = (x: number, y: number, scroll = 0) => ({ x: left + bezel + x * o.zoom, y: o.top + bezel + Math.round(62 * (o.zoom / 1.7)) + (y - scroll) * o.zoom });
  const scroll = (y: number) => place(holder, { y: -y });
  const camera = (s: number, fx: number, fy: number, lift = 0) => {
    // Scale about (fx, fy), then move by `lift`.
    cam.style.transform = `translate(${(fx - fx * s).toFixed(2)}px, ${(fy - fy * s + lift).toFixed(2)}px) scale(${s.toFixed(4)})`;
  };
  /** Centres a dialog (1× size w × h) on the screen, a little above the middle; returns its 1× top-left. */
  // Centred in the part of the screen above Instagram's caption, not the whole (off-frame) screen.
  const centre = (w2: number, h2: number) => {
    const visible = (SAFE_BOTTOM - 20 - o.top - bezel) / o.zoom;
    return { x: (sw / o.zoom - w2) / 2, y: Math.max(40, (visible - h2) / 2 + 20) };
  };
  /** The stage point of a point in the overlay's 1× px (before the camera). */
  const atOverlay = (x: number, y: number) => ({ x: left + bezel + x * o.zoom, y: o.top + bezel + y * o.zoom });
  return { el: cam, phone: el, screen, overlay, dim, at, atOverlay, centre, scroll, camera, width: w, height: h, left, top: o.top, zoom: o.zoom, screenW: sw, screenH: sh };
}

// ── Stickers ──────────────────────────────────────────────────────────

let stickerManifest: Record<string, { frames: number; delays: number[] }> = {};
export async function loadStickers() {
  stickerManifest = await fetch('/assets/stickers/manifest.json').then((r) => r.json());
  // Decode every frame before the first render, so no frame is shot half-loaded.
  const imgs: Promise<unknown>[] = [];
  for (const [name, m] of Object.entries(stickerManifest)) {
    for (let i = 0; i < m.frames; i++) {
      const img = new Image();
      img.src = stickerSrc(name, i);
      imgs.push(img.decode().catch(() => undefined));
    }
  }
  await Promise.all(imgs);
}
const stickerSrc = (name: string, i: number) => `/assets/stickers/${name.replace('/', '-')}/${i}.png`;

/** A 小紙團 sticker, played from `start` (s) and looping; it pops in with a small spring. */
export function sticker(name: StickerName, size: number) {
  const img = html('img', { attrs: { src: stickerSrc(name, 0), width: size, height: size }, style: { display: 'block', width: size, height: size } });
  const el = html('div', { class: 'abs', style: { width: size, height: size } }, [img]);
  let shown = -1;
  const update = (t: number, start: number, end = Infinity) => {
    const m = stickerManifest[name];
    const s = spring(t, start, 0.55, 0.3);
    const out = ease.inCubic(prog(t, end, end + 0.3));
    place(el, { s: Math.max(0.001, s * (1 - out)), opacity: Math.min(1, s * 2) * (1 - out), origin: '50% 80%' });
    if (!m || t < start) return;
    const total = m.delays.reduce((a, b) => a + b, 0);
    let ms = ((t - start) * 1000) % total;
    let i = 0;
    while (i < m.frames - 1 && ms >= m.delays[i]) ms -= m.delays[i++];
    if (i !== shown) {
      img.src = stickerSrc(name, i);
      shown = i;
    }
  };
  return { el, update };
}

// ── End card ──────────────────────────────────────────────────────────

/** The close: the mark drawn on, the name, the line, the puppets waving along the foot, where to get it. */
export function endCard(line: string, cast: StickerName[]) {
  const mark = icon('wave', 150, C.terracotta);
  const draw = mark.paths.map((p) => drawable(p));
  const word = html('div', { class: 'end-word', text: 'Resonance' });
  const brand = html('div', { style: { display: 'flex', alignItems: 'center', gap: 20 } }, [mark.el, word]);
  const zh = html('div', { class: 'end-zh', text: '共振' });
  const lineEl = words(line, { size: 92, align: 'center' });
  const where = html('div', { class: 'end-small', text: 'iOS・Android・resonance.channel' });
  const col = html('div', { class: 'abs', style: { left: 0, top: 420, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 } }, [
    zh,
    brand,
    html('div', { style: { height: 40 } }),
    lineEl.el,
    html('div', { style: { height: 10 } }),
    where,
  ]);
  const size = 300;
  const pals = cast.map((name, i) => {
    const s = sticker(name, size);
    css(s.el, { left: Math.round(W / 2 + (i - (cast.length - 1) / 2) * 196 - size / 2), top: 1010 + (i % 2) * 40 });
    return s;
  });
  const root = html('div', { class: 'abs', style: { left: 0, top: 0, width: W, height: H, zIndex: 40 } }, [paper(C.cream), col, ...pals.map((p) => p.el)]);
  const update = (t: number) => {
    place(root, { opacity: t < 0 ? 0 : 1 });
    if (t < 0) return;
    place(zh, { opacity: ease.outCubic(prog(t, 0.05, 0.4)) });
    draw.forEach((d, i) => d(ease.inOutCubic(prog(t, 0.05 + i * 0.1, 0.75 + i * 0.1))));
    place(word, { opacity: ease.outCubic(prog(t, 0.45, 0.9)), x: lerp(-14, 0, ease.outCubic(prog(t, 0.45, 0.9))) });
    lineEl.update(t - 0.7);
    place(where, { opacity: ease.outCubic(prog(t, 1.3, 1.8)) });
    pals.forEach((p, i) => p.update(t, 1.0 + i * 0.12));
  };
  return { root, update };
}

/** Linear 0 → 1 → 0: in over [a, a+fi], held, out over [b-fo, b]. */
export function window01(t: number, a: number, b: number, fi = 0.3, fo = 0.3) {
  return ease.outCubic(prog(t, a, a + fi)) * (1 - ease.inCubic(prog(t, b - fo, b)));
}

export { INK, ease, lerp, prog, spring };
