/**
 * One capture against its baseline — the unit of work the comparison (compare.ts) hands to its worker
 * threads (compareWorker.ts), or does itself when there are few. The judgement is diff.ts's
 * `compareImages`, untouched; what is faster is around it:
 *
 * - The same bytes are the same page, decoded never.
 * - Decoding is libvips's (sharp, already a dependency), about 3× pngjs: on every capture of runs
 *   20261121-161711 and 20261122-011120 (241, all four platforms) its RGBA came out byte for byte
 *   pngjs's. A PNG it might read otherwise — an embedded ICC profile (which libvips may convert), or
 *   not 8 bits a channel — is decoded by pngjs as before (`decodePng`), so the pixels judged are always
 *   the ones pngjs gave.
 * - The diff image is encoded by libvips too: other bytes than pngjs wrote, the same pixels.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { compareImages, type Area } from './diff';
import { ignorePath, readJson, type Rect } from './util';

// One libvips thread per worker: the pool gives the parallelism, and threads of both kinds would only fight.
sharp.concurrency(1);
sharp.cache(false);

export type Status = 'unchanged' | 'changed' | 'new' | 'missing';
export type Result = {
  /** `<platform>/<device>/<screen>@<theme>-<locale>.png` */
  key: string;
  status: Status;
  /** Share of pixels apart beyond a shift of a couple of pixels, or null (new, missing). */
  ratio: number | null;
  /** The areas that changed, largest first (changed only; none when the sizes differ). */
  areas?: Area[];
  /** Set when the two images differ in size. */
  sizes?: { baseline: [number, number]; current: [number, number] };
};

/** One capture to judge: both files exist. */
export type Job = { key: string; runDir: string; baselineDir: string; allowance?: number };

export type Decoded = { data: Uint8Array; width: number; height: number };

/** A PNG's RGBA, as pngjs gives it — through libvips whenever libvips gives the very same (see above). */
export async function decodePng(bytes: Buffer): Promise<Decoded> {
  const image = sharp(bytes);
  const meta = await image.metadata();
  if (meta.format === 'png' && !meta.icc && meta.depth === 'uchar') {
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.channels === 4) return { data, width: info.width, height: info.height };
  }
  const png = PNG.sync.read(bytes);
  return { data: png.data, width: png.width, height: png.height };
}

/** The diff image as a PNG (RGBA, opaque). */
export function encodeDiff(diff: Uint8Array, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(diff.buffer, diff.byteOffset, diff.byteLength), { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export async function judgeCapture({ key, runDir, baselineDir, allowance }: Job): Promise<Result> {
  const rawA = readFileSync(join(baselineDir, key));
  const rawB = readFileSync(join(runDir, key));
  if (rawA.equals(rawB)) return { key, status: 'unchanged', ratio: 0 };
  const [a, b] = await Promise.all([decodePng(rawA), decodePng(rawB)]);
  if (a.width !== b.width || a.height !== b.height) {
    return { key, status: 'changed', ratio: 1, sizes: { baseline: [a.width, a.height], current: [b.width, b.height] } };
  }
  // What the capture asked to be left out, as it was found now and in the baseline (a title that moved).
  const ignore = [join(runDir, key), join(baselineDir, key)].flatMap((png) => readJson<Rect[]>(ignorePath(png)) ?? []);
  const { ratio, areas, diff } = compareImages(a.data, b.data, a.width, a.height, ignore);
  // A screen's own allowance (`maxDiff`) forgives what is left as long as it stays under that share.
  if (!areas.length || (allowance != null && ratio <= allowance)) return { key, status: 'unchanged', ratio };
  const out = join(runDir, '_diff', key);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await encodeDiff(diff, a.width, a.height));
  return { key, status: 'changed', ratio, areas };
}
