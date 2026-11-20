import type { Transaction } from 'firebase-admin/firestore';
import type { AccountData, AccountTxRepo } from '@/server/ports/repos/account';
import type { AdminDb } from '../db';

/** `account` inside a Firestore transaction: filled by the lane that owns ports/repos/account.ts. */
export function accountTx(_db: AdminDb, _tx: Transaction): AccountTxRepo {
  return {};
}

/** `account` outside a transaction. */
export function accountData(_db: AdminDb): AccountData {
  return {};
}
