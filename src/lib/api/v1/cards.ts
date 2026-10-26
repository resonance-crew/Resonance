import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ANONYMOUS_VISIBILITY_MESSAGE, anonymousForConnections, editedAudience } from '@/lib/db/firestore/cardContent';
import { mapCard } from '@/lib/db/firestore/mapper';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { getVectorStore, type IVectorStore } from '@/lib/recommend/vectorStore';
import { cardPagePaths, landingPagePaths } from '@/lib/api/revalidate';
import { ApiFailure } from './http';
import { refuseInTrash } from './inTrash';
import { readTakeBack, takeBack } from './origins';
import { toFeedCard } from './present';
import { becameReachable, hiddenResonance } from './resonate';
import { summaryFields } from './summary';
import type { FeedCardBody, UpdateCardInput } from './schemas';

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
export async function updateCard(
  db: Firestore,
  uid: string,
  id: string,
  input: UpdateCardInput,
  vectors?: Pick<IVectorStore, 'setVisibility'>,
): Promise<UpdatedCard> {
  if (isReservedId(id)) throw notFound();
  const ref = db.doc(`cards/${id}`);
  const editRef = db.doc(`cards/${id}/edits/current`);
  const { before, data, changed, author } = await db.runTransaction(async (tx) => {
    const [snap, edit, me] = await Promise.all([tx.get(ref), tx.get(editRef), tx.get(db.doc(`users/${uid}`))]);
    if (!snap.exists || snap.get('authorId') !== uid) throw notFound();
    // Nothing synced into its pending edit either: the restore sets that straight.
    refuseInTrash(snap);
    const patch: Record<string, unknown> = {};
    if (input.visibility != null && input.visibility !== snap.get('visibility')) patch.visibility = input.visibility;
    if (input.anonymous != null && input.anonymous !== (snap.get('anonymous') === true)) patch.anonymous = input.anonymous;
    const changed = Object.keys(patch).length > 0;
    const after = { ...snap.data()!, ...patch };
    // Never into anonymous and for connections only; a card already that way keeps it until changed.
    if (changed && anonymousForConnections(after)) throw new ApiFailure('invalid_request', ANONYMOUS_VISIBILITY_MESSAGE);
    // Read before anything is written: what hiding a published resonance takes back.
    const plans = changed && hiddenResonance(after) ? await readTakeBack(tx, db, uid, id) : [];
    takeBack(tx, plans);
    if (changed) {
      // A published card's story is as read here: its list summary is restated
      // with the new updatedAt (./summary). A draft gets one when it is published.
      const summary = snap.get('publishedAt') != null ? summaryFields(snap.get('story')) : {};
      tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp(), ...summary });
      // The pending edit takes the change — and the card's other half of it,
      // where the change alone would leave the edit anonymous and for
      // connections only (applying that would be refused).
      if (edit.exists) {
        const both = { visibility: after.visibility, anonymous: after.anonymous === true };
        tx.update(editRef, anonymousForConnections(editedAudience({ ...edit.data(), ...patch }, after)) ? both : patch);
      }
    }
    return { before: snap.data()!, data: after, changed, author: me.data() };
  });
  const card = mapCard(id, data);
  if (data.visibility !== before.visibility) {
    // The card has changed either way; the route answers it. A failure is
    // logged — the recommended feed still re-checks every card it shows.
    await Promise.resolve()
      .then(() => (vectors ?? getVectorStore()).setVisibility(id, card.visibility))
      .catch((e) => console.error('[api/v1] vectors', id, e));
  }
  return {
    card: toFeedCard(card, author, { deanonymize: true }),
    stale: changed ? [...cardPagePaths(card), ...landingPagePaths(before, data)] : [],
    reaches: changed && becameReachable(before, data),
  };
}

export interface DeleteCardOptions {
  vectors?: Pick<IVectorStore, 'deleteByCard'>;
  /**
   * Only a card moved to the trash at or before this moment (the purge
   * cron's cutoff, the start of an emptying): one restored since, or moved
   * there again later, is left as it is — `deleted: false`, nothing written.
   */
  trashedBefore?: Timestamp;
  /**
   * Only a card in the trash (DELETE /cards/{id}?onlyIfTrashed=true, what the
   * trash's own 永久刪除 sends): one restored meanwhile — from another
   * device, a shelf on screen since before — is 409 'This card is not in the
   * trash.' and stays.
   */
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

/**
 * Delete your card for good, draft or published — the only way a published
 * one goes (the rules let a client delete a draft alone) — with what only the
 * server can reach: its pending edit (a subcollection a client's delete
 * leaves behind), the notes left on it and its recommendation vectors. Links
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
 * connection. Its pending edit goes in that same transaction. The notes go
 * just after the card — once it is gone no note can land on it — so they
 * leave their writers' backups when the card's page goes, never later with
 * its author's account, which would say whose card it was.
 */
export async function deleteCard(db: Firestore, uid: string, id: string, opts: DeleteCardOptions = {}): Promise<DeletedCard> {
  if (isReservedId(id)) throw notFound();
  const ref = db.doc(`cards/${id}`);
  const data = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('authorId') !== uid) throw notFound();
    const trashedAt = snap.get('trashedAt');
    if (opts.trashedBefore && !(trashedAt instanceof Timestamp && trashedAt.toMillis() <= opts.trashedBefore.toMillis())) return null;
    if (opts.onlyIfTrashed && trashedAt == null) throw new ApiFailure('conflict', NOT_IN_TRASH_MESSAGE);
    takeBack(tx, await readTakeBack(tx, db, uid, id));
    tx.delete(ref);
    // What is under the card goes with it: its pending edit — the one document a card has beneath it (the rules
    // let a client write edits/current alone, and no server path writes anything else there). Deleting a missing
    // one is nothing; once the card is gone the rules take no new one.
    tx.delete(db.doc(`cards/${id}/edits/current`));
    return snap.data()!;
  });
  if (!data) return { stale: [], deleted: false };
  // The card is gone either way, so each clean-up below runs whatever the other does (side by side, each
  // failing alone): stray notes go with its author's account (or `backfill.ts orphan-notes`), and stray vectors
  // only cost the recommender a candidate it then can't read.
  await Promise.all([
    deleteNotesOn(db, id).catch((e) => console.error('[api/v1] notes', id, e)),
    Promise.resolve()
      .then(() => (opts.vectors ?? getVectorStore()).deleteByCard(id))
      .catch((e) => console.error('[api/v1] vectors', id, e)),
  ]);
  return { stale: [...cardPagePaths(mapCard(id, data)), ...landingPagePaths(data)], deleted: true };
}

/** Every note left on the card `id`, delivered or withheld, a batch at a time. */
export async function deleteNotesOn(db: Firestore, id: string): Promise<void> {
  const notes = db.collection('notes').where('cardId', '==', id).select().limit(BATCH_MAX);
  for (;;) {
    const page = await notes.get();
    if (page.empty) return;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < BATCH_MAX) return;
  }
}

/** A batch's limit on writes. */
const BATCH_MAX = 500;
