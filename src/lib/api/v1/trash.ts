import type { IVectorStore } from '@/lib/recommend/vectorStore';
import { emptyTrashIn, purgeExpiredTrashIn, restoreCardIn, trashCardIn, type EmptiedTrashResult, type PurgedTrash, type RestoredCardResult, type TrashedCardResult } from '@/server/app/trash';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';
import { legacyVectors } from './cards';

export type { EmptiedTrashResult, PurgedTrash, RestoredCardResult, TrashedCardResult } from '@/server/app/trash';

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
 * edit, its place on the thought map and the notes, taps (共振, ./taps) and
 * readers' reading records (./reading) on a named card stay. Those on an
 * anonymous card go as it goes in, as deleting it takes them: their writers'
 * backups ("Download my data") must lose them when the card's page goes,
 * never later with its author's account, which would say whose card it was —
 * and restoring it brings none back.
 *
 * Nothing about it answers anyone else differently from a private card,
 * with or without a block: someone else's card in the trash is not_found
 * everywhere, and the card's changes revalidate its own pages and the
 * landing page only — never its author's profile (see ./cards).
 */

// The services are src/server/app/trash.ts (trashCardIn, restoreCardIn, emptyTrashIn,
// purgeExpiredTrashIn), on a ServerCtx; these are their legacy facades on a given Firestore.

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
 * After the write: the notes, taps and reading records on an anonymous card
 * are deleted (notes delivered and withheld alike) before the answer — a
 * failure is logged, and left for `backfill.ts orphan-notes`; the
 * recommender's copy goes private. No reading record comes back while it is
 * in the trash: reportReading refuses a trashed card in its transaction.
 */
export function trashCard(
  db: AdminDb,
  uid: string,
  id: string,
  opts: { vectors?: Pick<IVectorStore, 'setVisibility'>; now?: number; forDeletion?: boolean } = {},
): Promise<TrashedCardResult> {
  return trashCardIn(ctxFor(db, { vectors: legacyVectors(opts.vectors) }), uid, id, { now: opts.now, forDeletion: opts.forDeletion });
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
export function restoreCard(
  db: AdminDb,
  uid: string,
  id: string,
  opts: { vectors?: Pick<IVectorStore, 'setVisibility'>; now?: number } = {},
): Promise<RestoredCardResult> {
  return restoreCardIn(ctxFor(db, { vectors: legacyVectors(opts.vectors) }), uid, id, { now: opts.now });
}

/**
 * Empty your trash (DELETE /me/trash), a page of cards per call: each is
 * deleted for good as 永久刪除 deletes one (deleteCard), but only while it is
 * still in the trash from before `before` (at most now) — so a card restored
 * on another device between the page's read and its delete stays, and so
 * does one moved to the trash while the emptying runs. The first call sends
 * no `before`; the next ones send the first answer's, while `remaining` and
 * `deleted` are both above 0. `deleted` counts only cards deleted. A call
 * starts no new delete after `budgetMs` (20 s: well inside the apps' 30 s
 * request timeout); clients call again for the rest.
 */
export function emptyTrash(
  db: AdminDb,
  uid: string,
  opts: { before?: Date | null; now?: number; vectors?: Pick<IVectorStore, 'deleteByCard'>; budgetMs?: number } = {},
): Promise<EmptiedTrashResult> {
  return emptyTrashIn(ctxFor(db, { vectors: legacyVectors(opts.vectors) }), uid, { before: opts.before, now: opts.now, budgetMs: opts.budgetMs });
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
export function purgeExpiredTrash(
  db: AdminDb,
  opts: { now?: number; budgetMs: number; vectors?: Pick<IVectorStore, 'deleteByCard'>; revalidate?: (paths: string[]) => unknown },
): Promise<PurgedTrash> {
  return purgeExpiredTrashIn(ctxFor(db, { vectors: legacyVectors(opts.vectors) }), { now: opts.now, budgetMs: opts.budgetMs, revalidate: opts.revalidate });
}
