import type { Transaction } from 'firebase-admin/firestore';
import type { GraphData, GraphTxRepo } from '@/server/ports/repos/graph';
import type { AdminDb } from '../db';

/** `graph` inside a Firestore transaction: filled by the lane that owns ports/repos/graph.ts. */
export function graphTx(_db: AdminDb, _tx: Transaction): GraphTxRepo {
  return {};
}

/** `graph` outside a transaction. */
export function graphData(_db: AdminDb): GraphData {
  return {};
}
