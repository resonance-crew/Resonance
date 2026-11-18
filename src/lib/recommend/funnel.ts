import type { Firestore } from 'firebase-admin/firestore';
import { chatJSON, rerankModel, selectModel } from '@/lib/ai/openai';
import { getAdminDb } from '@/lib/db/firestore/admin';
import type { RecommendationItem } from '@/lib/db/types';
import {
  AUTHOR_MAX,
  EXACT_POOL_MAX,
  PICKS,
  slotsFor,
  authorKey,
  clusterTaste,
  farthestPoint,
  matchCards,
  mmr,
  partKey,
  poolStats,
  relevance,
  csls,
  type Candidate,
  type MatchCard,
  type PoolStats,
  type TasteVote,
} from './match';
import { publicPool, readPoolStats, recordModel } from './poolStats';
import { buildUserProfile, type UserProfile } from './profile';
import { buildRerankMessages, parseRerankScores, type RerankCandidate } from './rerank';
import { buildSelectMessages, parseSelection, type SelectCandidate, type Selection } from './select';
import { getEngagedAuthorIds, namedCardIds } from './signals';
import { currentEmbedModel } from './indexCard';
import { getVectorStore } from './vectorStore';
import type { VectorRecord } from './vectorStore/types';

// Funnel widths — the whole funnel narrows as it gets more expensive.
/** Above EXACT_POOL_MAX, the nearest parts each taste part asks for. */
const ANN_PER_PART = 60;
/** Candidates the rerank reads. */
const RERANK_INPUT = 30;
const SELECT_INPUT = 12;
export const LLM_FINAL = PICKS;
/** In a cold start, at most this many of the 8 are the reader's connections' newest named cards. */
const COLD_CONNECTIONS = 4;
/** At 20 positive cards or more the taste is clustered (match clusterTaste). */
const CLUSTER_AT = 20;
/** The kept pool numbers (./poolStats, daily) are used while younger than this. */
const POOL_STATS_FRESH_MS = 36 * 60 * 60 * 1000;

/**
 * Each LLM step's own limit. Together with the reads they stay inside the
 * recommendation routes' maxDuration, so a slow model fails the build (and
 * is recorded) instead of the function being killed mid-way.
 */
export const RERANK_TIMEOUT_MS = 20_000;
export const SELECT_TIMEOUT_MS = 25_000;
/** An LLM step isn't started with less time than this left before the deadline. */
export const MIN_LLM_WINDOW_MS = 1_500;
/**
 * Caps the rerank's reply. It lists at most RERANK_INPUT refs (~20 tokens
 * each); the rest is headroom for a reasoning model's thinking, which counts
 * against the cap too.
 */
const RERANK_MAX_TOKENS = 4_000;
/** The select's reply: eight short lines, and a reasoning model's thinking (reasoning low). */
const SELECT_MAX_TOKENS = 6_000;

/** Light additive boost for named cards whose author the reader has replied to (never an anonymous card). */
const RESONANCE_AUTHOR_BOOST = 0.15;

export interface FunnelOptions {
  /** When the whole build must be done (ms since epoch): each LLM step gets what is left, or is skipped. */
  deadline?: number;
  /**
   * When an LLM step fails or runs out of time, answer with the order the
   * earlier stages produced (without reasons) instead of throwing — for a
   * reader who has nothing else to be shown.
   */
  fallback?: boolean;
  /** The clock (tests). */
  now?: () => number;
  /** The database (tests); the app's admin one otherwise. */
  db?: Firestore;
}

export interface FunnelResult {
  items: RecommendationItem[];
  /** An LLM step was skipped or failed: the picks are in scoring (or rerank) order and carry no reasons. */
  partial: boolean;
  /** The reader has no positive card yet: the picks are the coverage set (no model was asked), today's as they are. */
  coldStart?: boolean;
}

/**
 * Run one LLM step inside the time left: null when it was skipped or failed
 * and `fallback` allows going on without it; otherwise its failure is thrown.
 */
async function llmStep<T>(opts: FunnelOptions, limitMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const now = opts.now ?? Date.now;
  const window = Math.min(limitMs, (opts.deadline ?? Number.POSITIVE_INFINITY) - now());
  if (window < MIN_LLM_WINDOW_MS) {
    if (opts.fallback) return null;
    throw new Error('recommendations: out of time before an LLM step');
  }
  try {
    return await run(AbortSignal.timeout(window));
  } catch (e) {
    if (!opts.fallback) throw e;
    console.warn('[recommend] LLM step skipped', e instanceof Error ? e.message : e);
    return null;
  }
}

/** The records of the cards the reader's taste is made of (any visibility: they read them), the index's model only. */
async function tasteRecords(profile: UserProfile, embedModel: string): Promise<VectorRecord[]> {
  const ids = [...profile.taste.positive, ...profile.taste.negative].map((t) => t.cardId);
  if (!ids.length) return [];
  return (await getVectorStore().listByCards(ids)).filter((r) => recordModel(r) === embedModel);
}

/**
 * The pool to score, and its numbers: read whole while it is small (the
 * kept numbers say how big it is; none kept yet reads it whole); above
 * EXACT_POOL_MAX, the parts nearest the taste's parts on raw vectors,
 * rescored with the kept μ and r(x).
 */
async function poolFor(db: Firestore, embedModel: string, taste: VectorRecord[], now: number): Promise<{ records: VectorRecord[]; stats: PoolStats }> {
  const kept = await readPoolStats(embedModel, db).catch(() => null);
  if (!kept || kept.cards <= EXACT_POOL_MAX || !taste.length) {
    const records = await publicPool(getVectorStore(), embedModel);
    // Today's kept numbers spare the build working them out (a part they don't know gets its r(x) against the pool).
    return { records, stats: kept && now - kept.at < POOL_STATS_FRESH_MS ? kept : poolStats(records) };
  }
  const store = getVectorStore();
  const hits = await Promise.all(
    taste
      .filter((r) => r.channel === 'insight')
      .map((r) => store.nearest({ channel: 'insight', vector: r.vector, filter: { visibility: 'public' }, limit: ANN_PER_PART })),
  );
  const ids = [...new Set(hits.flat().map((h) => h.record.cardId))];
  const records = (await store.listByCards(ids)).filter((r) => r.visibility === 'public' && recordModel(r) === embedModel);
  return { records, stats: kept };
}

/** A candidate's part that best meets the reader's strongest taste cards: the lines the rerank and select read (§A1.10). */
function hitLines(card: MatchCard, taste: TasteVote[], records: Map<string, VectorRecord>): { coreInsight: string; situation: string } {
  let best: { key: string; s: number } | null = null;
  for (const part of card.insight) {
    for (const t of taste.filter((x) => x.weight > 0)) {
      for (const q of t.card.insight) {
        const s = csls(part, q);
        if (!best || s > best.s) best = { key: part.key, s };
      }
    }
  }
  const record = records.get(best?.key ?? card.insight[0]?.key ?? card.situation[0]?.key ?? '');
  return { coreInsight: record?.coreInsight ?? '', situation: record?.situation ?? '' };
}

/** The reader's own lines for the prompts: their strongest taste cards' first insight part (others' cards: one short line each, D7). */
function readerLines(taste: TasteVote[], records: Map<string, VectorRecord>): string[] {
  const lines: string[] = [];
  for (const t of taste.filter((x) => x.weight > 0)) {
    const record = records.get(t.card.insight[0]?.key ?? '');
    if (!record?.coreInsight) continue;
    lines.push(record.situation ? `${record.coreInsight}（${record.situation}）` : record.coreInsight);
    if (lines.length >= 12) break;
  }
  return lines;
}

/** The reader's connections' newest named public cards (cold start's first), by id. */
async function connectionsCards(db: Firestore, profile: UserProfile): Promise<{ cardId: string; authorId: string }[]> {
  const ids = profile.connections.slice(0, 30);
  if (!ids.length) return [];
  const snap = await db
    .collection('cards')
    .where('authorId', 'in', ids)
    .select('authorId', 'visibility', 'anonymous', 'publishedAt', 'trashedAt', 'thin', 'signature.placeholder')
    .limit(200)
    .get();
  return snap.docs
    .filter((d) => d.get('visibility') === 'public' && d.get('anonymous') !== true && d.get('publishedAt') != null && d.get('trashedAt') == null)
    .filter((d) => d.get('thin') !== true && d.get('signature.placeholder') !== true && !profile.held.has(d.id))
    .sort((a, b) => b.get('publishedAt').toMillis() - a.get('publishedAt').toMillis() || (a.id < b.id ? -1 : 1))
    .map((d) => ({ cardId: d.id, authorId: String(d.get('authorId')) }));
}

/**
 * The coverage set (§A3.6): the reader's connections' newest named cards
 * first, then the pool in farthest-point order from the day's start — no
 * model, at most AUTHOR_MAX by one author.
 */
async function coverage(
  db: Firestore,
  profile: UserProfile,
  pool: MatchCard[],
  byCard: Map<string, VectorRecord>,
  stats: PoolStats,
  day: number,
  take: number,
  skip: Set<string>,
  perAuthor: Map<string, number>,
): Promise<RecommendationItem[]> {
  const out: RecommendationItem[] = [];
  const add = (cardId: string, author: string) => {
    if (out.length >= take || skip.has(cardId) || out.some((i) => i.cardId === cardId)) return;
    if ((perAuthor.get(author) ?? 0) >= AUTHOR_MAX) return;
    perAuthor.set(author, (perAuthor.get(author) ?? 0) + 1);
    out.push({ cardId, channel: 'insight', reason: '', score: 0 });
  };
  const friends = await connectionsCards(db, profile).catch((e) => (console.warn('[recommend] connections', e), []));
  for (const c of friends.slice(0, Math.min(COLD_CONNECTIONS, take))) add(c.cardId, `author:${c.authorId}`);
  // The head of the order is all a coverage of `take` can reach (the cap skips a few).
  const order = farthestPoint(pool, day, stats, Math.max(take * 4, 24));
  // Whether a card is anonymous is read as it is now (A2), for the cap only: an anonymous one is its own author.
  const named = order.length ? await namedCardIds(order.map((c) => c.cardId), db).catch(() => new Set<string>()) : new Set<string>();
  for (const c of order) {
    const author = byCard.get(c.cardId)?.authorId ?? '';
    add(c.cardId, authorKey({ cardId: c.cardId, authorId: author, anonymous: !named.has(c.cardId) }));
  }
  return out;
}

/**
 * The read-time funnel (round 26 §A2, §A3): the reader's taste (what they
 * wrote, replied to, noted, tapped, saved and read, weighed by ./weights) →
 * every listed public card scored against it exactly in memory (./match:
 * centred vectors, CSLS, MaxSim over parts, τ) → a cheap batch rerank of the
 * best 30 on the hit parts' lines → MMR down to 12, at most two by one
 * author → the select model's ≤ 8 with a line each. No count of anyone else's
 * enters it (./noPopularity.test.ts).
 *
 * A reader with no positive card yet gets the coverage set (cold start: the
 * connections' cards, then the farthest-point order; no model). With one or
 * two, 8 × 2 / (n + 2) of the 8 come from it; with three or more, one slot
 * goes to the best card from a life domain they haven't engaged with.
 * Fewer than 8 when the pool can't fill them (C5).
 *
 * Every LLM call carries a timeout. With `fallback`, a step that fails or
 * doesn't fit before `deadline` is skipped and the result is `partial`.
 */
export async function recommendFeed(uid: string, opts: FunnelOptions = {}): Promise<FunnelResult> {
  const db = opts.db ?? getAdminDb();
  const now = opts.now ?? Date.now;
  const embedModel = currentEmbedModel();
  // The reader's replies (a light boost) are read beside the profile; losing them only loses the boost.
  const engagedP = getEngagedAuthorIds(uid, db).catch((e) => {
    console.warn('[recommend] engaged authors', e);
    return new Set<string>();
  });
  const profile = await buildUserProfile(uid, { db, now: now() });
  const tasteRecs = await tasteRecords(profile, embedModel);
  const { records: poolRecords, stats } = await poolFor(db, embedModel, tasteRecs, now());
  const byKey = new Map<string, VectorRecord>([...tasteRecs, ...poolRecords].map((r) => [partKey(r), r]));
  const byCard = new Map<string, VectorRecord>(poolRecords.map((r) => [r.cardId, r]));
  // Never the reader's own cards, nor one they answered, read lately or were shown too often (./weights heldBack).
  const pool = matchCards(
    poolRecords.filter((r) => r.authorId !== uid && !profile.held.has(r.cardId)),
    stats,
    poolRecords,
  );

  const weightOf = new Map([...profile.taste.positive, ...profile.taste.negative].map((t) => [t.cardId, t.weight]));
  let taste: TasteVote[] = matchCards(tasteRecs, stats, poolRecords).map((card) => ({ card, weight: weightOf.get(card.cardId) ?? 0 }));
  const positives = taste.filter((t) => t.weight > 0).length;
  if (positives >= CLUSTER_AT) taste = clusterTaste(taste);
  const day = Math.floor(now() / 86_400_000);

  if (positives === 0) {
    const items = await coverage(db, profile, pool, byCard, stats, day, LLM_FINAL, new Set(), new Map());
    return { items, partial: false, coldStart: true };
  }

  const { taste: tasteSlots, coverage: coverageSlots, explore } = slotsFor(positives);

  const engagedAuthors = await engagedP;
  const everyScore = pool
    .map((card) => ({ card, rel: relevance(card, taste, stats) }))
    .sort((a, b) => b.rel - a.rel || (a.card.cardId < b.card.cardId ? -1 : 1));
  // Only a card nearer the taste than most counts as fitting it: fewer than 8 rather than padding (C5).
  const scored = everyScore.filter((c) => c.rel > 0);
  const top = scored.slice(0, RERANK_INPUT);
  // Who wrote a card counts for named cards only, read as they are now (A2): the boost and the per-author cap.
  const named = top.length ? await namedCardIds(top.map((c) => c.card.cardId), db).catch(() => new Set<string>()) : new Set<string>();
  const authorOf = (cardId: string) => byCard.get(cardId)?.authorId ?? '';
  const boost = (cardId: string) => (named.has(cardId) && engagedAuthors.has(authorOf(cardId)) ? RESONANCE_AUTHOR_BOOST : 0);
  const lines = new Map(top.map((c) => [c.card.cardId, hitLines(c.card, taste, byKey)]));
  const reader = readerLines(taste, byKey);

  // 2. Cheap batch rerank of the best on the hit parts' lines.
  const rerankInput: RerankCandidate[] = top.map((c) => ({ ref: c.card.cardId, ...lines.get(c.card.cardId)! }));
  const scores = top.length
    ? await llmStep(opts, RERANK_TIMEOUT_MS, async (signal) =>
        parseRerankScores(
          await chatJSON(buildRerankMessages(reader, rerankInput, RERANK_INPUT), { model: rerankModel(), signal, maxTokens: RERANK_MAX_TOKENS }),
        ),
      )
    : {};
  const candidates: Candidate[] = top.map((c) => ({
    card: c.card,
    // Without the rerank, the taste's own score stands in.
    score: (scores ? (scores[c.card.cardId] ?? 0) : c.rel) + boost(c.card.cardId),
    author: authorKey({ cardId: c.card.cardId, authorId: authorOf(c.card.cardId), anonymous: !named.has(c.card.cardId) }),
  }));

  // 3. MMR to the finalists: varied, at most two by one author.
  const finalists = mmr(
    [...candidates].sort((a, b) => b.score - a.score || (a.card.cardId < b.card.cardId ? -1 : 1)),
    Math.min(SELECT_INPUT, Math.max(tasteSlots, 0) + 4),
    stats,
  );
  const scoreOf = new Map(finalists.map((f) => [f.card.cardId, f.score]));

  // 4. The select model's picks and a line each — on the finalists only.
  const selectInput: SelectCandidate[] = finalists.map((f) => ({ ref: f.card.cardId, ...lines.get(f.card.cardId)! }));
  const picks: Selection[] | null = selectInput.length
    ? await llmStep(opts, SELECT_TIMEOUT_MS, async (signal) =>
        parseSelection(
          await chatJSON(buildSelectMessages(reader, selectInput, tasteSlots), { model: selectModel(), signal, maxTokens: SELECT_MAX_TOKENS, reasoningEffort: 'low' }),
        ),
      )
    : [];
  const chosen = picks ? picks : finalists.map((f) => ({ ref: f.card.cardId, reason: '' }));
  const items: RecommendationItem[] = [];
  const perAuthor = new Map<string, number>();
  for (const pick of chosen) {
    if (items.length >= tasteSlots) break;
    const f = finalists.find((x) => x.card.cardId === pick.ref);
    if (!f || items.some((i) => i.cardId === pick.ref)) continue; // a ref the model made up or repeated
    if ((perAuthor.get(f.author) ?? 0) >= AUTHOR_MAX) continue;
    perAuthor.set(f.author, (perAuthor.get(f.author) ?? 0) + 1);
    items.push({ cardId: pick.ref, channel: 'insight', reason: pick.reason, score: scoreOf.get(pick.ref) ?? 0 });
  }

  // 5. Three positives or more: one card from a life domain the reader hasn't engaged with (exploration).
  if (explore > 0) {
    const domains = new Set(tasteRecs.map((r) => r.lifeDomain).filter(Boolean));
    const domainOf = (cardId: string) => byCard.get(cardId)?.lifeDomain ?? '';
    const explore = everyScore.find((c) => !items.some((i) => i.cardId === c.card.cardId) && domainOf(c.card.cardId) !== '' && !domains.has(domainOf(c.card.cardId)));
    if (explore) {
      const exploreNamed = await namedCardIds([explore.card.cardId], db).catch(() => new Set<string>());
      const author = authorKey({ cardId: explore.card.cardId, authorId: authorOf(explore.card.cardId), anonymous: !exploreNamed.has(explore.card.cardId) });
      if ((perAuthor.get(author) ?? 0) < AUTHOR_MAX) {
        perAuthor.set(author, (perAuthor.get(author) ?? 0) + 1);
        items.push({ cardId: explore.card.cardId, channel: 'insight', reason: '', score: explore.rel });
      }
    }
  }

  // 6. One or two positives: the rest of the 8 from the coverage set.
  if (coverageSlots > 0) {
    const fill = await coverage(db, profile, pool, byCard, stats, day, coverageSlots, new Set(items.map((i) => i.cardId)), perAuthor);
    items.push(...fill);
  }

  return { items, partial: (top.length > 0 && !scores) || (selectInput.length > 0 && !picks) };
}
