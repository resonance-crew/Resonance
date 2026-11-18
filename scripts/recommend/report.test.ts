import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/lib/recommend/math';
import { chunks, compare, corpusStats, funnelTrial, funnelVerdicts, hubs, pairVerdicts, pairsHold, pooled, rank, rankMatch, renderReport, standing, type DiagCard } from './report';
import type { PartVector } from '../../src/lib/recommend/match';

const card = (id: string, over: Partial<DiagCard> = {}): DiagCard => ({
  id,
  key: `slug-${id}`,
  title: `Title ${id}`,
  fullChars: 800,
  readChars: 800,
  coreInsight: `insight of ${id}`,
  situation: `situation of ${id}`,
  lifeDomain: 'work',
  ...over,
});

/** Four cards on a plane: a and b side by side, c a quarter turn away, d opposite a. */
const vectors = new Map<string, number[]>([
  ['a', normalize([1, 0])],
  ['b', normalize([0.9, 0.1])],
  ['c', normalize([0, 1])],
  ['d', normalize([-1, 0])],
]);
const pool = ['a', 'b', 'c', 'd'].map((id) => card(id));

describe('rank', () => {
  it('lists every other card nearest first, by cosine distance', () => {
    const rankings = rank(vectors);
    expect(rankings.get('a')!.map((n) => n.id)).toEqual(['b', 'c', 'd']);
    expect(rankings.get('a')![0].distance).toBeCloseTo(1 - 0.9 / Math.hypot(0.9, 0.1), 6);
    expect(rankings.get('a')![2].distance).toBeCloseTo(2, 6);
    // c is a quarter turn from both a and d: the tie goes by id, the same on every run.
    expect(rankings.get('c')!.map((n) => n.id)).toEqual(['b', 'a', 'd']);
    expect(rank(new Map([['c', [0, 1]], ['d', [-1, 0]], ['a', [1, 0]]])).get('c')!.map((n) => n.id)).toEqual(['a', 'd']);
  });

  it('leaves out a card without a vector, and says where one card stands for another', () => {
    const rankings = rank(new Map([...vectors, ['e', []]]));
    expect(rankings.has('e')).toBe(false);
    expect(rankings.get('a')!.some((n) => n.id === 'e')).toBe(false);
    expect(standing(rankings, 'a', 'c')).toMatchObject({ rank: 2, of: 3 });
    expect(standing(rankings, 'a', 'e')).toBeNull();
    expect(standing(rankings, 'e', 'a')).toBeNull();
  });
});

describe('hubs', () => {
  it('counts how many cards list each card among their nearest, most-listed first', () => {
    // Everyone's nearest is the card in the middle; it has one nearest of its own.
    const star = new Map<string, number[]>([
      ['hub', normalize([1, 1, 1])],
      ['x', normalize([1, 0, 0])],
      ['y', normalize([0, 1, 0])],
      ['z', normalize([0, 0, 1])],
    ]);
    const counted = hubs(rank(star), 1);
    expect(counted[0]).toEqual({ id: 'hub', lists: 3 });
    expect(counted.reduce((sum, h) => sum + h.lists, 0)).toBe(4);
    // A card on nobody's list is counted too, as 0.
    expect(counted).toHaveLength(4);
    expect(counted.filter((h) => h.lists === 0)).toHaveLength(2);

    const report = renderReport({
      channel: 'insight',
      cards: [],
      pool: ['hub', 'x', 'y', 'z'].map((id) => card(id)),
      rankings: rank(star),
      top: 3,
      outside: { thin: 0, lowInsight: 0, placeholder: 0, noVector: 0 },
      pairs: [],
      readLimit: 1200,
    });
    // With four cards everyone is on three lists of three: nobody stands out, so the section is left out.
    expect(report).not.toContain('跟誰都很近的卡片');
  });
});

describe('pairs', () => {
  it('reads a pair both ways, by slug or id, and holds it to --within', () => {
    const rankings = rank(vectors);
    const [near, far, unknown] = pairVerdicts(pool, rankings, [['slug-a', 'b'], ['slug-a', 'slug-d'], ['slug-a', 'nope']]);
    expect(near.ab?.rank).toBe(1);
    expect(near.ba?.rank).toBe(1);
    expect(far.ab?.rank).toBe(3);
    expect(unknown.ab).toBeNull();
    expect(pairsHold([near], 1)).toBe(true);
    expect(pairsHold([near, far], 2)).toBe(false);
    // A pair naming a card outside the pool never passes: it can't be recommended at all.
    expect(pairsHold([unknown], 99)).toBe(false);
  });
});

describe('compare', () => {
  it('says how far a second ranking\'s nearest card sits in the stored one', () => {
    const stored = rank(vectors);
    // The second opinion puts a beside d (and so d beside a), and agrees on nothing else being different for b and c.
    const second = rank(new Map([['a', normalize([1, 0.05])], ['b', normalize([0, -1])], ['c', normalize([0, 1])], ['d', normalize([1, 0])]]));
    const versus = compare(stored, second);
    expect(versus.cards).toBe(4);
    expect(versus.rows.get('a')).toEqual({ nearest: 'd', rank: 3 });
    expect(versus.rows.get('d')).toEqual({ nearest: 'a', rank: 3 });
    expect(versus.sameNearest).toBe(versus.cards - [...versus.rows.values()].filter((r) => r.rank > 1).length);
    expect(versus.medianStanding).toBeGreaterThanOrEqual(1);
  });
});

describe('corpusStats', () => {
  it('counts the cards the signature model was handed only the opening of', () => {
    const cards = [card('a', { fullChars: 3000, readChars: 1200, coreInsight: '放下' }), card('b', { fullChars: 2400, readChars: 1200, coreInsight: '慢慢來比較快' }), card('c'), card('d')];
    const stats = corpusStats(cards, rank(vectors));
    expect(stats.cards).toBe(4);
    expect(stats.cut).toBe(2);
    expect(stats.readShare).toBeCloseTo(0.4, 6);
    expect(stats.insightChars.min).toBe(2);
    expect(stats.insightChars.max).toBe('insight of c'.length);
    expect(stats.nearest).toBeLessThan(stats.typical);
  });

  it('reads as whole when nothing is cut, and as nothing when there are no cards', () => {
    expect(corpusStats(pool, rank(vectors)).readShare).toBe(1);
    expect(corpusStats([], rank(new Map()))).toMatchObject({ cards: 0, cut: 0, nearest: 0, insightChars: { min: 0, median: 0, max: 0 } });
  });
});

describe('whole-text pieces', () => {
  it('cuts at paragraph ends, splits a paragraph that is too long, and loses nothing', () => {
    const long = 'x'.repeat(25);
    const text = `one\n\ntwo two\n\n\n${long}\n\nthree`;
    const pieces = chunks(text, 10);
    expect(pieces).toEqual(['one', 'two two', 'x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5), 'three']);
    expect(pieces.every((p) => p.length <= 10)).toBe(true);
    expect(chunks('a\n\nb\n\nc', 10)).toEqual(['a\n\nb\n\nc']);
    expect(chunks('  \n\n ', 10)).toEqual([]);
  });

  it('pools the pieces into one unit vector, the longer piece weighing more', () => {
    const v = pooled([{ vector: [1, 0], chars: 300 }, { vector: [0, 1], chars: 100 }, { vector: [], chars: 50 }]);
    expect(Math.hypot(...v)).toBeCloseTo(1, 6);
    expect(v[0]).toBeGreaterThan(v[1]);
    expect(pooled([])).toEqual([]);
  });
});

describe('renderReport', () => {
  const rankings = rank(vectors);
  const base = {
    channel: 'insight' as const,
    pool,
    rankings,
    top: 2,
    outside: { thin: 1, lowInsight: 2, placeholder: 0, noVector: 0 },
    pairs: [] as [string, string][],
    readLimit: 1200,
  };

  it('prints a card with what the model wrote of it and its nearest cards in order', () => {
    const a = card('a', { fullChars: 3000, readChars: 1200, title: 'A | title\nbroken' });
    const report = renderReport({ ...base, cards: [a], pool: [a, ...pool.slice(1)] });
    expect(report).toContain('候選池裡的公開卡片 4 張');
    expect(report).toContain('另有 3 張公開卡片不在池裡');
    // A title can't end a table cell or a heading.
    expect(report).toContain('### A \\| title broken（`slug-a`）');
    expect(report).toContain('全文 3,000 字，模型讀到 40%');
    expect(report).toContain('- 核心體悟：insight of a（12 字）');
    const rows = report.split('\n').filter((l) => /^\| \d/.test(l));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('| 1 | ');
    expect(rows[0]).toContain('Title b（`slug-b`） | insight of b |');
    expect(rows[1]).toContain('Title c（`slug-c`）');
    // Only the card asked for gets a section.
    expect(report.match(/^### /gm)).toHaveLength(1);
  });

  it('reports the pairs asked about, and the second opinion when there is one', () => {
    const second = rank(new Map([['a', normalize([1, 0.05])], ['b', normalize([0, -1])], ['c', normalize([0, 1])], ['d', normalize([1, 0])]]));
    const report = renderReport({ ...base, cards: [pool[0]], pairs: [['slug-a', 'slug-d'], ['slug-a', 'gone']], whole: second });
    expect(report).toContain('| Title a（`slug-a`） | Title d（`slug-d`） | 第 3／3 | 第 3／3 | 2.000 |');
    expect(report).toContain('`gone`（不在候選池裡）');
    expect(report).toContain('## 整篇文字的第二種看法');
    expect(report).toContain('整篇文字認為最近的是 Title d（`slug-d`），在上面的名單裡排第 3。');
    expect(renderReport({ ...base, cards: [pool[0]] })).not.toContain('整篇文字');
  });
});

// Round 26 §A5.2: a dry run's file ranked with the funnel's own scoring, over each card's parts, and the funnel's
// picks for one card taken as a reader's only positive (C3).
describe('the funnel’s score over parts', () => {
  const part = (cardId: string, part: number, v: number[], channel: 'insight' | 'situation' = 'insight'): PartVector => ({ cardId, channel, part, vector: normalize(v) });
  const records = [
    part('a', 0, [1, 0, 0, 0, 0, 0]),
    part('a', 1, [0, 0, 0, 0, 1, 0]),
    // b meets a's second part, not its first: one card of several insights is near another by its best pair.
    part('b', 0, [0, 0, 0, 0, 1, 0.05]),
    part('c', 0, [0, 1, 0, 0, 0, 0]),
    part('d', 0, [0, 0, 1, 0, 0, 0]),
    part('e', 0, [0, 0, 0, 1, 0, 0]),
  ];

  it('ranks each card’s neighbours by the best pair of parts, and prints the score', () => {
    const rankings = rankMatch(records);
    expect(rankings.get('a')![0].id).toBe('b');
    expect(rankings.get('b')![0].id).toBe('a');
    expect(standing(rankings, 'a', 'b')).toMatchObject({ rank: 1, of: 4 });
    const report = renderReport({
      channel: 'insight',
      cards: [card('a')],
      pool: ['a', 'b', 'c', 'd', 'e'].map((id) => card(id)),
      rankings,
      top: 2,
      outside: { thin: 0, lowInsight: 0, placeholder: 0, noVector: 0 },
      pairs: [['slug-a', 'slug-b']],
      readLimit: 30_000,
      metric: 'match',
    });
    expect(report).toContain('| 名次 | 分數 | 卡片 | 核心體悟 |');
    expect(report).toContain('數字越大越近');
    expect(report).toContain(`| ${(-rankings.get('a')![0].distance).toFixed(3)} | Title b（\`slug-b\`）`);
  });

  it('tries the funnel for a reader whose only positive is one card: its pair makes the 8 by the taste', () => {
    const { picks, byTaste } = funnelTrial(records, 'a');
    expect(picks).not.toContain('a');
    expect(picks[0]).toBe('b');
    expect(byTaste.has('b')).toBe(true);
    const verdicts = funnelVerdicts(['a', 'b', 'c', 'd', 'e'].map((id) => card(id)), records, [['slug-a', 'slug-b'], ['slug-a', 'gone']]);
    expect(verdicts).toEqual([
      { from: 'slug-a', to: 'slug-b', place: 1, byTaste: true, picks: 4 },
      { from: 'slug-b', to: 'slug-a', place: 1, byTaste: true, picks: 4 },
    ]);
    const report = renderReport({
      channel: 'insight', cards: [], pool: ['a', 'b'].map((id) => card(id)), rankings: rankMatch(records), top: 1,
      outside: { thin: 0, lowInsight: 0, placeholder: 0, noVector: 0 }, pairs: [], readLimit: 30_000, metric: 'match', funnel: verdicts,
    });
    expect(report).toContain('## 漏斗試跑');
    expect(report).toContain('| Title a（`slug-a`） | Title b（`slug-b`） | 第 1 | 口味 |');
  });
});

describe('the scripts', () => {
  const source = (file: string) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

  it('read no card\'s writer', () => {
    // A list that left a writer's own cards out, or marked them, would name an
    // anonymous card's writer (.claude/rules/safety.md): the diagnostic and the
    // dry run stay card-to-card, so none of them has a writer to print or keep.
    for (const file of ['nearest.ts', 'report.ts', 'dryrun.ts']) expect(source(file), file).not.toMatch(/authorId|userId|handle\b/);
  });

  it('write nothing to Firestore: the dry run and the diagnostic only read production', () => {
    expect(".doc('cards/x').set({})").toMatch(/\.doc\([^)]*\)\s*\.(set|update|delete|create)\(/);
    for (const file of ['nearest.ts', 'dryrun.ts']) {
      // A document's or a query result's writes, a batch, a transaction, the index's own writers.
      expect(source(file), file).not.toMatch(
        /\.doc\([^)]*\)\s*\.(set|update|delete|create)\(|\.ref\.(set|update|delete)\(|collection\([^)]*\)\s*\.add\(|\.batch\(|runTransaction|bulkWriter|recursiveDelete|indexCard\(|getVectorStore|\.upsert\(|setVisibility\(|deleteByCard\(/,
      );
    }
  });
});
