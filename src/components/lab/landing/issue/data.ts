/**
 * What the issue sets from the six cards, worked out on the server (pure: no DOM, no React). Everything here is read
 * from what the landing read already serializes into its HTML (latestForLanding): titles, stories, tags, covers, and
 * a byline only for a named card.
 */
import type { Card, User } from '@/lib/db/types';
import { passageBlocks } from '@/lib/markdown/sharePassages';
import { readMinutes } from '@/lib/readTime';
import { storyType } from '@/lib/text/script';

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
const graphemes = (s: string) => Array.from(segmenter.segment(s), (x) => x.segment);

/** One story as the issue sets it. */
export interface IssueStory {
  id: string;
  /** The card page's key: the slug, never for an anonymous card (its id). */
  href: string;
  /** The card's slug (anonymous cards too: the server's own, never shown — only to pick the faked pair). */
  slug: string | null;
  title: string;
  /** Its first sentence, ≤ 36 graphemes (CJK) / 110 characters (Latin): the contents' pull quote. */
  quote: string;
  /** Its second sentence, ≤ 46 graphemes / 130 characters: the cover line (never the pull quote again). */
  line: string;
  /**
   * What comes after the pull quote, ≤ 90 graphemes / 220 characters, ending 「……」: a page of the story printed
   * elsewhere in the issue (the spread, the last page), so no passage is printed twice.
   */
  excerpt: string;
  /**
   * About four lines from the middle of the story (from its fourth sentence on, in a short one): the sidenote's —
   * a look further in, never what the issue prints elsewhere.
   */
  passage: string;
  /** The pen name; null for an anonymous card (shown as 不署名, never an author). */
  author: string | null;
  minutes: number;
  tags: string[];
  cover: string | null;
  script: 'cjk' | 'latin';
  lang?: string;
  /** Its id's hue family, for a quiet tint (0–5). */
  family: number;
  /** The plain sentences, for a passage picked by hand (the faked pair). */
  sentences: string[];
}

const SOFT_BREAK = /[，、；：,;:—–]/u;
const OPEN = new Set(['「', '『', '（', '(', '“', '‘', '《', '〈', '[']);
const CLOSE = new Set(['」', '』', '）', ')', '”', '’', '》', '〉', ']']);
const END_CJK = new Set(['。', '！', '？', '!', '?']);
/** A Latin full stop that ends a title or an abbreviation (Ms. Tsai, e.g.), not a sentence. */
const ABBREVIATION = /(?:^|\s)(?:[A-Z][a-z]{0,2}|e\.g|i\.e|vs|etc)\.$/u;

/**
 * `text` cut at `max` graphemes: at the last soft break before it when one is past half way, never inside 〈〉 or
 * 「」 (a bracket left open goes back to before it), with `tail`.
 */
function cutAt(text: string, max: number, tail: string): string {
  const g = graphemes(text);
  if (g.length <= max) return text;
  let end = max;
  for (let i = max - 1; i > max / 2; i--) {
    if (SOFT_BREAK.test(g[i])) {
      end = i;
      break;
    }
  }
  const open: number[] = [];
  for (let i = 0; i < end; i++) {
    if (OPEN.has(g[i])) open.push(i);
    else if (CLOSE.has(g[i])) open.pop();
  }
  if (open.length && open[0] > max / 3) end = open[0];
  return g.slice(0, end).join('').replace(/[\s，、；：,;:—–]+$/u, '') + tail;
}

/**
 * The story's sentences in reading order: a block ends one (a line like 「國小四年級的時候」, too short to stand,
 * runs on into the next with a comma), and inside a block a sentence ends at 。！？ (or . ! ? before a space, in
 * Latin) — never inside 「」 or brackets, so a quoted question doesn't end the sentence quoting it.
 */
export function sentencesOf(blocks: string[], script: 'cjk' | 'latin'): string[] {
  const out: string[] = [];
  let carry = '';
  for (const b of blocks) {
    // a line break inside a CJK paragraph joins its two halves; any other run of space is one space
    const clean = (script === 'cjk' ? b.replace(/\s*\n\s*/g, '') : b).replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const text = carry
      ? script === 'latin'
        ? `${carry} ${clean}`
        : /[：:]$/u.test(carry)
          ? `${carry}${clean}`
          : `${carry.replace(/[，,]$/u, '')}，${clean}`
      : clean;
    carry = '';
    const g = graphemes(text);
    if (g.length < 14 && !/[。！？!?…]$/u.test(text)) {
      carry = text;
      continue;
    }
    let depth = 0;
    let cur = '';
    for (let i = 0; i < g.length; i++) {
      const ch = g[i];
      cur += ch;
      if (OPEN.has(ch)) depth++;
      else if (CLOSE.has(ch)) depth = Math.max(0, depth - 1);
      const ends =
        depth === 0 &&
        (END_CJK.has(ch) || (script === 'latin' && ch === '.' && (i + 1 >= g.length || /\s/.test(g[i + 1])) && !ABBREVIATION.test(cur)));
      if (!ends) continue;
      // the end marks that follow (？！, a closing quote) stay with it
      while (i + 1 < g.length && (END_CJK.has(g[i + 1]) || CLOSE.has(g[i + 1]))) cur += g[++i];
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    }
    if (cur.trim()) out.push(cur.trim());
  }
  if (carry) out.push(carry);
  return out;
}

/** Sentences run together (a CJK sentence that ended without a mark takes a comma) and cut at `max` with 「……」. */
function run(sentences: string[], script: 'cjk' | 'latin', max: number): string {
  const tail = script === 'cjk' ? '……' : '…';
  let text = '';
  for (const x of sentences) {
    if (!text) text = x;
    else if (script === 'latin') text = `${text} ${x}`;
    else text = /[。！？…」』）!?：:]$/u.test(text) ? `${text}${x}` : `${text}，${x}`;
    if (graphemes(text).length > max) break;
  }
  const cut = cutAt(text, max, tail);
  return cut.endsWith(tail) ? cut : `${cut.replace(/[。.！!？?，,]$/u, '')}${tail}`;
}

/** One sentence as a quote: whole when it fits (its end mark dropped), else cut with 「……」. */
function quoteOf(sentence: string, script: 'cjk' | 'latin', max: number): string {
  const tail = script === 'cjk' ? '……' : '…';
  if (graphemes(sentence).length <= max) return sentence.replace(/[。.]$/u, '');
  return cutAt(sentence, max, tail);
}

/** Where the sidenote opens a story of `n` sentences: half way in, never before its fourth (nor past its last). */
function middle(n: number): number {
  if (n <= 1) return 0;
  return Math.min(n - 1, Math.max(3, Math.floor(n / 2)));
}

/** The card's id → one of the six card families (a quiet tint), as the card colours pick one. */
function familyOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 6;
}

export function issueStory(card: Card, authors: Record<string, User>): IssueStory {
  const { script, lang } = storyType(card.thoughtCore, card.story);
  const cjk = script === 'cjk';
  const sentences = sentencesOf(passageBlocks(card.story), script);
  const fallback = card.thoughtCore;
  const rest = sentences.slice(1);
  return {
    id: card.id,
    href: `/card/${card.anonymous ? card.id : (card.slug ?? card.id)}`,
    slug: card.slug ?? null,
    title: card.thoughtCore,
    quote: sentences.length ? quoteOf(sentences[0], script, cjk ? 36 : 110) : fallback,
    line: rest.length ? quoteOf(rest[0], script, cjk ? 46 : 130) : sentences.length ? quoteOf(sentences[0], script, cjk ? 46 : 130) : fallback,
    excerpt: rest.length ? run(rest, script, cjk ? 90 : 220) : sentences.length ? run(sentences, script, cjk ? 90 : 220) : fallback,
    passage: sentences.length ? run(sentences.slice(middle(sentences.length)), script, cjk ? 72 : 180) : fallback,
    author: card.anonymous ? null : (authors[card.authorId]?.handle ?? null),
    minutes: readMinutes(card.story),
    tags: card.tags.slice(0, 2),
    cover: card.media?.type === 'image' && card.media.url ? card.media.url : null,
    script,
    lang,
    family: familyOf(card.id),
    sentences,
  };
}

/** The named authors, in the issue's order, each once; and whether any story is unsigned (never how many). */
export function bylines(stories: IssueStory[]): { names: string[]; unsigned: boolean } {
  const names: string[] = [];
  let unsigned = false;
  for (const s of stories) {
    if (!s.author) unsigned = true;
    else if (!names.includes(s.author)) names.push(s.author);
  }
  return { names, unsigned };
}

/** A page of the spread: the story and the passage printed for it. */
export interface SpreadPage {
  story: IssueStory;
  passage: string;
}

/**
 * The faked pair for judging (the owner's call): 念誠's 〈放鬆的心，才接得住靈感〉 asks whether life hands you the best
 * things once you stop grasping for them, and Neo's 〈換我坐副駕駛〉 answers it — the giving he thought went one way,
 * until the summer he sat in the passenger seat. Two named zh cards by two people (a card never answers its own
 * author's), each printed from the sentence that carries the pairing.
 */
const FAKED = {
  a: 'open-mind-catches-inspiration',
  b: 'my-turn-in-shotgun',
  /** The question 〈放鬆的心〉 asks, whole. */
  aFrom: /^四篇其實在回答同一個問題/u,
  aCount: 1,
  /** And the turn in 〈換我坐副駕駛〉 that answers it: three sentences. */
  bFrom: /^那些日子很開心/u,
  bCount: 3,
};

function passageFrom(story: IssueStory, from: RegExp, count: number): string {
  const i = story.sentences.findIndex((x) => from.test(x));
  return i >= 0 ? run(story.sentences.slice(i, i + count), story.script, story.script === 'cjk' ? 96 : 240) : story.excerpt;
}

/**
 * The spread's pair: a story and the story that answered it.
 *
 * FAKED for the prototype (the owner's call): the real version reads the newest resonance among the latest public
 * cards and its original (one get: public, published, listed, not trashed, not blank) — beyond "the six", so it waits
 * for the owner's OK. Here: a real pair when one of the six answers another of them (`faked: false`); else the pair
 * above when both are in the issue; else two of the six other than the cover story (the newest is printed on the
 * cover already), the older set as if the newer answered it. No pair (fewer than two stories): the section is left out.
 */
export function pairOf(cards: Card[], stories: IssueStory[]): { a: SpreadPage; b: SpreadPage; faked: boolean } | null {
  const byId = new Map(stories.map((s) => [s.id, s]));
  for (const c of cards) {
    const original = c.referenceCardId ? byId.get(c.referenceCardId) : undefined;
    const answer = byId.get(c.id);
    if (original && answer) return { a: { story: original, passage: original.excerpt }, b: { story: answer, passage: answer.excerpt }, faked: false };
  }
  const bySlug = (slug: string) => stories.find((s) => s.slug === slug);
  const a = bySlug(FAKED.a);
  const b = bySlug(FAKED.b);
  if (a && b) return { a: { story: a, passage: passageFrom(a, FAKED.aFrom, FAKED.aCount) }, b: { story: b, passage: passageFrom(b, FAKED.bFrom, FAKED.bCount) }, faked: true };
  const rest = stories.length > 2 ? stories.slice(1) : stories;
  if (rest.length < 2) return null;
  return { a: { story: rest[1], passage: rest[1].excerpt }, b: { story: rest[0], passage: rest[0].excerpt }, faked: true };
}

/**
 * The last page's left page: the newest story printed nowhere else in the issue (not the cover story, not the
 * spread's two), a CJK one when there is one; else the newest.
 */
export function lastStory(stories: IssueStory[], used: Set<string>): IssueStory | null {
  const free = stories.filter((s, i) => i > 0 && !used.has(s.id));
  return free.find((s) => s.script === 'cjk') ?? free[0] ?? stories[0] ?? null;
}

/** Split for the ripple: graphemes (CJK) or words with their spaces (Latin). */
export function rippleParts(text: string, script: 'cjk' | 'latin'): string[] {
  if (script === 'cjk') return graphemes(text);
  return text.split(/(\s+)/).filter(Boolean);
}
