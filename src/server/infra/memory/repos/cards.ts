import type { CardsData, CardsTxRepo } from '@/server/ports/repos/cards';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/** `cards` inside a memory transaction: filled by the lane that owns ports/repos/cards.ts (reads through `tx.get` / `tx.rows`, writes through `tx.put` / `tx.delete`). */
export function cardsTx(_tx: MemoryTx): CardsTxRepo {
  return {};
}

/** `cards` outside a transaction. */
export function cardsData(_state: MemoryState): CardsData {
  return {};
}
