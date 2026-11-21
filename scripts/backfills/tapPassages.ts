import type { Firestore } from 'firebase-admin/firestore';
import { offersPassages, passagesHash, PASSAGES_TRIES_MAX } from '../../src/lib/cards/tapPassages';
import { makeTapPassages, type TapPassagesOptions, type TapPassagesResult } from '../../src/lib/api/v1/tapPassagesMake';

/**
 * Cards published before cards offered tap passages (round 27 §P2.6) get
 * them now: every published card out of the trash, long enough to offer
 * them, whose `tapPassages.of` isn't its story's — made as a publish makes
 * them (makeTapPassages: one small model call each), `concurrency` at a time
 * with a pause between, so the model's rate limit is never met. Nobody's
 * budget is charged (the owner runs it); no card's `updatedAt` moves; a
 * failure marks the card owed for the daily cron, as after a publish.
 * Idempotent: a card done is no candidate again until its story's words
 * change. Without `apply` it only counts.
 */
export async function backfillTapPassages(
  db: Firestore,
  opts: { apply: boolean; log?: (line: string) => void; concurrency?: number; pauseMs?: number; pick?: TapPassagesOptions['pick'] },
) {
  const log = opts.log ?? console.log;
  const snap = await db
    .collection('cards')
    // The published cards, the rest asked below (no composite index for this one-off read).
    .where('publishedAt', '!=', null)
    .select('story', 'publishedAt', 'trashedAt', 'tapPassages')
    .get();
  const candidates = snap.docs.filter((doc) => {
    const data = doc.data();
    if (!offersPassages(data)) return false;
    const of = passagesHash(String(data.story ?? ''));
    const stored = data.tapPassages as { of?: unknown; failed?: { of?: unknown; tries?: unknown } } | undefined;
    if (stored?.of === of) return false;
    // Left alone after its failures, until the story changes (as the cron leaves it).
    return !(stored?.failed?.of === of && Number(stored.failed.tries) >= PASSAGES_TRIES_MAX);
  });
  log(`published cards: ${snap.size}, long enough to offer passages without current ones: ${candidates.length}`);
  const report: Record<TapPassagesResult | 'candidates', number> = {
    candidates: candidates.length, made: 0, unchanged: 0, none: 0, removed: 0, 'not-found': 0, 'over-budget': 0, failed: 0, 'given-up': 0, moved: 0,
  };
  if (!opts.apply) return report;
  const concurrency = opts.concurrency ?? 2;
  const pause = opts.pauseMs ?? 500;
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < candidates.length) {
        const doc = candidates[next++];
        const result = await makeTapPassages(db, doc.id, { pick: opts.pick });
        report[result]++;
        if (result !== 'made') log(`  ${doc.id}: ${result}`);
        if (pause) await new Promise((r) => setTimeout(r, pause));
      }
    }),
  );
  log(`made ${report.made}, none ${report.none}, failed ${report.failed}, other ${candidates.length - report.made - report.none - report.failed}`);
  return report;
}
