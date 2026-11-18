import type { Firestore } from 'firebase-admin/firestore';

/**
 * The recommender's server-only collections, named where nothing else is
 * imported: account deletion and card deletion run beside Firestore and must
 * not reach the OpenAI client (src/lib/ai/regions.test.ts follows imports).
 */

/** A card's reading (round 26 §A1.6), by card id. */
export const CARD_SIGNATURES = 'cardSignatures';


/**
 * Which of these cards their reading keeps from strangers
 * (`cardSignatures.listedForStrangers: false`, round 26 §A1.7: feeling
 * only, too little a stranger could take, a placeholder) — one batch read of
 * that one field. A card not read yet (no reading, or one from before round
 * 26) is not held back: nothing has judged it.
 */
export async function unlistedForStrangers(db: Firestore, cardIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(cardIds.filter((id) => id && !id.includes('/')))];
  if (!ids.length) return new Set();
  const snaps = await db.getAll(...ids.map((id) => db.collection(CARD_SIGNATURES).doc(id)), { fieldMask: ['listedForStrangers'] });
  return new Set(snaps.filter((s) => s.exists && s.get('listedForStrangers') === false).map((s) => s.id));
}
