import type { Firestore } from 'firebase-admin/firestore';
import { unlistedCard } from '../../src/lib/cards/blank';
import { presentSummaryTranslations } from '../../src/lib/api/v1/summaryTranslations';
import { makeSummaryTranslations, type SummaryTranslationsOptions, type SummaryTranslationsResult } from '../../src/lib/api/v1/summaryTranslationsMake';
import { listCard, summarize } from '../../src/lib/api/v1/summary';
import { translationTargets } from '../../src/lib/text/translation';

/**
 * Cards published before feed cards carried their translated title and
 * excerpt (round 25 §F7) get them now: every published, public card a list
 * may show (not in the trash, not unlisted) in a script we translate, whose
 * `summaryTranslations` is missing or no longer describes it — made as a
 * publish makes them (makeSummaryTranslations: one small model call each),
 * `concurrency` at a time with a pause between, so the model's rate limit is
 * never met. Nobody's budget is charged (the owner runs it); no card's
 * `updatedAt` or `excerptAt` moves. Idempotent: a card done is no candidate
 * again until its title or excerpt changes. Without `apply` it only counts.
 */
export async function backfillSummaryTranslations(
  db: Firestore,
  opts: { apply: boolean; log?: (line: string) => void; concurrency?: number; pauseMs?: number; translate?: SummaryTranslationsOptions['translate'] },
) {
  const log = opts.log ?? console.log;
  const snap = await db
    .collection('cards')
    // The published cards, their visibility asked below (no composite index for this one-off read).
    .where('publishedAt', '!=', null)
    .select('thoughtCore', 'story', 'excerpt', 'readMinutes', 'excerptAt', 'updatedAt', 'publishedAt', 'visibility', 'trashedAt', 'thin', 'signature.placeholder', 'summaryTranslations')
    .get();
  const candidates = snap.docs.filter((doc) => {
    const data = doc.data();
    if (data.visibility !== 'public' || data.trashedAt != null || unlistedCard(data)) return false;
    const card = listCard(doc.id, data);
    const title = String(data.thoughtCore ?? '');
    if (!translationTargets(title, String(data.story ?? '')).length) return false;
    // As a list shows it, and as makeSummaryTranslations reads it: the stored summary while it is current, else the
    // story's. Never the story's while a current summary stands — an older build's stored excerpt need not be what
    // today's summarize() makes of the same story, and such a card would be a candidate for ever (production,
    // 2026-11-16: 8 of 19 still counted after all 19 were made).
    const shown = (card.listing ?? summarize(data.story)).excerpt;
    return presentSummaryTranslations(card, title, shown) === null;
  });
  log(`published cards: ${snap.size}, public and listed without current translated titles and excerpts: ${candidates.length}`);
  const report: Record<SummaryTranslationsResult | 'candidates', number> = {
    candidates: candidates.length, made: 0, unchanged: 0, removed: 0, none: 0, 'not-found': 0, 'over-budget': 0, offline: 0, moved: 0, failed: 0,
  };
  if (!opts.apply) return report;
  const concurrency = opts.concurrency ?? 2;
  const pause = opts.pauseMs ?? 500;
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < candidates.length) {
        const doc = candidates[next++];
        const result = await makeSummaryTranslations(db, doc.id, { translate: opts.translate });
        report[result]++;
        if (result !== 'made') log(`  ${doc.id}: ${result}`);
        if (pause) await new Promise((r) => setTimeout(r, pause));
      }
    }),
  );
  log(`made ${report.made}, failed ${report.failed}, other ${candidates.length - report.made - report.failed}`);
  return report;
}
