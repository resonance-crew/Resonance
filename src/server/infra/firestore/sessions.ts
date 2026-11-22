import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { replayOf } from '@/server/domain/session';
import type { RefreshRow, RotateOutcome, SessionStore } from '@/server/ports/sessions';
import type { AdminDb } from './db';

/**
 * Resonance's sessions in Firestore (server-only collections; no client rule
 * lets anyone near them):
 *
 * - `identities/{provider}_{subject}` → `{ userId, provider, subject, createdAt }`:
 *   today `firebase_<uid>` → the same uid, made at the first exchange.
 * - `refreshTokens/{sha256 of the token}` → `{ uid, family, authTime, createdAt,
 *   expiresAt, usedAt, nextHash }`; `expiresAt` is the collection's TTL field
 *   (firestore.indexes.json), so used and expired rows go by themselves.
 */
const IDENTITIES = 'identities';
const REFRESH = 'refreshTokens';
/** Deletes per batch (Firestore takes 500 writes a commit). */
const PAGE = 400;

const SUBJECT = /^[^/]{1,128}$/;
const PROVIDER = /^[a-z][a-z0-9-]{0,31}$/;

export function identityDocId(provider: string, subject: string): string {
  if (!PROVIDER.test(provider) || !SUBJECT.test(subject)) throw new Error('Not an identity this store keeps');
  return `${provider}_${subject}`;
}

const date = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : null);

function rowOf(d: DocumentData | undefined): RefreshRow | null {
  if (!d || typeof d.uid !== 'string' || typeof d.family !== 'string') return null;
  const expiresAt = date(d.expiresAt);
  if (!expiresAt) return null;
  return {
    uid: d.uid,
    family: d.family,
    authTime: typeof d.authTime === 'number' ? d.authTime : 0,
    createdAt: date(d.createdAt) ?? new Date(0),
    expiresAt,
    usedAt: date(d.usedAt),
    nextHash: typeof d.nextHash === 'string' ? d.nextHash : null,
  };
}

const stored = (row: RefreshRow) => ({
  uid: row.uid,
  family: row.family,
  authTime: row.authTime,
  createdAt: Timestamp.fromDate(row.createdAt),
  expiresAt: Timestamp.fromDate(row.expiresAt),
  usedAt: row.usedAt ? Timestamp.fromDate(row.usedAt) : null,
  ...(row.nextHash ? { nextHash: row.nextHash } : {}),
});

export function firestoreSessionStore(db: AdminDb): SessionStore {
  const refresh = (hash: string) => db.collection(REFRESH).doc(hash);

  async function deleteWhere(field: 'uid' | 'family', value: string): Promise<void> {
    for (;;) {
      const page = await db.collection(REFRESH).where(field, '==', value).limit(PAGE).get();
      if (page.empty) return;
      const batch = db.batch();
      for (const doc of page.docs) batch.delete(doc.ref);
      await batch.commit();
      if (page.size < PAGE) return;
    }
  }

  return {
    async linkIdentity(provider, subject, userId, at) {
      const ref = db.collection(IDENTITIES).doc(identityDocId(provider, subject));
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const kept = snap.get('userId');
        if (typeof kept === 'string' && kept) return kept;
        tx.set(ref, { userId, provider, subject, createdAt: Timestamp.fromDate(at) });
        return userId;
      });
    },
    async putRefresh(hash, row) {
      await refresh(hash).create(stored(row));
    },
    async getRefresh(hash) {
      return rowOf((await refresh(hash).get()).data());
    },
    async rotateRefresh(hash, nextHash, next, at): Promise<RotateOutcome> {
      let reusedFamily: string | null = null;
      const outcome = await db.runTransaction(async (tx): Promise<RotateOutcome> => {
        reusedFamily = null;
        const ref = refresh(hash);
        const row = rowOf((await tx.get(ref)).data());
        if (!row) return { kind: 'unknown' };
        if (row.usedAt) {
          // The client's own second try (a race, a lost answer) while the token it was traded for is the newest.
          const successor = row.nextHash ? rowOf((await tx.get(refresh(row.nextHash))).data()) : null;
          if (replayOf({ usedAtMs: row.usedAt.getTime(), atMs: at.getTime(), successorUnused: !!successor && !successor.usedAt }) === 'superseded') {
            return { kind: 'superseded' };
          }
          reusedFamily = row.family;
          return { kind: 'reused', uid: row.uid, family: row.family };
        }
        if (row.expiresAt.getTime() <= at.getTime()) {
          tx.delete(ref);
          return { kind: 'expired' };
        }
        tx.update(ref, { usedAt: Timestamp.fromDate(at), nextHash });
        tx.create(refresh(nextHash), stored(next(row)));
        return { kind: 'rotated', row: { ...row, usedAt: at, nextHash } };
      });
      // A used token presented again, not the client's own replay, is a stolen one (or its thief's copy): the whole family goes.
      if (reusedFamily) await deleteWhere('family', reusedFamily);
      return outcome;
    },
    async revokeFamily(family) {
      await deleteWhere('family', family);
    },
    async revokeUser(uid) {
      await deleteWhere('uid', uid);
    },
  };
}
