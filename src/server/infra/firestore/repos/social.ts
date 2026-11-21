import { FieldValue, Timestamp, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { pairKey } from '@/server/domain/graph';
import type { BlockReads, InviteRow, SocialData, SocialTxRepo } from '@/server/ports/repos/social';
import type { AdminDb } from '../db';

// What src/lib/db/firestore/client/{bookmarks,blocks,invites}.ts and
// reads.ts listMyConnectionUids wrote and read from the browser under the
// rules, now on the server: the same documents, the same fields.

const ALREADY_EXISTS = 6;

const dateOf = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);
const byTimeDesc = <T>(at: (row: T) => Date | null) => (a: T, b: T) => (at(b)?.getTime() ?? -Infinity) - (at(a)?.getTime() ?? -Infinity);

function inviteRow(d: DocumentSnapshot): InviteRow {
  const ref = d.get('referenceCardId');
  return {
    id: d.id,
    fromUserId: String(d.get('fromUserId') ?? ''),
    toUserId: String(d.get('toUserId') ?? ''),
    message: typeof d.get('message') === 'string' ? d.get('message') : '',
    referenceCardId: typeof ref === 'string' && ref ? ref : null,
    status: String(d.get('status') ?? ''),
    createdAt: dateOf(d.get('createdAt')),
    expiresAt: dateOf(d.get('expiresAt')),
  };
}

export function socialTx(db: AdminDb, tx: Transaction): SocialTxRepo {
  const pending = (from: string, to: string) =>
    tx.get(db.collection('invites').where('fromUserId', '==', from).where('toUserId', '==', to).where('status', '==', 'pending'));
  return {
    async readBlock(uid, other) {
      const [block, connection, out, back] = await Promise.all([
        tx.get(db.doc(`users/${uid}/blocks/${other}`)),
        tx.get(db.doc(`connections/${pairKey(uid, other)}`)),
        pending(uid, other),
        pending(other, uid),
      ]);
      return { blocked: block.exists, connected: connection.exists, pendingInvites: [...out.docs, ...back.docs].map((d) => d.id) };
    },
    block(uid, other, reads: BlockReads) {
      // The block first, as the client wrote it: once it stands, nothing new can reach across it.
      if (!reads.blocked) tx.set(db.doc(`users/${uid}/blocks/${other}`), { blockedUid: other, createdAt: FieldValue.serverTimestamp() });
      if (reads.connected) tx.delete(db.doc(`connections/${pairKey(uid, other)}`));
      for (const id of reads.pendingInvites) tx.update(db.doc(`invites/${id}`), { status: 'withdrawn' });
    },
    declineInvite(inviteId) {
      tx.update(db.doc(`invites/${inviteId}`), { status: 'declined' });
    },
  };
}

export function socialData(db: AdminDb): SocialData {
  const bookmark = (uid: string, cardId: string) => db.doc(`users/${uid}/bookmarks/${cardId}`);
  return {
    async isBookmarked(uid, cardId) {
      return (await bookmark(uid, cardId).get()).exists;
    },
    async putBookmark(uid, cardId) {
      try {
        await bookmark(uid, cardId).create({ cardId, createdAt: FieldValue.serverTimestamp() });
      } catch (e) {
        if ((e as { code?: unknown }).code !== ALREADY_EXISTS) throw e;
      }
    },
    async deleteBookmark(uid, cardId) {
      await bookmark(uid, cardId).delete();
    },
    async listBlocks(uid) {
      const snap = await db.collection(`users/${uid}/blocks`).get();
      return snap.docs.map((d) => ({ uid: d.id, createdAt: dateOf(d.get('createdAt')) })).sort(byTimeDesc((r) => r.createdAt));
    },
    async unblock(uid, other) {
      const ref = db.doc(`users/${uid}/blocks/${other}`);
      return db.runTransaction(async (tx) => {
        const there = (await tx.get(ref)).exists;
        if (there) tx.delete(ref);
        return there;
      });
    },
    async listConnections(uid) {
      const snap = await db.collection('connections').where('userIds', 'array-contains', uid).get();
      return snap.docs
        .map((d) => {
          const ids = d.get('userIds');
          const other = Array.isArray(ids) ? ids.find((u: unknown) => typeof u === 'string' && u !== uid) : undefined;
          return { other: typeof other === 'string' ? other : '', establishedAt: dateOf(d.get('establishedAt')) };
        })
        .filter((r) => r.other)
        .sort(byTimeDesc((r) => r.establishedAt));
    },
    async pendingInvitesTo(uid) {
      const snap = await db.collection('invites').where('toUserId', '==', uid).where('status', '==', 'pending').orderBy('createdAt', 'desc').get();
      return snap.docs.map(inviteRow);
    },
  };
}
