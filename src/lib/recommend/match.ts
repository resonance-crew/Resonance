/**
 * How two cards are compared, and how a reader's picks are chosen from the
 * comparisons (round 26 §A2.3, §A2.5, §A3.3, §A3.6) — pure functions, no I/O,
 * the same on every run. The funnel (./funnel), the film (LandingFilm/data's
 * kin uses `maxSim`) and the offline tools (scripts/recommend) all score with
 * these, so what the exam measures is what readers get.
 *
 * - A card is several parts (lib/recommend/signature readingParts), each a
 *   vector on the `insight` or `situation` channel.
 * - Vectors are **centred** (the pool's mean μ taken away, then normalised):
 *   what every card has in common says nothing about which two are alike.
 * - Two parts are compared by **CSLS** — 2·cos − r(a) − r(b), r(x) the mean
 *   similarity of x to its CSLS_K nearest vectors of other cards — which
 *   takes from a vector that is near everything ("hubness").
 * - Two cards: the best pair of insight parts (**MaxSim**) plus β × the best
 *   pair of situation parts. A card with no situation part takes the pool's
 *   median there, so lacking one neither helps nor hurts.
 */
import { dot, mean, normalize } from './math';
import type { VectorChannel, VectorRecord } from './vectorStore/types';

/** The situation channel's weight beside the insight's (C9: 0 was insight alone; both at full was the other end). */
export const BETA = 0.3;
/** How many nearest vectors of other cards r(x) averages. */
export const CSLS_K = 3;
/** MMR's balance between fitting the reader (1) and differing from what is chosen already (0). */
export const MMR_LAMBDA = 0.7;
/** At most this many of a reader's picks by one author — an anonymous card counts as its own author (A3). */
export const AUTHOR_MAX = 2;
/** Up to this many listed cards, the pool is read whole and scored exactly in memory (C1). */
export const EXACT_POOL_MAX = 300;
/** A card the reader pushed away weighs this much against a candidate near it (§A3.3). */
export const NEGATIVE_SHARE = 0.25;
/** A reader's picks a day. */
export const PICKS = 8;
/** The positive cards a reader needs for the taste alone (fewer: some of the picks come from the coverage set). */
export const TASTE_ALONE_AT = 3;

/**
 * How a reader's PICKS are made up by how many positive cards they have
 * (§A3.6): none — the coverage set alone (a cold start); one or two —
 * PICKS × 2 / (n + 2) of them from the coverage set, the rest from the
 * taste; three or more — the taste, with one place for exploration (a life
 * domain they haven't engaged with).
 */
export function slotsFor(positives: number): { taste: number; coverage: number; explore: number } {
  if (positives <= 0) return { taste: 0, coverage: PICKS, explore: 0 };
  if (positives < TASTE_ALONE_AT) {
    const coverage = Math.round((PICKS * 2) / (positives + 2));
    return { taste: PICKS - coverage, coverage, explore: 0 };
  }
  return { taste: PICKS - 1, coverage: 0, explore: 1 };
}

/** What the scoring reads of a part: whose card, which channel, which part, its vector (nothing of who wrote it). */
export type PartVector = Pick<VectorRecord, 'cardId' | 'channel' | 'part' | 'vector'>;

/** A part's key: its vector document's id. */
export const partKey = (r: Pick<VectorRecord, 'cardId' | 'channel' | 'part'>) => `${r.cardId}__${r.channel}__${r.part}`;

/** The pool's numbers (stored daily for a pool too big to read whole, see ./poolStats). */
export interface PoolStats {
  /** The mean vector per channel (raw unit vectors). */
  mu: Record<VectorChannel, number[]>;
  /** r(x) by part key, on centred vectors. */
  r: Record<string, number>;
  /** The median card-to-card score over the pool's pairs: what counts as "nearer than most". */
  tau: number;
  /** The median situation term over pairs where both have one (a card without one takes it). */
  tauSituation: number;
}

/** One centred part: its vector, its r(x), and its key (partKey) to find its record by. */
export interface MatchPart {
  v: number[];
  r: number;
  key: string;
}

/** A card ready to be compared: its centred parts by channel, and their r(x). */
export interface MatchCard {
  cardId: string;
  insight: MatchPart[];
  situation: MatchPart[];
}

/** v − μ, normalised. */
export function centre(v: number[], mu: number[]): number[] {
  if (!mu.length) return normalize(v);
  return normalize(v.map((x, i) => x - (mu[i] ?? 0)));
}

/** CSLS of two centred parts. */
export const csls = (a: Pick<MatchPart, 'v' | 'r'>, b: Pick<MatchPart, 'v' | 'r'>) => 2 * dot(a.v, b.v) - a.r - b.r;

/** The best pair's value, or null when either side has none. */
function best(a: MatchPart[], b: MatchPart[], f: (x: MatchPart, y: MatchPart) => number): number | null {
  let out: number | null = null;
  for (const x of a) {
    for (const y of b) {
      const s = f(x, y);
      if (out === null || s > out) out = s;
    }
  }
  return out;
}

/** The best plain cosine between two sets of unit vectors (MaxSim): the film's kin, and the diagnostics, read raw vectors this way. */
export function maxSim(a: number[][], b: number[][]): number | null {
  return best(a.map((v) => ({ v, r: 0, key: '' })), b.map((v) => ({ v, r: 0, key: '' })), (x, y) => dot(x.v, y.v));
}

/** Card-to-card: MaxSim of the insight parts' CSLS + β × the situation parts' (the pool's median when either has none). */
export function cardScore(a: MatchCard, b: MatchCard, stats: Pick<PoolStats, 'tauSituation'>): number {
  const insight = best(a.insight, b.insight, csls) ?? 0;
  const situation = best(a.situation, b.situation, csls) ?? stats.tauSituation;
  return insight + BETA * situation;
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  return s[Math.floor((s.length - 1) / 2)];
};

/** r(x) of each centred part: the mean of its CSLS_K highest cosines to parts (same channel) of other cards. */
function rOf(parts: { key: string; cardId: string; v: number[] }[], against: { cardId: string; v: number[] }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of parts) {
    const top: number[] = [];
    for (const q of against) {
      if (q.cardId === p.cardId) continue;
      const s = dot(p.v, q.v);
      if (top.length < CSLS_K) {
        top.push(s);
        top.sort((x, y) => y - x);
      } else if (s > top[CSLS_K - 1]) {
        top[CSLS_K - 1] = s;
        top.sort((x, y) => y - x);
      }
    }
    out.set(p.key, top.length ? top.reduce((s, x) => s + x, 0) / top.length : 0);
  }
  return out;
}

const byChannel = (records: PartVector[], channel: VectorChannel) => records.filter((r) => r.channel === channel && r.vector.length > 0);

/**
 * The pool's numbers from its records: μ per channel, r(x) of every part on
 * centred vectors, and the median scores over every pair of cards (all of
 * them up to EXACT_POOL_MAX cards; a sample of `samplePairs` beyond).
 */
export function poolStats(records: PartVector[], opts: { samplePairs?: number } = {}): PoolStats {
  const mu = { insight: mean(byChannel(records, 'insight').map((r) => r.vector)), situation: mean(byChannel(records, 'situation').map((r) => r.vector)) };
  const r: Record<string, number> = {};
  for (const channel of ['insight', 'situation'] as const) {
    const parts = byChannel(records, channel).map((x) => ({ key: partKey(x), cardId: x.cardId, v: centre(x.vector, mu[channel]) }));
    for (const [key, value] of rOf(parts, parts)) r[key] = value;
  }
  const partial: PoolStats = { mu, r, tau: 0, tauSituation: 0 };
  const cards = matchCards(records, partial);
  const pairs: [MatchCard, MatchCard][] = [];
  const limit = opts.samplePairs ?? 50_000;
  outer: for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      pairs.push([cards[i], cards[j]]);
      if (pairs.length >= limit) break outer;
    }
  }
  const situationTerms = pairs.map(([a, b]) => best(a.situation, b.situation, csls)).filter((x): x is number => x !== null);
  partial.tauSituation = median(situationTerms);
  partial.tau = median(pairs.map(([a, b]) => cardScore(a, b, partial)));
  return partial;
}

/**
 * Cards ready to compare, from their records, centred on the pool's μ. A
 * part the pool's r(x) doesn't know (a card outside the pool: the reader's
 * own private one, a connection's) gets its r against `against` — the pool's
 * records — or 0 with none.
 */
export function matchCards(records: PartVector[], stats: Pick<PoolStats, 'mu' | 'r'>, against: PartVector[] = []): MatchCard[] {
  const unknown = records.filter((x) => x.vector.length > 0 && stats.r[partKey(x)] === undefined);
  const extra = new Map<string, number>();
  for (const channel of ['insight', 'situation'] as const) {
    const parts = unknown.filter((x) => x.channel === channel).map((x) => ({ key: partKey(x), cardId: x.cardId, v: centre(x.vector, stats.mu[channel]) }));
    if (!parts.length) continue;
    const pool = byChannel(against, channel).map((x) => ({ cardId: x.cardId, v: centre(x.vector, stats.mu[channel]) }));
    for (const [key, value] of rOf(parts, pool)) extra.set(key, value);
  }
  const cards = new Map<string, MatchCard>();
  for (const x of records) {
    if (!x.vector.length) continue;
    const card = cards.get(x.cardId) ?? { cardId: x.cardId, insight: [], situation: [] };
    card[x.channel].push({ v: centre(x.vector, stats.mu[x.channel]), r: stats.r[partKey(x)] ?? extra.get(partKey(x)) ?? 0, key: partKey(x) });
    cards.set(x.cardId, card);
  }
  return [...cards.values()].sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
}

/** One card of a reader's taste, with its weight (lib/recommend/weights: positive draws near, negative pushes away). */
export interface TasteVote {
  card: MatchCard;
  weight: number;
}

/**
 * How well a candidate fits the reader (§A3.3): each taste card votes by
 * how much nearer than τ the candidate is to it,
 *   rel = Σ ŵᵢ · max(0, score(c, i) − τ) − NEGATIVE_SHARE · Σ |ŵⱼ| · max(0, score(c, j) − τ),
 * ŵ = w over the sum of the positive w.
 */
export function relevance(candidate: MatchCard, taste: TasteVote[], stats: Pick<PoolStats, 'tau' | 'tauSituation'>): number {
  const total = taste.reduce((s, t) => s + Math.max(0, t.weight), 0);
  if (total <= 0) return 0;
  let rel = 0;
  for (const t of taste) {
    const near = Math.max(0, cardScore(candidate, t.card, stats) - stats.tau);
    if (t.weight > 0) rel += (t.weight / total) * near;
    else if (t.weight < 0) rel -= NEGATIVE_SHARE * (Math.abs(t.weight) / total) * near;
  }
  return rel;
}

/**
 * Clusters of a reader's positive cards merge while their average link —
 * the best pair of centred insight parts, by plain cosine — is at least this.
 * Plain, not CSLS: within a tight group CSLS says "as alike as its
 * neighbours", which is the point when ranking and no use when grouping.
 */
export const CLUSTER_COS = 0.5;

/** Two cards' best pair of centred insight parts, by plain cosine (clustering a taste). */
export const insightCos = (a: MatchCard, b: MatchCard) => best(a.insight, b.insight, (x, y) => dot(x.v, y.v)) ?? 0;

/**
 * The medoids of a reader's positive cards when they have many (§A3.3, 20
 * or more): clustered by average linkage (insightCos) until no two clusters
 * are as near as `threshold`, each cluster voting as its medoid with its
 * members' weight. Negative votes are kept as they are.
 */
export function clusterTaste(taste: TasteVote[], threshold = CLUSTER_COS): TasteVote[] {
  const positive = taste.filter((t) => t.weight > 0);
  const negative = taste.filter((t) => t.weight < 0);
  const n = positive.length;
  const sim: number[][] = positive.map((a) => positive.map((b) => insightCos(a.card, b.card)));
  let clusters: number[][] = positive.map((_, i) => [i]);
  const link = (x: number[], y: number[]) => {
    let s = 0;
    for (const i of x) for (const j of y) s += sim[i][j];
    return s / (x.length * y.length);
  };
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bs = -Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const s = link(clusters[i], clusters[j]);
        if (s > bs) {
          bs = s;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0 || bs < threshold) break;
    clusters = [...clusters.filter((_, k) => k !== bi && k !== bj), [...clusters[bi], ...clusters[bj]]];
  }
  const votes = clusters.map((members) => {
    const medoid = members.reduce((m, i) => {
      const score = (k: number) => members.reduce((s, j) => s + (j === k ? 0 : sim[k][j]), 0);
      return score(i) > score(m) ? i : m;
    }, members[0]);
    return { card: positive[medoid].card, weight: members.reduce((s, i) => s + positive[i].weight, 0) };
  });
  return n ? [...votes, ...negative] : negative;
}

/** Who a card counts as being by, for the per-author cap: an anonymous card is its own (it must not turn on whose it is). */
export const authorKey = (c: { cardId: string; authorId: string; anonymous: boolean }) => (c.anonymous ? `anon:${c.cardId}` : `author:${c.authorId}`);

export interface Candidate {
  card: MatchCard;
  /** What it scores for the reader (relevance, a boost included). */
  score: number;
  author: string;
}

/**
 * Choose up to `k` by MMR (§A2.5): each next one the best of
 * λ · score − (1 − λ) · (its nearest likeness to those chosen, above τ),
 * at most AUTHOR_MAX by one author. Fewer when the pool runs out (C5): never
 * padded with what doesn't fit.
 */
export function mmr(candidates: Candidate[], k: number, stats: Pick<PoolStats, 'tau' | 'tauSituation'>, opts: { lambda?: number; authorMax?: number } = {}): Candidate[] {
  const lambda = opts.lambda ?? MMR_LAMBDA;
  const authorMax = opts.authorMax ?? AUTHOR_MAX;
  const chosen: Candidate[] = [];
  const perAuthor = new Map<string, number>();
  const left = [...candidates];
  while (chosen.length < k && left.length) {
    let bestAt = -1;
    let bestValue = -Infinity;
    for (let i = 0; i < left.length; i++) {
      const c = left[i];
      if ((perAuthor.get(c.author) ?? 0) >= authorMax) continue;
      const likeness = chosen.reduce((m, s) => Math.max(m, cardScore(c.card, s.card, stats) - stats.tau), 0);
      const value = lambda * c.score - (1 - lambda) * likeness;
      if (value > bestValue || (value === bestValue && bestAt >= 0 && c.card.cardId < left[bestAt].card.cardId)) {
        bestValue = value;
        bestAt = i;
      }
    }
    if (bestAt < 0) break;
    const [pick] = left.splice(bestAt, 1);
    chosen.push(pick);
    perAuthor.set(pick.author, (perAuthor.get(pick.author) ?? 0) + 1);
  }
  return chosen;
}

/**
 * The pool in farthest-point order (§A3.6, the coverage set): from a start
 * that turns with the day, each next card the one least like every card
 * before it — the widest spread of what the pool holds, for a reader the
 * recommender knows nothing about yet. No model is asked.
 */
export function farthestPoint(cards: MatchCard[], day: number, stats: Pick<PoolStats, 'tauSituation'>, limit = Infinity): MatchCard[] {
  if (!cards.length) return [];
  const sorted = [...cards].sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
  const start = ((day % sorted.length) + sorted.length) % sorted.length;
  const order = [sorted[start]];
  const nearest = sorted.map((c) => cardScore(c, sorted[start], stats));
  const used = new Set([start]);
  // Each step compares every card left with the one just taken: the head of the order costs what it holds.
  while (order.length < Math.min(sorted.length, limit)) {
    let pick = -1;
    for (let i = 0; i < sorted.length; i++) if (!used.has(i) && (pick < 0 || nearest[i] < nearest[pick])) pick = i;
    used.add(pick);
    order.push(sorted[pick]);
    for (let i = 0; i < sorted.length; i++) if (!used.has(i)) nearest[i] = Math.max(nearest[i], cardScore(sorted[i], sorted[pick], stats));
  }
  return order;
}
