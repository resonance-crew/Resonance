import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fontCoverage } from './cmap';

/**
 * The link-preview image's fonts (src/lib/linkImage/fonts, made by
 * scripts/linkImage/build-fonts.py: static instances, since satori can't instance
 * the variable files the site and the apps use). Read from disk on first use
 * — the CJK faces (about 7 MB) only for a card whose words need them — and
 * kept for the instance's life. next.config's outputFileTracingIncludes ships
 * the folder with the route.
 *
 * What none of them draws is left out of the text before satori sees it
 * (`drawable`): satori asks next/og for a missing glyph — any character but a
 * tab or a line feed, spaces too — and next/og fetches it from Google Fonts
 * (an emoji from a CDN) while the image renders, with no deadline: a request
 * to a third party carrying the card's words. A letter or digit outside the
 * faces (a Hanzi beyond Big5 level 1, kana, Hangul) becomes □, a space none
 * draws (an ideographic space in a Latin card, a thin or an Ogham space) a
 * plain one, a line or paragraph separator or a CR a line feed, and a
 * byte-order mark, an emoji or any other mark is dropped.
 */

export const OG_FONT_DIR = join(process.cwd(), 'src/lib/linkImage/fonts');

/** The families as the image names them (fontFamily). */
export const FACE = {
  /** Noto Serif TC 600: a CJK story's title. */
  storySerif: 'Story Serif',
  /** Noto Sans TC 400 / 600: a CJK story's words, CJK in a pen name. */
  storySans: 'Story Sans',
  /** Playfair Display 700 with lining figures (renamed Share Display): a Latin story's title, the wordmark. */
  display: 'Share Display',
  /** DM Sans 400 / 600: a Latin story's words, the byline, the domain. */
  body: 'Body',
} as const;

type Weight = 400 | 600 | 700;
export interface OgFont {
  name: string;
  data: Buffer;
  weight: Weight;
  style: 'normal';
}

const LATIN: [file: string, name: string, weight: Weight][] = [
  ['ShareDisplay-Bold.ttf', FACE.display, 700],
  ['DMSans-Regular.ttf', FACE.body, 400],
  ['DMSans-SemiBold.ttf', FACE.body, 600],
];
const CJK: [file: string, name: string, weight: Weight][] = [
  ['NotoSerifTC-SemiBold.ttf', FACE.storySerif, 600],
  ['NotoSansTC-Regular.ttf', FACE.storySans, 400],
  ['NotoSansTC-SemiBold.ttf', FACE.storySans, 600],
];

export interface FontSet {
  /** One array per set, kept: satori parses a fonts array once and reuses it while it is the same array. */
  fonts: OgFont[];
  /** Every code point some font of the set draws. */
  coverage: Set<number>;
}

async function load(files: typeof LATIN): Promise<FontSet> {
  const fonts = await Promise.all(
    files.map(async ([file, name, weight]) => ({ name, weight, style: 'normal' as const, data: await readFile(join(OG_FONT_DIR, file)) })),
  );
  const coverage = new Set<number>();
  for (const f of fonts) for (const c of fontCoverage(f.data)) coverage.add(c);
  return { fonts, coverage };
}

let latinSet: Promise<FontSet> | null = null;
let fullSet: Promise<FontSet> | null = null;

/** The Latin faces alone. */
export function latinFonts(): Promise<FontSet> {
  latinSet ??= load(LATIN).catch((e) => {
    latinSet = null;
    throw e;
  });
  return latinSet;
}

/** The Latin and the CJK faces. */
export function allFonts(): Promise<FontSet> {
  fullSet ??= Promise.all([latinFonts(), load(CJK)])
    .then(([latin, cjk]) => ({ fonts: [...latin.fonts, ...cjk.fonts], coverage: new Set([...latin.coverage, ...cjk.coverage]) }))
    .catch((e) => {
      fullSet = null;
      throw e;
    });
  return fullSet;
}

const BLANK = /\s/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/** A line break however it is spelled — CRLF, CR, a line or paragraph separator — as the line feed satori breaks at (or, outside pre-line, reads as a space). */
const LINE_BREAK = /\r\n?|[\u2028\u2029]/g;
const LINE_FEED = '\n';
const SPACE = ' ';
const BYTE_ORDER_MARK = '\uFEFF';
/** What stands in for a letter or digit no face draws. */
export const MISSING = '□';

/** One character as it is drawn with `coverage`: itself, a stand-in, or nothing. */
function drawnChar(ch: string, coverage: Set<number>): string {
  // The line feed is the one character besides a tab satori never looks up (and a tab it folds into a space).
  if (ch === LINE_FEED || coverage.has(ch.codePointAt(0)!)) return ch;
  if (BLANK.test(ch)) return ch === BYTE_ORDER_MARK || !coverage.has(SPACE.codePointAt(0)!) ? '' : SPACE;
  if (LETTER_OR_DIGIT.test(ch) && coverage.has(MISSING.codePointAt(0)!)) return MISSING;
  return '';
}

/**
 * The text with what `coverage` doesn't draw left out: a letter or digit as □
 * (when □ itself is drawn), a space as a plain space, a line break as a line
 * feed — so every character satori is handed is one a face draws, or a line feed.
 */
export function drawable(text: string, coverage: Set<number>): string {
  let out = '';
  for (const ch of text.replace(LINE_BREAK, LINE_FEED)) out += drawnChar(ch, coverage);
  return out;
}

/**
 * The fonts a set of texts needs, and the texts as they will be drawn: the
 * Latin faces when they draw every character, else all of them, with
 * whatever none draws left out.
 */
export async function fontsFor<T extends Record<string, string>>(texts: T): Promise<{ fonts: OgFont[]; texts: T }> {
  const latin = await latinFonts();
  // A space never asks for the CJK faces: one the Latin faces don't draw is drawn as a plain space (drawable).
  const fits = Object.values(texts).every((t) => [...t].every((ch) => latin.coverage.has(ch.codePointAt(0)!) || BLANK.test(ch)));
  const set = fits ? latin : await allFonts();
  const drawn = Object.fromEntries(Object.entries(texts).map(([k, t]) => [k, drawable(t, set.coverage)])) as T;
  return { fonts: set.fonts, texts: drawn };
}
