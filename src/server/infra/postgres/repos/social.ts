import { pairKey } from '@/server/domain/graph';
import type { InviteRow, SocialData, SocialTxRepo } from '@/server/ports/repos/social';
import type { Doc } from '../codec';
import type { PgDocs } from '../docs';
import type { PgTx } from '../uow';

/**
 * The social aggregate over PostgreSQL: `bookmarks`, `blocks` (one table:
 * the memory repo's `users/{uid}/blocks` and its `blocks` mirror are the
 * same rows here), `connections`, `invites` — the memory repository's
 * semantics (infra/memory/repos/social.ts).
 */

const dateOf = (v: unknown): Date | null => (v instanceof Date ? v : null);
const byTimeDesc = <T>(at: (row: T) => Date | null) => (a: T, b: T) => (at(b)?.getTime() ?? -Infinity) - (at(a)?.getTime() ?? -Infinity);
const BOOKMARKS = (uid: string) => `users/${uid}/bookmarks`;

function inviteRow(id: string, r: Doc): InviteRow {
  return {
    id,
    fromUserId: String(r.fromUserId ?? ''),
    toUserId: String(r.toUserId ?? ''),
    message: typeof r.message === 'string' ? r.message : '',
    referenceCardId: typeof r.referenceCardId === 'string' && r.referenceCardId ? r.referenceCardId : null,
    status: String(r.status ?? ''),
    createdAt: dateOf(r.createdAt),
    expiresAt: dateOf(r.expiresAt),
  };
}

export function pgSocialTx(tx: PgTx): SocialTxRepo {
  const pending = async (from: string, to: string) => (await tx.rows('invites', { eq: { fromUserId: from, toUserId: to, status: 'pending' } })).map((r) => r.id);
  return {
    async readBlock(uid, other) {
      const [block, connection, out, back] = await Promise.all([
        tx.get('blocks', `${uid}/${other}`),
        tx.get('connections', pairKey(uid, other)),
        pending(uid, other),
        pending(other, uid),
      ]);
      return { blocked: block != null, connected: connection != null, pendingInvites: [...out, ...back] };
    },
    block(uid, other, reads) {
      if (!reads.blocked) tx.put('blocks', `${uid}/${other}`, { blockedUid: other, createdAt: new Date() });
      if (reads.connected) tx.delete('connections', pairKey(uid, other));
      for (const id of reads.pendingInvites) tx.merge('invites', id, { status: 'withdrawn' });
    },
    declineInvite(inviteId) {
      tx.merge('invites', inviteId, { status: 'declined' });
    },
  };
}

export function pgSocialData(docs: PgDocs): SocialData {
  return {
    async isBookmarked(uid, cardId) {
      return (await docs.get(BOOKMARKS(uid), cardId)) != null;
    },
    async putBookmark(uid, cardId) {
      // Kept with its first time: inserted only when absent.
      await docs.db.query(`insert into bookmarks (user_id, card_id, created_at) values ($1, $2, $3) on conflict do nothing`, [uid, cardId, new Date()]);
    },
    async deleteBookmark(uid, cardId) {
      await docs.delete(BOOKMARKS(uid), cardId);
    },
    async listBlocks(uid) {
      return (await docs.rows('blocks', { eq: { owner_id: uid } }))
        .map(({ id, row }) => ({ uid: id.slice(uid.length + 1), createdAt: dateOf(row.createdAt) }))
        .sort(byTimeDesc((r) => r.createdAt));
    },
    async unblock(uid, other) {
      const n = await docs.deleteWhere('blocks', { eq: { owner_id: uid, blocked_id: other } });
      return n > 0;
    },
    async listConnections(uid) {
      return (await docs.rows('connections', { contains: { userIds: uid } }))
        .map(({ row }) => ({
          other: String((row.userIds as unknown[]).find((u) => typeof u === 'string' && u !== uid) ?? ''),
          establishedAt: dateOf(row.establishedAt),
        }))
        .filter((r) => r.other)
        .sort(byTimeDesc((r) => r.establishedAt));
    },
    async pendingInvitesTo(uid) {
      return (await docs.rows('invites', { eq: { toUserId: uid, status: 'pending' } })).map(({ id, row }) => inviteRow(id, row)).sort(byTimeDesc((r) => r.createdAt));
    },
  };
}
