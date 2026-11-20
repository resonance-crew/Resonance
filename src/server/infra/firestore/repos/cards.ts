import type { Transaction } from 'firebase-admin/firestore';
import type { CardsData, CardsTxRepo } from '@/server/ports/repos/cards';
import type { AdminDb } from '../db';

/** `cards` inside a Firestore transaction: filled by the lane that owns ports/repos/cards.ts. */
export function cardsTx(_db: AdminDb, _tx: Transaction): CardsTxRepo {
  return {};
}

/** `cards` outside a transaction. */
export function cardsData(_db: AdminDb): CardsData {
  return {};
}
