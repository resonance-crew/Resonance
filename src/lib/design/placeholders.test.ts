import { describe, expect, it } from 'vitest';
import { WEB_FILES, hitsIn, ratchet, relPath, scan, withoutComments, type Ratchet } from './sourceScan';

/**
 * Placeholders are styled once, in globals.css (the resonance-ui skill's hard rule 5): the hint's
 * colour `--placeholder`, the body face, italic in English and upright in Chinese. A component that
 * styles its own `::placeholder` drifts from every other field, so outside globals.css only the files
 * below may, each with why; the list can only shrink.
 */
const ALLOWED: Ratchet = {
  'src/components/atoms/Field/Field.module.css': {
    count: 1,
    why: "the writer's bare title sets its hint as its words will be (no italic face, no synthetic oblique in Chinese); only the colour stays global",
  },
  'src/components/molecules/TagField/TagField.module.css': {
    count: 1,
    why: "the tag capsule's input restates the global colour (`--placeholder`) — a duplicate that could go",
  },
  'src/components/lab/landing/answer/desk.module.css': {
    count: 1,
    why: "the landing lab's prototype (unlinked, noindex)",
  },
};

const PLACEHOLDER = [/::?(?:-webkit-input-|-moz-)?placeholder\b/];

describe('placeholders are styled in globals.css', () => {
  const HOME = 'src/styles/globals.css';
  const css = WEB_FILES().filter((f) => f.endsWith('.css'));
  const found = scan(css.filter((f) => relPath(f) !== HOME), (f) => hitsIn(f, PLACEHOLDER));
  const { over, under } = ratchet(found, ALLOWED);

  it('no component styles its own ::placeholder outside the listed ones', () => {
    expect(css.length).toBeGreaterThan(100);
    expect(over, 'a ::placeholder rule outside globals.css (the skill’s rule 5)').toEqual([]);
  });

  it('keeps its list of exceptions as short as the code', () => {
    expect(under, 'an exception with fewer rules left: lower its count or remove it').toEqual([]);
  });

  it('finds the global rule where it belongs', () => {
    expect(hitsIn(css.find((f) => relPath(f) === HOME)!, PLACEHOLDER).length).toBeGreaterThan(0);
  });

  it('counts a selector line, not a comment', () => {
    const probe = (line: string) => PLACEHOLDER.some((re) => re.test(withoutComments(line, true)));
    expect(probe('.input::placeholder {')).toBe(true);
    expect(probe('input:lang(zh-TW)::placeholder,')).toBe(true);
    expect(probe('.x::-webkit-input-placeholder {')).toBe(true);
    expect(probe('/* the global ::placeholder rule */')).toBe(false);
    expect(probe('color: var(--placeholder);')).toBe(false);
  });
});
