import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { LeaseStore } from '@/server/ports/lease';
import type { AdminDb } from './db';

/** A lease key is a document path: `collection/id` (or deeper, in pairs). */
const DOC_PATH = /^[^/]+\/[^/]+(\/[^/]+\/[^/]+)*$/;

/**
 * Leases as the recommender has always kept its build lease
 * (src/server/app/recommendDaily.ts): a `leaseUntil` Timestamp on a
 * document, taken in a transaction that reads it first. The key is that
 * document's path (`recommendations/{uid}`), so a lease lives beside the row
 * it guards and goes with it; the document is made when absent (a merge, so
 * nothing else on it changes). Release deletes the field.
 */
export function firestoreLeaseStore(db: AdminDb): LeaseStore {
  const ref = (key: string) => {
    if (!DOC_PATH.test(key)) throw new Error(`A lease key is a document path (collection/id), not ${JSON.stringify(key)}`);
    return db.doc(key);
  };
  return {
    acquire(key, ttlMs, now) {
      const doc = ref(key);
      return db.runTransaction(async (tx) => {
        const held = (await tx.get(doc)).get('leaseUntil');
        if (held instanceof Timestamp && held.toMillis() > now) return false;
        tx.set(doc, { leaseUntil: Timestamp.fromMillis(now + ttlMs) }, { merge: true });
        return true;
      });
    },
    async release(key) {
      // An update: releasing the lease of a row that is gone makes no row.
      await ref(key)
        .update({ leaseUntil: FieldValue.delete() })
        .catch((e: unknown) => {
          if ((e as { code?: unknown } | null)?.code !== 5) throw e;
        });
    },
  };
}
