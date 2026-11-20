import type { Transaction } from 'firebase-admin/firestore';
import type { BellData, BellTxRepo } from '@/server/ports/repos/bell';
import type { AdminDb } from '../db';

/** `bell` inside a Firestore transaction: filled by the lane that owns ports/repos/bell.ts. */
export function bellTx(_db: AdminDb, _tx: Transaction): BellTxRepo {
  return {};
}

/** `bell` outside a transaction. */
export function bellData(_db: AdminDb): BellData {
  return {};
}
