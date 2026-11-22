import type { DocumentData, DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { openRequest } from '@/lib/api/v1/conversations';
import { letterReadsAsConnectionIn } from '@/server/app/preLetter';
import { reachOriginalWith } from '@/server/app/resonate';
import { answeredByReasons, type KeyedReason } from '@/server/domain/graph';
import type { Reach } from '@/server/ports/repos/graph';
import { ctxFor } from '../ctx';
import type { AdminDb } from '../db';
import { graphTx, originsOf, resonanceCardOf } from '../repos/graph';

// The graph aggregate's legacy helpers that take a Firestore Transaction or
// snapshot — composed today by other modules' transactions (trash, cards,
// edits, conversations, reads) — re-exported from their old paths
// (src/lib/api/v1/{origins,resonate,preLetter}.ts) with their old
// signatures, over the same code as the services. They go when those
// callers' lanes move to `tx.graph`.

/** See src/lib/api/v1/resonate.ts `reachOriginal` (`card`: the resonance as the transaction leaves it). */
export function reachOriginal(tx: Transaction, db: AdminDb, cardId: string, card: DocumentData, r: Reach, made?: string[][]): string | null {
  return reachOriginalWith(graphTx(db, tx), cardId, resonanceCardOf(card), r, Date.now(), made);
}

/** See src/lib/api/v1/origins.ts `answeredBy` (`origins` as read in the same transaction). */
export function answeredBy(origins: DocumentSnapshot | null | undefined, uid: string, other: string): KeyedReason | null {
  return answeredByReasons(originsOf(origins), uid, other);
}

/** See src/lib/api/v1/preLetter.ts `letterReadsAsConnection`. */
export function letterReadsAsConnection(db: AdminDb, viewerId: string, writerId: string, conversation: DocumentSnapshot): Promise<boolean> {
  return letterReadsAsConnectionIn(ctxFor(db), viewerId, writerId, openRequest(conversation)?.from ?? null);
}
