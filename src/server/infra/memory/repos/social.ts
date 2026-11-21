import { pairKey } from '@/server/domain/graph';
import type { InviteRow, SocialData, SocialTxRepo } from '@/server/ports/repos/social';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';

/**
 * Tables: `users/{uid}/bookmarks` (`{ cardId, createdAt }` by card id),
 * `users/{uid}/blocks` (`{ blockedUid, createdAt }` by the blocked uid) —
 * mirrored into `blocks` by `{uid}/{other}`, the table the graph,
 * conversations, taps and push repos read a block from — `connections`
 * (`{ userIds, establishedAt }` by pair) and `invites`.
 */

const dateOf = (v: unknown): Date | null => (v instanceof Date ? v : null);
const byTimeDesc = <T>(at: (row: T) => Date | null) => (a: T, b: T) => (at(b)?.getTime() ?? -Infinity) - (at(a)?.getTime() ?? -Infinity);
const BLOCKS = (uid: string) => `users/${uid}/blocks`;
const BOOKMARKS = (uid: string) => `users/${uid}/bookmarks`;

function inviteRow(id: string, r: Row): InviteRow {
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

const pendingBetween = (rows: (table: string, where: (r: Row) => boolean) => { id: string }[], from: string, to: string) =>
  rows('invites', (r) => r.fromUserId === from && r.toUserId === to && r.status === 'pending').map((r) => r.id);

export function socialTx(tx: MemoryTx): SocialTxRepo {
  return {
    async readBlock(uid, other) {
      const rows = (table: string, where: (r: Row) => boolean) => tx.rows(table, where);
      return {
        blocked: tx.get(BLOCKS(uid), other) != null,
        connected: tx.get('connections', pairKey(uid, other)) != null,
        pendingInvites: [...pendingBetween(rows, uid, other), ...pendingBetween(rows, other, uid)],
      };
    },
    block(uid, other, reads) {
      if (!reads.blocked) {
        const row = { blockedUid: other, createdAt: new Date() };
        tx.put(BLOCKS(uid), other, row);
        tx.put('blocks', `${uid}/${other}`, row);
      }
      if (reads.connected) tx.delete('connections', pairKey(uid, other));
      for (const id of reads.pendingInvites) tx.merge('invites', id, { status: 'withdrawn' });
    },
    declineInvite(inviteId) {
      tx.merge('invites', inviteId, { status: 'declined' });
    },
  };
}

export function socialData(state: MemoryState): SocialData {
  return {
    async isBookmarked(uid, cardId) {
      return state.get(BOOKMARKS(uid), cardId) != null;
    },
    async putBookmark(uid, cardId) {
      if (!state.get(BOOKMARKS(uid), cardId)) state.put(BOOKMARKS(uid), cardId, { cardId, createdAt: new Date() });
    },
    async deleteBookmark(uid, cardId) {
      state.delete(BOOKMARKS(uid), cardId);
    },
    async listBlocks(uid) {
      return state
        .rows(BLOCKS(uid))
        .map(({ id, row }) => ({ uid: id, createdAt: dateOf(row.createdAt) }))
        .sort(byTimeDesc((r) => r.createdAt));
    },
    async unblock(uid, other) {
      const there = state.get(BLOCKS(uid), other) != null;
      state.delete(BLOCKS(uid), other);
      state.delete('blocks', `${uid}/${other}`);
      return there;
    },
    async listConnections(uid) {
      return state
        .rows('connections', (r) => Array.isArray(r.userIds) && r.userIds.includes(uid))
        .map(({ row }) => ({
          other: String((row.userIds as unknown[]).find((u) => typeof u === 'string' && u !== uid) ?? ''),
          establishedAt: dateOf(row.establishedAt),
        }))
        .filter((r) => r.other)
        .sort(byTimeDesc((r) => r.establishedAt));
    },
    async pendingInvitesTo(uid) {
      return state
        .rows('invites', (r) => r.toUserId === uid && r.status === 'pending')
        .map(({ id, row }) => inviteRow(id, row))
        .sort(byTimeDesc((r) => r.createdAt));
    },
  };
}
