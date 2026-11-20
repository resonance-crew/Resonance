import type { Transaction } from 'firebase-admin/firestore';
import type { PushStateData, PushStateTxRepo } from '@/server/ports/repos/pushState';
import type { AdminDb } from '../db';

/** `pushState` inside a Firestore transaction: filled by the lane that owns ports/repos/pushState.ts. */
export function pushStateTx(_db: AdminDb, _tx: Transaction): PushStateTxRepo {
  return {};
}

/** `pushState` outside a transaction. */
export function pushStateData(_db: AdminDb): PushStateData {
  return {};
}
