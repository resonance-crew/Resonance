import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { relPath, sourceFiles, withoutComments } from './sourceScan';

/**
 * Hand-drawn surfaces size their own wobble (the resonance-ui skill's hard rule 6; designs/DESIGN.md
 * §17): `wobAuto.ts` derives `segmentsH` / `segmentsV` / `mag` / `curve` from the measured size —
 * long edges more turning points, big surfaces gentler curves. A number written as one of those props
 * is an override, kept only where a tuned legacy primitive is matched (StoryCard, Modal, the menus…).
 * A count ratchet: each file below may keep at most its number of literal props, a file not listed
 * none, and a number that falls must be lowered here — so the count only goes down.
 */
const COUNTS: Record<string, number> = {
  'src/components/atoms/Field/Field.tsx': 1,
  'src/components/atoms/HandDrawnAvatar/HandDrawnAvatar.tsx': 3,
  'src/components/atoms/HandDrawnImage/HandDrawnImage.tsx': 4,
  'src/components/atoms/OrganicButton/OrganicButton.tsx': 1,
  'src/components/lab/landing/answer/Chip.tsx': 3,
  'src/components/lab/landing/answer/LinkButton.tsx': 2,
  'src/components/lab/landing/issue/LinkPill.tsx': 2,
  'src/components/lab/landing/oneday/PillLink.tsx': 2,
  'src/components/molecules/MarkdownEditor/NodeRemoveButton.tsx': 3,
  'src/components/molecules/MarkdownEditor/ToolButton.tsx': 4,
  'src/components/molecules/MiniStoryCard/MiniStoryCard.tsx': 6,
  'src/components/molecules/Modal/Modal.tsx': 6,
  'src/components/molecules/OrganicMenu/OrganicMenu.tsx': 6,
  'src/components/molecules/StoryCard/StoryCard.tsx': 6,
  'src/components/molecules/ThoughtMap/ThoughtMapCanvas.tsx': 3,
  'src/components/molecules/ThoughtMap/ThoughtMapNode.tsx': 3,
  'src/components/sections/AboutPage/AboutArt.tsx': 2,
  'src/components/sections/AppHeader/MessagesEntry.tsx': 4,
  'src/components/sections/AppHeader/NotificationBell.tsx': 4,
  'src/components/sections/MessagesPage/MessagesPage.tsx': 4,
  'src/components/sections/MessagesPage/RowWash.tsx': 4,
};

/** A JSX prop of the wobble given a number or an array literal: `mag={2.6}`, `segmentsH={[3, 4]}`. */
const LITERAL = /\b(?:segmentsH|segmentsV|mag|curve)=\{\s*[-[\d.]/g;

const literals = (text: string) => [...withoutComments(text, false).matchAll(LITERAL)].length;

describe('wobble literals only fall', () => {
  const files = sourceFiles('src', (name) => name.endsWith('.tsx'));
  const found = Object.fromEntries(
    files.map((f) => [relPath(f), literals(readFileSync(f, 'utf8'))] as const).filter(([, n]) => n > 0),
  );

  it('adds no hard-coded segmentsH / segmentsV / mag / curve: let wobAuto size the wobble', () => {
    const over = Object.entries(found)
      .filter(([f, n]) => n > (COUNTS[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} literal wobble props, allowed ${COUNTS[f] ?? 0}`);
    expect(over, 'a new literal wobble prop (the skill’s rule 6: wobAuto derives them from the size)').toEqual([]);
  });

  it('lowers a count as soon as a literal goes', () => {
    const under = Object.entries(COUNTS)
      .filter(([f, n]) => (found[f] ?? 0) < n)
      .map(([f, n]) => `${f}: ${found[f] ?? 0} now, listed as ${n}`);
    expect(under, 'fewer literals than listed: lower the number (or drop the file)').toEqual([]);
  });

  it('counts literals, not values passed through or comments', () => {
    expect(literals('<HandDrawnBorder seed={3} segmentsH={[3, 4]} segmentsV={2} mag={2.6} curve={1.6} />')).toBe(4);
    expect(literals('<HandDrawnBorder mag={-1} />')).toBe(1);
    expect(literals('<HandDrawnBorder segmentsH={segH} mag={mag} curve={shape.curve} />')).toBe(0);
    expect(literals('{/* mag={2.6} was too strong */}')).toBe(0);
  });
});
