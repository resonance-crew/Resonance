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
/** `users` inside a memory transaction — the write side (profile.ts), over `users`, `handles` (`{ uid, handle, reservedAt }`) and `handleHolds` (`{ heldFor, releasedAt }`). */
export function usersTx(tx: MemoryTx): UsersTxRepo {
  return {
    async getProfile(uid) {
      return docIdOk(uid) ? tx.get<PersonRow & Record<string, unknown>>('users', uid) : null;
    },
    async handleTakenByOther(uid, handle) {
      return takenByOther(
        (table, id) => tx.get(table, id),
        (key) => tx.rows('users', (u) => u.handleLower === key).slice(0, 2),
        uid,
        handle,
      );
    },
    async ownsReleasableReservation(uid, current, next) {
      const oldKey = handleKey(current);
      if (!(oldKey && reservable(oldKey) && oldKey !== handleKey(next))) return false;
      return tx.get<{ uid?: unknown }>(HANDLES, oldKey)?.uid === uid;
    },

    createProfile(uid, p) {
      const at = new Date();
      tx.put('users', uid, { ...p, handleLower: handleKey(p.handle), joinedAt: at, handleChangedAt: at });
    },
    nameProfile(uid, n) {
      const { initials, ...rest } = n;
      tx.merge('users', uid, { ...rest, handleLower: handleKey(n.handle), handleChangedAt: new Date(), ...(initials !== undefined ? { initials } : {}) });
    },
    patchProfile(uid, p) {
      const patch: Record<string, unknown> = {};
      if (p.handle != null) Object.assign(patch, { handle: p.handle, handleLower: handleKey(p.handle), handleChangedAt: new Date() });
      if (p.bio != null) patch.bio = p.bio;
      if (p.region != null) patch.region = p.region;
      if (p.primaryLocale != null) patch.primaryLocale = p.primaryLocale;
      if (Object.keys(patch).length) tx.merge('users', uid, patch);
    },
    reserveHandle(uid, handle) {
      tx.put(HANDLES, handleKey(handle), { uid, handle: handle.trim(), reservedAt: new Date() });
      tx.delete(HOLDS, handleKey(handle));
    },
    releaseHandle(uid, handle) {
      tx.delete(HANDLES, handleKey(handle));
      tx.put(HOLDS, handleKey(handle), { heldFor: uid, releasedAt: new Date() });
    },
  };
}

const HANDLES = 'handles';
const HOLDS = 'handleHolds';
const HOLD_DAYS = 90;
const handleKey = (handle: string) => handle.trim().toLowerCase();
/** handles.ts reservable: a lower-cased pen name that can be a document id. */
const reservable = (key: string) => key.length > 0 && key !== '.' && key !== '..' && !/^__.*__$/.test(key) && !key.includes('/') && Buffer.byteLength(key) <= 1500;

/** handles.ts handleTakenByOther, over reads given (in a transaction or not). */
function takenByOther(
  get: (table: string, id: string) => Record<string, unknown> | null,
  holders: (key: string) => { id: string }[],
  uid: string,
  handle: string,
): boolean {
  const key = handleKey(handle);
  const reservation = reservable(key) ? get(HANDLES, key) : null;
  const hold = reservable(key) ? get(HOLDS, key) : null;
  const owner = typeof reservation?.uid === 'string' && reservation.uid ? reservation.uid : null;
  if (owner) return owner !== uid;
  const at = hold?.releasedAt;
  if (at instanceof Date && at.getTime() + HOLD_DAYS * 86_400_000 > Date.now() && hold?.heldFor !== uid) return true;
  return holders(key).some((d) => d.id !== uid);
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

    // --- write side (cardsWrite lane: profile.ts)

    async handleAvailable(uid, handle) {
      if (!reservable(handleKey(handle))) return false;
      return !takenByOther(
        (table, id) => state.get(table, id),
        (key) => state.rows('users', (u) => u.handleLower === key).slice(0, 2),
        uid,
        handle,
      );
    },
  };
}
