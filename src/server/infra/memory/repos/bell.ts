import type { BellData, BellTxRepo } from '@/server/ports/repos/bell';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/** `bell` inside a memory transaction: filled by the lane that owns ports/repos/bell.ts (reads through `tx.get` / `tx.rows`, writes through `tx.put` / `tx.delete`). */
export function bellTx(_tx: MemoryTx): BellTxRepo {
  return {};
}

/** `bell` outside a transaction. */
export function bellData(_state: MemoryState): BellData {
  return {};
}
