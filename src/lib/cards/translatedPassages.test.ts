import { describe, expect, it } from 'vitest';
import { keptTranslatedPassages, passagesSig, TRANSLATED_PASSAGE_MAX_CHARS, verifyTranslatedPassages } from './translatedPassages';

// Round 31: a card's passages as its translation says them. The model only points at pieces of the translation;
// what is kept is always the translation's own words, one piece per passage, in the original's order.
const ORIGINALS = [
  { id: 'a1', text: '箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。' },
  { id: 'b2', text: '你不是失去了一個家，你是多了一個可以回去的地方。' },
  { id: 'c3', text: 'The quiet after moving out felt like mine — finally.' },
];
const TRANSLATED = [
  'Boxes filled the living room. I sat on the floor and felt, for the **first time**, that the quiet was mine.',
  '> You did not lose a home;\n> you gained a place to go back to.',
  'The quiet after moving out felt like mine — *finally*.',
].join('\n\n');

describe('verifyTranslatedPassages', () => {
  it('keeps pieces of the translation’s plain text — Markdown and line breaks read away — in the original’s order', () => {
    expect(
      verifyTranslatedPassages(TRANSLATED, ORIGINALS, [
        { id: 'b2', text: 'You did not lose a home; you gained a place to go back to.' },
        { id: 'a1', text: 'I sat on the floor and felt, for the first time,   that the quiet was mine.' },
      ]),
    ).toEqual([
      { id: 'a1', text: 'I sat on the floor and felt, for the first time, that the quiet was mine.' },
      { id: 'b2', text: 'You did not lose a home; you gained a place to go back to.' },
    ]);
  });

  it('drops words the translation doesn’t have, a piece across two paragraphs, an unknown id and anything not a passage', () => {
    expect(
      verifyTranslatedPassages(TRANSLATED, ORIGINALS, [
        { id: 'a1', text: 'I sat on the floor; the quiet was finally mine.' },
        { id: 'b2', text: 'that the quiet was mine. You did not lose a home;' },
        { id: 'zz', text: 'Boxes filled the living room.' },
        'Boxes filled the living room.',
        null,
        { id: 'c3' },
      ]),
    ).toEqual([]);
  });

  it('keeps one piece per passage and never two that overlap or say the same words', () => {
    expect(
      verifyTranslatedPassages(TRANSLATED, ORIGINALS, [
        { id: 'a1', text: 'Boxes filled the living room.' },
        { id: 'a1', text: 'I sat on the floor' },
        { id: 'b2', text: 'filled the living room. I sat' },
        { id: 'c3', text: 'Boxes filled the living room.' },
      ]),
    ).toEqual([{ id: 'a1', text: 'Boxes filled the living room.' }]);
  });

  it('holds a piece to a sentence or three, never a paragraph’s worth', () => {
    const long = 'word '.repeat(TRANSLATED_PASSAGE_MAX_CHARS / 4).trim() + '.';
    expect(verifyTranslatedPassages(long, ORIGINALS, [{ id: 'a1', text: long }])).toEqual([]);
    expect(verifyTranslatedPassages('', ORIGINALS, [{ id: 'a1', text: 'x' }])).toEqual([]);
  });
});

describe('keptTranslatedPassages', () => {
  it('reads a placing of these passages, and none of other passages (placed again then)', () => {
    const stored = { of: passagesSig(ORIGINALS), items: [{ id: 'b2', text: 'You did not lose a home.' }, { id: 'old', text: 'x' }, 3] };
    expect(keptTranslatedPassages(stored, ORIGINALS)).toEqual([{ id: 'b2', text: 'You did not lose a home.' }]);
    expect(keptTranslatedPassages({ of: passagesSig(ORIGINALS), items: [] }, ORIGINALS)).toEqual([]);
    expect(keptTranslatedPassages(stored, ORIGINALS.slice(1))).toBeNull();
    expect(keptTranslatedPassages(undefined, ORIGINALS)).toBeNull();
    expect(keptTranslatedPassages({ of: 'a1,b2,c3' }, ORIGINALS)).toBeNull();
  });
});
