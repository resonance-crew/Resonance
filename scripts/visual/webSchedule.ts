/**
 * How the web's captures share out between browser contexts (web.ts). They used to run one after the other —
 * phone (three variants), then tablet, then desktop: 33 minutes for a full web run (20261122-011120), the
 * browser idle while each page loaded and settled. Now several contexts run at once — but the pages
 * write to the one stack they share: a read is counted (one per reader, card and day), the bell's panel
 * marks its notifications read, a screen's hints are unspent for its account. In the old order every
 * capture met the stack as every capture before it had left it, the same each run; in any other order a
 * count or a badge could change from run to run.
 *
 * So the order of the writes is kept. A screen's FIRST visit by an account is what writes; every later
 * visit — the same screen and account in the dark, in English, on another device — writes nothing new
 * (the read already counted today, the notifications already read). The first visits run one after the
 * other, in the old order (`first`); then the rest run side by side (`rest`), each seeing the stack as
 * every first visit left it, which is what the old order showed them too. A screen with hints unspends
 * them on every visit (hints.ts), so all its visits stay in `first`.
 *
 * `runGroups` runs groups `limit` at a time (`VISUAL_WEB_PARALLEL`, default 4; 1 is the old one-by-one).
 * A group that throws is tried once more in a fresh context; one that fails twice has its captures said
 * and counted unsettled (which fails the run), and the others go on.
 */
import { mapLimit } from './pool';
import type { Account, Screen, Variant } from './screens';

export type WebGroup = { device: string; variant: Variant; account: Account | null; screens: Screen[] };

/** The groups in the old order, split into the first visits (in order, one at a time) and the rest (side by side). */
export function schedule(groups: readonly WebGroup[]): { first: WebGroup[]; rest: WebGroup[] } {
  const seen = new Set<string>();
  const first: WebGroup[] = [];
  const rest: WebGroup[] = [];
  for (const g of groups) {
    const writes: Screen[] = [];
    const repeats: Screen[] = [];
    for (const screen of g.screens) {
      const visit = `${g.account ?? '-'}|${screen.id}`;
      if (!seen.has(visit) || screen.hints?.length) writes.push(screen);
      else repeats.push(screen);
      seen.add(visit);
    }
    if (writes.length) first.push({ ...g, screens: writes });
    if (repeats.length) rest.push({ ...g, screens: repeats });
  }
  return { first, rest };
}

/** How many web contexts capture at once (`VISUAL_WEB_PARALLEL`, default 4: room for 24 GB beside the stack, about 0.3 GB a context). */
export function webParallel(): number {
  const set = Number(process.env.VISUAL_WEB_PARALLEL);
  return Number.isFinite(set) && set >= 1 ? Math.floor(set) : 4;
}

/**
 * Runs each group (`run`: its own context, closed whatever happens; answers its unsettled keys), `limit` at a
 * time. A group that throws is run once more; failing again, its captures (`keysOf`) are said and answered as
 * unsettled. Answers every unsettled key.
 */
export async function runGroups(
  groups: readonly WebGroup[],
  { limit, run, keysOf, log, tries = 2 }: { limit: number; run: (g: WebGroup) => Promise<string[]>; keysOf: (g: WebGroup) => string[]; log: (line: string) => void; tries?: number },
): Promise<string[]> {
  const out = await mapLimit(groups, limit, async (g) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await run(g);
      } catch (error) {
        const why = String((error as Error)?.message ?? error).split('\n')[0];
        const what = `web/${g.device} ${g.variant.theme}-${g.variant.locale}${g.account ? ` as ${g.account}` : ''}`;
        if (attempt < tries) {
          log(`  ${what} failed (${why}): once more in a fresh context`);
          continue;
        }
        const keys = keysOf(g);
        log(`  ${what} failed twice (${why}): ${keys.length} capture(s) not taken — ${keys.join(', ')}`);
        return keys;
      }
    }
  });
  return out.flat();
}
