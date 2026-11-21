import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import type { ChangeSource, Doc, PendingChange } from '@/server/app/replicate';
import { CHANGE_LOG, pathOf } from '@/server/domain/outbox';
import type { AdminDb } from './db';

/** A Firestore value as plain data: Timestamps as Dates, all the way down. */
export function plainOf(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate();
  if (Array.isArray(v)) return v.map(plainOf);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plainOf(x)]));
  }
  return v;
}

const micros = (t: Timestamp) => t.seconds * 1_000_000 + Math.floor(t.nanoseconds / 1000);

/**
 * Firestore's outbox (`changeLog/{ulid}`, written by FirestoreUnitOfWork with
 * OUTBOX_ENABLED=1) as the replicator's source: entries not done in id
 * (ulid) order, each row read as it is now — its version Firestore's update
 * time, or for a row that is gone the read time.
 */
export function firestoreChangeSource(db: AdminDb): ChangeSource {
  return {
    async pending(limit): Promise<PendingChange[]> {
      const snap = await db.collection(CHANGE_LOG).where('done', '==', false).orderBy(FieldPath.documentId()).limit(limit).get();
      return snap.docs.map((d) => ({
        logId: d.id,
        entry: { entity: String(d.get('entity')), id: String(d.get('id')), op: d.get('op'), version: Number(d.get('version')) || 0 },
      }));
    },
    async read(entity, id) {
      const snap = await db.doc(pathOf(entity, id)).get();
      if (!snap.exists) return { row: null, version: micros(snap.readTime) };
      return { row: plainOf(snap.data()) as Doc, version: micros(snap.updateTime ?? snap.readTime) };
    },
    async markDone(logIds) {
      for (let i = 0; i < logIds.length; i += 400) {
        const batch = db.batch();
        for (const id of logIds.slice(i, i + 400)) batch.update(db.collection(CHANGE_LOG).doc(id), { done: true });
        await batch.commit();
      }
    },
  };
}
