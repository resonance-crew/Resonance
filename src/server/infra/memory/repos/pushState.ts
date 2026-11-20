import type { PushStateData, PushStateTxRepo } from '@/server/ports/repos/pushState';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/** `pushState` inside a memory transaction: filled by the lane that owns ports/repos/pushState.ts (reads through `tx.get` / `tx.rows`, writes through `tx.put` / `tx.delete`). */
export function pushStateTx(_tx: MemoryTx): PushStateTxRepo {
  return {};
}

/** `pushState` outside a transaction. */
export function pushStateData(_state: MemoryState): PushStateData {
  return {};
}
