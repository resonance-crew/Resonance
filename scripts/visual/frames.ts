/**
 * A screen's frame as pixels (RGBA, 8 bits a channel), for the captures that look at many frames before keeping one:
 * Android's settle and the Mac's. Frames are compared as pixels and only the frame kept is encoded, once — not a PNG
 * per frame (the AVD encoded each `screencap -p` itself, about half a second for 1080 × 2424; the Mac decoded,
 * cut and encoded every frame with pngjs). The pixels are the ones the PNG held: a PNG encoder is lossless, so the
 * frame kept judges against the baseline exactly as the device's own PNG did.
 */
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import type { Rect } from './util';

export type Frame = { data: Buffer; width: number; height: number };

/**
 * `adb exec-out screencap` without `-p`: a header — width, height, pixel format, and since Android 10 a colour space,
 * 32 bits each, little-endian — then the pixels, RGBA_8888 (format 1) row by row.
 */
export function parseScreencap(raw: Buffer): Frame {
  if (raw.length < 12) throw new Error(`screencap gave ${raw.length} bytes, no header`);
  const width = raw.readUInt32LE(0);
  const height = raw.readUInt32LE(4);
  const format = raw.readUInt32LE(8);
  const pixels = width * height * 4;
  const header = raw.length - pixels;
  if (format !== 1 || (header !== 12 && header !== 16)) {
    throw new Error(`screencap gave ${width} × ${height} in format ${format} with ${raw.length} bytes: not RGBA_8888 as expected`);
  }
  return { data: raw.subarray(header), width, height };
}

/** Whether two frames are the very same pixels. */
export const sameFrame = (a: Frame, b: Frame) => a.width === b.width && a.height === b.height && (a.data.equals(b.data) || pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 }) === 0);

const inside = (x: number, y: number, r: Rect) => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;

/** Where two frames differ (any channel of any pixel), outside `ignore`: one box round all of it, or null where nothing does. */
export function apartBoxOf(a: Frame, b: Frame, ignore: Rect[] = []): Rect | null {
  if (a.width !== b.width || a.height !== b.height) return { x: 0, y: 0, width: Math.max(a.width, b.width), height: Math.max(a.height, b.height) };
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  const pa = a.data;
  const pb = b.data;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      if (pa[i] === pb[i] && pa[i + 1] === pb[i + 1] && pa[i + 2] === pb[i + 2] && pa[i + 3] === pb[i + 3]) continue;
      if (ignore.some((r) => inside(x, y, r))) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** The frame kept, as a PNG (RGBA, libvips: other bytes than the device's encoder wrote, the same pixels). */
export function encodeFrame(frame: Frame): Promise<Buffer> {
  return sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer();
}

/**
 * Frames taken again and again until two in a row match (`same`), as util's `settle` does for PNGs; answers the last
 * frame and whether it settled, once `timeoutMs` runs out.
 */
export async function settleFrames(
  take: () => Promise<Frame>,
  { intervalMs = 400, timeoutMs = 20_000, same = sameFrame, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) }: {
    intervalMs?: number;
    timeoutMs?: number;
    same?: (a: Frame, b: Frame) => boolean | Promise<boolean>;
    sleep?: (ms: number) => Promise<unknown>;
  } = {},
): Promise<{ frame: Frame; settled: boolean }> {
  const end = Date.now() + timeoutMs;
  let last = await take();
  while (Date.now() < end) {
    await sleep(intervalMs);
    const next = await take();
    if (await same(last, next)) return { frame: next, settled: true };
    last = next;
  }
  return { frame: last, settled: false };
}
