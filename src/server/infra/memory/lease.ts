import type { LeaseStore } from '@/server/ports/lease';
import type { MemoryState } from './state';

/**
 * Leases over MemoryState: the `leaseUntil` (a Date) of the row the key names
 * (`table/id`, as the Firestore adapter's document path), so a test sees the
 * lease where the service reads it. Nothing awaits between the read and the
 * write, so an acquire is atomic here.
 */
export function memoryLeaseStore(state: MemoryState): LeaseStore {
  const at = (key: string) => {
    const slash = key.lastIndexOf('/');
    if (slash <= 0 || slash === key.length - 1) throw new Error(`A lease key is a row path (table/id), not ${JSON.stringify(key)}`);
    return { table: key.slice(0, slash), id: key.slice(slash + 1) };
  };
  return {
    async acquire(key, ttlMs, now) {
      const { table, id } = at(key);
      const held = state.get(table, id)?.leaseUntil;
      if (held instanceof Date && held.getTime() > now) return false;
      state.merge(table, id, { leaseUntil: new Date(now + ttlMs) });
      return true;
    },
    async release(key) {
      const { table, id } = at(key);
      if (state.get(table, id)) state.merge(table, id, { leaseUntil: undefined });
    },
  };
}
