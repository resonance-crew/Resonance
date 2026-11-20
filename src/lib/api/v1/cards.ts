import { getVectorStore, type IVectorStore } from '@/lib/recommend/vectorStore';
import { deleteCardIn, updateCardIn, type DeletedCard, type UpdatedCard } from '@/server/app/cards';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';
import { deleteNotesOn as deleteNotesIn } from '@/server/infra/firestore/repos/cards';
import type { VectorStore } from '@/server/ports/vectors';
import type { UpdateCardInput } from './schemas';

export { NOT_IN_TRASH_MESSAGE, type DeletedCard, type UpdatedCard } from '@/server/app/cards';

/**
 * The card box's own changes to a card — its visibility, its byline, deleting
 * it — made by the server. The author can still change the first two straight
 * from the client (the rules allow it for the builds that do), but not on a
 * published resonance, whose take-back only the server runs; and the client
 * deletes drafts only, since deleting a published card deletes the notes left
 * on it, which only the server reaches. Only a server path can drop the
 * cached pages that showed the card as it was: each answers the logical paths
 * now stale (`stale`: the card, the landing page when it could be listed
 * there), which the route revalidates after its response.
 *
 * Never the author's profile (/u/{handle}): its HTML is a shell and the
 * person's own metadata, holding no cards (the page reads them in the
 * browser), so dropping it shows a reader nothing new — but it does start
 * that page's cache afresh at the very moment a card changed, and someone
 * watching an anonymous card vanish or come back could then find the one
 * profile whose cache started over then. The profile is revalidated where
 * the profile itself changes (POST/PATCH /me, the account purge).
 *
 * The services are src/server/app/cards.ts (updateCardIn, deleteCardIn), on a
 * ServerCtx; these are their legacy facades on a given Firestore.
 */

/**
 * The vectors a legacy call reaches: those it was handed, else the app's own
 * store (getVectorStore, which the emulator suites mock) — asked for only when
 * used, inside the service's own catch, as before.
 */
export function legacyVectors(given?: Partial<IVectorStore>): VectorStore {
  return new Proxy({} as VectorStore, {
    get: (_t, key) => (...args: unknown[]) => {
      const store = (given ?? getVectorStore()) as unknown as Record<PropertyKey, (...a: unknown[]) => unknown>;
      return store[key](...args);
    },
  });
}

/**
 * Change your card's visibility and/or anonymity (only the fields sent).
 * Someone else's card is as absent as a missing one. An anonymous card is
 * public or private: a change that would leave it anonymous and for
 * connections only is refused (`invalid_request`, anonymousForConnections) —
 * one already that way changes nothing until either is sent. A pending edit
 * (edits/current) carries the same two fields: it takes the change too, or
 * applying it later would quietly undo it. The recommendation vectors keep
 * their own copy of the visibility (the candidate pool's filter): a new one
 * reaches them too, so a card made private or connections-only stops being
 * recommended to others — and one made public again rejoins the pool.
 *
 * A card in the trash changes nothing until it is restored: 409 'This card
 * is in the trash.' (asked after it is known to be yours: someone else's is
 * not_found, in the trash or not).
 *
 * A published resonance made public under its writer's name — published
 * private, connections-only or anonymous, it reached no one — now reaches the
 * original's author as publishing it so would have (`reaches`: the route
 * runs tryReachResonance after its response, so the answer never waits on
 * it): the two connected, their bell rung, once for each reader and card
 * whatever path rings it. The reach reads the card again, as it is then.
 * One made private, connections-only or anonymous no longer stands under its
 * original: it is taken back in the same transaction, as unresonate takes it
 * back (hiddenResonance, ./origins) — the connection goes with it when
 * nothing else holds it.
 */
export function updateCard(
  db: AdminDb,
  uid: string,
  id: string,
  input: UpdateCardInput,
  vectors?: Pick<IVectorStore, 'setVisibility'>,
): Promise<UpdatedCard> {
  return updateCardIn(ctxFor(db, { vectors: legacyVectors(vectors) }), uid, id, input);
}

export interface DeleteCardOptions {
  vectors?: Pick<IVectorStore, 'deleteByCard'>;
  /**
   * Only a card moved to the trash at or before this moment (the purge
   * cron's cutoff, the start of an emptying): one restored since, or moved
   * there again later, is left as it is — `deleted: false`, nothing written.
   * A Firestore Timestamp, or anything with its `toMillis()`.
   */
  trashedBefore?: { toMillis(): number };
  /**
   * Only a card in the trash (DELETE /cards/{id}?onlyIfTrashed=true, what the
   * trash's own 永久刪除 sends): one restored meanwhile — from another
   * device, a shelf on screen since before — is 409 'This card is not in the
   * trash.' and stays.
   */
  onlyIfTrashed?: boolean;
}

/**
 * Delete your card for good, draft or published — the only way a published
 * one goes (the rules let a client delete a draft alone) — with what only the
 * server can reach: its pending edit (a subcollection a client's delete
 * leaves behind), the notes left on it, who resonated with it (its taps), how
 * it was read (its reading records) and its recommendation vectors. Links
 * and resonances pointing at it dangle, as they always have: readers resolve
 * a missing card to nothing. A card in the trash is deleted the same way (the
 * trash's 永久刪除, emptying it, its daily purge; `trashedBefore` and
 * `onlyIfTrashed` hold those to the cards still there), and so is any card an
 * installed app build deletes: its 刪除 says it can't be undone. Answers the
 * stale pages.
 *
 * A resonance is taken back with it, as unresonate takes it back
 * (readTakeBack): read in the transaction that deletes the card, so a
 * resonance pointed at a card a moment before can't outlive it with its
 * connection. Its pending edit goes in that same transaction, and the card
 * leaves a tombstone (and its slug retired) there too. The notes go just
 * after the card — once it is gone no note can land on it — so they leave
 * their writers' backups when the card's page goes, never later with its
 * author's account, which would say whose card it was.
 */
export function deleteCard(db: AdminDb, uid: string, id: string, opts: DeleteCardOptions = {}): Promise<DeletedCard> {
  return deleteCardIn(ctxFor(db, { vectors: legacyVectors(opts.vectors) }), uid, id, {
    trashedBefore: opts.trashedBefore ? new Date(opts.trashedBefore.toMillis()) : undefined,
    onlyIfTrashed: opts.onlyIfTrashed,
  });
}

/** Every note left on the card `id`, delivered or withheld, a batch at a time. */
export function deleteNotesOn(db: AdminDb, id: string): Promise<void> {
  return deleteNotesIn(db, id);
}
