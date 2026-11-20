import type { Transaction } from 'firebase-admin/firestore';
import type { TapsData, TapsTxRepo } from '@/server/ports/repos/taps';
import type { AdminDb } from '../db';

/** `taps` inside a Firestore transaction: filled by the lane that owns ports/repos/taps.ts. */
export function tapsTx(_db: AdminDb, _tx: Transaction): TapsTxRepo {
  return {};
}

/** `taps` outside a transaction. */
export function tapsData(_db: AdminDb): TapsData {
  return {};
}
