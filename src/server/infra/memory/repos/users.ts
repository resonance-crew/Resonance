import type { User } from '@/lib/db/types';
import { docIdOk } from '@/server/domain/cards';
import type { PersonRow, UsersData, UsersTxRepo } from '@/server/ports/repos/users';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/**
 * Tables, named after the collections: `users` (profiles by id, times as
 * Date), `handles` (`{ uid }` by lower-cased pen name), `users/{uid}/blocks`
 * (one row per person `uid` blocked), `connections` (by `a_b`, the smaller
 * uid first), `accountDeletions` (`{ requestedAt, purgeAfter }` by uid).
 */
export function usersTx(_tx: MemoryTx): UsersTxRepo {
  return {};
}

const pairId = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const pick = (row: PersonRow, fields: readonly string[]): PersonRow => Object.fromEntries(fields.filter((f) => row[f] !== undefined).map((f) => [f, row[f]]));

/** `users` outside a transaction. */
export function usersData(state: MemoryState): UsersData {
  const idForHandle = async (handle: string): Promise<string | null> => {
    const key = handle.trim().toLowerCase();
    if (!key) return null;
    const reserved = state.get<{ uid?: string }>('handles', key)?.uid;
    if (reserved) return reserved;
    // A name not reserved yet: the profile going by it, the earliest-joined first.
    const [first] = state
      .rows<User & Record<string, unknown>>('users', (u) => typeof u.handle === 'string' && u.handle.toLowerCase() === key)
      .sort((a, b) => (a.row.joinedAt?.getTime?.() ?? Infinity) - (b.row.joinedAt?.getTime?.() ?? Infinity) || a.id.localeCompare(b.id));
    return first?.id ?? null;
  };
  const getRow = async (uid: string): Promise<PersonRow | null> => (docIdOk(uid) ? state.get<PersonRow & Record<string, unknown>>('users', uid) : null);

  return {
    async findByHandle(handle) {
      const uid = await idForHandle(handle);
      return uid ? state.get<User & Record<string, unknown>>('users', uid) : null;
    },
    idForHandle,
    getRow,
    async getUser(uid, fields) {
      const row = await getRow(uid);
      if (!row) return null;
      const kept = fields ? pick(row, fields) : row;
      return { ...kept, id: uid, joinedAt: kept.joinedAt instanceof Date ? kept.joinedAt : new Date(0), handleChangedAt: kept.handleChangedAt instanceof Date ? kept.handleChangedAt : new Date(0) } as User;
    },
    async rowsOf(ids, fields) {
      const out = new Map<string, PersonRow>();
      for (const id of new Set(ids)) {
        const row = docIdOk(id) ? state.get<PersonRow & Record<string, unknown>>('users', id) : null;
        if (row) out.set(id, pick(row, fields));
      }
      return out;
    },
    async blockedBy(uid) {
      return new Set(state.rows(`users/${uid}/blocks`).map((r) => r.id));
    },
    async hasBlocked(uid, other) {
      return state.get(`users/${uid}/blocks`, other) != null;
    },
    async connected(a, b) {
      return a !== b && state.get('connections', pairId(a, b)) != null;
    },
    async connectedAmong(uid, others) {
      return new Set(others.filter((o) => o !== uid && state.get('connections', pairId(uid, o)) != null));
    },
    async deletionOf(uid) {
      const row = state.get<{ requestedAt?: unknown; purgeAfter?: unknown }>('accountDeletions', uid);
      return row && row.requestedAt instanceof Date && row.purgeAfter instanceof Date ? { requestedAt: row.requestedAt, purgeAfter: row.purgeAfter } : null;
    },
    // Letters are the conversations aggregate's; a memory context has none until that lane models them.
    letterReadsAsConnection: async () => false,
  };
}
