import type { AccountData, AccountTxRepo } from '@/server/ports/repos/account';
import type { MemoryState } from '../state';
import type { MemoryTx } from '../uow';

/** `account` inside a memory transaction: filled by the lane that owns ports/repos/account.ts (reads through `tx.get` / `tx.rows`, writes through `tx.put` / `tx.delete`). */
export function accountTx(_tx: MemoryTx): AccountTxRepo {
  return {};
}

/** `account` outside a transaction. */
export function accountData(_state: MemoryState): AccountData {
  return {};
}
