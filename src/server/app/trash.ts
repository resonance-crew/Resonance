import { cardPagePaths, landingPagePaths } from '@/lib/api/revalidate';
import { ApiFailure } from '@/lib/api/v1/http';
import { toFeedCard } from '@/lib/api/v1/present';
import type { FeedCardBody } from '@/lib/api/v1/schemas';
import { DAY_MS, TRASH_DAYS, restorableVisibility, trashExpired, type TrashedFrom } from '@/lib/cards/trash';
import { anonymousForConnections, editedAudience } from '@/lib/db/firestore/cardContent';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { ServerCtx } from '@/server/ctx';
import { becameReachable, cardOf, docId, trashedFromOf, trashedMs } from '@/server/domain/cardsWrite';
import type { CardRow } from '@/server/ports/repos/cards';
import { deleteCardIn } from './cards';

/**
 * The trash (垃圾桶) as application services: moving a card in, bringing it
 * back, emptying it and the daily purge. src/lib/api/v1/trash.ts keeps the
 * legacy `(db, …)` exports and the module comment saying what a card in the
 * trash is and why.
 */

const notFound = () => new ApiFailure('not_found', 'No such card.');

export interface TrashedCardResult {
  /** The card as the trash shelf shows it (its byline kept when anonymous, its trash fields). */
  card: FeedCardBody;
  /** False when it was in the trash already: nothing was written. */
  changed: boolean;
  /** Card and landing pages to revalidate after the response (never returned). */
  stale: string[];
}

/** Move your card to the trash (POST /cards/{id}/trash): src/lib/api/v1/trash.ts trashCard. */
export async function trashCardIn(
  ctx: ServerCtx,
  uid: string,
  id: string,
  opts: { now?: number; forDeletion?: boolean } = {},
): Promise<TrashedCardResult> {
  if (isReservedId(id)) throw notFound();
  const now = opts.now ?? ctx.clock.now();
  const { before, after, changed, me } = await ctx.uow.run(async (tx) => {
    const [row, meRow] = await Promise.all([tx.cards.getCardRow(id), tx.cards.getAuthorRow(uid)]);
    if (!row || row.authorId !== uid) throw notFound();
    const at = trashedMs(row);
    if (at != null && trashExpired(at, now)) throw notFound();
    if (at != null || row.trashedAt != null) return { before: row, after: row, changed: false, me: meRow };
    // Read before anything is written: what taking a resonance back ends.
    tx.cards.takeBack(await tx.cards.readTakeBack(uid, id));
    const trashedFrom: TrashedFrom = {
      visibility: restorableVisibility(row.visibility),
      referenceCardId: docId(row.referenceCardId) ? row.referenceCardId : null,
    };
    const trashedAt = new Date(now);
    tx.cards.moveToTrash(id, trashedAt, trashedFrom, opts.forDeletion === true);
    const { referenceCardId: _parked, ...rest } = row;
    return { before: row, after: { ...rest, trashedAt, trashedFrom, visibility: 'private' }, changed: true, me: meRow };
  }, { label: 'trashCard' });
  const card = cardOf(id, after);
  if (changed) {
    const anonymous = before.anonymous === true;
    // Both before the answer, side by side, each failing alone; each clean-up once more on a failure.
    await Promise.all([
      // An anonymous card's notes go now, as deleting it takes them. Once more on a failure.
      anonymous ? twice(() => ctx.data.cards.deleteNotesOn(id)).catch((e) => ctx.log.error('[trash] notes', id, e)) : null,
      // And who resonated with it, for the same reason: restoring it brings none back.
      anonymous ? twice(() => ctx.data.taps.deleteTapsOn(id)).catch((e) => ctx.log.error('[trash] taps', id, e)) : null,
      // And how its readers read it: in their exports, it would end with its author's account.
      anonymous ? twice(() => ctx.data.taps.deleteSignalsOn(id)).catch((e) => ctx.log.error('[trash] reading', id, e)) : null,
      before.visibility !== 'private'
        ? Promise.resolve()
            .then(() => ctx.vectors.setVisibility(id, 'private'))
            .catch((e) => ctx.log.error('[trash] vectors', id, e))
        : null,
    ]);
  }
  return {
    card: toFeedCard(card, me ?? undefined, { deanonymize: true, own: true }),
    changed,
    stale: changed ? [...cardPagePaths(card), ...landingPagePaths(before, after)] : [],
  };
}

const twice = (work: () => Promise<void>) => work().catch(() => work());

export interface RestoredCardResult {
  /** The card as the card box shows it, out of the trash. */
  card: FeedCardBody;
  /** False when it wasn't in the trash: nothing was written. */
  changed: boolean;
  /** A resonance that came back on its own (it no longer answers the card it answered). */
  droppedResonance: boolean;
  /** The original author's bell, when bringing the resonance back reached them (never returned). */
  notificationId: string | null;
  /** Card and landing pages to revalidate after the response (never returned). */
  stale: string[];
}

/** Bring your card back from the trash (POST /cards/{id}/restore), as it was: src/lib/api/v1/trash.ts restoreCard. */
export async function restoreCardIn(ctx: ServerCtx, uid: string, id: string, opts: { now?: number } = {}): Promise<RestoredCardResult> {
  if (isReservedId(id)) throw notFound();
  const now = opts.now ?? ctx.clock.now();
  const result = await ctx.uow.run(async (tx) => {
    const [row, meRow, edit] = await Promise.all([tx.cards.getCardRow(id), tx.cards.getAuthorRow(uid), tx.cards.getEditRow(id)]);
    if (!row || row.authorId !== uid) throw notFound();
    const at = trashedMs(row);
    if (at != null && trashExpired(at, now)) throw notFound();
    if (at == null && row.trashedAt == null) {
      return { before: row, after: row, me: meRow, changed: false, dropped: false, bell: null };
    }
    const from = trashedFromOf(row);
    const original = from.referenceCardId;
    // Read before anything is written: who else of yours answers it, and all its reach depends on.
    const [answers, reach] = original ? await Promise.all([tx.cards.answersTo(uid, original, 2), tx.cards.readReach(uid, original)]) : [null, null];
    const repoint = !!original && original !== id && !answers!.some((other) => other !== id) && reach!.originalAnswers !== id;

    tx.cards.restore(id, from.visibility, repoint ? original : null);
    const { trashedAt: _at, trashedFrom: _from, trashedFor: _for, ...rest } = row;
    const after: CardRow = { ...rest, visibility: from.visibility, ...(repoint ? { referenceCardId: original } : {}) };
    // A pending edit saved since the card went in holds the trash's 'private': it takes the restored
    // visibility (and the byline beside it where the visibility alone would leave it anonymous and for
    // connections only). An older one is the author's own working copy and is left as it is.
    if (edit) {
      const saved = edit.updatedAt;
      if (!(saved instanceof Date && at != null && saved.getTime() < at)) {
        const patch = { visibility: after.visibility };
        const both = { visibility: after.visibility, anonymous: after.anonymous === true };
        tx.cards.patchEdit(id, anonymousForConnections(editedAudience({ ...edit, ...patch }, after)) ? both : patch);
      }
    }
    const bell = repoint && becameReachable(row, after) ? tx.cards.reachOriginal(id, after, reach!) : null;
    return { before: row, after, me: meRow, changed: true, dropped: !!original && !repoint, bell };
  }, { label: 'restoreCard' });
  const card = cardOf(id, result.after);
  if (result.changed && result.after.publishedAt != null && card.visibility !== 'private') {
    await Promise.resolve()
      .then(() => ctx.vectors.setVisibility(id, card.visibility))
      .catch((e) => ctx.log.error('[trash] vectors', id, e));
  }
  return {
    card: toFeedCard(card, result.me ?? undefined, { deanonymize: true, own: true }),
    changed: result.changed,
    droppedResonance: result.dropped,
    notificationId: result.bell,
    stale: result.changed ? [...cardPagePaths(card), ...landingPagePaths(result.before, result.after)] : [],
  };
}

/** How many cards a call empties from the trash, and how many at once. */
const EMPTY_PAGE = 50;
const EMPTY_AT_ONCE = 4;
/** A call starts no new delete after this long: well inside the apps' 30 s request timeout (trash.ts). */
const EMPTY_BUDGET_MS = 20_000;

export interface EmptiedTrashResult {
  deleted: number;
  remaining: number;
  /** The cut-off this emptying keeps to (ISO 8601): the next call sends it back. */
  before: string;
  /** Card and landing pages to revalidate after the response (never returned). */
  stale: string[];
}

/** Empty your trash (DELETE /me/trash), a page of cards per call: src/lib/api/v1/trash.ts emptyTrash. */
export async function emptyTrashIn(
  ctx: ServerCtx,
  uid: string,
  opts: { before?: Date | null; now?: number; budgetMs?: number } = {},
): Promise<EmptiedTrashResult> {
  const started = opts.now ?? ctx.clock.now();
  const cutoff = new Date(Math.min(opts.before?.getTime() ?? started, started));
  const ids = await ctx.data.cards.trashedIds(uid, cutoff, EMPTY_PAGE);
  const budget = opts.budgetMs ?? EMPTY_BUDGET_MS;
  const stale: string[] = [];
  let deleted = 0;
  await eachAtOnce(ids, EMPTY_AT_ONCE, () => ctx.clock.now() - started < budget, async (cardId) => {
    try {
      const done = await deleteCardIn(ctx, uid, cardId, { trashedBefore: cutoff });
      if (done.deleted) deleted += 1;
      stale.push(...done.stale);
    } catch (e) {
      // Gone already (another device emptied it, the cron purged it): nothing left to do.
      if (!(e instanceof ApiFailure && e.code === 'not_found')) ctx.log.error('[trash] empty', cardId, e);
    }
  });
  const remaining = await ctx.data.cards.countTrashed(uid, cutoff);
  return { deleted, remaining, before: cutoff.toISOString(), stale: [...new Set(stale)] };
}

/** How many cards the purge reads at a time, and deletes at once. */
const PURGE_PAGE = 50;
const PURGE_AT_ONCE = 4;

export interface PurgedTrash {
  purged: number;
  /** Restored (or moved there again) between the page's read and its delete: left. */
  skipped: number;
  failed: number;
  /** Read but not started: out of time (the next run takes them). */
  deferred: number;
  /** Every page the purged cards were on, revalidated as each went (see `revalidate`). */
  stale: string[];
}

/** The daily purge (/api/cron/purge-trash): src/lib/api/v1/trash.ts purgeExpiredTrash. */
export async function purgeExpiredTrashIn(
  ctx: ServerCtx,
  opts: { now?: number; budgetMs: number; revalidate?: (paths: string[]) => unknown },
): Promise<PurgedTrash> {
  const started = ctx.clock.now();
  const cutoff = new Date((opts.now ?? started) - TRASH_DAYS * DAY_MS);
  const report: PurgedTrash = { purged: 0, skipped: 0, failed: 0, deferred: 0, stale: [] };
  const inTime = () => ctx.clock.now() - started < opts.budgetMs;
  for await (const page of ctx.data.cards.expiredTrash(cutoff, PURGE_PAGE)) {
    const left = await eachAtOnce(page, PURGE_AT_ONCE, inTime, async (d) => {
      const author = d.authorId;
      if (typeof author !== 'string' || !author) {
        report.failed += 1;
        ctx.log.error('[trash] purge: no author', d.id);
        return;
      }
      try {
        const done = await deleteCardIn(ctx, author, d.id, { trashedBefore: cutoff });
        if (!done.deleted) {
          report.skipped += 1;
          return;
        }
        report.purged += 1;
        report.stale.push(...done.stale);
        if (done.stale.length) opts.revalidate?.(done.stale);
      } catch (e) {
        if (e instanceof ApiFailure && e.code === 'not_found') report.skipped += 1;
        else {
          report.failed += 1;
          ctx.log.error('[trash] purge', d.id, e);
        }
      }
    });
    report.deferred += left;
    if (left) break;
  }
  ctx.log.info(`[trash] purged ${report.purged} · skipped ${report.skipped} · failed ${report.failed} · deferred ${report.deferred}`);
  return report;
}

/** Run `work` on each item, `atOnce` at a time, starting none once `go()` says no; answers how many were never started. */
async function eachAtOnce<T>(items: T[], atOnce: number, go: () => boolean, work: (item: T) => Promise<void>): Promise<number> {
  let next = 0;
  let stopped = false;
  const lane = async () => {
    while (next < items.length) {
      if (!go()) {
        stopped = true;
        return;
      }
      await work(items[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, items.length) }, lane));
  return stopped ? items.length - next : 0;
}
