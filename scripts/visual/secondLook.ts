/**
 * A second look before a capture is kept. `settle` waits for two frames in a row to match, but a
 * page still waiting holds still too — a skeleton, a loader, an empty list before its read: the
 * 2.5.0 release run kept three Android cards taken before they loaded, and in 55 runs `settle` never
 * flagged one. The baseline is the best word there is for what the page should be, so a capture
 * that differs from it (or has none: see wantsSecondLook) is taken again after a few seconds. The same picture again: the change is real, and stays. Another one: the first look
 * was too early — the later one is kept and the capture is marked *retaken* — and it is looked at
 * once more, up to three looks; still moving by then, it is *unsettled*, which fails the run.
 *
 * "The same" is the comparison's own rule (diff.ts: an area moved by more than a couple of pixels,
 * the regions a capture asked to skip left out, a screen's `maxDiff` allowance).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareImages } from './diff';
import { decodePng } from './judge';
import { SCREENS, type Platform } from './screens';
import { baselineDir as currentBaseline } from './baselines';
import { ignorePath, readJson, sleep, type Rect } from './util';

export type Shot = { png: Buffer; settled: boolean };
/** A capture as kept: `retaken` when an earlier look was found too early. */
export type Look = Shot & { retaken: boolean };

/** How long each platform waits before looking again (the apps read over the network on a cold start). */
export const SECOND_LOOK_MS: Record<Platform, number> = { web: 2000, ios: 5000, mac: 5000, android: 5000 };
/** Looks in all, the first included. */
export const LOOKS = 3;

const allowances = new Map(SCREENS.filter((s) => s.maxDiff != null).map((s) => [s.id, s.maxDiff!]));
const allowanceOf = (key: string) => allowances.get(key.split('/').pop()!.split('@')[0]);

/**
 * Whether two captures show the same page, by the comparison's rule. Decoded by libvips where it gives the very pixels
 * pngjs would (judge.ts `decodePng`: about 3× faster; pngjs for the rest), so the answer is pngjs's own.
 */
export async function samePicture(a: Buffer, b: Buffer, ignore: Rect[] = [], allowance?: number): Promise<boolean> {
  if (a.equals(b)) return true;
  const [pa, pb] = await Promise.all([decodePng(a), decodePng(b)]);
  if (pa.width !== pb.width || pa.height !== pb.height) return false;
  const { ratio, areas } = compareImages(pa.data, pb.data, pa.width, pa.height, ignore);
  return !areas.length || (allowance != null && ratio <= allowance);
}

/**
 * Whether a capture wants another look: it differs from its baseline, or it has none. On the web a
 * capture without one gets another look only on a platform that has a baseline (a new screen): the
 * web's pass waits for its requests to drain and retakes a blank page itself. The apps have neither
 * (a skeleton holds still as well as a page does), so on them every capture without a baseline is
 * looked at again — a machine's first run, a new screen, the extended set's first run — or a capture
 * taken before load would be the baseline the next run trusts.
 */
export async function wantsSecondLook(key: string, png: Buffer, ignore: Rect[] = [], baselineDir = currentBaseline()): Promise<boolean> {
  const file = join(baselineDir, key);
  const platform = key.split('/')[0];
  if (!existsSync(file)) return platform !== 'web' || existsSync(join(baselineDir, platform));
  const skip = [...ignore, ...(readJson<Rect[]>(ignorePath(file)) ?? [])];
  return !(await samePicture(readFileSync(file), png, skip, allowanceOf(key)));
}

export type SecondLookOptions = {
  /** `<platform>/<device>/<shot>.png` */
  key: string;
  /** Regions the comparison skips in this capture (the web's cover titles). */
  ignore?: Rect[];
  /** How long to wait before each further look (default: the platform's, SECOND_LOOK_MS). */
  waitMs?: number;
  baselineDir?: string;
  wait?: (ms: number) => Promise<void>;
  /**
   * One plain frame of the screen as it is now, no settling (the apps: a screencap, a simctl screenshot): for a capture
   * with no baseline, its second look (see `secondLook`).
   */
  glance?: () => Promise<Buffer>;
};

/** What a capture's log line adds about how it was taken. */
export const lookNote = (look: Look) => (!look.settled ? '  (never settled)' : look.retaken ? '  (taken again: the first look was early)' : '');

/**
 * The capture to keep: `first`, or a later look when `first` was taken too early (see above).
 *
 * A capture with no baseline (a new screen, a first run) and a `glance`: its first look is already a settled one —
 * Android's held still 3.5 s with no skeleton left in its window, iOS's and the Mac's taken 4 s after the launch — so
 * its second look, after the same wait as ever, is one plain frame rather than a whole settled look again (on Android
 * a screencap instead of two, a 3.5 s hold and a window dump: about 7 s a capture). The same page again: two looks
 * apart in time agree, and the first is kept. Another page: the first look was early after all, and the looks go on
 * as they always did — whole settled looks, `LOOKS` in all, unsettled if it never holds.
 */
export async function secondLook(first: Shot, retake: () => Promise<Shot>, options: SecondLookOptions): Promise<Look> {
  const { key, ignore = [], baselineDir = currentBaseline(), wait = sleep } = options;
  const waitMs = options.waitMs ?? SECOND_LOOK_MS[key.split('/')[0] as Platform] ?? 5000;
  if (!(await wantsSecondLook(key, first.png, ignore, baselineDir))) return { ...first, retaken: false };
  const allowance = allowanceOf(key);
  if (options.glance && !existsSync(join(baselineDir, key))) {
    await wait(waitMs);
    if (await samePicture(first.png, await options.glance(), ignore, allowance)) return { ...first, retaken: false };
  }
  let current = first;
  let retaken = false;
  for (let look = 1; look < LOOKS; look++) {
    await wait(waitMs);
    const next = await retake();
    if (await samePicture(current.png, next.png, ignore, allowance)) return { png: next.png, settled: current.settled && next.settled, retaken };
    retaken = true;
    current = next;
    // It turned into the baseline's page: the first look was simply early.
    if (!(await wantsSecondLook(key, current.png, ignore, baselineDir))) return { ...current, retaken };
  }
  return { png: current.png, settled: false, retaken };
}
