import type { InfraData, InfraTxRepo } from '@/server/ports/repos/infra';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/** `infra` inside a memory transaction: filled by the lane that owns ports/repos/infra.ts (reads through `tx.get` / `tx.rows`, writes through `tx.put` / `tx.delete`). */
export function infraTx(_tx: MemoryTx): InfraTxRepo {
  return {};
}

/** `infra` outside a transaction. */
export function infraData(_state: MemoryState): InfraData {
  return {};
}
