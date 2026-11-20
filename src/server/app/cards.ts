import { cardPagePaths, landingPagePaths } from '@/lib/api/revalidate';
import { ApiFailure } from '@/lib/api/v1/http';
import { refuseInTrash } from '@/lib/api/v1/inTrash';
import { toFeedCard } from '@/lib/api/v1/present';
import type { FeedCardBody, UpdateCardInput } from '@/lib/api/v1/schemas';
import { ANONYMOUS_VISIBILITY_MESSAGE, BLANK_CARD_MESSAGE, anonymousForConnections, blankForReaders, editedAudience } from '@/lib/db/firestore/cardContent';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { ServerCtx } from '@/server/ctx';
import { asSnap, becameReachable, cardOf, hiddenResonance } from '@/server/domain/cardsWrite';
import type { AudiencePatch, CardRow } from '@/server/ports/repos/cards';

/**
 * The card box's own changes to a card — its visibility, its byline, deleting
 * it — as application services on a ServerCtx (src/lib/api/v1/cards.ts keeps
 * the legacy `(db, …)` exports and says why each works as it does). Each
 * answers the logical pages it made stale (`stale`), which the caller drops
 * after its response (refreshPages) — never the author's profile.
 */

const notFound = () => new ApiFailure('not_found', 'No such card.');

export interface UpdatedCard {
  /** The card as its author's card box shows it (their byline kept when anonymous). */
  card: FeedCardBody;
  /** Card and landing pages to revalidate; empty when nothing changed. */
  stale: string[];
  /** The change made a published resonance reachable: the route reaches its original after the response (tryReachResonance). */
  reaches: boolean;
}

/** Drop `stale` from the page cache after the response (what the routes do with a service's `stale`). */
export function refreshPages(ctx: ServerCtx, stale: string[]): void {
  if (stale.length) ctx.later.later(() => ctx.pages.revalidate(stale), 'revalidate');
}

/** Change your card's visibility and/or anonymity (only the fields sent): src/lib/api/v1/cards.ts updateCard. */
export async function updateCardIn(ctx: ServerCtx, uid: string, id: string, input: UpdateCardInput): Promise<UpdatedCard> {
  if (isReservedId(id)) throw notFound();
  const { before, data, changed, author } = await ctx.uow.run(async (tx) => {
    const [stored, edit, me] = await Promise.all([tx.cards.getCardRow(id), tx.cards.getEditRow(id), tx.cards.getAuthorRow(uid)]);
    if (!stored || stored.authorId !== uid) throw notFound();
    // Nothing synced into its pending edit either: the restore sets that straight.
    refuseInTrash(asSnap(stored));
    const patch: AudiencePatch = {};
    if (input.visibility != null && input.visibility !== stored.visibility) patch.visibility = input.visibility;
    if (input.anonymous != null && input.anonymous !== (stored.anonymous === true)) patch.anonymous = input.anonymous;
    const changed = Object.keys(patch).length > 0;
    const after: CardRow = { ...stored, ...patch };
    // Never into anonymous and for connections only; a card already that way keeps it until changed.
    if (changed && anonymousForConnections(after)) throw new ApiFailure('invalid_request', ANONYMOUS_VISIBILITY_MESSAGE);
    // A published card shown to others again needs words in its story; a draft's audience is publishing's to judge.
    if (patch.visibility && stored.publishedAt != null && blankForReaders(after) && !blankForReaders(stored)) {
      throw new ApiFailure('invalid_request', BLANK_CARD_MESSAGE);
    }
    // Read before anything is written: what hiding a published resonance takes back.
    if (changed && hiddenResonance(after)) tx.cards.takeBack(await tx.cards.readTakeBack(uid, id));
    if (changed) {
      // A published card's story is as read here: its list summary is restated with the new updatedAt.
      // A draft gets one when it is published.
      tx.cards.setAudience(id, patch, stored.publishedAt != null ? { story: stored.story } : undefined);
      // The pending edit takes the change — and the card's other half of it, where the change alone would leave
      // the edit anonymous and for connections only (applying that would be refused).
      if (edit) {
        const both = { visibility: after.visibility, anonymous: after.anonymous === true };
        tx.cards.patchEdit(id, anonymousForConnections(editedAudience({ ...edit, ...patch }, after)) ? both : patch);
      }
    }
    return { before: stored, data: after, changed, author: me ?? undefined };
  }, { label: 'updateCard' });
  const card = cardOf(id, data);
  if (data.visibility !== before.visibility) {
    // The card has changed either way; the route answers it. A failure is logged — the recommended feed
    // still re-checks every card it shows.
    await Promise.resolve()
      .then(() => ctx.vectors.setVisibility(id, card.visibility))
      .catch((e) => ctx.log.error('[api/v1] vectors', id, e));
  }
  return {
    card: toFeedCard(card, author, { deanonymize: true }),
    stale: changed ? [...cardPagePaths(card), ...landingPagePaths(before, data)] : [],
    reaches: changed && becameReachable(before, data),
  };
}

export interface DeleteCardOptions {
  /** Only a card moved to the trash at or before this moment (the purge's cutoff, an emptying's start). */
  trashedBefore?: Date;
  /** Only a card in the trash (DELETE …?onlyIfTrashed=true): one restored meanwhile is 409 and stays. */
  onlyIfTrashed?: boolean;
}

export interface DeletedCard {
  /** Card and landing pages to revalidate (empty when nothing was deleted). */
  stale: string[];
  /** False when `trashedBefore` left the card as it was. */
  deleted: boolean;
}

/** What DELETE …?onlyIfTrashed=true refuses: a card no longer in the trash. */
export const NOT_IN_TRASH_MESSAGE = 'This card is not in the trash.';

/** Delete your card for good, draft or published: src/lib/api/v1/cards.ts deleteCard. */
export async function deleteCardIn(ctx: ServerCtx, uid: string, id: string, opts: DeleteCardOptions = {}): Promise<DeletedCard> {
  if (isReservedId(id)) throw notFound();
  const data = await ctx.uow.run(async (tx) => {
    const stored = await tx.cards.getCardRow(id);
    if (!stored || stored.authorId !== uid) throw notFound();
    const trashedAt = stored.trashedAt;
    if (opts.trashedBefore && !(trashedAt instanceof Date && trashedAt.getTime() <= opts.trashedBefore.getTime())) return null;
    if (opts.onlyIfTrashed && trashedAt == null) throw new ApiFailure('conflict', NOT_IN_TRASH_MESSAGE);
    // A resonance is taken back with it, read in this transaction: one pointed at the card a moment before
    // can't outlive it with its connection.
    tx.cards.takeBack(await tx.cards.readTakeBack(uid, id));
    tx.cards.deleteForGood(id, stored.slug);
    return stored;
  }, { label: 'deleteCard' });
  if (!data) return { stale: [], deleted: false };
  // The card is gone either way, so each clean-up below runs whatever the other does (side by side, each
  // failing alone): stray notes go with its author's account (or `backfill.ts orphan-notes`), and stray vectors
  // only cost the recommender a candidate it then can't read.
  await Promise.all([
    ctx.data.cards.deleteNotesOn(id).catch((e) => ctx.log.error('[api/v1] notes', id, e)),
    // Who resonated with it (taps) and how it was read (reading): about this card alone, gone with it.
    ctx.data.taps.deleteTapsOn(id).catch((e) => ctx.log.error('[api/v1] taps', id, e)),
    ctx.data.taps.deleteSignalsOn(id).catch((e) => ctx.log.error('[api/v1] reading', id, e)),
    Promise.resolve()
      .then(() => ctx.vectors.deleteByCard(id))
      .catch((e) => ctx.log.error('[api/v1] vectors', id, e)),
  ]);
  return { stale: [...cardPagePaths(cardOf(id, data)), ...landingPagePaths(data)], deleted: true };
}
