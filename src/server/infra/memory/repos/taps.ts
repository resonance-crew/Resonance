import type { TapsData, TapsTxRepo } from '@/server/ports/repos/taps';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/** `taps` inside a memory transaction: filled by the lane that owns ports/repos/taps.ts (reads through `tx.get` / `tx.rows`, writes through `tx.put` / `tx.delete`). */
export function tapsTx(_tx: MemoryTx): TapsTxRepo {
  return {};
}

/** `taps` outside a transaction. */
export function tapsData(_state: MemoryState): TapsData {
  return {};
}
