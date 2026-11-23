/**
 * A phone takes three variants (light zh-TW, dark zh-TW, light en) and a tablet one, so on Android and iOS the tablet's
 * lane finished first and stood idle while the phone went on: run 20261123-073642's Android tablet 14 min, its iPad 9
 * (phone lanes 1228 s and 908 s against 359 s and 373 s). Now, once the tablet is done and shut down, a second phone —
 * the same AVD again, read-only (Android), or a clone of the harness's iPhone (iOS) — takes the phone's last variants
 * while the first phone goes on with its own: never more than two devices at once, so no more memory than before.
 *
 * The phone's work is cut by variant (`variantBlocks`): each variant starts from a clean app (Android `pm clear`, iOS
 * an account's sign-in launch), so a variant runs the same on either phone. The first phone takes from the front
 * (light zh-TW first: the first visits, which write to the stack, keep their old order), the second from the back.
 */
import type { Variant } from './screens';

/** Consecutive groups of the same variant, as one block each (`groups` in variants.ts keeps a variant's groups together). */
export function variantBlocks<G extends { variant: Variant }>(groups: readonly G[]): G[][] {
  const out: G[][] = [];
  for (const g of groups) {
    const last = out.at(-1);
    if (last && last[0].variant.theme === g.variant.theme && last[0].variant.locale === g.variant.locale) last.push(g);
    else out.push([g]);
  }
  return out;
}

/** The phone's blocks, taken from both ends. */
export class BlockQueue<T> {
  private readonly blocks: T[];
  constructor(blocks: readonly T[]) {
    this.blocks = [...blocks];
  }
  /** The first phone's next block (the front). */
  front(): T | undefined {
    return this.blocks.shift();
  }
  /** The second phone's next block (the back). */
  back(): T | undefined {
    return this.blocks.pop();
  }
  get left(): number {
    return this.blocks.length;
  }
}

/**
 * Whether a second phone is worth booting once the tablet is done: at least one block left for it, the tablet shut
 * down by this run (else a third device would run beside the two), and not turned off (`VISUAL_SECOND_PHONE=0`, or
 * `VISUAL_PARALLEL=0`: one device at a time).
 */
export function secondPhoneWanted({ left, tabletDown, env = process.env }: { left: number; tabletDown: boolean; env?: Record<string, string | undefined> }): boolean {
  if (env.VISUAL_SECOND_PHONE === '0' || env.VISUAL_PARALLEL === '0') return false;
  return left >= 1 && tabletDown;
}
