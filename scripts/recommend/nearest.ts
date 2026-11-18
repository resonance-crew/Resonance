/**
 * Read-only diagnostic of what the recommender takes two cards to have in
 * common: for each public card in the candidate pool, the cards its stored
 * vector stands nearest to — the order the feed's first step (funnel.ts, the
 * vector search) hands on for a reader whose profile is that one card —
 * beside how much of the story the signature model was handed and what it
 * wrote of it. It changes nothing.
 *
 *   npx tsx scripts/recommend/nearest.ts                      every card and its 3 nearest
 *   npx tsx scripts/recommend/nearest.ts --card <slug|id>     one card and its 10 nearest
 *     --top <n>                 how many neighbours to list
 *     --pair <a>,<b>            where b stands among a's neighbours, and a among b's (repeatable)
 *     --pairs <file.json>       the same, from a file: [["slug-a", "slug-b"], …]
 *     --within <n>              exit 1 when a pair stands further apart than n, either way
 *     --channel situation       the other stored channel (the feed reads insight alone today)
 *     --fulltext                a second opinion: each card's whole text embedded (title and
 *                               story, in pieces), and where the card that ranking calls nearest
 *                               stands in the stored one. Sends the pool's public cards' text to
 *                               OpenAI's embeddings — the model the index itself uses.
 *     --out <file>              write the report (Markdown) there instead of printing it
 *
 * Production, credentials from .env (FIREBASE_*; OPENAI_API_KEY for --fulltext).
 *
 * Public cards only, by title and slug, never by who wrote them: a list that
 * left a writer's own cards out, or marked them, would name an anonymous
 * card's writer (.claude/rules/safety.md) — so this reads no card's writer at all.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminDb } from '../../src/lib/db/firestore/admin';
import { embed } from '../../src/lib/ai/openai';
import { signatureText } from '../../src/lib/ai/tasks';
import { plainText } from '../../src/lib/markdown/plainText';
import { isIndexable, parseSignature } from '../../src/lib/recommend/signature';
import { chunks, compare, pairVerdicts, pairsHold, pooled, rank, renderReport, resolve, type DiagCard } from './report';

/** What the cards collection is asked for: the words, the signature, whether a reader may be shown the card. */
const CARD_FIELDS = ['slug', 'thoughtCore', 'story', 'signature', 'visibility', 'trashedAt', 'publishedAt', 'thin'];
/** The longest piece of a story embedded for --fulltext, in characters (well inside the model's input limit in any script). */
const PIECE_CHARS = 1500;
/** Pieces per embeddings call, and how long one call may take. */
const EMBED_BATCH = 48;
const EMBED_TIMEOUT_MS = 60_000;

interface Args {
  card?: string;
  top?: number;
  pairs: [string, string][];
  within?: number;
  channel: 'insight' | 'situation';
  fulltext: boolean;
  out?: string;
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { pairs: [], channel: 'insight', fulltext: false };
  const pair = (value: string): [string, string] => {
    const [a, b, ...rest] = value.split(',').map((s) => s.trim());
    if (!a || !b || rest.length) fail(`--pair takes two cards, a comma between them: ${value}`);
    return [a, b];
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i] ?? fail(`${flag} needs a value`);
    if (flag === '--card') args.card = value();
    else if (flag === '--top') args.top = Number(value());
    else if (flag === '--pair') args.pairs.push(pair(value()));
    else if (flag === '--pairs') {
      const listed: unknown = JSON.parse(readFileSync(value(), 'utf8'));
      if (!Array.isArray(listed)) fail('--pairs: the file holds a list of [a, b] pairs');
      for (const p of listed as unknown[]) args.pairs.push(pair(Array.isArray(p) ? p.join(',') : String(p)));
    } else if (flag === '--within') args.within = Number(value());
    else if (flag === '--channel') {
      const channel = value();
      if (channel !== 'insight' && channel !== 'situation') fail('--channel is insight or situation');
      args.channel = channel;
    } else if (flag === '--fulltext') args.fulltext = true;
    else if (flag === '--out') args.out = value();
    else fail(`Unknown argument: ${flag}`);
  }
  for (const n of [args.top, args.within]) if (n !== undefined && !(Number.isInteger(n) && n > 0)) fail('--top and --within take a whole number above 0');
  return args;
}

/** Whether readers are shown this card: published, public (as a card naming no visibility reads), not in the trash. */
const shown = (data: DocumentData) =>
  data.publishedAt != null && data.trashedAt == null && (data.visibility ?? 'public') === 'public';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getAdminDb();

  // The channel's vectors. Filtered here rather than in the query, which then needs no index of its own.
  const stored = await db.collection('cardVectors').where('channel', '==', args.channel).select('cardId', 'visibility', 'vector').get();
  const vectors = new Map<string, number[]>();
  for (const doc of stored.docs) {
    const data = doc.data();
    if (data.visibility !== 'public') continue;
    const vector = (data.vector?.toArray?.() ?? []) as number[];
    if (vector.length > 0) vectors.set(String(data.cardId), vector);
  }

  // Every card, lightly: the pool's own words, and why a public card is outside it.
  const all = await db.collection('cards').select(...CARD_FIELDS).get();
  const pool: DiagCard[] = [];
  const texts = new Map<string, string>();
  const outside = { thin: 0, lowInsight: 0, placeholder: 0, noVector: 0 };
  for (const doc of all.docs) {
    const data = doc.data();
    if (!shown(data)) {
      vectors.delete(doc.id);
      continue;
    }
    const signature = parseSignature(data.signature);
    if (!vectors.has(doc.id)) {
      if (data.thin === true) outside.thin++;
      else if (signature.placeholder === true) outside.placeholder++;
      else if (data.signature && !isIndexable(signature)) outside.lowInsight++;
      else outside.noVector++;
      continue;
    }
    const title = String(data.thoughtCore ?? '');
    const story = String(data.story ?? '');
    pool.push({
      id: doc.id,
      key: typeof data.slug === 'string' && data.slug ? data.slug : doc.id,
      title: title.trim(),
      fullChars: `${title.trim()}\n\n${story.trim()}`.trim().length,
      readChars: signatureText({ title, story }).length,
      coreInsight: signature.coreInsight,
      situation: signature.situation,
      lifeDomain: signature.lifeDomain,
    });
    texts.set(doc.id, `${title.trim()}\n\n${plainText(story)}`.trim());
  }
  // A vector whose card is gone names nothing to print.
  const held = new Set(pool.map((c) => c.id));
  for (const id of [...vectors.keys()]) if (!held.has(id)) vectors.delete(id);
  if (pool.length < 2) fail(`Only ${pool.length} public card(s) with a ${args.channel} vector: nothing to compare.`);

  const rankings = rank(vectors);

  let whole: ReturnType<typeof rank> | undefined;
  if (args.fulltext) {
    const pieces = pool.flatMap((c) => chunks(texts.get(c.id) ?? '', PIECE_CHARS).map((text) => ({ id: c.id, text })));
    console.error(`Embedding ${pieces.length} pieces of ${pool.length} cards…`);
    const embedded: number[][] = [];
    for (let at = 0; at < pieces.length; at += EMBED_BATCH) {
      const batch = pieces.slice(at, at + EMBED_BATCH).map((p) => p.text);
      embedded.push(...(await embed(batch, { signal: AbortSignal.timeout(EMBED_TIMEOUT_MS) })));
    }
    const byCard = new Map<string, { vector: number[]; chars: number }[]>();
    pieces.forEach((p, i) => byCard.set(p.id, [...(byCard.get(p.id) ?? []), { vector: embedded[i] ?? [], chars: p.text.length }]));
    whole = rank(new Map([...byCard].map(([id, parts]) => [id, pooled(parts)])));
  }

  let cards: DiagCard[];
  if (args.card) {
    const one = resolve(pool, args.card);
    if (!one) fail(`No public card in the pool by that slug or id: ${args.card}`);
    cards = [one];
  } else if (whole) {
    // Where the two orders disagree most comes first.
    const versus = compare(rankings, whole);
    cards = [...pool].sort((a, b) => (versus.rows.get(b.id)?.rank ?? 0) - (versus.rows.get(a.id)?.rank ?? 0) || a.key.localeCompare(b.key));
  } else {
    cards = [...pool].sort((a, b) => a.key.localeCompare(b.key));
  }

  const report = renderReport({
    channel: args.channel,
    cards,
    pool,
    rankings,
    top: args.top ?? (args.card ? 10 : 3),
    outside,
    pairs: args.pairs,
    whole,
    readLimit: signatureText({ title: '', story: 'x'.repeat(100_000) }).length,
  });
  if (args.out) {
    writeFileSync(args.out, report);
    console.error(`Wrote ${args.out} (${pool.length} cards)`);
  } else {
    process.stdout.write(report);
  }

  if (args.within !== undefined && !pairsHold(pairVerdicts(pool, rankings, args.pairs), args.within)) {
    console.error(`A pair stands further apart than ${args.within}.`);
    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
