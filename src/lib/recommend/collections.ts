import type { AdminDb } from '@/server/infra/firestore/db';
import { recommendData } from '@/server/infra/firestore/repos/recommend';

/**
 * The recommender's server-only collections, named where nothing that
 * builds picks is imported: account deletion and card deletion run beside
 * Firestore and must not reach the OpenAI client (src/lib/ai/regions.test.ts
 * follows imports). The names and the reads live in the recommend
 * repository (src/server/infra/firestore/repos/recommend.ts), which reaches
 * no model either.
 */

/** A card's reading (round 26 §A1.6), by card id. */
export { CARD_SIGNATURES } from '@/server/infra/firestore/repos/recommend';

/**
 * Which of these cards their reading keeps from strangers
 * (`cardSignatures.listedForStrangers: false`, round 26 §A1.7: feeling
 * only, too little a stranger could take, a placeholder) — one batch read of
 * that one field. A card not read yet (no reading, or one from before round
 * 26) is not held back: nothing has judged it.
 */
export function unlistedForStrangers(db: AdminDb, cardIds: string[]): Promise<Set<string>> {
  return recommendData(db).unlistedForStrangers(cardIds);
}
