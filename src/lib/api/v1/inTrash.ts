import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { ApiFailure } from './http';

/**
 * What every write to your card refuses while it is in the trash (PATCH,
 * publish, edits/apply, resonating with it): 409 'This card is in the
 * trash.' — restore it first. Asked inside each write's transaction, and
 * only after the card is known to be yours: someone else's card in the trash
 * is exactly as absent as a missing one (404), so a stranger learns nothing
 * of any card id — an anonymous one's least of all.
 */
export const IN_TRASH_MESSAGE = 'This card is in the trash.';

/** The card (read in the transaction, already known to be yours) is in the trash: throw the 409. */
export function refuseInTrash(snap: DocumentSnapshot): void {
  if (snap.get('trashedAt') != null) throw new ApiFailure('conflict', IN_TRASH_MESSAGE);
}
