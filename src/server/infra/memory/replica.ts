import type { ChangeSource, PendingChange, ReplicaTarget } from '@/server/app/replicate';
import { CHANGE_LOG, pathOf, type ChangeEntry } from '@/server/domain/outbox';
import type { MemoryState } from './state';

/** The memory table and id a registry entity's row lives at (`blocks`, `u/x` → `users/u/blocks`, `x`). */
export function memoryRowOf(entity: string, id: string): { table: string; id: string } {
  const path = pathOf(entity, id);
  const slash = path.lastIndexOf('/');
  return { table: path.slice(0, slash), id: path.slice(slash + 1) };
}

/** The outbox of a MemoryState (memoryUow with `outbox`), as the replicator's source. Memory keeps no row versions: an entry's own stands in. */
export function memoryChangeSource(state: MemoryState): ChangeSource {
  return {
    async pending(limit): Promise<PendingChange[]> {
      return state
        .rows<ChangeEntry & Record<string, unknown>>(CHANGE_LOG, (row) => row.done !== true)
        .slice(0, limit)
        .map(({ id, row }) => ({ logId: id, entry: { entity: row.entity, id: row.id, op: row.op, version: row.version } }));
    },
    async read(entity, id, recorded) {
      const at = memoryRowOf(entity, id);
      return { row: state.get(at.table, at.id), version: recorded };
    },
    async markDone(logIds) {
      for (const id of logIds) state.merge(CHANGE_LOG, id, { done: true });
    },
  };
}

/** A MemoryState as the replicator's target: rows where memory keeps them, the versions applied in `replicaVersions`. */
export function memoryReplicaTarget(state: MemoryState): ReplicaTarget {
  return {
    async apply(entity, id, row, version) {
      const key = `${entity}/${id}`;
      const was = state.get<{ version: number }>('replicaVersions', key)?.version ?? -1;
      if (version <= was) return 'stale';
      const at = memoryRowOf(entity, id);
      if (row) state.put(at.table, at.id, row);
      else state.delete(at.table, at.id);
      state.put('replicaVersions', key, { version });
      return 'applied';
    },
  };
}
