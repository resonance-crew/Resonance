/**
 * The sticker pipeline's pure parts (no Chrome, no files): how a sticker is sampled in time, how long each frame shows,
 * the die-cut margin, the size limits, reading an animated WebP's frames back, and the content version. Shared by
 * render.ts and catalog.ts, and tested in src/lib/stickers/pipeline.test.ts.
 */
import { createHash } from 'node:crypto';

/** Every sticker is drawn on twos: 12 frames a second. */
export const FPS = 12;
/** The canvas, px (the renderer draws at 2× and scales down to this). */
export const SIZE = 432;
export const THUMB = 256;
export const ICON = 96;
/** Px: nothing may come within this of the canvas edge (the die-cut margin included). */
export const EDGE = 6;
/** Bytes: what a sticker should weigh, and past what the build fails. */
export const SIZE_TARGET = 120 * 1024;
export const SIZE_CAP = 200 * 1024;
/** One play's length, seconds. */
export const MIN_DURATION = 1.5;
export const MAX_DURATION = 2.5;

/** The times one play is sampled at: 0, 1/12, 2/12, … up to (not including) its duration. */
export function sampleTimes(duration: number, fps = FPS): number[] {
  const n = Math.round(duration * fps);
  if (n < 1) throw new Error(`a sticker lasts at least one frame (got ${duration} s)`);
  return Array.from({ length: n }, (_, i) => i / fps);
}

/**
 * The hero as a frame of the loop: `hero` seconds snapped to the 12 fps grid (a hero at the very end is the key pose's
 * frame 0 again).
 */
export function heroFrame(hero: number, frames: number, fps = FPS): number {
  return Math.round(hero * fps) % frames;
}

/**
 * The order the loop's `frames` sampled frames go into the file when it plays from frame `start` (its hero): start,
 * start + 1, … round to start − 1. The file then repeats its first frame as its last, so it starts and ends on the hero
 * — the thumb a client swaps to once the two plays are over — and the loop still closes on the key pose in between.
 */
export function phaseOrder(frames: number, start: number): number[] {
  return Array.from({ length: frames }, (_, i) => (i + start) % frames);
}

/**
 * How long each of `frames` frames shows, whole milliseconds (WebP's unit), so their running sum stays on the 12 fps
 * grid: 83, 84, 83, 83, 84, … — never a drift.
 */
export function frameDurations(frames: number, fps = FPS): number[] {
  return Array.from({ length: frames }, (_, i) => Math.round(((i + 1) * 1000) / fps) - Math.round((i * 1000) / fps));
}

export type SizeVerdict = 'ok' | 'over-target' | 'over-cap';
export function sizeVerdict(bytes: number): SizeVerdict {
  return bytes > SIZE_CAP ? 'over-cap' : bytes > SIZE_TARGET ? 'over-target' : 'ok';
}

export function checkDuration(duration: number): void {
  if (!(duration >= MIN_DURATION - 1e-9 && duration <= MAX_DURATION + 1e-9)) {
    throw new Error(`a sticker plays ${MIN_DURATION}–${MAX_DURATION} s (got ${duration} s)`);
  }
}

/** The die-cut margin's cream: the torn paper's own fibre rim, oklch(97.5% 0.012 85), in sRGB. */
export const CREAM: readonly [number, number, number] = [249, 244, 235];

export interface DieCutOptions {
  /** The margin, px (2.5 at 432). */
  radius?: number;
  cream?: readonly [number, number, number];
  /** Alpha below `lo` counts for nothing, above `hi` for all (glue shadows and soft glows don't get an outline). */
  lo?: number;
  hi?: number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/**
 * A die-cut sticker's margin: a cream outline `radius` px wide round everything solid, anti-aliased, under the art —
 * and anything faint beyond it (a glue shadow's tail) cut away, so the sticker's edge is the outline. Not a shadow:
 * it is what lets 悄悄's navy read on the night paper. `rgba` is straight (not premultiplied) RGBA; returns a new one.
 */
export function dieCut(rgba: Uint8Array, w: number, h: number, o: DieCutOptions = {}): Uint8Array {
  const radius = o.radius ?? 2.5;
  const [cr, cg, cb] = o.cream ?? CREAM;
  const lo = o.lo ?? 0.25;
  const hi = o.hi ?? 0.6;
  const n = w * h;
  const cov = new Float32Array(n);
  for (let i = 0; i < n; i++) cov[i] = smoothstep(lo, hi, rgba[i * 4 + 3] / 255);
  // a grey dilation by a disc, its rim anti-aliased: m(p) = max over q of cov(q) · clamp(r + 0.5 − |p − q|, 0, 1)
  const R = Math.ceil(radius + 1);
  const offs: [number, number, number][] = [];
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const wgt = Math.min(1, Math.max(0, radius + 0.5 - Math.hypot(dx, dy)));
      if (wgt > 0) offs.push([dx, dy, wgt]);
    }
  }
  const m = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cov[i] >= 1) {
        m[i] = 1;
        continue;
      }
      let best = cov[i];
      for (const [dx, dy, wgt] of offs) {
        if (wgt <= best) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const v = cov[yy * w + xx] * wgt;
        if (v > best) best = v;
      }
      m[i] = best;
    }
  }
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = (rgba[i * 4 + 3] / 255) * m[i];
    const ca = m[i] * (1 - a);
    const oa = a + ca;
    if (oa <= 0) continue;
    out[i * 4] = Math.round((rgba[i * 4] * a + cr * ca) / oa);
    out[i * 4 + 1] = Math.round((rgba[i * 4 + 1] * a + cg * ca) / oa);
    out[i * 4 + 2] = Math.round((rgba[i * 4 + 2] * a + cb * ca) / oa);
    out[i * 4 + 3] = Math.round(oa * 255);
  }
  return out;
}

/** Does anything (alpha above `min`) come within `margin` px of the canvas's edge? A die-cut sticker must not touch it. */
export function touchesEdge(rgba: Uint8Array, w: number, h: number, margin = 2, min = 24): boolean {
  for (let y = 0; y < h; y++) {
    const edgeRow = y < margin || y >= h - margin;
    for (let x = 0; x < w; x++) {
      if (!edgeRow && x >= margin && x < w - margin) continue;
      if (rgba[(y * w + x) * 4 + 3] > min) return true;
    }
  }
  return false;
}

/** The share of pixels two frames differ in (a channel off by more than `tol`). */
export function frameDiff(a: Uint8Array, b: Uint8Array, tol = 24): number {
  let diff = 0;
  const n = a.length / 4;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 4; c++) {
      if (Math.abs(a[i * 4 + c] - b[i * 4 + c]) > tol) {
        diff++;
        break;
      }
    }
  }
  return diff / n;
}

export interface WebpInfo {
  width: number;
  height: number;
  animated: boolean;
  frames: number;
  /** One play (the frames' durations summed); 0 for a still. */
  durationMs: number;
  /** The loop count baked in (0 = for ever; a still has none). */
  loop: number | null;
}

/** Reads a WebP's container (RIFF): its size, whether it moves, its frames, their durations and its loop count. */
export function readWebp(buf: Uint8Array): WebpInfo {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('not a WebP');
  const u24 = (o: number) => buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
  let width = 0;
  let height = 0;
  let animated = false;
  let frames = 0;
  let durationMs = 0;
  let loop: number | null = null;
  for (let o = 12; o + 8 <= buf.length;) {
    const id = tag(o);
    const len = dv.getUint32(o + 4, true);
    const d = o + 8;
    if (id === 'VP8X') {
      animated = (buf[d] & 0x02) !== 0;
      width = u24(d + 4) + 1;
      height = u24(d + 7) + 1;
    } else if (id === 'ANIM') {
      loop = dv.getUint16(d + 4, true);
    } else if (id === 'ANMF') {
      frames++;
      durationMs += u24(d + 12);
    } else if (id === 'VP8 ' && !width) {
      width = dv.getUint16(d + 6, true) & 0x3fff;
      height = dv.getUint16(d + 8, true) & 0x3fff;
    } else if (id === 'VP8L' && !width) {
      const bits = dv.getUint32(d + 1, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }
    o = d + len + (len & 1);
  }
  if (!animated) frames = 1;
  return { width, height, animated, frames, durationMs, loop };
}

/** A file's content version, as its URL's `?v=`: the first 10 hex of a sha256 of the bytes (in order). */
export function contentVersion(files: readonly Uint8Array[]): string {
  const h = createHash('sha256');
  for (const f of files) h.update(f).update('\0');
  return h.digest('hex').slice(0, 10);
}
