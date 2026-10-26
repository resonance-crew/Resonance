import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/**
 * A card deleted for good leaves its id behind as a tombstone, so no new card
 * takes it (firestore.rules refuse one): resonances, bookmarks, a thread's
 * cards and old links still name that id, and would follow whoever took it.
 * Written by every server path that deletes a card (deleteCard — the trash's
 * too — and the account purge). It holds no uid: it must not say whose card
 * it was.
 */
export function tombstoneRef(db: Firestore, id: string) {
  return db.doc(`cardTombstones/${id}`);
}

/** A tombstone's whole content: when, never who. */
export const TOMBSTONE = { deletedAt: FieldValue.serverTimestamp() };
