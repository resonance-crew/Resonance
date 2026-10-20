import { plainText } from '@/lib/markdown/plainText';

/**
 * Which script a text is written in — one rule for the publish panel's mirror
 * (lib/ai/mirror: which language to answer in) and for how a story is set
 * (src/styles/story.css: data-script and lang on the title and the prose), on
 * the web and in both apps (native/fixtures/story-script.json pins it).
 * Client-safe and pure.
 *
 * A text is read as a reader reads it: a CJK character against a word. Only
 * its prose counts — Markdown, link targets and bare addresses are left out
 * (lib/markdown/plainText) — and only its start, SCRIPT_READ_CHARS of title
 * and story together, so a 200 000-character story is judged in a moment.
 */

/** How much of a text, title and story together, is read from its start. */
export const SCRIPT_READ_CHARS = 4_000;

/** What the mirror tells apart: the CJK scripts one by one, Latin, and anything else (or nothing). */
export type DraftScript = 'han' | 'kana' | 'hangul' | 'latin' | 'other';

/** How a story is set: CJK (a Ming title over a Hei body, justified) or Latin (Playfair over DM Sans, ragged). */
export type StoryScript = 'cjk' | 'latin';

const HAN = /\p{scx=Han}/gu;
const KANA = /[\p{scx=Hira}\p{scx=Kana}]/gu;
const HANGUL = /\p{scx=Hang}/gu;
/** A run of letters in a script that spaces its words (Latin, Cyrillic, Greek…). */
const SPACED_WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const CJK_CHARS = /[\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\p{scx=Hang}]/gu;
const LATIN = /\p{scx=Latn}/u;
const LETTER = /\p{L}/u;

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** What a text holds: its CJK characters by script, and the words of the other scripts. */
export interface Measure {
  han: number;
  kana: number;
  hangul: number;
  /** han + kana + hangul */
  cjk: number;
  /** Words in the scripts that space them, digits alone included. */
  words: number;
  /** Words with a Latin letter in them. */
  latinWords: number;
  /** Words with any letter in them (not digits alone). */
  letterWords: number;
}

/** CJK characters and the other words of a text. */
export function measure(text: string): Measure {
  const han = count(text, HAN);
  const kana = count(text, KANA);
  const hangul = count(text, HANGUL);
  const words = text.replace(CJK_CHARS, ' ').match(SPACED_WORD) ?? [];
  const latinWords = words.filter((w) => LATIN.test(w)).length;
  const letterWords = words.filter((w) => LETTER.test(w)).length;
  return { han, kana, hangul, cjk: han + kana + hangul, words: words.length, latinWords, letterWords };
}

/** The prose of a title and story's first SCRIPT_READ_CHARS characters. */
export function readableProse(title: string, story: string): string {
  return plainText(`${title}\n\n${story}`.slice(0, SCRIPT_READ_CHARS));
}

function scriptOf(m: Measure): DraftScript {
  if (m.cjk === 0 && m.words === 0) return 'other';
  if (m.cjk >= m.words) {
    if (m.hangul > m.han + m.kana) return 'hangul';
    return m.kana * 10 >= m.cjk ? 'kana' : 'han';
  }
  return m.latinWords * 2 >= m.words ? 'latin' : 'other';
}

/**
 * The script the draft is mostly written in, by what a reader reads most of:
 * a CJK character against a word. Kana make Han Japanese; a Latin-script draft
 * may hold a Chinese name and stays Latin.
 */
export function draftScript(title: string, story: string): DraftScript {
  return scriptOf(measure(readableProse(title, story)));
}

/** The language tag each script stands for: Han is the site's own zh-TW (so VoiceOver keeps its Taiwan voice). */
const LANG: Partial<Record<DraftScript, string>> = { han: 'zh-TW', kana: 'ja', hangul: 'ko', latin: 'en' };

/**
 * How a story is set, and the language its words are in (for `lang` — on the
 * title and the prose only, never on what is around them, which is in the
 * reader's own language).
 *
 * - `script`: CJK when the mirror reads Han, kana or Hangul; Latin otherwise.
 *   A text with no letters at all — empty, or digits and marks alone — is
 *   neither, and takes `fallback`: the writer passes its UI locale's
 *   (`localeScript`), so an English writer's new card starts in Latin type
 *   instead of re-setting itself under the caret a moment after the first
 *   line; everyone else takes CJK, the site's own.
 * - `lang`: zh-TW, ja, ko or en; none for a text with no letters or one in a
 *   script we can't name (Cyrillic, Greek… — better no tag than a wrong one).
 */
export function storyType(
  title: string,
  story: string,
  fallback: StoryScript = 'cjk',
): { script: StoryScript; lang: string | undefined } {
  const m = measure(readableProse(title, story));
  if (m.cjk === 0 && m.letterWords === 0) return { script: fallback, lang: undefined };
  const script = scriptOf(m);
  return { script: script === 'han' || script === 'kana' || script === 'hangul' ? 'cjk' : 'latin', lang: LANG[script] };
}

/** How a story is set (storyType's `script`). */
export function storyScript(title: string, story: string, fallback: StoryScript = 'cjk'): StoryScript {
  return storyType(title, story, fallback).script;
}

/** The language a story's words are in, for `lang` (storyType's `lang`). */
export function storyLang(title: string, story: string): string | undefined {
  return storyType(title, story).lang;
}

/** The script an empty draft starts in, from the UI's locale: en is Latin, zh-TW (and any CJK locale) is CJK. */
export function localeScript(locale: string): StoryScript {
  return /^(zh|ja|ko)\b/i.test(locale) ? 'cjk' : 'latin';
}

/**
 * How much a draft must hold — CJK characters and other words together, as
 * the mirror counts them (lib/ai/mirror MIN_DRAFT_UNITS, which a test keeps
 * equal) — before the writer re-sets it by what it reads: under it, a draft
 * stays in the type it started in (its UI locale's, or what it was opened in).
 */
export const WRITER_SCRIPT_FLOOR = 15;

/**
 * How far past even a draft must lean before the writer changes its type:
 * set as CJK, it turns Latin once CJK characters are at most this share of
 * what it holds; set as Latin, it turns CJK once they are at least 1 − this.
 * Between the two it keeps the type it has, so a draft mixing the two about
 * evenly never flips back and forth under the caret.
 */
export const WRITER_SCRIPT_LEAN = 0.4;

/**
 * The type a story being written is set in, re-read as it is written (the
 * writer asks on its autosave tick, never per keystroke). `current` is what it
 * is set in now — for a new draft its UI locale's (`localeScript`), for a
 * draft opened again `storyType`'s reading of it. The draft changes type only
 * once it holds WRITER_SCRIPT_FLOOR units and leans clearly the other way
 * (WRITER_SCRIPT_LEAN); a draft with no letters keeps what it has.
 */
export function writerScript(current: StoryScript, title: string, story: string): StoryScript {
  const m = measure(readableProse(title, story));
  const units = m.cjk + m.words;
  if (units < WRITER_SCRIPT_FLOOR || (m.cjk === 0 && m.letterWords === 0)) return current;
  const share = m.cjk / units;
  if (current === 'cjk') return share <= WRITER_SCRIPT_LEAN ? 'latin' : 'cjk';
  return share >= 1 - WRITER_SCRIPT_LEAN ? 'cjk' : 'latin';
}

/** ‘ or ’ with a Latin letter immediately before and after it. */
const LATIN_MARK = /(?<=\p{sc=Latn})[‘’](?=\p{sc=Latn})/gu;

/**
 * Where an apostrophe stands inside a Latin word (don’t, it’s, rock’n’roll):
 * the UTF-16 indices of each U+2018 / U+2019 with a Latin letter on both
 * sides. A CJK face draws these marks full-width, which would open a half-em
 * hole inside the word, so a CJK story sets them in its Latin face
 * (story.css `.story-latin-mark`). A mark beside anything else — 他’s,
 * James’ book, ‘OK’ — keeps the CJK form, as CJK typesetting wants.
 */
export function latinMarks(text: string): number[] {
  return Array.from(text.matchAll(LATIN_MARK), (m) => m.index);
}
