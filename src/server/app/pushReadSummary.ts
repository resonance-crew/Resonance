import { runPool } from '@/lib/push/pool';
import type { ServerCtx } from '@/server/ctx';
import { BELL_READ_SUMMARY_CAPABILITY, READ_SUMMARY, READ_SUMMARY_MIN, WEEK_MS, readSummaryId, weekTally, type WeekRead } from '@/server/domain/push/readSummary';
import { bellChanged } from '@/server/domain/realtimeInbox';
import { signal } from './inbox';
import { appsDrawIn } from './pushDevices';

/** The weekly read summary's bell rows (`/api/cron/read-summary`; lib/push/readSummary tells the story). */

export interface ReadSummaryRun {
  /** Cards read to the end by anyone that week. */
  cards: number;
  /** Rows written. */
  rows: number;
  /** Cards with READ_SUMMARY_MIN readers whose author has an app build that can't draw the row. */
  held: number;
  /** Cards the run had no time left for. */
  late: number;
}

/** The week's summary rows, as of `now`. Starts no card past `deadline` (counted in `late`, for the log). */
export async function runReadSummaryIn(ctx: ServerCtx, opts: { now?: number; deadline?: number; clock?: () => number } = {}): Promise<ReadSummaryRun> {
  const now = opts.now ?? ctx.clock.now();
  const clock = opts.clock ?? (() => ctx.clock.now());
  const bell = ctx.data.bell;
  const reads = await bell.listReachedEnd(now - WEEK_MS, now);
  const tally = weekTally(reads, now);
  const run: ReadSummaryRun = { cards: tally.size, rows: 0, held: 0, late: 0 };
  const byCard = new Map<string, WeekRead[]>();
  for (const r of reads) byCard.set(r.cardId, [...(byCard.get(r.cardId) ?? []), r]);
  const due = [...tally].filter(([id, t]) => t.readers >= READ_SUMMARY_MIN && !id.includes('/')).map(([id]) => id);
  // Whether an author's apps draw the row, asked once per author (B17), not once per card of theirs.
  const draws = new Map<string, Promise<boolean>>();
  const drawsFor = (author: string) => {
    if (!draws.has(author)) draws.set(author, appsDrawIn(ctx, author, BELL_READ_SUMMARY_CAPABILITY));
    return draws.get(author)!;
  };
  for (let i = 0; i < due.length; i += 100) {
    if (opts.deadline !== undefined && clock() >= opts.deadline) {
      run.late += due.length - i;
      break;
    }
    const chunk = due.slice(i, i + 100);
    const cards = await bell.getSummaryCards(chunk);
    // A chunk's rows written side by side, a few at a time (B17), not one after another.
    await runPool(
      [...cards.entries()],
      8,
      async ([j, card]) => {
        const cardId = chunk[j];
        const author = card?.authorId ?? '';
        if (!card || !author || author.includes('/') || !card.published || card.trashed) return;
        // Public cards only: a connections card's readers are a few people its author knows.
        if (card.visibility !== 'public') return;
        // Its author's own reads were never kept; counted again without them all the same.
        const week = weekTally((byCard.get(cardId) ?? []).filter((r) => r.userId !== author), now).get(cardId);
        if (!week || week.readers < READ_SUMMARY_MIN) return;
        if (!(await drawsFor(author))) {
          run.held++;
          return;
        }
        const written = await bell.insertIfAbsent(readSummaryId(cardId, now), {
          userId: author,
          type: READ_SUMMARY,
          payload: { cardId, readers: week.readers, reread: week.reread, ...(card.anonymous ? { anonymous: true } : {}) },
          // A bell row only: nothing pushes it.
          atMs: now,
        });
        if (written === 'inserted') {
          run.rows++;
          await signal(ctx, bellChanged(author));
        }
      },
      { tag: '[read-summary]' },
    );
  }
  return run;
}
