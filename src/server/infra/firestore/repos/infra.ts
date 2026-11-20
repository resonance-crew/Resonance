import type { Transaction } from 'firebase-admin/firestore';
import type { InfraData, InfraTxRepo } from '@/server/ports/repos/infra';
import type { AdminDb } from '../db';

/** `infra` inside a Firestore transaction: filled by the lane that owns ports/repos/infra.ts. */
export function infraTx(_db: AdminDb, _tx: Transaction): InfraTxRepo {
  return {};
}

/** `infra` outside a transaction. */
export function infraData(_db: AdminDb): InfraData {
  return {};
}
