import { FieldValue, Timestamp, type DocumentData, type DocumentSnapshot, type Firestore, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { DAY_MS, TRASH_DAYS, restorableVisibility, trashExpired, type TrashedFrom } from '@/lib/cards/trash';
import { anonymousForConnections, editedAudience } from '@/lib/db/firestore/cardContent';
import { mapCard } from '@/lib/db/firestore/mapper';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { getVectorStore, type IVectorStore } from '@/lib/recommend/vectorStore';
import { cardPagePaths, landingPagePaths } from '@/lib/api/revalidate';
import { deleteCard, deleteNotesOn } from './cards';
import { ApiFailure } from './http';
import { readTakeBack, takeBack } from './origins';
import { toFeedCard } from './present';
import { becameReachable, reachOriginal, readReach } from './resonate';
import type { FeedCardBody } from './schemas';

/**
 * The trash (垃圾桶): a card its author deletes on the web or in a current
 * app goes here first, and is deleted for good TRASH_DAYS later
 * (purgeExpiredTrash, the daily cron), or at once when they choose 永久刪除
 * (DELETE /cards/{id}?onlyIfTrashed=true) or 清空垃圾桶 (emptyTrash).
 *
 * A card in the trash stays where it is, `cards/{id}`, flagged and made
 * private by the server alone (the rules refuse every client write to it):
 *
 * - `trashedAt`: when it went in (the server's time, taken in the
 *   transaction); `trashedFrom`: `{ visibility, referenceCardId }`, what
 *   restoring it brings back;
 * - `visibility: 'private'`: everyone but its author already treats a private
 *   card as absent — every public query, the rules' reads, the card page, the
 *   share image, picks and pushes, bookmarks, notes and resonances to it — so
 *   nothing on the public side has to know about the trash;
 * - `referenceCardId` parked in `trashedFrom`: every "one resonance per
 *   reader per original" reader then ignores it, installed builds too.
 *
 * Its slug (the URL comes back), its dates (a draft keeps its place in edit
 * order, no list summary is retired), its story and the rest, its pending
 * edit, its place on the thought map and the notes on a named card stay.
 * The notes on an anonymous card go as it goes in, as deleting it takes
 * them: their writers' backups must lose them when the card's page goes,
 * never later with its author's account, which would say whose card it was.
 *
 * Nothing about it answers anyone else differently from a private card,
 * with or without a block: someone else's card in the trash is not_found
 * everywhere, and the card's changes revalidate its own pages and the
 * landing page only — never its author's profile (see ./cards).
 */

const notFound = () => new ApiFailure('not_found', 'No such card.');

/** A document id that can be put in a path (a stored field could hold anything). */
const docId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.includes('/') && !isReservedId(v);

/** When a stored card went into the trash, in ms; null for one that isn't there (or an odd value, read as not there). */
function trashedMs(data: DocumentData | undefined): number | null {
  const at = data?.trashedAt;
  return at instanceof Timestamp ? at.toMillis() : null;
}

/** A stored `trashedFrom` as the trash reads it: what restoring brings back. */
function trashedFromOf(data: DocumentData): TrashedFrom {
  const from = data.trashedFrom && typeof data.trashedFrom === 'object' ? (data.trashedFrom as DocumentData) : {};
  return {
    visibility: restorableVisibility(from.visibility),
    referenceCardId: docId(from.referenceCardId) ? from.referenceCardId : null,
  };
}

export interface TrashedCardResult {
  /** The card as the trash shelf shows it (its byline kept when anonymous, its trash fields). */
  card: FeedCardBody;
  /** False when it was in the trash already: nothing was written. */
  changed: boolean;
  /** Card and landing pages to revalidate after the response (never returned). */
  stale: string[];
}

/**
 * Move your card to the trash (POST /cards/{id}/trash). Someone else's card,
 * a missing one and one of yours past its purge date are all not_found, with
 * a missing card's very body. A card in the trash already changes nothing:
 * the first move's `trashedAt` and `trashedFrom` stand, so its thirty days
 * don't start again and a second move can't record the trash's own
 * 'private' as what to restore.
 *
 * A resonance is taken back, as hiding it is (readTakeBack, in this
 * transaction): no longer a reason the two of you are connected, and the
 * connection goes when no other reason holds it. Restoring it never brings
 * that connection back — its bell is the record that it rang once.
 *
 * After the write: the notes on an anonymous card are deleted (delivered and
 * withheld alike) before the answer — a failure is logged, and left for
 * `backfill.ts orphan-notes`; the recommender's copy goes private.
 */
export async function trashCard(
  db: Firestore,
  uid: string,
  id: string,
  opts: { vectors?: Pick<IVectorStore, 'setVisibility'>; now?: number } = {},
): Promise<TrashedCardResult> {
  if (isReservedId(id)) throw notFound();
  const now = opts.now ?? Date.now();
  const ref = db.doc(`cards/${id}`);
  const { before, after, changed, me } = await db.runTransaction(async (tx) => {
    const [snap, meSnap] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`))]);
    if (!snap.exists || snap.get('authorId') !== uid) throw notFound();
    const data = snap.data()!;
    const at = trashedMs(data);
    if (at != null && trashExpired(at, now)) throw notFound();
    if (at != null || data.trashedAt != null) return { before: data, after: data, changed: false, me: meSnap.data() };
    // Read before anything is written: what taking a resonance back ends.
    const plans = await readTakeBack(tx, db, uid, id);
    takeBack(tx, plans);
    const trashedFrom: TrashedFrom = {
      visibility: restorableVisibility(data.visibility),
      referenceCardId: docId(data.referenceCardId) ? data.referenceCardId : null,
    };
    const trashedAt = Timestamp.fromMillis(now);
    // Never updatedAt nor excerptAt: a draft keeps its place in edit order, a list its stored summary.
    tx.update(ref, { trashedAt, trashedFrom, visibility: 'private', referenceCardId: FieldValue.delete() });
    const { referenceCardId: _parked, ...rest } = data;
    return { before: data, after: { ...rest, trashedAt, trashedFrom, visibility: 'private' }, changed: true, me: meSnap.data() };
  });
  const card = mapCard(id, after);
  if (changed) {
    // An anonymous card's notes go now, as deleting it takes them (see the module comment). Once more on a failure.
    if (before.anonymous === true) {
      await deleteNotesOn(db, id)
        .catch(() => deleteNotesOn(db, id))
        .catch((e) => console.error('[trash] notes', id, e));
    }
    if (before.visibility !== 'private') {
      await Promise.resolve()
        .then(() => (opts.vectors ?? getVectorStore()).setVisibility(id, 'private'))
        .catch((e) => console.error('[trash] vectors', id, e));
    }
  }
  return {
    card: toFeedCard(card, me, { deanonymize: true, own: true }),
    changed,
    stale: changed ? [...cardPagePaths(card), ...landingPagePaths(before, after)] : [],
  };
}

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

/**
 * Bring your card back from the trash (POST /cards/{id}/restore), as it was:
 * its visibility exactly (a legacy anonymous card for connections only too:
 * never migrate one), its place, its slug, its pending edit. Someone else's,
 * a missing one and one past its purge date are not_found; one not in the
 * trash changes nothing.
 *
 * A resonance comes back answering its original as making a hidden one
 * public again does (un-hiding): whatever has become of the original — gone,
 * private, in the trash, across a block — it points at it again, and only
 * reaches anyone as PATCH would. Two things keep it from coming back as one,
 * and then it comes back on its own (`droppedResonance`, one flag for both,
 * which never says why): another card of yours answers that original now (a
 * reader answers a card once), or the original answers this card (a card
 * can't answer one answering it).
 *
 * The reach runs in this transaction (reachOriginal), so it can't go missing:
 * the bell `resonance_{you}_{original}` rang once ever, so a resonance taken
 * back when it went to the trash rings no one and connects no one now — a
 * connection that ended then doesn't come back; between two still connected
 * it is a reason again. One that never reached anyone (published across a
 * block since lifted, or before a pen name) rings now, once, as making it
 * public would.
 *
 * A pending edit saved after the card went in (a save racing the trash)
 * holds the trash's 'private': it takes the restored visibility, or applying
 * it would hide the card again. An older one is the author's own working
 * copy from before and is left as it is.
 *
 * Never re-dates the card, never announces it to connections (that is a first
 * publish's alone), never asks an LLM.
 */
export async function restoreCard(
  db: Firestore,
  uid: string,
  id: string,
  opts: { vectors?: Pick<IVectorStore, 'setVisibility'>; now?: number } = {},
): Promise<RestoredCardResult> {
  if (isReservedId(id)) throw notFound();
  const now = opts.now ?? Date.now();
  const ref = db.doc(`cards/${id}`);
  const editRef = db.doc(`cards/${id}/edits/current`);
  const result = await db.runTransaction(async (tx) => {
    const [snap, meSnap, edit] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`)), tx.get(editRef)]);
    if (!snap.exists || snap.get('authorId') !== uid) throw notFound();
    const data = snap.data()!;
    const at = trashedMs(data);
    if (at != null && trashExpired(at, now)) throw notFound();
    if (at == null && data.trashedAt == null) {
      return { before: data, after: data, me: meSnap.data(), changed: false, dropped: false, bell: null };
    }
    const from = trashedFromOf(data);
    const original = from.referenceCardId;
    // Read before anything is written: who else of yours answers it, and all its reach depends on.
    const [answers, reach] = original
      ? await Promise.all([
          tx.get(db.collection('cards').where('authorId', '==', uid).where('referenceCardId', '==', original).limit(2)),
          readReach(tx, db, uid, original),
        ])
      : [null, null];
    const repoint =
      !!original && original !== id && !answers!.docs.some((d) => d.id !== id) && reach!.original?.referenceCardId !== id;

    const restored: Record<string, unknown> = {
      visibility: from.visibility,
      trashedAt: FieldValue.delete(),
      trashedFrom: FieldValue.delete(),
      ...(repoint ? { referenceCardId: original } : {}),
    };
    tx.update(ref, restored);
    const { trashedAt: _at, trashedFrom: _from, ...rest } = data;
    const after: DocumentData = { ...rest, visibility: from.visibility, ...(repoint ? { referenceCardId: original } : {}) };
    alignPendingEdit(tx, edit, after, at);
    const bell = repoint && becameReachable(data, after) ? reachOriginal(tx, db, id, after, reach!) : null;
    return { before: data, after, me: meSnap.data(), changed: true, dropped: !!original && !repoint, bell };
  });
  const card = mapCard(id, result.after);
  if (result.changed && result.after.publishedAt != null && card.visibility !== 'private') {
    await Promise.resolve()
      .then(() => (opts.vectors ?? getVectorStore()).setVisibility(id, card.visibility))
      .catch((e) => console.error('[trash] vectors', id, e));
  }
  return {
    card: toFeedCard(card, result.me, { deanonymize: true, own: true }),
    changed: result.changed,
    droppedResonance: result.dropped,
    notificationId: result.bell,
    stale: result.changed ? [...cardPagePaths(card), ...landingPagePaths(result.before, result.after)] : [],
  };
}

/**
 * The restore's part in a pending edit (see restoreCard): one saved since the
 * card went in takes the restored visibility — and the card's byline beside
 * it where the visibility alone would leave the edit anonymous and for
 * connections only (applying that is refused), as a PATCH carries a change
 * into one.
 */
function alignPendingEdit(
  tx: Transaction,
  edit: DocumentSnapshot,
  card: DocumentData,
  trashedAt: number | null,
): void {
  if (!edit.exists) return;
  const saved = edit.get('updatedAt');
  if (saved instanceof Timestamp && trashedAt != null && saved.toMillis() < trashedAt) return;
  const patch = { visibility: card.visibility };
  const both = { visibility: card.visibility, anonymous: card.anonymous === true };
  tx.update(edit.ref, anonymousForConnections(editedAudience({ ...edit.data(), ...patch }, card)) ? both : patch);
}

/** How many cards a call empties from the trash, and how many at once. */
const EMPTY_PAGE = 50;
const EMPTY_AT_ONCE = 4;
/**
 * A call starts no new delete after this long (its route's maxDuration is 60 s): well inside the
 * apps' 30 s request timeout, so a long page answers before an app gives up on it while the server
 * goes on deleting (the dialog then said 沒完成 over an empty trash). Clients call again for the rest.
 */
const EMPTY_BUDGET_MS = 20_000;

export interface EmptiedTrashResult {
  deleted: number;
  remaining: number;
  /** The cut-off this emptying keeps to (ISO 8601): the next call sends it back. */
  before: string;
  /** Card and landing pages to revalidate after the response (never returned). */
  stale: string[];
}

/**
 * Empty your trash (DELETE /me/trash), a page of cards per call: each is
 * deleted for good as 永久刪除 deletes one (deleteCard), but only while it is
 * still in the trash from before `before` (at most now) — so a card restored
 * on another device between the page's read and its delete stays, and so
 * does one moved to the trash while the emptying runs. The first call sends
 * no `before`; the next ones send the first answer's, while `remaining` and
 * `deleted` are both above 0. `deleted` counts only cards deleted.
 */
export async function emptyTrash(
  db: Firestore,
  uid: string,
  opts: { before?: Date | null; now?: number; vectors?: Pick<IVectorStore, 'deleteByCard'>; budgetMs?: number } = {},
): Promise<EmptiedTrashResult> {
  const started = opts.now ?? Date.now();
  const cutoff = Timestamp.fromMillis(Math.min(opts.before?.getTime() ?? started, started));
  // Ordered as the (authorId, trashedAt desc) index is, the count too: unordered, a range on
  // trashedAt orders it ascending, which asks for an index no one made — the page went, then
  // the count failed, and every emptying answered 500 with the trash already empty.
  const inTrash = db.collection('cards').where('authorId', '==', uid).where('trashedAt', '<=', cutoff).orderBy('trashedAt', 'desc');
  const page = await inTrash.select().limit(EMPTY_PAGE).get();
  const budget = opts.budgetMs ?? EMPTY_BUDGET_MS;
  const stale: string[] = [];
  let deleted = 0;
  await eachAtOnce(page.docs, EMPTY_AT_ONCE, () => Date.now() - started < budget, async (d) => {
    try {
      const done = await deleteCard(db, uid, d.id, { trashedBefore: cutoff, vectors: opts.vectors });
      if (done.deleted) deleted += 1;
      stale.push(...done.stale);
    } catch (e) {
      // Gone already (another device emptied it, the cron purged it): nothing left to do.
      if (!(e instanceof ApiFailure && e.code === 'not_found')) console.error('[trash] empty', d.id, e);
    }
  });
  const remaining = (await inTrash.count().get()).data().count;
  return { deleted, remaining, before: cutoff.toDate().toISOString(), stale: [...new Set(stale)] };
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

/**
 * The daily purge (/api/cron/purge-trash): every card in the trash for
 * TRASH_DAYS or more, deleted for good as 永久刪除 deletes one, from the
 * longest there — each only while it still is (`trashedBefore`: a restore
 * racing the purge wins). Pages through the trash with startAfter, so a
 * card whose delete keeps failing never holds back the rest; starts nothing
 * new past `budgetMs`. Each card's pages are revalidated as it goes. An
 * account purged first takes its trash with it (collectAccountData reads
 * cards by author, in the trash or not).
 */
export async function purgeExpiredTrash(
  db: Firestore,
  opts: { now?: number; budgetMs: number; vectors?: Pick<IVectorStore, 'deleteByCard'>; revalidate?: (paths: string[]) => unknown },
): Promise<PurgedTrash> {
  const started = Date.now();
  const cutoff = Timestamp.fromMillis((opts.now ?? started) - TRASH_DAYS * DAY_MS);
  const report: PurgedTrash = { purged: 0, skipped: 0, failed: 0, deferred: 0, stale: [] };
  const inTime = () => Date.now() - started < opts.budgetMs;
  let last: QueryDocumentSnapshot | null = null;
  for (;;) {
    let q = db.collection('cards').where('trashedAt', '<=', cutoff).orderBy('trashedAt', 'asc').select('authorId', 'trashedAt').limit(PURGE_PAGE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    last = page.docs[page.size - 1];
    const left = await eachAtOnce(page.docs, PURGE_AT_ONCE, inTime, async (d) => {
      const author = d.get('authorId');
      if (typeof author !== 'string' || !author) {
        report.failed += 1;
        console.error('[trash] purge: no author', d.id);
        return;
      }
      try {
        const done = await deleteCard(db, author, d.id, { trashedBefore: cutoff, vectors: opts.vectors });
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
          console.error('[trash] purge', d.id, e);
        }
      }
    });
    report.deferred += left;
    if (left || page.size < PURGE_PAGE) break;
  }
  console.log(`[trash] purged ${report.purged} · skipped ${report.skipped} · failed ${report.failed} · deferred ${report.deferred}`);
  return report;
}

/**
 * Run `work` on each item, `atOnce` at a time, starting none once `go()`
 * says no; answers how many were never started.
 */
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
