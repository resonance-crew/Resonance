/**
 * The pure half of the recommender's nearest-card diagnostic (./nearest.ts):
 * exact neighbours over the stored vectors, how much of each story the
 * signature model was handed, and the report the owner reads. No I/O.
 *
 * A card here has a title, a slug and its signature — never an author. A
 * neighbour list that left an author's own cards out, or marked them, would
 * say who wrote an anonymous one (.claude/rules/safety.md).
 */
import { dot, normalize } from '../../src/lib/recommend/math';

export interface DiagCard {
  id: string;
  /** The card's slug, or its id when it has none: what the report names it by, and what --card / --pair take. */
  key: string;
  title: string;
  /** Characters of the title and story together, as the signature model would be handed them uncut. */
  fullChars: number;
  /** How many of those it was handed (signatureText cuts the rest). */
  readChars: number;
  coreInsight: string;
  situation: string;
  lifeDomain: string;
}

/** Card id → unit vector. */
export type Vectors = ReadonlyMap<string, number[]>;

export interface Neighbour {
  id: string;
  /** Cosine distance, 1 − cos θ, as the vector store answers it: smaller is closer. */
  distance: number;
}

/** Card id → every other card, nearest first. */
export type Rankings = ReadonlyMap<string, Neighbour[]>;

/**
 * Every card's neighbours, nearest first — exact, over all pairs (the feed's
 * first step asks Firestore for the same order). Ties go by id, so two runs
 * over the same vectors read the same.
 */
export function rank(vectors: Vectors): Rankings {
  const ids = [...vectors.keys()].filter((id) => (vectors.get(id)?.length ?? 0) > 0);
  const out = new Map<string, Neighbour[]>();
  for (const id of ids) {
    const from = vectors.get(id)!;
    const list = ids
      .filter((other) => other !== id)
      .map((other) => ({ id: other, distance: 1 - dot(from, vectors.get(other)!) }));
    list.sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1));
    out.set(id, list);
  }
  return out;
}

export interface Standing {
  /** 1 = the nearest. */
  rank: number;
  /** How many cards the list holds. */
  of: number;
  distance: number;
}

/** Where `to` stands among `from`'s neighbours; null when either has no vector. */
export function standing(rankings: Rankings, from: string, to: string): Standing | null {
  const list = rankings.get(from);
  if (!list) return null;
  const at = list.findIndex((n) => n.id === to);
  return at < 0 ? null : { rank: at + 1, of: list.length, distance: list[at].distance };
}

/**
 * How many cards list each card among their nearest `top`, most-listed first
 * (on average a card is on `top` lists). One on far more is near everything:
 * its signature is worded so broadly that it tells no two cards apart.
 */
export function hubs(rankings: Rankings, top: number): { id: string; lists: number }[] {
  const counts = new Map<string, number>([...rankings.keys()].map((id) => [id, 0]));
  for (const list of rankings.values()) for (const n of list.slice(0, top)) counts.set(n.id, (counts.get(n.id) ?? 0) + 1);
  return [...counts].map(([id, lists]) => ({ id, lists })).sort((a, b) => b.lists - a.lists || (a.id < b.id ? -1 : 1));
}

/** The middle value (the lower of the two middles for an even count); 0 for none. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export interface CorpusStats {
  cards: number;
  /** Cards longer than what the signature model is handed. */
  cut: number;
  /** Of those, the median share of the text it was handed (0–1); 1 when none is cut. */
  readShare: number;
  insightChars: { min: number; median: number; max: number };
  /** Median distance from a card to its nearest neighbour. */
  nearest: number;
  /** Median distance from a card to the neighbour in the middle of its list. */
  typical: number;
}

/** Characters as a reader counts them (a surrogate pair is one). */
const chars = (s: string) => [...s].length;

export function corpusStats(cards: DiagCard[], rankings: Rankings): CorpusStats {
  const cut = cards.filter((c) => c.readChars < c.fullChars);
  const lengths = cards.map((c) => chars(c.coreInsight));
  const lists = cards.map((c) => rankings.get(c.id) ?? []).filter((l) => l.length > 0);
  return {
    cards: cards.length,
    cut: cut.length,
    readShare: cut.length ? median(cut.map((c) => c.readChars / c.fullChars)) : 1,
    insightChars: {
      min: lengths.length ? Math.min(...lengths) : 0,
      median: median(lengths),
      max: lengths.length ? Math.max(...lengths) : 0,
    },
    nearest: median(lists.map((l) => l[0].distance)),
    typical: median(lists.map((l) => l[Math.floor((l.length - 1) / 2)].distance)),
  };
}

export interface Comparison {
  /** Cards both rankings hold. */
  cards: number;
  /** How many have the same nearest card in both. */
  sameNearest: number;
  /** Where the other ranking's nearest card stands in the base ranking: the median over cards. */
  medianStanding: number;
  /** Per card: the other ranking's nearest, and where it stands in the base ranking. */
  rows: Map<string, { nearest: string; rank: number }>;
}

/** How far a second ranking's idea of "nearest" sits from the base one's. */
export function compare(base: Rankings, other: Rankings): Comparison {
  const rows = new Map<string, { nearest: string; rank: number }>();
  for (const [id, list] of other) {
    const nearest = list[0]?.id;
    const at = nearest ? standing(base, id, nearest) : null;
    if (nearest && at) rows.set(id, { nearest, rank: at.rank });
  }
  const ranks = [...rows.values()].map((r) => r.rank);
  return { cards: rows.size, sameNearest: ranks.filter((r) => r === 1).length, medianStanding: median(ranks), rows };
}

/**
 * A text in pieces of at most `size` characters, cut at paragraph ends where
 * it can; a paragraph longer than that is cut where it runs out. Every
 * character of every paragraph lands in a piece.
 */
export function chunks(text: string, size: number): string[] {
  const out: string[] = [];
  let piece = '';
  const flush = () => {
    if (piece) out.push(piece);
    piece = '';
  };
  for (const paragraph of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (piece && piece.length + 2 + paragraph.length > size) flush();
    if (paragraph.length <= size) {
      piece = piece ? `${piece}\n\n${paragraph}` : paragraph;
      continue;
    }
    for (let at = 0; at < paragraph.length; at += size) out.push(paragraph.slice(at, at + size));
  }
  flush();
  return out;
}

/** One unit vector for a text embedded in pieces: their mean, each weighted by its length. */
export function pooled(pieces: { vector: number[]; chars: number }[]): number[] {
  const held = pieces.filter((p) => p.vector.length > 0 && p.chars > 0);
  if (held.length === 0) return [];
  const sum = new Array<number>(held[0].vector.length).fill(0);
  for (const { vector, chars: weight } of held) for (let i = 0; i < sum.length; i++) sum[i] += (vector[i] ?? 0) * weight;
  return normalize(sum);
}

/** The card a key names — its slug or its id. */
export function resolve(cards: DiagCard[], key: string): DiagCard | undefined {
  return cards.find((c) => c.key === key || c.id === key);
}

export interface PairVerdict {
  a: string;
  b: string;
  /** Where b stands among a's neighbours, and a among b's; null when a key names no card in the pool. */
  ab: Standing | null;
  ba: Standing | null;
}

export function pairVerdicts(cards: DiagCard[], rankings: Rankings, pairs: [string, string][]): PairVerdict[] {
  return pairs.map(([a, b]) => {
    const ca = resolve(cards, a);
    const cb = resolve(cards, b);
    return {
      a,
      b,
      ab: ca && cb ? standing(rankings, ca.id, cb.id) : null,
      ba: ca && cb ? standing(rankings, cb.id, ca.id) : null,
    };
  });
}

/** Whether every pair stands within `within` of each other, both ways. */
export function pairsHold(verdicts: PairVerdict[], within: number): boolean {
  return verdicts.every((v) => v.ab !== null && v.ba !== null && v.ab.rank <= within && v.ba.rank <= within);
}

export interface ReportInput {
  channel: 'insight' | 'situation';
  /** The cards to print, each with a vector, in the order to print them. */
  cards: DiagCard[];
  /** Every card in the pool (what the pairs and the neighbours are named from). */
  pool: DiagCard[];
  rankings: Rankings;
  /** Neighbours listed per card. */
  top: number;
  /** Public published cards with no vector, by why. */
  outside: { thin: number; lowInsight: number; placeholder: number; noVector: number };
  pairs: [string, string][];
  /** The second opinion's ranking (whole texts embedded), when asked for. */
  whole?: Rankings;
  /** The most characters the signature model is handed. */
  readLimit: number;
}

const fmt = (d: number) => d.toFixed(3);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const count = (n: number) => n.toLocaleString('en-US');
/** One table cell: a line, with nothing that ends the cell. */
const cell = (s: string) => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
const name = (c: DiagCard | undefined, fallback = '') => (c ? `${cell(c.title) || '（無標題）'}（\`${c.key}\`）` : `\`${fallback}\`（不在候選池裡）`);
const place = (s: Standing | null) => (s ? `第 ${s.rank}／${s.of}` : '—');

/** The report, in Markdown, in the owner's language (the cards' own). */
export function renderReport(input: ReportInput): string {
  const { cards, pool, rankings, whole, outside } = input;
  const byId = new Map(pool.map((c) => [c.id, c]));
  const stats = corpusStats(pool, rankings);
  const lines: string[] = [];
  const outsideTotal = outside.thin + outside.lowInsight + outside.placeholder + outside.noVector;

  lines.push('# 推薦診斷：每張卡片最接近的是哪一張', '');
  lines.push(
    `頻道 ${input.channel}。候選池裡的公開卡片 ${count(stats.cards)} 張。` +
      (outsideTotal
        ? `另有 ${count(outsideTotal)} 張公開卡片不在池裡（太短 ${outside.thin}、體悟分數不到門檻 ${outside.lowInsight}、被判為測試文 ${outside.placeholder}、沒有向量 ${outside.noVector}）。`
        : ''),
  );
  lines.push('距離是餘弦距離，0 是完全一樣，1 是無關，數字越小越近。推薦的每一步只讀下面的「核心體悟」和「處境」，不讀原文。', '');

  lines.push('## 模型讀到多少', '');
  lines.push(
    `- 簽名模型只拿到標題加故事的前 ${count(input.readLimit)} 個字（含標點和 Markdown 記號）。${count(stats.cards)} 張裡有 ${count(stats.cut)} 張比這長` +
      (stats.cut ? `，這些卡片的中位數是只讀到全文的 ${pct(stats.readShare)}。` : '。'),
  );
  lines.push(`- 核心體悟的長度：最短 ${stats.insightChars.min} 字，中位數 ${stats.insightChars.median} 字，最長 ${stats.insightChars.max} 字。`);
  lines.push(
    `- 每張卡片到最近那張的距離，中位數 ${fmt(stats.nearest)}。到名單正中間那張的距離，中位數 ${fmt(stats.typical)}。兩個數字越接近，向量越分不出誰近誰遠。`,
    '',
  );

  const HUB_TOP = 3;
  const listed = hubs(rankings, HUB_TOP).filter((h) => h.lists > HUB_TOP).slice(0, 5);
  if (listed.length) {
    lines.push('## 跟誰都很近的卡片', '');
    lines.push(
      `一張卡片平均會出現在 ${HUB_TOP} 張卡片的前 ${HUB_TOP} 名裡。出現次數遠多於這個數字的，核心體悟寫得太籠統，跟哪一張都像。`,
      '',
      `| 卡片 | 出現在幾張卡片的前 ${HUB_TOP} 名 | 核心體悟 |`,
      '|---|---|---|',
    );
    for (const h of listed) lines.push(`| ${name(byId.get(h.id), h.id)} | ${h.lists}／${stats.cards - 1} | ${cell(byId.get(h.id)?.coreInsight ?? '')} |`);
    lines.push('');
  }

  if (input.pairs.length) {
    lines.push('## 指定的配對', '', '| A | B | B 在 A 的名單裡 | A 在 B 的名單裡 | 距離 |', '|---|---|---|---|---|');
    for (const v of pairVerdicts(pool, rankings, input.pairs)) {
      lines.push(`| ${name(resolve(pool, v.a), v.a)} | ${name(resolve(pool, v.b), v.b)} | ${place(v.ab)} | ${place(v.ba)} | ${v.ab ? fmt(v.ab.distance) : '—'} |`);
    }
    lines.push('');
  }

  const versus = whole ? compare(rankings, whole) : null;
  if (versus) {
    lines.push('## 整篇文字的第二種看法', '');
    lines.push('把每張卡片的標題和整篇故事分段做 embedding 再平均，當成另一種排法。這只是對照，不代表正確答案。', '');
    lines.push(`- ${count(versus.cards)} 張裡，兩種排法選出同一張最近卡片的有 ${count(versus.sameNearest)} 張。`);
    lines.push(`- 整篇文字選出的最近卡片，在現在的名單裡排名的中位數是第 ${versus.medianStanding}。`, '');
  }

  lines.push('## 每張卡片', '');
  for (const card of cards) {
    lines.push(`### ${name(card)}`, '');
    lines.push(
      card.readChars < card.fullChars
        ? `全文 ${count(card.fullChars)} 字，模型讀到 ${pct(card.readChars / card.fullChars)}`
        : `全文 ${count(card.fullChars)} 字，模型全部讀到`,
      '',
    );
    lines.push(`- 核心體悟：${cell(card.coreInsight)}（${chars(card.coreInsight)} 字）`);
    lines.push(`- 處境：${cell(card.situation) || '—'}`);
    lines.push(`- 領域：${cell(card.lifeDomain) || '—'}`, '');
    lines.push('| 名次 | 距離 | 卡片 | 核心體悟 |', '|---|---|---|---|');
    (rankings.get(card.id) ?? []).slice(0, input.top).forEach((n, i) => {
      lines.push(`| ${i + 1} | ${fmt(n.distance)} | ${name(byId.get(n.id), n.id)} | ${cell(byId.get(n.id)?.coreInsight ?? '')} |`);
    });
    lines.push('');
    const second = versus?.rows.get(card.id);
    if (second) {
      lines.push(
        second.rank === 1
          ? `整篇文字認為最近的也是 ${name(byId.get(second.nearest), second.nearest)}。`
          : `整篇文字認為最近的是 ${name(byId.get(second.nearest), second.nearest)}，在上面的名單裡排第 ${second.rank}。`,
        '',
      );
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
