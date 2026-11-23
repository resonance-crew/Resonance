import type { Firestore } from 'firebase-admin/firestore';
import { offersPassages, passagesCurrent, passagesHash, PASSAGES_TRIES_MAX, PASSAGES_VERSION, verifyPassages } from '../../src/lib/cards/tapPassages';
import { makeTapPassages, type TapPassagesOptions, type TapPassagesResult } from '../../src/lib/api/v1/tapPassagesMake';

/**
 * Cards whose tap passages aren't current get them made again (round 27 §P2.6; Wave 2 #3a): every published card out
 * of the trash, long enough to offer them, whose `tapPassages` weren't made from its story as it is now by this
 * version of the pick (`PASSAGES_VERSION`, stored as `tapPassages.v`; round 27's have none and count as 1) — made as a
 * publish makes them (makeTapPassages: one model call each, with the card's through line), `concurrency` at a time with
 * a pause between, so the model's rate limit is never met. Nobody's budget is charged (the owner runs it); no card's
 * `updatedAt` moves; a failure marks the card owed for the daily cron, as after a publish. Idempotent: a card done is no
 * candidate again until its story's words or the version change.
 *
 * Without `apply` it writes nothing: it counts the candidates by the version they hold, and with `preview` asks the
 * model for that many of them and prints what the new pick would offer beside what they offer now — still writing
 * nothing (the owner reads it before an `--apply`). `limit` caps how many an apply (or a preview) takes.
 */
export async function backfillTapPassages(
  db: Firestore,
  opts: {
    apply: boolean;
    log?: (line: string) => void;
    concurrency?: number;
    pauseMs?: number;
    pick?: TapPassagesOptions['pick'];
    limit?: number;
    preview?: number;
  },
) {
  const log = opts.log ?? console.log;
  const snap = await db
    .collection('cards')
    // The published cards, the rest asked below (no composite index for this one-off read).
    .where('publishedAt', '!=', null)
    .select('thoughtCore', 'story', 'publishedAt', 'trashedAt', 'tapPassages', 'signature.coreInsight')
    .get();
  const byVersion: Record<string, number> = {};
  const candidates = snap.docs.filter((doc) => {
    const data = doc.data();
    if (!offersPassages(data)) return false;
    const of = passagesHash(String(data.story ?? ''));
    const stored = data.tapPassages as { of?: unknown; v?: unknown; failed?: { of?: unknown; tries?: unknown } } | undefined;
    if (passagesCurrent(stored, of)) return false;
    // Left alone after its failures, until the story changes (as the cron leaves it).
    if (stored?.failed?.of === of && Number(stored.failed.tries) >= PASSAGES_TRIES_MAX) return false;
    const held = !stored ? 'none' : stored.of !== of ? 'stale story' : `v${typeof stored.v === 'number' ? stored.v : 1}`;
    byVersion[held] = (byVersion[held] ?? 0) + 1;
    return true;
  });
  log(`prompt version ${PASSAGES_VERSION}; published cards: ${snap.size}, long enough to offer passages and not current: ${candidates.length}`);
  log(`  by what they hold now: ${Object.entries(byVersion).map(([k, n]) => `${k} ${n}`).join(', ') || 'nothing'}`);
  const report: Record<TapPassagesResult | 'candidates', number> = {
    candidates: candidates.length, made: 0, unchanged: 0, none: 0, removed: 0, 'not-found': 0, 'over-budget': 0, failed: 0, 'given-up': 0, moved: 0,
  };
  const take = (n?: number) => (n !== undefined && n >= 0 ? candidates.slice(0, n) : candidates);

  if (!opts.apply) {
    if (opts.preview && opts.pick) {
      // What the new pick would offer, beside what the card offers now. Card ids only: no author, no handle.
      for (const doc of take(opts.preview)) {
        const data = doc.data();
        const story = String(data.story ?? '');
        const title = String(data.thoughtCore ?? '');
        const now = ((data.tapPassages as { items?: { text: string }[] } | undefined)?.items ?? []).map((i) => i.text);
        try {
          const answer = await opts.pick(title, story, { insight: (data.signature?.coreInsight as string | undefined) ?? null });
          const next = verifyPassages(story, answer.passages, { title }).map((i) => i.text);
          log(`\n${doc.id} (${answer.model})\n  now:  ${now.map((t) => `「${t}」`).join(' ') || '—'}\n  next: ${next.map((t) => `「${t}」`).join(' ') || '— (none)'}`);
        } catch (e) {
          log(`\n${doc.id}: the pick failed (${e instanceof Error ? e.message : String(e)})`);
        }
        if (opts.pauseMs ?? 500) await new Promise((r) => setTimeout(r, opts.pauseMs ?? 500));
      }
    }
    return report;
  }
  const todo = take(opts.limit);
  const concurrency = opts.concurrency ?? 2;
  const pause = opts.pauseMs ?? 500;
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < todo.length) {
        const doc = todo[next++];
        const result = await makeTapPassages(db, doc.id, { pick: opts.pick });
        report[result]++;
        if (result !== 'made') log(`  ${doc.id}: ${result}`);
        if (pause) await new Promise((r) => setTimeout(r, pause));
      }
    }),
  );
  log(`made ${report.made}, none ${report.none}, failed ${report.failed}, other ${todo.length - report.made - report.none - report.failed}`);
  return report;
}
