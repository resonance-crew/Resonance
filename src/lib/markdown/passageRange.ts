/**
 * Where a picked sentence lies in one drawn text of the story (round 29 §P3):
 * the one rule the three renderers share — the web's rehype plugin, iOS's
 * and Android's story views port it and run the same cases
 * (test/vectors/passageMarks.json).
 *
 * A **leaf** is one text the renderer draws as one run: a paragraph, a
 * heading, a list item's paragraph, a quote's paragraph, a table cell — its
 * own characters as drawn (no Markdown marks; a soft break as the renderer
 * has it). The sentence is what the server keeps of a pick: the story's plain
 * text, whitespace read as one space.
 *
 * 1. Both are read with runs of whitespace as one space and trimmed, and a
 *    space with a CJK character on either side of it dropped (a renderer
 *    draws a space, or keeps a line break, where the server's plain text
 *    dropped one after a CJK stop).
 * 2. The first occurrence in the leaf that holds it. Where the sentence
 *    starts with a letter or a digit that is not CJK, the character before
 *    the match must not be one (and so at its end): "at the door" is not
 *    inside "that the door".
 * 3. The answer is a range of the leaf's own text, in UTF-16 code units (as
 *    JavaScript, NSString and Java/Kotlin strings count): `start` the first
 *    character's index, `end` one past the last — so it can cross bold,
 *    italic and a link's words, which the renderer splits it at.
 * 4. Not there (a sentence across two list items or two table cells, a
 *    literal `*` the renderer draws) is null: no wash, never a guess.
 *
 * Pure, with no import, so each app's port is this file read line by line.
 */

/**
 * The code points read as CJK (inclusive ranges): the CJK scripts — Han,
 * kana, Hangul, Bopomofo — with their punctuation and the full-width forms
 * (，：！？ are full-width forms, not Han). Mirrored in the cases file's
 * `cjkRanges` (passageRange.test.ts pins the two alike).
 */
export const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x11ff], // Hangul Jamo
  [0x2e80, 0x2fdf], // CJK and Kangxi radicals
  [0x2ff0, 0x303f], // ideographic description, CJK symbols and punctuation
  [0x3040, 0x31ff], // kana, Bopomofo, Hangul compatibility jamo, kanbun, strokes, katakana extensions
  [0x3200, 0x4dbf], // enclosed CJK, compatibility, extension A
  [0x4e00, 0x9fff], // unified ideographs
  [0xa960, 0xa97f], // Hangul Jamo extended A
  [0xac00, 0xd7ff], // Hangul syllables, Jamo extended B
  [0xf900, 0xfaff], // compatibility ideographs
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xffef], // half-width and full-width forms
  [0x20000, 0x3ffff], // extensions B onward
];

export function isCjk(cp: number): boolean {
  for (const [lo, hi] of CJK_RANGES) if (cp >= lo && cp <= hi) return true;
  return false;
}

const WHITESPACE = /\s/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** A letter or a digit that is not CJK: a word's character in a Latin-script match. */
function wordChar(cp: number): boolean {
  return !isCjk(cp) && LETTER_OR_DIGIT.test(String.fromCodePoint(cp));
}

/** A text read as rule 1 reads it: its code points, each with where it starts in the original and how long it is there. */
function normalized(text: string): { cp: number; at: number; len: number }[] {
  const raw: { cp: number; at: number; len: number }[] = [];
  let i = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (WHITESPACE.test(ch)) {
      // A run of whitespace as one space, at its first character.
      if (raw.length && raw[raw.length - 1].cp !== 0x20) raw.push({ cp: 0x20, at: i, len: ch.length });
    } else {
      raw.push({ cp, at: i, len: ch.length });
    }
    i += ch.length;
  }
  while (raw.length && raw[raw.length - 1].cp === 0x20) raw.pop();
  // A space with a CJK character on either side of it dropped.
  return raw.filter((c, k) => c.cp !== 0x20 || !(isCjk(raw[k - 1]?.cp ?? 0) || isCjk(raw[k + 1]?.cp ?? 0)));
}

/** The sentence's range in the leaf's own text (UTF-16, `end` exclusive), or null when the leaf doesn't hold it. */
export function findPassage(leaf: string, sentence: string): { start: number; end: number } | null {
  const hay = normalized(leaf);
  const needle = normalized(sentence).map((c) => c.cp);
  if (!needle.length || needle.length > hay.length) return null;
  const edgeStart = wordChar(needle[0]);
  const edgeEnd = wordChar(needle[needle.length - 1]);
  for (let s = 0; s + needle.length <= hay.length; s++) {
    let k = 0;
    while (k < needle.length && hay[s + k].cp === needle[k]) k++;
    if (k < needle.length) continue;
    const before = hay[s - 1];
    const after = hay[s + needle.length];
    if (edgeStart && before && wordChar(before.cp)) continue;
    if (edgeEnd && after && wordChar(after.cp)) continue;
    const last = hay[s + needle.length - 1];
    return { start: hay[s].at, end: last.at + last.len };
  }
  return null;
}

/**
 * The first leaf, in the story's order, that holds the sentence, and its
 * range there (rule 2: the story's order, then the leaf's first occurrence).
 */
export function findPassageIn(leaves: readonly string[], sentence: string): { leaf: number; start: number; end: number } | null {
  for (let leaf = 0; leaf < leaves.length; leaf++) {
    const r = findPassage(leaves[leaf], sentence);
    if (r) return { leaf, ...r };
  }
  return null;
}
