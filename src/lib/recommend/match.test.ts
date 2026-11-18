import { describe, expect, it } from 'vitest';
import { normalize } from './math';
import {
  AUTHOR_MAX,
  BETA,
  authorKey,
  cardScore,
  centre,
  clusterTaste,
  csls,
  farthestPoint,
  matchCards,
  maxSim,
  mmr,
  poolStats,
  relevance,
  type Candidate,
  type MatchCard,
} from './match';
import type { VectorChannel, VectorRecord } from './vectorStore/types';

// Round 26 §A2.3: how two cards are compared — centred vectors, CSLS, MaxSim over parts, situation at β — and how a
// reader's picks are chosen from the comparisons (§A2.5 MMR and the author cap, §A3.6 the coverage set), on
// synthetic vectors.

const rec = (cardId: string, channel: VectorChannel, part: number, v: number[], authorId = `by-${cardId}`): VectorRecord => ({
  cardId,
  authorId,
  visibility: 'public',
  channel,
  part,
  vector: normalize(v),
  embedModel: 'm',
  insightScore: 0.8,
  coreInsight: `insight ${cardId}.${part}`,
  situation: `situation ${cardId}.${part}`,
  lifeDomain: 'x',
  span: '',
});
const byId = (cards: MatchCard[]) => new Map(cards.map((c) => [c.cardId, c]));

describe('centring and CSLS', () => {
  it('takes away what every card has in common before comparing', () => {
    // Everyone leans one way (the first axis); what tells them apart is the rest.
    const mu = normalize([1, 0, 0]);
    expect(centre(normalize([1, 0.2, 0]), mu)[1]).toBeGreaterThan(0.99);
    expect(centre([0.6, 0.8], [])).toEqual(normalize([0.6, 0.8]));
  });

  it('takes from a vector near everything: of two cards as near to a by cosine, the hub ranks below', () => {
    const records = [
      rec('a', 'insight', 0, [1, 0, 0, 0, 0]),
      // b is near a alone; the hub is as near to a, and near c, d and e besides.
      rec('b', 'insight', 0, [0.6, 0.8, 0, 0, 0]),
      rec('hub', 'insight', 0, [0.6, 0, 0.462, 0.462, 0.462]),
      rec('c', 'insight', 0, [0, 0, 1, 0, 0]),
      rec('d', 'insight', 0, [0, 0, 0, 1, 0]),
      rec('e', 'insight', 0, [0, 0, 0, 0, 1]),
    ];
    const cos = (x: string, y: string) => records.find((r) => r.cardId === x)!.vector.reduce((s, v, i) => s + v * records.find((r) => r.cardId === y)!.vector[i], 0);
    expect(cos('a', 'b')).toBeCloseTo(cos('a', 'hub'), 2);
    const stats = poolStats(records);
    expect(stats.r['hub__insight__0']).toBeGreaterThan(stats.r['b__insight__0']);
    const cards = byId(matchCards(records, stats));
    const a = cards.get('a')!.insight[0];
    expect(csls(a, cards.get('b')!.insight[0])).toBeGreaterThan(csls(a, cards.get('hub')!.insight[0]));
  });
});

describe('cardScore', () => {
  it('is the best pair of insight parts plus β × the best pair of situation parts', () => {
    const records = [
      rec('a', 'insight', 0, [1, 0, 0, 0]),
      rec('a', 'insight', 1, [0, 1, 0, 0]),
      rec('a', 'situation', 0, [0, 0, 1, 0]),
      rec('b', 'insight', 0, [0, 1, 0.05, 0]),
      rec('b', 'situation', 0, [0, 0, 1, 0.1]),
    ];
    // No centring, no hub correction: the bare sums.
    const stats = { mu: { insight: [], situation: [] }, r: {}, tau: 0, tauSituation: 0 };
    const cards = byId(matchCards(records, stats));
    const a = cards.get('a')!;
    const b = cards.get('b')!;
    // a's second insight part meets b's (MaxSim), cos ≈ 0.9988; situation cos ≈ 0.995.
    const insight = 2 * normalize([0, 1, 0.05, 0])[1];
    const situation = 2 * normalize([0, 0, 1, 0.1])[2];
    expect(cardScore(a, b, stats)).toBeCloseTo(insight + BETA * situation, 6);
    expect(cardScore(a, b, stats)).toBeCloseTo(cardScore(b, a, stats), 9);
  });

  it("gives a card without a situation part the pool's median there, neither helping nor hurting it", () => {
    const stats = { mu: { insight: [], situation: [] }, r: {}, tau: 0, tauSituation: -0.4 };
    const cards = byId(matchCards([rec('a', 'insight', 0, [1, 0]), rec('a', 'situation', 0, [0, 1]), rec('only', 'insight', 0, [1, 0])], stats));
    expect(cardScore(cards.get('a')!, cards.get('only')!, stats)).toBeCloseTo(2 + BETA * -0.4, 6);
  });

  it('reads raw parts the same way for the film (maxSim: the best cosine of any pair)', () => {
    expect(maxSim([normalize([1, 0]), normalize([0, 1])], [normalize([0.1, 1])])).toBeCloseTo(normalize([0.1, 1])[1], 9);
    expect(maxSim([], [[1, 0]])).toBeNull();
  });
});

describe('poolStats', () => {
  it('knows each part’s r(x), the means, and a τ between the near pairs and the far ones', () => {
    const records = [
      rec('a', 'insight', 0, [1, 0.1, 0, 0, 0]),
      rec('b', 'insight', 0, [1, 0.12, 0.01, 0, 0]),
      rec('c', 'insight', 0, [0, 1, 0, 0, 0]),
      rec('d', 'insight', 0, [0, 0, 1, 0, 0]),
      rec('e', 'insight', 0, [0, 0, 0, 1, 0]),
      rec('f', 'insight', 0, [0, 0, 0, 0, 1]),
    ];
    const stats = poolStats(records);
    expect(stats.mu.insight).toHaveLength(5);
    expect(Object.keys(stats.r).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => `${id}__insight__0`));
    const cards = byId(matchCards(records, stats));
    // a and b, alike, are the nearest pair of all, well past τ.
    const ab = cardScore(cards.get('a')!, cards.get('b')!, stats);
    expect(ab).toBeGreaterThan(stats.tau);
    for (const [x, y] of [['a', 'c'], ['c', 'd'], ['e', 'f'], ['b', 'f']]) expect(cardScore(cards.get(x)!, cards.get(y)!, stats)).toBeLessThan(ab);
  });

  it('works out r(x) against the pool for a part it doesn’t hold (a reader’s own private card)', () => {
    const pool = [rec('a', 'insight', 0, [1, 0, 0]), rec('b', 'insight', 0, [0, 1, 0]), rec('c', 'insight', 0, [0, 0, 1]), rec('d', 'insight', 0, [1, 1, 0])];
    const stats = poolStats(pool);
    const [mine] = matchCards([rec('mine', 'insight', 0, [1, 0.1, 0])], stats, pool);
    expect(mine.insight[0].r).not.toBe(0);
  });
});

describe('relevance', () => {
  const records = [
    rec('liked', 'insight', 0, [1, 0, 0, 0]),
    rec('disliked', 'insight', 0, [0, 0, 1, 0]),
    rec('nearLiked', 'insight', 0, [1, 0.05, 0, 0]),
    rec('nearDisliked', 'insight', 0, [0, 0.05, 1, 0]),
    rec('far', 'insight', 0, [0, 1, 0, 0]),
    rec('other', 'insight', 0, [0, 0, 0, 1]),
  ];
  const stats = poolStats(records);
  const cards = byId(matchCards(records, stats));

  it('lets each taste card vote: near a liked card scores, near a disliked one costs a quarter, far counts nothing', () => {
    const taste = [
      { card: cards.get('liked')!, weight: 2 },
      { card: cards.get('disliked')!, weight: -2 },
    ];
    expect(relevance(cards.get('nearLiked')!, taste, stats)).toBeGreaterThan(0);
    expect(relevance(cards.get('nearDisliked')!, taste, stats)).toBeLessThan(0);
    expect(relevance(cards.get('far')!, taste, stats)).toBeLessThanOrEqual(relevance(cards.get('nearLiked')!, taste, stats));
    // Only the dislike: nothing to draw near, so nothing scores.
    expect(relevance(cards.get('nearLiked')!, [taste[1]], stats)).toBe(0);
  });

  it('clusters a big taste into medoids weighed by their members', () => {
    // Four alike, two alike, among a pool of cards unlike any of them.
    const v = (axis: number, nudge: number) => Array.from({ length: 10 }, (_, i) => (i === axis ? 1 : i === 9 ? nudge : 0));
    const many = [...Array(6)].map((_, i) => rec(`t${i}`, 'insight', 0, i < 4 ? v(0, i * 0.01) : v(1, i * 0.01)));
    const others = [2, 3, 4, 5, 6, 7].map((axis) => rec(`o${axis}`, 'insight', 0, v(axis, 0)));
    const s = poolStats([...many, ...others]);
    const votes = matchCards(many, s, others).map((card) => ({ card, weight: 1 }));
    const clustered = clusterTaste(votes);
    expect(clustered).toHaveLength(2);
    expect(clustered.map((c) => c.weight).sort()).toEqual([2, 4]);
  });
});

describe('mmr', () => {
  it('takes the best first, then what differs from it, at most two by one author — an anonymous card its own', () => {
    const records = [
      rec('a1', 'insight', 0, [1, 0, 0, 0], 'amy'),
      rec('a2', 'insight', 0, [1, 0.02, 0, 0], 'amy'),
      rec('a3', 'insight', 0, [1, 0.04, 0, 0], 'amy'),
      rec('anon', 'insight', 0, [1, 0.03, 0, 0], 'amy'),
      rec('b1', 'insight', 0, [0, 1, 0, 0], 'ben'),
      rec('c1', 'insight', 0, [0, 0, 1, 0], 'cat'),
    ];
    const stats = poolStats(records);
    const cards = byId(matchCards(records, stats));
    const cand = (id: string, score: number, anonymous = false): Candidate => ({
      card: cards.get(id)!,
      score,
      author: authorKey({ cardId: id, authorId: records.find((r) => r.cardId === id)!.authorId, anonymous }),
    });
    const chosen = mmr([cand('a1', 1), cand('a2', 0.99), cand('a3', 0.98), cand('anon', 0.97, true), cand('b1', 0.5), cand('c1', 0.4)], 5, stats);
    const ids = chosen.map((c) => c.card.cardId);
    expect(ids[0]).toBe('a1');
    expect(ids.filter((id) => ['a1', 'a2', 'a3'].includes(id))).toHaveLength(AUTHOR_MAX);
    // Whose an anonymous card is never decides whether it shows: it isn't counted with amy's.
    expect(ids).toContain('anon');
    // Fewer than asked when nothing is left to take.
    expect(mmr([cand('a1', 1), cand('a2', 1), cand('a3', 1)], 8, stats)).toHaveLength(2);
  });
});

describe('farthestPoint', () => {
  it('spreads over the pool from a start that turns with the day, the same order on every run', () => {
    const records = [
      rec('a', 'insight', 0, [1, 0, 0]),
      rec('a2', 'insight', 0, [1, 0.05, 0]),
      rec('b', 'insight', 0, [0, 1, 0]),
      rec('c', 'insight', 0, [0, 0, 1]),
    ];
    const stats = poolStats(records);
    const cards = matchCards(records, stats);
    const today = farthestPoint(cards, 0, stats).map((c) => c.cardId);
    expect(today[0]).toBe('a');
    // a2 stands beside a: it comes last, after the cards that differ.
    expect(today.at(-1)).toBe('a2');
    expect(farthestPoint(cards, 1, stats)[0].cardId).toBe('a2');
    expect(farthestPoint(cards, 0, stats).map((c) => c.cardId)).toEqual(today);
    expect(farthestPoint(cards, 0, stats, 2)).toHaveLength(2);
  });
});
