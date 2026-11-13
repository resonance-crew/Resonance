import { describe, expect, it } from 'vitest';
import { WEB_FILES, hitsIn, ratchet, scan, withoutComments, type Ratchet } from './sourceScan';

/**
 * Organic, not flat (the resonance-ui skill's pre-ship check 5; its decision table: "never a flat 1px
 * border"): rows and sections part by a wavy pen rule (`<Divider>`), surfaces are wobbly. Flat pieces
 * shipped anyway in rounds 17 and 22 (the divider grip, the sticker cell's hover box), so a flat
 * `border…: 1px solid` in CSS or an inline style is refused outside the files below, each with why;
 * the list can only shrink.
 */
const ALLOWED: Ratchet = {
  'src/styles/story.css': {
    count: 1,
    why: "a story table's rows: a hairline between body rows inside the reader's prose (the header's rule is hand-drawn)",
  },
  'src/components/atoms/Field/Field.module.css': {
    count: 1,
    why: "the `subtle` input variant's underline — an older variant: a candidate for a wavy rule",
  },
  'src/components/molecules/InvitesInbox/InvitesInbox.tsx': {
    count: 1,
    why: 'the legacy invite inbox (no invite is sent any more): an inline-styled box, to go with it',
  },
  'src/components/lab/landing/issue/back.module.css': {
    count: 1,
    why: "the landing lab's prototype (unlinked, noindex)",
  },
};

const FLAT = [
  /\bborder(?:-(?:top|bottom|left|right|inline|block)(?:-(?:start|end))?)?\s*:\s*1px\s+solid\b/,
  /\bborder(?:Top|Bottom|Left|Right|Inline|Block)?(?:Start|End)?\s*:\s*['"`]1px\s+solid\b/,
];

describe('no flat 1px borders', () => {
  const files = WEB_FILES();
  const found = scan(files, (f) => hitsIn(f, FLAT));
  const { over, under } = ratchet(found, ALLOWED);

  it('draws no flat 1px solid border outside the listed ones: a wavy rule or a wobbly surface instead', () => {
    expect(over, 'a flat 1px border (organic, not flat: <Divider>, a hand-drawn surface)').toEqual([]);
  });

  it('keeps its list of exceptions as short as the code', () => {
    expect(under, 'an exception with fewer borders left: lower its count or remove it').toEqual([]);
  });

  it('counts a flat border, not a 1.2px rule, a none or a comment', () => {
    const probe = (line: string, css = true) => FLAT.some((re) => re.test(withoutComments(line, css)));
    expect(probe('border: 1px solid var(--field-border);')).toBe(true);
    expect(probe('border-bottom: 1px solid var(--x);')).toBe(true);
    expect(probe("border: '1px solid var(--x)',", false)).toBe(true);
    expect(probe("borderTop: '1px solid var(--x)',", false)).toBe(true);
    expect(probe('border-bottom: 1.2px solid var(--x);')).toBe(false);
    expect(probe('border: none;')).toBe(false);
    expect(probe('/* never border: 1px solid */')).toBe(false);
  });
});
