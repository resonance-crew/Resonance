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
/**
 * What the pick is asked for and kept by (Wave 2 #3a, the owner: 2–3 whole sentences, about 100 characters of the
 * author's own words — round 27 took one sentence of 8–36). Stored with the pick (`tapPassages.v`): a card whose
 * passages were made by an older version is made again by the next run that reaches it (the backfill, the cron),
 * as a changed story is. Raise it whenever the prompt or the rules below change what a pick is.
 */
export const PASSAGES_VERSION = 2;
/** A passage in a CJK story, in code points: 1–3 whole sentences, about 100 characters at most. */
export const PASSAGE_MIN_CJK = 8;
export const PASSAGE_MAX_CJK = 100;
/** A passage in a Latin story: 4–60 words, at most 360 characters. */
export const PASSAGE_MIN_WORDS = 4;
export const PASSAGE_MAX_WORDS = 60;
export const PASSAGE_MAX_CHARS = 360;
/**
 * The share of a story's plain text (code points) its passages may take together: past it a later one is dropped, so
 * the pick is still a pick and not the story read back — longer passages ask for a longer story.
 */
export const PASSAGES_MAX_SHARE = 0.6;
/** How long a story must be (CJK characters and other words, as the mirror counts) to offer passages. */
export const PASSAGES_MIN_UNITS = 180;
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
  /** PASSAGES_VERSION when they were made; absent: round 27's (1). */
  v?: number;
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

/** Whether stored passages are as the current version makes them for this story: the same text, the same version. */
export function passagesCurrent(stored: { of?: unknown; v?: unknown } | undefined, of: string): boolean {
  return !!stored && stored.of === of && (typeof stored.v === 'number' ? stored.v : 1) >= PASSAGES_VERSION;
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
export function blocksOf(story: string): StoryBlock[] {
  return story
    .split(/\n[ \t\u00A0]*\n/)
    .map((md) => ({ md: md.trim(), text: squash(plainText(md)) }))
    .filter((b) => b.text.length > 0);
}

/** One of {@link blocksOf}'s blocks: its Markdown and its plain text, whitespace read as one. */
export interface StoryBlock {
  text: string;
  md: string;
}

/**
 * Where a sentence lies in the story's blocks, read as a pick is read (the
 * text whitespace-squashed, then the first block whose plain text holds it,
 * at its first place there): the block's index, where it starts and ends in
 * that block's text, and the squashed text. Null when no one block holds it.
 * The one place-finder of {@link verifyPassages} and the author's picked
 * sentences (lib/cards/tapPicked, round 29).
 */
export function placeInBlocks(blocks: readonly StoryBlock[], raw: string): { block: number; start: number; end: number; text: string } | null {
  const text = squash(raw);
  if (!text) return null;
  const block = blocks.findIndex((b) => b.text.includes(text));
  if (block < 0) return null;
  const start = blocks[block].text.indexOf(text);
  return { block, start, end: start + text.length, text };
}

/** A sentence's last mark, with closing quotes or brackets after it. */
const SENTENCE_END_CJK = /[。！？!?…]+[」』”’"）)]*$/u;
const SENTENCE_END_LATIN = /[.!?…]+["”’)]*$/u;
/** Where a sentence may start inside a block: after a sentence's end (and closing marks), then any space. */
const AFTER_END_CJK = /[。！？!?…][」』”’"）)]*\s*$/u;
const AFTER_END_LATIN = /[.!?…]["”’)]*\s+$/u;
/** Opening and closing quotes: a passage that is one quotation from end to end is someone's speech, not the author's line. */
const OPENS = '「『“"‘\'';
const CLOSES = '」』”"’\'';

/** Whether `text`, found at [start, end) of `block`, begins and ends where sentences do (a block's edges count). */
export function wholeSentences(block: string, start: number, end: number, script: 'cjk' | 'latin'): boolean {
  const text = block.slice(start, end);
  const endsWell = end === block.length || (script === 'cjk' ? SENTENCE_END_CJK : SENTENCE_END_LATIN).test(text);
  const startsWell = start === 0 || (script === 'cjk' ? AFTER_END_CJK : AFTER_END_LATIN).test(block.slice(0, start));
  return endsWell && startsWell;
}

/** Whether a passage is one quotation from its first mark to its last: dialogue (Wave 2 #3a: never offered). */
export function quotedSpeech(text: string): boolean {
  // A stop after the closing quote (「好。」。 / "Fine".) still leaves one quotation.
  const chars = [...text.trim().replace(/[。.]+$/u, '')];
  const first = chars[0];
  const last = chars[chars.length - 1];
  if (!first || !last || !OPENS.includes(first) || !CLOSES.includes(last)) return false;
  // One quotation, not two side by side (「…」他說「…」): no closing mark inside — an apostrophe aside (I'm, don’t).
  return !chars.slice(1, -1).some((c) => CLOSES.includes(c) && c !== "'" && c !== '’');
}

/**
 * The passages a card offers from what was picked (a model's answer, the
 * offline pick): each string, whitespace read as one and trimmed, must be a
 * contiguous piece of the story's plain text read the same way, within one
 * of its blocks — anything else is dropped. Then, in the story's order: drop
 * one shorter than the floor or longer than the cap, one that doesn't begin
 * and end where sentences do (Wave 2 #3a: whole sentences only), one that is
 * a single quotation (dialogue), one that overlaps or repeats an earlier one,
 * one that is the title, and one that would take the pick past
 * PASSAGES_MAX_SHARE of the story. The first PASSAGES_MAX are kept; fewer
 * than PASSAGES_MIN left is none.
 */
export function verifyPassages(story: string, picked: readonly unknown[], opts: { title?: string } = {}): TapPassageItem[] {
  const title = squash(opts.title ?? '');
  const blocks = blocksOf(story);
  if (!blocks.length) return [];
  const script = storyType(opts.title ?? '', story).script;
  const room = Math.floor(codePoints(blocks.map((b) => b.text).join(' ')) * PASSAGES_MAX_SHARE);
  let taken = 0;
  const found: { block: number; start: number; end: number; text: string }[] = [];
  for (const raw of picked) {
    if (typeof raw !== 'string') continue;
    const place = placeInBlocks(blocks, raw);
    if (place) found.push(place);
  }
  found.sort((a, b) => a.block - b.block || a.start - b.start || a.end - b.end);
  const kept: typeof found = [];
  for (const f of found) {
    if (!passageFits(f.text, script)) continue;
    if (!wholeSentences(blocks[f.block].text, f.start, f.end, script) || quotedSpeech(f.text)) continue;
    if (title && f.text === title) continue;
    if (kept.some((k) => k.text === f.text || (k.block === f.block && f.start < k.end && k.start < f.end))) continue;
    if (taken + codePoints(f.text) > room) continue;
    taken += codePoints(f.text);
    kept.push(f);
    if (kept.length === PASSAGES_MAX) break;
  }
  if (kept.length < PASSAGES_MIN) return [];
  return kept.map((k) => ({ id: passageId(k.text), text: k.text }));
}

/** A sentence's end: CJK and Latin marks, a closing quote after one kept with it. */
const SENTENCE = /[^。！？!?…]*(?:[。！？!?…]+[」』”’"]?|$)/gu;
const SENTENCE_LATIN = /[^.!?…]*(?:[.!?…]+["”’)]?(?=\s|$)|$)/gu;
function sentencesOf(paragraph: string, script: 'cjk' | 'latin'): string[] {
  const re = script === 'cjk' ? SENTENCE : SENTENCE_LATIN;
  return (paragraph.match(re) ?? []).map(squash).filter(Boolean);
}

/**
 * The first run of whole sentences of a paragraph that fits (Wave 2 #3a): from each sentence on, as many of the
 * ones after it as still fit the cap (three at most), the longest such run that fits — never one that is a lone
 * quotation; null when none does.
 */
function firstRun(sentences: string[], script: 'cjk' | 'latin'): string | null {
  const join = (xs: string[]) => squash(xs.join(script === 'cjk' ? '' : ' '));
  for (let i = 0; i < sentences.length; i++) {
    for (let n = Math.min(3, sentences.length - i); n >= 1; n--) {
      const run = join(sentences.slice(i, i + n));
      if (passageFits(run, script) && !quotedSpeech(run)) return run;
    }
  }
  return null;
}

/** A block that is not prose: a heading, a list, a table, code, a rule. */
const NOT_PROSE = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||```|~~~|---|\*\*\*|___)/;
/** A block that carries a link (its words are the link's, not the author's sentence): taken last. */
const HAS_LINK = /\]\(/;

/**
 * The pick made without a model (the emulators' `modelsOffline`, the seed):
 * the first run of up to three whole sentences that fits of each of
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
    const run = firstRun(sentencesOf(p.text, script), script);
    if (run) picked.push(run);
  }
  return verifyPassages(story, picked, opts);
}
