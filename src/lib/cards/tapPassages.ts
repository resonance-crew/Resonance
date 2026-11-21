import { createHash } from 'node:crypto';
import { plainText } from '@/lib/markdown/plainText';
import { storyTooComplex } from '@/lib/markdown/storyLimits';
import { measure, storyType } from '@/lib/text/script';

/**
 * A card's tap passages (round 27, 共振之後，選一段): after a reader turns
 * 共振 on, a small dialog offers up to three sentences of the author's own,
 * word for word, and the reader may pick one ("this part"); only the card's
 * author learns which.
 *
 * The model only picks (lib/ai/tasks pickPassages): nothing it wrote is ever
 * shown, so every answer goes through {@link verifyPassages} — each pick must
 * be a contiguous piece of the story's plain text, whitespace read as one
 * space — and a story that tells the model what to answer can at worst get
 * odd sentences of its own offered.
 *
 * These are the pure rules, with no model import: GET /cards/{key}, the tap
 * and its list run in hkg1 (lib/ai/regions.test.ts). Making them is
 * lib/api/v1/tapPassagesMake; reading them lib/api/v1/tapPassages.
 */

/** Passages a card offers at most. */
export const PASSAGES_MAX = 3;
/** Fewer than this left after the check: the card offers none. */
export const PASSAGES_MIN = 2;
/** A passage in a CJK story, in code points: two lines of the dialog's 312 text column at most. */
export const PASSAGE_MIN_CJK = 8;
export const PASSAGE_MAX_CJK = 36;
/** A passage in a Latin story: 4–20 words, at most 120 characters. */
export const PASSAGE_MIN_WORDS = 4;
export const PASSAGE_MAX_WORDS = 20;
export const PASSAGE_MAX_CHARS = 120;
/** How long a story must be (CJK characters and other words, as the mirror counts) to offer passages. */
export const PASSAGES_MIN_UNITS = 200;
/** Failures for one text before it is left alone until the story changes. */
export const PASSAGES_TRIES_MAX = 3;

export interface TapPassageItem {
  id: string;
  text: string;
}

/** `cards/{id}.tapPassages`, server-written (the rules take it from no client). */
export interface StoredTapPassages {
  /** passagesHash of the story they were made from. */
  of?: string;
  items?: TapPassageItem[];
  model?: string;
  at?: unknown;
  /** Failures for the text whose hash is `of` (left alone after PASSAGES_TRIES_MAX). */
  failed?: { of?: string; tries?: number };
}

/** Runs of whitespace read as one space, trimmed. */
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

const codePoints = (s: string): number => [...s].length;

/** A passage's id: the first 8 hex characters of sha256 of its text (the same sentence keeps it when made again). */
export function passageId(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/** What a card's passages were made from: its story's plain text, whitespace read as one (a formatting-only edit keeps them). */
export function passagesHash(story: string): string {
  return createHash('sha256').update(squash(plainText(story))).digest('base64url').slice(0, 22);
}

/** How long a story is, as the mirror counts it: CJK characters and other words. */
export function passageUnits(story: string): number {
  const m = measure(plainText(story));
  return m.cjk + m.words;
}

/**
 * Whether a card may offer passages at all: published, out of the trash,
 * not blank, at least PASSAGES_MIN_UNITS long and not too complex to read.
 */
export function offersPassages(card: { publishedAt?: unknown; trashedAt?: unknown; story?: unknown }): boolean {
  if (card.publishedAt == null || card.trashedAt != null) return false;
  const story = typeof card.story === 'string' ? card.story : '';
  if (!story.trim() || storyTooComplex(story)) return false;
  return passageUnits(story) >= PASSAGES_MIN_UNITS;
}

/** Whether one passage's length fits the story's type. */
export function passageFits(text: string, script: 'cjk' | 'latin'): boolean {
  if (script === 'cjk') {
    const n = codePoints(text);
    return n >= PASSAGE_MIN_CJK && n <= PASSAGE_MAX_CJK;
  }
  const words = text.split(' ').filter(Boolean).length;
  return words >= PASSAGE_MIN_WORDS && words <= PASSAGE_MAX_WORDS && codePoints(text) <= PASSAGE_MAX_CHARS;
}

/**
 * The story's blocks (paragraphs, quotes, list items run together, headings)
 * as plain text, whitespace read as one, in order: a passage lies within one
 * (plainText runs blocks together, so a piece across two would read as one).
 */
function blocksOf(story: string): { text: string; md: string }[] {
  return story
    .split(/\n[ \t\u00A0]*\n/)
    .map((md) => ({ md: md.trim(), text: squash(plainText(md)) }))
    .filter((b) => b.text.length > 0);
}

/**
 * The passages a card offers from what was picked (a model's answer, the
 * offline pick): each string, whitespace read as one and trimmed, must be a
 * contiguous piece of the story's plain text read the same way, within one
 * of its blocks — anything else is dropped. Then, in the story's order: drop
 * one shorter than the floor or longer than the cap, one that overlaps or
 * repeats an earlier one, one that is the title. The first PASSAGES_MAX are
 * kept; fewer than PASSAGES_MIN left is none.
 */
export function verifyPassages(story: string, picked: readonly unknown[], opts: { title?: string } = {}): TapPassageItem[] {
  const title = squash(opts.title ?? '');
  const blocks = blocksOf(story);
  if (!blocks.length) return [];
  const script = storyType(opts.title ?? '', story).script;
  const found: { block: number; start: number; end: number; text: string }[] = [];
  for (const raw of picked) {
    if (typeof raw !== 'string') continue;
    const text = squash(raw);
    if (!text) continue;
    const block = blocks.findIndex((b) => b.text.includes(text));
    if (block < 0) continue;
    const start = blocks[block].text.indexOf(text);
    found.push({ block, start, end: start + text.length, text });
  }
  found.sort((a, b) => a.block - b.block || a.start - b.start || a.end - b.end);
  const kept: typeof found = [];
  for (const f of found) {
    if (!passageFits(f.text, script)) continue;
    if (title && f.text === title) continue;
    if (kept.some((k) => k.text === f.text || (k.block === f.block && f.start < k.end && k.start < f.end))) continue;
    kept.push(f);
    if (kept.length === PASSAGES_MAX) break;
  }
  if (kept.length < PASSAGES_MIN) return [];
  return kept.map((k) => ({ id: passageId(k.text), text: k.text }));
}

/** A sentence's end: CJK and Latin marks, a closing quote after one kept with it. */
const SENTENCE = /[^。！？!?…]*(?:[。！？!?…]+[」』”’"]?|$)/gu;
const SENTENCE_LATIN = /[^.!?…]*(?:[.!?…]+["”’)]?(?=\s|$)|$)/gu;
/** Where a clause may be cut. */
const CLAUSE = /[，、；：,;:—]/u;

function sentencesOf(paragraph: string, script: 'cjk' | 'latin'): string[] {
  const re = script === 'cjk' ? SENTENCE : SENTENCE_LATIN;
  return (paragraph.match(re) ?? []).map(squash).filter(Boolean);
}

/** A sentence cut to the cap at its last clause mark that fits (the mark left out), or null. */
function cutToCap(sentence: string, script: 'cjk' | 'latin'): string | null {
  if (passageFits(sentence, script)) return sentence;
  const chars = [...sentence];
  for (let i = chars.length - 1; i > 0; i--) {
    if (!CLAUSE.test(chars[i])) continue;
    const head = squash(chars.slice(0, i).join(''));
    if (passageFits(head, script)) return head;
  }
  return null;
}

/** A block that is not prose: a heading, a list, a table, code, a rule. */
const NOT_PROSE = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||```|~~~|---|\*\*\*|___)/;
/** A block that carries a link (its words are the link's, not the author's sentence): taken last. */
const HAS_LINK = /\]\(/;

/**
 * The pick made without a model (the emulators' `modelsOffline`, the seed):
 * the first sentence that fits — cut to the cap at a clause mark — of each of
 * the story's three longest prose paragraphs (a quote counts; headings,
 * lists, tables and code don't; one with a link only after those without),
 * through {@link verifyPassages} like any answer, so in the story's order.
 */
export function offlinePassages(story: string, opts: { title?: string } = {}): TapPassageItem[] {
  const script = storyType(opts.title ?? '', story).script;
  const prose = blocksOf(story)
    .map((b, at) => ({ ...b, at, linked: HAS_LINK.test(b.md) }))
    .filter((b) => !NOT_PROSE.test(b.md));
  prose.sort((a, b) => Number(a.linked) - Number(b.linked) || codePoints(b.text) - codePoints(a.text) || a.at - b.at);
  const picked: string[] = [];
  for (const p of prose) {
    if (picked.length === PASSAGES_MAX) break;
    for (const sentence of sentencesOf(p.text, script)) {
      const cut = cutToCap(sentence, script);
      if (cut) {
        picked.push(cut);
        break;
      }
    }
  }
  return verifyPassages(story, picked, opts);
}
