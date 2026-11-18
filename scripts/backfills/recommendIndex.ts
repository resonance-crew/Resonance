import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { costOf, dollars } from '../../src/lib/ai/prices';
import { embedModel, signatureModel } from '../../src/lib/ai/openai';
import { readingText } from '../../src/lib/ai/tasks';
import { CARD_SIGNATURES, INDEX_VERSION, indexCard, type IndexOptions, type IndexResult } from '../../src/lib/recommend/indexCard';
import { modelsOffline } from '../../src/lib/text/translation';

/**
 * `scripts/backfill.ts recommend-index [--all] [--apply] [--emulator]` (round
 * 26 §A5.1, D9; replaces scripts/backfill-recommend-index.ts): published
 * cards get round 26's reading — the whole story read once into its insights
 * (lib/recommend/indexCard), server-only in `cardSignatures`, the card keeping
 * its through line, and its parts as vectors — two at a time with a pause
 * between, a formula-phrased reading asked once more (the backfill and the
 * daily cron are the only places it is). Without `--all`, the cards not read
 * by this recipe yet; with it, every published card again. Then:
 *
 * - the older recipe's fields on cards are deleted (`signature.intent`,
 *   `situation`, `lifeDomain`, `emotionalRegister`, `insightScore`), on the
 *   cards the reading left as they were too (a draft, a thin card);
 * - every reader's stored picks lose their `items` and `date` — the next ask
 *   builds them on the new pool — and keep `askedOn` (the evening's push
 *   reads it) and `shown` (what they were shown, §A3.2).
 *
 * A dry run (no `--apply`) counts, estimates tokens and cost, and writes
 * nothing. Under `--emulator` no model is asked (lib/recommend/offline).
 * Production runs are the owner's call, after the push (§E3: an older build
 * still serving would write the older format back).
 */

/** The fields the older recipe kept on a card's `signature`. */
export const LEGACY_SIGNATURE_FIELDS = ['intent', 'situation', 'lifeDomain', 'emotionalRegister', 'insightScore'] as const;
/** About how many tokens a character of a story is (Chinese is about one; English less): an estimate's. */
const TOKENS_PER_CHAR = 0.9;
/** The prompt, the reasoning and the answer of one reading, about (an estimate's). */
const READING_OVERHEAD = { input: 1_400, output: 3_000 };
/** The parts' text, about (an estimate's). */
const EMBED_TOKENS = 500;

export interface RecommendIndexOptions {
  apply: boolean;
  all?: boolean;
  log?: (line: string) => void;
  concurrency?: number;
  pauseMs?: number;
  /** The index (tests). */
  index?: (cardId: string, opts: IndexOptions) => Promise<IndexResult>;
}

export interface RecommendIndexReport {
  published: number;
  targets: number;
  estimate: { input: number; output: number; embed: number; cost: number | null };
  outcomes: Record<string, number>;
  tokens: { input: number; output: number; reasoning: number; embed: number };
  cost: number | null;
  legacyCleared: number;
  recommendationsCleared: number;
}

export async function backfillRecommendIndex(db: Firestore, opts: RecommendIndexOptions): Promise<RecommendIndexReport> {
  const log = opts.log ?? console.log;
  const [cards, readings] = await Promise.all([
    db.collection('cards').where('publishedAt', '!=', null).select('thoughtCore', 'story', 'signature').get(),
    db.collection(CARD_SIGNATURES).select('version', 'error').get(),
  ]);
  const read = new Map(readings.docs.map((d) => [d.id, d.get('version') === INDEX_VERSION && d.get('error') == null]));
  const targets = cards.docs.filter((d) => opts.all || !read.get(d.id));
  const chars = targets.reduce((sum, d) => sum + readingText({ title: String(d.get('thoughtCore') ?? ''), story: String(d.get('story') ?? '') }).length, 0);
  const estimate = {
    input: Math.round(chars * TOKENS_PER_CHAR) + targets.length * READING_OVERHEAD.input,
    output: targets.length * READING_OVERHEAD.output,
    embed: targets.length * EMBED_TOKENS,
    cost: null as number | null,
  };
  const offline = modelsOffline();
  const readingCost = offline ? 0 : costOf(signatureModel(), estimate);
  const embedCost = offline ? 0 : costOf(embedModel(), { input: estimate.embed, output: 0 });
  estimate.cost = readingCost === null || embedCost === null ? null : readingCost + embedCost;
  log(`published cards: ${cards.size}, to read${opts.all ? ' (--all)' : ''}: ${targets.length}`);
  log(`  ${offline ? 'offline (no model asked)' : `reading model ${signatureModel()}, embedding model ${embedModel()}`}`);
  log(`  estimate: ~${estimate.input.toLocaleString('en-US')} input + ~${estimate.output.toLocaleString('en-US')} output tokens, ~${estimate.embed.toLocaleString('en-US')} embedding tokens, ${dollars(estimate.cost)}`);

  const report: RecommendIndexReport = {
    published: cards.size,
    targets: targets.length,
    estimate,
    outcomes: {},
    tokens: { input: 0, output: 0, reasoning: 0, embed: 0 },
    cost: null,
    legacyCleared: 0,
    recommendationsCleared: 0,
  };
  const legacy = cards.docs.filter((d) => LEGACY_SIGNATURE_FIELDS.some((f) => d.get(`signature.${f}`) !== undefined));
  log(`cards still carrying the older recipe's fields: ${legacy.length}`);
  if (!opts.apply) {
    report.recommendationsCleared = await clearRecommendations(db, { apply: false });
    log(`readers' stored picks to clear (items and date only): ${report.recommendationsCleared}`);
    return report;
  }

  const index = opts.index ?? indexCard;
  const concurrency = opts.concurrency ?? 2;
  const pause = opts.pauseMs ?? 500;
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < targets.length) {
        const doc = targets[next++];
        try {
          const result = await index(doc.id, {
            force: true,
            rewrite: true,
            onUsage: (u) => {
              report.tokens.input += u.input;
              report.tokens.output += u.output;
              report.tokens.reasoning += u.reasoning;
              report.tokens.embed += u.embed;
            },
          });
          const outcome = result.reason ?? 'indexed';
          report.outcomes[outcome] = (report.outcomes[outcome] ?? 0) + 1;
          log(`  ${doc.id}: ${result.indexed ? `read (${result.channels} vectors)` : outcome}`);
        } catch (err) {
          report.outcomes.error = (report.outcomes.error ?? 0) + 1;
          log(`  ${doc.id}: FAILED ${err instanceof Error ? err.message : String(err)}`);
        }
        if (pause) await new Promise((r) => setTimeout(r, pause));
      }
    }),
  );
  const spentReading = offline ? 0 : costOf(signatureModel(), report.tokens);
  const spentEmbed = offline ? 0 : costOf(embedModel(), { input: report.tokens.embed, output: 0 });
  report.cost = spentReading === null || spentEmbed === null ? null : spentReading + spentEmbed;
  log(`tokens: ${report.tokens.input} input, ${report.tokens.output} output (${report.tokens.reasoning} reasoning), ${report.tokens.embed} embedding — ${dollars(report.cost)}`);

  // The older recipe's fields, wherever the reading left them (an update only: a card deleted meanwhile stays so).
  const still = await db.collection('cards').where('publishedAt', '!=', null).select('signature').get();
  for (const d of still.docs) {
    const stale = LEGACY_SIGNATURE_FIELDS.filter((f) => d.get(`signature.${f}`) !== undefined);
    if (!stale.length) continue;
    await d.ref.update(Object.fromEntries(stale.map((f) => [`signature.${f}`, FieldValue.delete()]))).catch(() => undefined);
    report.legacyCleared++;
  }
  log(`older fields deleted on ${report.legacyCleared} card(s)`);
  report.recommendationsCleared = await clearRecommendations(db, { apply: true });
  log(`cleared the items of ${report.recommendationsCleared} reader(s)' stored picks (askedOn and shown kept)`);
  return report;
}

/**
 * Every reader's stored picks lose their `items` and `date` (the next ask
 * builds them on the new pool), keeping `askedOn` and `shown`. Counts the
 * documents that hold items; with `apply`, clears them.
 */
export async function clearRecommendations(db: Firestore, opts: { apply: boolean }): Promise<number> {
  const recs = await db.collection('recommendations').select('date', 'items').get();
  const holding = recs.docs.filter((d) => d.get('items') !== undefined || d.get('date') !== undefined);
  if (opts.apply) {
    for (let i = 0; i < holding.length; i += 400) {
      const batch = db.batch();
      for (const d of holding.slice(i, i + 400)) batch.update(d.ref, { items: FieldValue.delete(), date: FieldValue.delete() });
      await batch.commit();
    }
  }
  return holding.length;
}
