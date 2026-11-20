import type { GraphData, GraphTxRepo } from '@/server/ports/repos/graph';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/** `graph` inside a memory transaction: filled by the lane that owns ports/repos/graph.ts (reads through `tx.get` / `tx.rows`, writes through `tx.put` / `tx.delete`). */
export function graphTx(_tx: MemoryTx): GraphTxRepo {
  return {};
}

/** `graph` outside a transaction. */
export function graphData(_state: MemoryState): GraphData {
  return {};
}
