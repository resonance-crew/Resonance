/**
 * Read-only diagnostic of what the recommender takes two cards to have in
 * common: for each public card in the candidate pool, the cards it stands
 * nearest to by the funnel's own card score over their parts
 * (lib/recommend/match: centred, CSLS, MaxSim + β × situation — what a
 * reader whose taste is that one card is scored by) — beside how much of the
 * story the reading model was handed and what it wrote of it. It changes
 * nothing.
 *
 *   npx tsx scripts/recommend/nearest.ts                      every card and its 3 nearest
 *   npx tsx scripts/recommend/nearest.ts --card <slug|id>     one card and its 10 nearest
 *     --from <file.json>        a dry run's file (./dryrun.ts) instead of the stored index: the readings and
 *                               vectors it made in memory, ranked the same way (nothing read from production)
 *     --top <n>                 how many neighbours to list
 *     --pair <a>,<b>            where b stands among a's neighbours, and a among b's (repeatable)
 *     --pairs <file.json>       the same, from a file: [["slug-a", "slug-b"], …]
 *     --within <n>              exit 1 when a pair stands further apart than n, either way
 *     --funnel                  for each pair, both ways: the funnel's picks for a reader whose only positive is
 *                               one card (lib/recommend/match slotsFor(1)), and whether the other made the 8
 *     --cosine                  the stored index's first part of one channel, by plain cosine (the older view)
 *     --channel situation       with --cosine: the other channel
 *     --fulltext                with --cosine: a second opinion — each card's whole text embedded (title and
 *                               story, in pieces), and where the card that ranking calls nearest stands in the
 *                               stored one. Sends the pool's public cards' text to OpenAI's embeddings.
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
import { READING_MAX_CHARS, readingText } from '../../src/lib/ai/tasks';
import { plainText } from '../../src/lib/markdown/plainText';
import { currentEmbedModel } from '../../src/lib/recommend/indexCard';
import { recordModel } from '../../src/lib/recommend/poolStats';
import type { PartVector } from '../../src/lib/recommend/match';
import type { DryRun } from './dryrun';
import { chunks, compare, funnelVerdicts, pairVerdicts, pairsHold, pooled, rank, rankMatch, renderReport, resolve, type DiagCard } from './report';

/** What the cards collection is asked for: the words, whether a reader may be shown the card. */
const CARD_FIELDS = ['slug', 'thoughtCore', 'story', 'visibility', 'trashedAt', 'publishedAt', 'thin', 'signature.placeholder'];
/** What a reading is asked for: its lines and judgments — never who wrote the card. */
const READING_FIELDS = ['throughLine', 'insights', 'lifeDomain', 'listedForStrangers', 'moodOnly', 'placeholder'];
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
  cosine: boolean;
  funnel: boolean;
  from?: string;
  out?: string;
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { pairs: [], channel: 'insight', fulltext: false, cosine: false, funnel: false };
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
    else if (flag === '--cosine') args.cosine = true;
    else if (flag === '--funnel') args.funnel = true;
    else if (flag === '--from') args.from = value();
    else if (flag === '--out') args.out = value();
    else fail(`Unknown argument: ${flag}`);
  }
  for (const n of [args.top, args.within]) if (n !== undefined && !(Number.isInteger(n) && n > 0)) fail('--top and --within take a whole number above 0');
  if (args.from && (args.cosine || args.fulltext)) fail('--from ranks by the funnel’s score: --cosine and --fulltext read the stored index');
  if (args.fulltext && !args.cosine) fail('--fulltext compares with --cosine’s ranking');
  if (args.funnel && !args.pairs.length) fail('--funnel needs pairs (--pair or --pairs)');
  return args;
}

/** Whether readers are shown this card: published, public (as a card naming no visibility reads), not in the trash. */
const shown = (data: DocumentData) =>
  data.publishedAt != null && data.trashedAt == null && (data.visibility ?? 'public') === 'public';

/** A dry run's file as the pool: its listed cards and their parts (the file names no writer: every card its own). */
function fromFile(file: string): { pool: DiagCard[]; records: PartVector[]; outside: { thin: number; lowInsight: number; placeholder: number; noVector: number } } {
  const run = JSON.parse(readFileSync(file, 'utf8')) as DryRun;
  const pool: DiagCard[] = [];
  const records: PartVector[] = [];
  const outside = { thin: run.outside?.thin ?? 0, lowInsight: run.outside?.unlisted ?? 0, placeholder: 0, noVector: run.outside?.failed ?? 0 };
  for (const c of run.cards) {
    if (!c.listed || !c.parts.length) continue;
    const first = c.reading?.insights[0];
    pool.push({
      id: c.id,
      key: c.key,
      title: c.title,
      fullChars: c.fullChars,
      readChars: c.readChars,
      coreInsight: c.reading?.throughLine ?? '',
      situation: first?.situation ?? '',
      lifeDomain: c.reading?.lifeDomain ?? '',
    });
    for (const p of c.parts) {
      records.push({ cardId: c.id, channel: p.channel, part: p.part, vector: p.vector });
    }
  }
  console.error(`${file}: ${run.model} / ${run.embedModel}, ${pool.length} listed cards`);
  return { pool, records, outside };
}

/** The stored index as the pool: the public parts of the index's current model, and each card's reading's lines. */
async function fromIndex() {
  const db = getAdminDb();
  const model = currentEmbedModel();
  // Filtered here rather than in the query, which then needs no index of its own; never who wrote a card.
  const stored = await db.collection('cardVectors').select('cardId', 'visibility', 'channel', 'part', 'vector', 'embedModel', 'coreInsight', 'situation', 'span').get();
  const records: (PartVector & { coreInsight: string; situation: string })[] = [];
  for (const doc of stored.docs) {
    const d = doc.data();
    const vector = (d.vector?.toArray?.() ?? []) as number[];
    if (d.visibility !== 'public' || !vector.length || recordModel({ embedModel: d.embedModel ?? '' }) !== model) continue;
    records.push({
      cardId: String(d.cardId),
      channel: d.channel === 'situation' ? 'situation' : 'insight',
      part: Number.isInteger(d.part) ? d.part : 0,
      vector,
      coreInsight: String(d.coreInsight ?? ''),
      situation: String(d.situation ?? ''),
    });
  }
  const withVectors = new Set(records.map((r) => r.cardId));
  // Every card, lightly: the pool's own words, and why a public card is outside it.
  const all = await db.collection('cards').select(...CARD_FIELDS).get();
  const readings = new Map(
    (await db.collection('cardSignatures').select(...READING_FIELDS).get()).docs.map((d) => [d.id, d.data()]),
  );
  const pool: DiagCard[] = [];
  const texts = new Map<string, string>();
  const outside = { thin: 0, lowInsight: 0, placeholder: 0, noVector: 0 };
  for (const doc of all.docs) {
    const data = doc.data();
    if (!shown(data)) {
      withVectors.delete(doc.id);
      continue;
    }
    const reading = readings.get(doc.id);
    if (!withVectors.has(doc.id)) {
      if (data.thin === true) outside.thin++;
      else if (data.signature?.placeholder === true || reading?.placeholder === true) outside.placeholder++;
      else if (reading && reading.listedForStrangers === false) outside.lowInsight++;
      else outside.noVector++;
      continue;
    }
    const title = String(data.thoughtCore ?? '');
    const story = String(data.story ?? '');
    const first = Array.isArray(reading?.insights) ? reading!.insights[0] : undefined;
    const part0 = records.find((r) => r.cardId === doc.id && r.channel === 'insight');
    pool.push({
      id: doc.id,
      key: typeof data.slug === 'string' && data.slug ? data.slug : doc.id,
      title: title.trim(),
      fullChars: `${title.trim()}\n\n${story.trim()}`.trim().length,
      readChars: readingText({ title, story }).length,
      coreInsight: String(reading?.throughLine ?? part0?.coreInsight ?? ''),
      situation: String(first?.situation ?? part0?.situation ?? ''),
      lifeDomain: String(reading?.lifeDomain ?? ''),
    });
    texts.set(doc.id, `${title.trim()}\n\n${plainText(story)}`.trim());
  }
  // A vector whose card is gone names nothing to print.
  const held = new Set(pool.map((c) => c.id));
  return { pool, records: records.filter((r) => held.has(r.cardId)), outside, texts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.from ? { ...fromFile(args.from), texts: new Map<string, string>() } : await fromIndex();
  const { pool, records, outside, texts } = source;
  if (pool.length < 2) fail(`Only ${pool.length} public card(s) with vectors: nothing to compare.`);

  // The funnel's own score over every part — or, with --cosine, the older one-vector view of one channel.
  const rankings = args.cosine
    ? rank(new Map(records.filter((r) => r.channel === args.channel && r.part === 0).map((r) => [r.cardId, r.vector])))
    : rankMatch(records);

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
    readLimit: READING_MAX_CHARS,
    metric: args.cosine ? 'cosine' : 'match',
    funnel: args.funnel ? funnelVerdicts(pool, records, args.pairs, Math.floor(Date.now() / 86_400_000)) : undefined,
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
