import type { RecommendData, RecommendTxRepo } from '@/server/ports/repos/recommend';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/** `recommend` inside a memory transaction: filled by the lane that owns ports/repos/recommend.ts (reads through `tx.get` / `tx.rows`, writes through `tx.put` / `tx.delete`). */
export function recommendTx(_tx: MemoryTx): RecommendTxRepo {
  return {};
}

/** `recommend` outside a transaction. */
export function recommendData(_state: MemoryState): RecommendData {
  return {};
}
