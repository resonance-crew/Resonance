import type { Transaction } from 'firebase-admin/firestore';
import type { RecommendData, RecommendTxRepo } from '@/server/ports/repos/recommend';
import type { AdminDb } from '../db';

/** `recommend` inside a Firestore transaction: filled by the lane that owns ports/repos/recommend.ts. */
export function recommendTx(_db: AdminDb, _tx: Transaction): RecommendTxRepo {
  return {};
}

/** `recommend` outside a transaction. */
export function recommendData(_db: AdminDb): RecommendData {
  return {};
}
