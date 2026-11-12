/**
 * A second look before a capture is kept. `settle` waits for two frames in a row to match, but a
 * page still waiting holds still too — a skeleton, a loader, an empty list before its read: the
 * 2.5.0 release run kept three Android cards taken before they loaded, and in 55 runs `settle` never
 * flagged one. The baseline is the best word there is for what the page should be, so a capture
 * that differs from it (or a new screen on a platform that has a baseline) is taken again after a
 * few seconds. The same picture again: the change is real, and stays. Another one: the first look
 * was too early — the later one is kept and the capture is marked *retaken* — and it is looked at
 * once more, up to three looks; still moving by then, it is *unsettled*, which fails the run.
 *
 * "The same" is the comparison's own rule (diff.ts: an area moved by more than a couple of pixels,
 * the regions a capture asked to skip left out, a screen's `maxDiff` allowance).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { compareImages } from './diff';
import { SCREENS, type Platform } from './screens';
import { BASELINE_DIR, ignorePath, readJson, sleep, type Rect } from './util';

export type Shot = { png: Buffer; settled: boolean };
/** A capture as kept: `retaken` when an earlier look was found too early. */
export type Look = Shot & { retaken: boolean };

/** How long each platform waits before looking again (the apps read over the network on a cold start). */
export const SECOND_LOOK_MS: Record<Platform, number> = { web: 2000, ios: 5000, mac: 5000, android: 5000 };
/** Looks in all, the first included. */
export const LOOKS = 3;

const allowances = new Map(SCREENS.filter((s) => s.maxDiff != null).map((s) => [s.id, s.maxDiff!]));
const allowanceOf = (key: string) => allowances.get(key.split('/').pop()!.split('@')[0]);

/** Whether two captures show the same page, by the comparison's rule. */
export function samePicture(a: Buffer, b: Buffer, ignore: Rect[] = [], allowance?: number): boolean {
  if (a.equals(b)) return true;
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return false;
  const { ratio, areas } = compareImages(pa.data, pb.data, pa.width, pa.height, ignore);
  return !areas.length || (allowance != null && ratio <= allowance);
}

/**
 * Whether a capture wants another look: it differs from its baseline, or it has none on a platform
 * that has one (a new screen). A machine's first run has no baseline at all: nothing to go by, no
 * second look (it is reviewed whole, `review --all`).
 */
export function wantsSecondLook(key: string, png: Buffer, ignore: Rect[] = [], baselineDir = BASELINE_DIR): boolean {
  const file = join(baselineDir, key);
  if (!existsSync(file)) return existsSync(join(baselineDir, key.split('/')[0]));
  const skip = [...ignore, ...(readJson<Rect[]>(ignorePath(file)) ?? [])];
  return !samePicture(readFileSync(file), png, skip, allowanceOf(key));
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
};

/** What a capture's log line adds about how it was taken. */
export const lookNote = (look: Look) => (!look.settled ? '  (never settled)' : look.retaken ? '  (taken again: the first look was early)' : '');

/** The capture to keep: `first`, or a later look when `first` was taken too early (see above). */
export async function secondLook(first: Shot, retake: () => Promise<Shot>, options: SecondLookOptions): Promise<Look> {
  const { key, ignore = [], baselineDir = BASELINE_DIR, wait = sleep } = options;
  const waitMs = options.waitMs ?? SECOND_LOOK_MS[key.split('/')[0] as Platform] ?? 5000;
  if (!wantsSecondLook(key, first.png, ignore, baselineDir)) return { ...first, retaken: false };
  const allowance = allowanceOf(key);
  let current = first;
  let retaken = false;
  for (let look = 1; look < LOOKS; look++) {
    await wait(waitMs);
    const next = await retake();
    if (samePicture(current.png, next.png, ignore, allowance)) return { png: next.png, settled: current.settled && next.settled, retaken };
    retaken = true;
    current = next;
    // It turned into the baseline's page: the first look was simply early.
    if (!wantsSecondLook(key, current.png, ignore, baselineDir)) return { ...current, retaken };
  }
  return { png: current.png, settled: false, retaken };
}
