import type { User } from '@/lib/db/types';
import type { UsersData, UsersTxRepo } from '@/server/ports/repos/users';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/**
 * Tables: `users` (User rows by id) and `handles` (`{ uid }` by lower-cased
 * pen name). The cards-read lane brings the rest of the users aggregate.
 */
export function usersTx(_tx: MemoryTx): UsersTxRepo {
  return {};
}

/** `users` outside a transaction. */
export function usersData(state: MemoryState): UsersData {
  return {
    async findByHandle(handle) {
      const key = handle.trim().toLowerCase();
      if (!key) return null;
      const reserved = state.get<{ uid?: string }>('handles', key)?.uid;
      if (reserved) return state.get<User & Record<string, unknown>>('users', reserved);
      // A name not reserved yet: the profile going by it, the earliest-joined first.
      const [first] = state
        .rows<User & Record<string, unknown>>('users', (u) => typeof u.handle === 'string' && u.handle.toLowerCase() === key)
        .sort((a, b) => (a.row.joinedAt?.getTime?.() ?? Infinity) - (b.row.joinedAt?.getTime?.() ?? Infinity) || a.id.localeCompare(b.id));
      return first?.row ?? null;
    },
  };
}
