import { runPool } from '@/lib/push/pool';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { embedModel, signatureModel } from '@/lib/ai/openai';
import { costOf } from '@/lib/ai/prices';
import { CARD_SIGNATURES, indexCard, type IndexResult } from './indexCard';

/**
 * The daily re-reading (round 26 §A1.8, `/api/cron/index-cards`): the cards
 * whose reading is owed — an applied edit (`indexPendingAt`, which applying
 * sets rather than reading the whole story again at once), a reading cut
 * short or failed after a publish (indexCard leaves the mark) — and the
 * readings in formula phrasings not yet asked again (`templated`, §A1.5: the
 * one rewrite happens here and in the backfill, never on publish). At most
 * `limit` readings a run (each one LLM call, two for a rewrite); a card whose
 * text turns out unchanged costs no call and no place. Logs tokens and cost.
 */

/** Readings a run asks for at most. */
export const INDEX_OWED_LIMIT = 20;
/** Owed cards a run looks at (an unchanged one is settled without a call). */
const EXAMINED_MAX = 200;
/** How many cards are read at once. */
export const INDEX_OWED_CONCURRENCY = 3;

/** The results that asked no model. */
const NO_CALL = new Set<IndexResult['reason']>(['unchanged', 'blank', 'thin', 'not-published', 'not-found', 'over-budget']);

export interface IndexOwedRun {
  examined: number;
  read: number;
  outcomes: Record<string, number>;
  /** Cards left for the next run (the limit or the deadline). */
  left: number;
  tokens: { input: number; output: number; reasoning: number; embed: number };
  /** Dollars, or null when a model has no price (lib/ai/prices). */
  cost: number | null;
}

export async function indexOwed(db: Firestore, opts: { limit?: number; deadline?: number; now?: () => number } = {}): Promise<IndexOwedRun> {
  const limit = opts.limit ?? INDEX_OWED_LIMIT;
  const now = opts.now ?? Date.now;
  const [pending, templated] = await Promise.all([
    db.collection('cards').where('indexPendingAt', '!=', null).orderBy('indexPendingAt', 'asc').select().limit(EXAMINED_MAX).get(),
    db.collection(CARD_SIGNATURES).where('templated', '==', true).select('rewritten').limit(EXAMINED_MAX).get(),
  ]);
  const owed = [
    ...pending.docs.map((d) => ({ id: d.id, rewrite: false })),
    ...templated.docs.filter((d) => d.get('rewritten') !== true).map((d) => ({ id: d.id, rewrite: true })),
  ].filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i);
  const run: IndexOwedRun = { examined: 0, read: 0, outcomes: {}, left: 0, tokens: { input: 0, output: 0, reasoning: 0, embed: 0 }, cost: 0 };
  // Three at a time (B16): each reading takes 20–60 s, and one after another twenty overran the cron's 300 s.
  // None is started past the deadline, nor once those read and still reading could reach the limit.
  let reading = 0;
  const { notStarted } = await runPool(
    owed,
    INDEX_OWED_CONCURRENCY,
    async (card) => {
      run.examined++;
      reading++;
      try {
        const result = await indexCard(card.id, {
          // A templated reading's text is unchanged: asked again all the same, once.
          force: card.rewrite,
          rewrite: true,
          onUsage: (u) => {
            run.tokens.input += u.input;
            run.tokens.output += u.output;
            run.tokens.reasoning += u.reasoning;
            run.tokens.embed += u.embed;
          },
        });
        const outcome = result.reason ?? 'indexed';
        run.outcomes[outcome] = (run.outcomes[outcome] ?? 0) + 1;
        if (!NO_CALL.has(result.reason)) run.read++;
      } catch (e) {
        run.read++;
        run.outcomes.error = (run.outcomes.error ?? 0) + 1;
        console.error('[index-cards]', card.id, e);
      } finally {
        reading--;
      }
    },
    { tag: '[index-cards]', stop: () => run.read + reading >= limit || (opts.deadline !== undefined && now() >= opts.deadline) },
  );
  run.left = notStarted;
  const readCost = costOf(signatureModel(), run.tokens);
  const embedding = costOf(embedModel(), { input: run.tokens.embed, output: 0 });
  run.cost = readCost === null || embedding === null ? null : readCost + embedding;
  return run;
}

/**
 * Mark a card's reading owed (an applied edit): the daily run reads it again.
 * An update, so a card deleted meanwhile stays deleted; one gone is no error.
 */
export async function markIndexOwed(db: Firestore, cardId: string): Promise<void> {
  await db
    .collection('cards')
    .doc(cardId)
    .update({ indexPendingAt: FieldValue.serverTimestamp() })
    .catch((e: unknown) => {
      if ((e as { code?: unknown } | null)?.code !== 5) throw e;
    });
}
