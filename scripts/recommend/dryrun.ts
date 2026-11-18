/**
 * The model bake-off's dry run (round 26 §A5.2, §E1; D3): production's
 * public cards read **read-only**, each given round 26's reading and its
 * parts' vectors **in memory** with the models named, and the lot written to
 * a local JSON file — which `nearest.ts --from <file>` ranks with the
 * funnel's own scoring. Nothing is written to Firestore, of any kind: the
 * index production serves is left as it is (an older build still serving
 * would write the older format back over a backfill, D3).
 *
 *   npx tsx scripts/recommend/dryrun.ts --model gpt-6.2-sol --embed text-embedding-3-small --out sol-small.json
 *     --limit <n>         the first n cards only (newest first)
 *     --card <slug|id>    one card only
 *     --concurrency <n>   readings at once (2)
 *
 * Production, credentials from .env (FIREBASE_*, OPENAI_API_KEY). The
 * cards' text goes to OpenAI, as publishing a card already sends it.
 *
 * Public cards only, by title and slug, never by who wrote them: the file
 * names no writer — no uid, no pen name (report.test.ts scans this file) —
 * so a list made from it can't name an anonymous card's writer.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminDb } from '../../src/lib/db/firestore/admin';
import { ChatIncomplete, embed, type TokenUsage } from '../../src/lib/ai/openai';
import { costOf, dollars } from '../../src/lib/ai/prices';
import { fullReadingChars, INDEX_DEADLINE_MS, readCard, readingText } from '../../src/lib/ai/tasks';
import { thinCard } from '../../src/lib/cards/blank';
import { formulaPhrases, listedForStrangers, readingParts } from '../../src/lib/recommend/signature';
import type { CardReading } from '../../src/lib/db/types';

/** One card of the file. */
export interface DryCard {
  id: string;
  /** The slug, or the id without one: what the report and --pair name it by. */
  key: string;
  title: string;
  fullChars: number;
  readChars: number;
  reading: CardReading | null;
  listed: boolean;
  templated: boolean;
  /** The reading model gave none (length, refusal: the fallback's stands in, failed). */
  error: string | null;
  parts: { channel: 'insight' | 'situation'; part: number; insight: string; situation: string; span: string; vector: number[] }[];
}

export interface DryRun {
  at: string;
  model: string;
  embedModel: string;
  cards: DryCard[];
  /** Public published cards the run gave no parts, by why. */
  outside: { thin: number; unlisted: number; failed: number };
  usage: TokenUsage & { embed: number };
  cost: number | null;
}

interface Args {
  model: string;
  embed: string;
  out: string;
  limit?: number;
  card?: string;
  concurrency: number;
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { concurrency: 2 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i] ?? fail(`${flag} needs a value`);
    if (flag === '--model') args.model = value();
    else if (flag === '--embed') args.embed = value();
    else if (flag === '--out') args.out = value();
    else if (flag === '--limit') args.limit = Number(value());
    else if (flag === '--card') args.card = value();
    else if (flag === '--concurrency') args.concurrency = Number(value());
    else fail(`Unknown argument: ${flag}`);
  }
  if (!args.model || !args.embed || !args.out) fail('--model, --embed and --out are all needed');
  for (const n of [args.limit, args.concurrency]) if (n !== undefined && !(Number.isInteger(n) && n > 0)) fail('--limit and --concurrency take a whole number above 0');
  return args as Args;
}

/** Whether readers are shown this card: published, public (as a card naming no visibility reads), not in the trash. */
const shown = (data: DocumentData) => data.publishedAt != null && data.trashedAt == null && (data.visibility ?? 'public') === 'public';
/** A vector to six places: the file stays a few megabytes, the ranking the same. */
const short = (v: number[]) => v.map((x) => Math.round(x * 1e6) / 1e6);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getAdminDb();
  // Read-only: one query, the fields a reading needs — never who wrote a card.
  const snap = await db.collection('cards').where('visibility', '==', 'public').select('slug', 'thoughtCore', 'story', 'publishedAt', 'trashedAt', 'visibility').get();
  let docs = snap.docs.filter((d) => shown(d.data())).sort((a, b) => b.get('publishedAt').toMillis() - a.get('publishedAt').toMillis());
  if (args.card) docs = docs.filter((d) => d.id === args.card || d.get('slug') === args.card);
  if (args.limit) docs = docs.slice(0, args.limit);
  console.error(`${docs.length} public cards, reading with ${args.model}, embedding with ${args.embed}…`);

  const run: DryRun = {
    at: new Date().toISOString(),
    model: args.model,
    embedModel: args.embed,
    cards: [],
    outside: { thin: 0, unlisted: 0, failed: 0 },
    usage: { input: 0, output: 0, reasoning: 0, embed: 0 },
    cost: null,
  };
  const count = (u: TokenUsage) => {
    run.usage.input += u.input;
    run.usage.output += u.output;
    run.usage.reasoning += u.reasoning;
  };
  let next = 0;
  await Promise.all(
    Array.from({ length: args.concurrency }, async () => {
      while (next < docs.length) {
        const doc = docs[next++];
        const title = String(doc.get('thoughtCore') ?? '');
        const story = String(doc.get('story') ?? '');
        const key = typeof doc.get('slug') === 'string' && doc.get('slug') ? String(doc.get('slug')) : doc.id;
        const card: DryCard = {
          id: doc.id,
          key,
          title: title.trim(),
          fullChars: fullReadingChars({ title, story }),
          readChars: readingText({ title, story }).length,
          reading: null,
          listed: false,
          templated: false,
          error: null,
          parts: [],
        };
        if (thinCard({ thoughtCore: title, story })) {
          run.outside.thin++;
          continue;
        }
        try {
          const signal = AbortSignal.timeout(INDEX_DEADLINE_MS);
          let result = await readCard({ title, story }, { model: args.model, signal, onUsage: count });
          // As the backfill does: a reading in formula phrasings is asked once more.
          const found = result.error === null ? formulaPhrases(result.reading, title) : [];
          if (found.length) result = await readCard({ title, story }, { model: args.model, signal, onUsage: count, avoid: found });
          card.reading = result.reading;
          card.error = result.error;
          card.listed = listedForStrangers(result.reading);
          card.templated = formulaPhrases(result.reading, title).length > 0;
          if (card.listed) {
            const parts = readingParts(result.reading);
            const vectors = await embed(
              parts.map((p) => p.text),
              { model: args.embed, signal, onUsage: (u) => (run.usage.embed += u.input) },
            );
            card.parts = parts.map((p, i) => ({ channel: p.channel, part: p.part, insight: p.insight, situation: p.situation, span: p.span, vector: short(vectors[i] ?? []) }));
          } else run.outside.unlisted++;
        } catch (e) {
          card.error = e instanceof ChatIncomplete ? e.kind : 'failed';
          run.outside.failed++;
          console.error(`  ${key}: ${card.error} ${e instanceof Error ? e.message : ''}`);
        }
        run.cards.push(card);
        console.error(`  ${key}: ${card.listed ? `${card.parts.length} parts` : card.error ?? 'not for strangers'}`);
      }
    }),
  );
  run.cards.sort((a, b) => a.key.localeCompare(b.key));
  const reading = costOf(args.model, run.usage);
  const embedding = costOf(args.embed, { input: run.usage.embed, output: 0 });
  run.cost = reading === null || embedding === null ? null : reading + embedding;
  writeFileSync(args.out, JSON.stringify(run));
  console.error(
    `Wrote ${args.out}: ${run.cards.filter((c) => c.listed).length} listed of ${run.cards.length}; ${run.usage.input} input, ${run.usage.output} output (${run.usage.reasoning} reasoning), ${run.usage.embed} embedding tokens — ${dollars(run.cost)}`,
  );
}

if (process.argv[1]?.endsWith('dryrun.ts')) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
