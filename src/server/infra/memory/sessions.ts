import type { RefreshRow, RotateOutcome, SessionStore } from '@/server/ports/sessions';

/** Sessions in memory, for unit tests: the same outcomes as the Firestore store (infra/firestore/sessions.ts). */
export interface MemorySessionStore extends SessionStore {
  readonly identities: Map<string, { userId: string; provider: string; subject: string; createdAt: Date }>;
  readonly refresh: Map<string, RefreshRow>;
}

export function memorySessionStore(): MemorySessionStore {
  const identities: MemorySessionStore['identities'] = new Map();
  const refresh = new Map<string, RefreshRow>();
  const deleteWhere = (match: (row: RefreshRow) => boolean) => {
    for (const [hash, row] of refresh) if (match(row)) refresh.delete(hash);
  };
  return {
    identities,
    refresh,
    async linkIdentity(provider, subject, userId, at) {
      const id = `${provider}_${subject}`;
      const kept = identities.get(id);
      if (kept) return kept.userId;
      identities.set(id, { userId, provider, subject, createdAt: at });
      return userId;
    },
    async putRefresh(hash, row) {
      if (refresh.has(hash)) throw new Error('already exists');
      refresh.set(hash, { ...row });
    },
    async getRefresh(hash) {
      const row = refresh.get(hash);
      return row ? { ...row } : null;
    },
    async rotateRefresh(hash, nextHash, next, at): Promise<RotateOutcome> {
      const row = refresh.get(hash);
      if (!row) return { kind: 'unknown' };
      if (row.usedAt) {
        deleteWhere((r) => r.family === row.family);
        return { kind: 'reused', uid: row.uid };
      }
      if (row.expiresAt.getTime() <= at.getTime()) {
        refresh.delete(hash);
        return { kind: 'expired' };
      }
      row.usedAt = at;
      refresh.set(nextHash, next({ ...row, usedAt: null }));
      return { kind: 'rotated', row: { ...row } };
    },
    async revokeFamily(family) {
      deleteWhere((r) => r.family === family);
    },
    async revokeUser(uid) {
      deleteWhere((r) => r.uid === uid);
    },
  };
}
