import { runPool } from './pool';
import { Timestamp, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { READER_SIGNALS } from '@/lib/api/v1/reading';
import { appsDraw } from './bellCapability';

/**
 * The weekly read summary (round 26 §R4, `/api/cron/read-summary`, Mondays
 * 01:00 UTC = 09:00 in Taipei): for each published public card, how many
 * readers — never its author — read it to the end in the seven days before
 * the run (`readerSignals.reachedEndAt`, lib/api/v1/reading). Three or more,
 * and the author gets one bell row, `notifications/rsum_{cardId}_{yyyymmdd}` =
 * `{ userId, type: 'read_summary', payload: { cardId, readers, reread,
 * anonymous?: true }, readAt, createdAt, pushedAt }` — 「上週有 {count} 個人把這張卡
 * 讀到最後」, with 「，有人回來又讀了一遍」 when one of them came back to read it
 * again that week (`reread`). Fewer than three, nothing: a count that small
 * could name its readers. Names never, at any count. A card for connections
 * only (or private by now) never gets one, at any count: its readers are
 * among the author's connections, who may be only three or four while few
 * connections exist, and a count of three could then name them all.
 *
 * A bell row only: written already pushed (`pushedAt`), so nothing rings a
 * phone for it (no switch is needed for what never buzzes). Like the tap's
 * row (./tapBell), it is written only when every app install the author has
 * registered declares `bell-read-summary`: an older build would draw its type
 * as a raw string. Opens the card. The row's id carries the run's day, so a
 * run repeated the same day writes nothing new.
 */
export const READ_SUMMARY = 'read_summary';
/** The capability an app build registers once it draws the `read_summary` row. */
export const BELL_READ_SUMMARY_CAPABILITY = 'bell-read-summary';
/** Fewer readers than this in a week, and the author hears nothing. */
export const READ_SUMMARY_MIN = 3;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The run's day, as yyyymmdd. */
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
/** The card's summary row for a run on the UTC day of `ms`. */
export const readSummaryId = (cardId: string, ms: number) => `rsum_${cardId}_${dayOf(ms)}`;

/** A reading record as the week's count needs it. */
export interface WeekRead {
  cardId: string;
  userId: string;
  /** When they last read it to the end (ms). */
  reachedEndAt: number;
  /** When they last came back to read it again (ms), if ever. */
  rereadAt: number | null;
}

export interface WeekTally {
  readers: number;
  reread: boolean;
}

/**
 * The week ending at `now`: each card's distinct readers who read it to the
 * end in [now − 7 days, now), and whether one of them read it again in that
 * time. Pure.
 */
export function weekTally(reads: WeekRead[], now: number): Map<string, WeekTally> {
  const since = now - WEEK_MS;
  const inWeek = (t: number | null) => t !== null && t >= since && t < now;
  const byCard = new Map<string, { readers: Set<string>; reread: boolean }>();
  for (const r of reads) {
    if (!inWeek(r.reachedEndAt)) continue;
    const entry = byCard.get(r.cardId) ?? { readers: new Set<string>(), reread: false };
    entry.readers.add(r.userId);
    entry.reread ||= inWeek(r.rereadAt);
    byCard.set(r.cardId, entry);
  }
  return new Map([...byCard].map(([id, e]) => [id, { readers: e.readers.size, reread: e.reread }]));
}

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

const PAGE = 500;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const millis = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);

/** The week's reading records, a page at a time (one range on reachedEndAt: its single-field index). */
async function weekReads(db: Firestore, now: number): Promise<WeekRead[]> {
  const out: WeekRead[] = [];
  let last: QueryDocumentSnapshot | null = null;
  for (;;) {
    let q = db
      .collection(READER_SIGNALS)
      .where('reachedEndAt', '>=', Timestamp.fromMillis(now - WEEK_MS))
      .where('reachedEndAt', '<', Timestamp.fromMillis(now))
      .orderBy('reachedEndAt')
      .select('cardId', 'userId', 'reachedEndAt', 'rereadAt')
      .limit(PAGE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    for (const d of page.docs) {
      const at = millis(d.get('reachedEndAt'));
      if (at !== null && str(d.get('cardId')) && str(d.get('userId'))) {
        out.push({ cardId: str(d.get('cardId')), userId: str(d.get('userId')), reachedEndAt: at, rereadAt: millis(d.get('rereadAt')) });
      }
    }
    if (page.size < PAGE) return out;
    last = page.docs[page.size - 1];
  }
}

/**
 * The week's summary rows (see above), as of `now`. Starts no card past
 * `deadline` (counted in `late`, for the log).
 */
export async function runReadSummary(db: Firestore, opts: { now?: number; deadline?: number; clock?: () => number } = {}): Promise<ReadSummaryRun> {
  const now = opts.now ?? Date.now();
  const clock = opts.clock ?? Date.now;
  const reads = await weekReads(db, now);
  const tally = weekTally(reads, now);
  const run: ReadSummaryRun = { cards: tally.size, rows: 0, held: 0, late: 0 };
  const byCard = new Map<string, WeekRead[]>();
  for (const r of reads) byCard.set(r.cardId, [...(byCard.get(r.cardId) ?? []), r]);
  const due = [...tally].filter(([id, t]) => t.readers >= READ_SUMMARY_MIN && !id.includes('/')).map(([id]) => id);
  // Whether an author's apps draw the row, asked once per author (B17), not once per card of theirs.
  const draws = new Map<string, Promise<boolean>>();
  const drawsFor = (author: string) => {
    if (!draws.has(author)) draws.set(author, appsDraw(db, author, BELL_READ_SUMMARY_CAPABILITY));
    return draws.get(author)!;
  };
  for (let i = 0; i < due.length; i += 100) {
    if (opts.deadline !== undefined && clock() >= opts.deadline) {
      run.late += due.length - i;
      break;
    }
    const chunk = due.slice(i, i + 100);
    const cards = await db.getAll(...chunk.map((id) => db.doc(`cards/${id}`)), {
      fieldMask: ['authorId', 'publishedAt', 'trashedAt', 'anonymous', 'visibility'],
    });
    // A chunk's rows written side by side, a few at a time (B17), not one after another.
    await runPool([...cards.entries()], 8, async ([j, card]) => {
      const cardId = chunk[j];
      const author = card.exists ? str(card.get('authorId')) : '';
      if (!author || author.includes('/') || card.get('publishedAt') == null || card.get('trashedAt') != null) return;
      // Public cards only (see above): a connections card's readers are a few people its author knows.
      if (card.get('visibility') !== 'public') return;
      // Its author's own reads were never kept; counted again without them all the same.
      const week = weekTally((byCard.get(cardId) ?? []).filter((r) => r.userId !== author), now).get(cardId);
      if (!week || week.readers < READ_SUMMARY_MIN) return;
      if (!(await drawsFor(author))) {
        run.held++;
        return;
      }
      const at = Timestamp.fromMillis(now);
      const written = await db
        .doc(`notifications/${readSummaryId(cardId, now)}`)
        .create({
          userId: author,
          type: READ_SUMMARY,
          payload: { cardId, readers: week.readers, reread: week.reread, ...(card.get('anonymous') === true ? { anonymous: true } : {}) },
          readAt: null,
          createdAt: at,
          // A bell row only: nothing pushes it.
          pushedAt: at,
        })
        .then(
          () => true,
          (e: { code?: number }) => {
            // Already written by a run earlier today.
            if (e?.code === 6) return false;
            throw e;
          },
        );
      if (written) run.rows++;
    }, { tag: '[read-summary]' });
  }
  return run;
}
