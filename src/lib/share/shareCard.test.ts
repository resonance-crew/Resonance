import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lightRootCss } from '@/lib/design/paletteCss';
import { describe, expect, it } from 'vitest';
import { CARD_BORDERS, CARD_FILLS } from '@/lib/design/cardColours';
import { CARD_HUES } from '@/lib/design/dominantHue';
import {
  COLOUR_TOKENS,
  SHARE_CARD,
  SHARE_TYPE,
  STORY_TOKENS,
  shareColours,
  shareOutline,
  sharePalette,
  shareSeed,
  tokenValue,
} from './shareCard';

// The card recipe both apps draw their share image from: every number lives
// once, in SHARE_CARD, and reaches the apps as native/fixtures/share-card.json
// (their renderers' tests read it, as they read geometry.json). After an
// intentional change, regenerate and review the diff:
//   UPDATE_SHARE_CARD=1 npx vitest run src/lib/share/shareCard.test.ts

const ROOT = resolve(__dirname, '../../..');
const FIXTURE = resolve(ROOT, 'native/fixtures/share-card.json');
const NOTE =
  'The 9:16 share image both apps draw (src/lib/share/shareCard.ts SHARE_CARD; UPDATE_SHARE_CARD=1 npx vitest run src/lib/share/shareCard.test.ts writes this file). Lengths are points on the canvas before `scale`. Type names the story tokens (tokens.css "A story\'s type", the apps\' Tokens.story*) and faces by their CSS variables (--font-story-serif = Noto Serif TC, --font-story-sans = Noto Sans TC, --font-heading = Playfair Display, --font-body = DM Sans); `type.cjk` or `type.latin` by the story\'s script (story-script.json); `figures: lining` = lnum. `cardFill` / `cardBorder` are the card\'s family p = preferredPalette(accentHue, seedFromId(card id)) (Tokens.cardFill{p} / cardBorder{p}); paper and rule are oklch(lightness% chroma CARD_HUES[p]). The outline is wobRect(w, h, radius, seedFromId(card id), min(w, h) × magnitude, options); the rule is wavyLine(width, seed + seedOffset, amplitude, steps). The words are share-passages.json\'s `opening`. An anonymous card draws `anonymous` in place of the photo, pen name and initials — never them, nor a region or verified mark.';

const fixture = () => ({ note: NOTE, ...SHARE_CARD });

if (process.env.UPDATE_SHARE_CARD) writeFileSync(FIXTURE, `${JSON.stringify(fixture(), null, 2)}\n`);

// Colours are palette.css's; light terracotta's :root stands for them (a share image is always light terracotta).
const tokensCss = readFileSync(resolve(ROOT, 'src/styles/tokens.css'), 'utf8') + lightRootCss();
function cssToken(name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(tokensCss)?.[1].replace(/\/\*.*$/, '').trim();
}

/** Every token name anywhere in the recipe. */
function namedTokens(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string' && value.startsWith('--')) out.add(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => namedTokens(v, out));
  return out;
}

describe('the share card recipe (native/fixtures/share-card.json, shared with the apps)', () => {
  it('is what the fixture says', () => {
    expect(existsSync(FIXTURE), 'run with UPDATE_SHARE_CARD=1').toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(JSON.parse(JSON.stringify(fixture())));
  });

  it('names only tokens tokens.css has, and the server copies say what tokens.css says', () => {
    for (const name of namedTokens(SHARE_CARD)) expect(cssToken(name), name).toBeDefined();
    for (const [name, value] of Object.entries(STORY_TOKENS)) expect(Number(cssToken(name)), name).toBe(value);
    for (const [name, value] of Object.entries(COLOUR_TOKENS)) expect(cssToken(name)?.replace(/\s+/g, ' '), name).toBe(value);
  });

  it("sets a story's title and words in the reader's type, by script", () => {
    expect(SHARE_TYPE.title.cjk).toMatchObject({ face: '--font-story-serif', weight: '--story-heading-weight', tracking: '--story-heading-tracking', figures: 'lining' });
    expect(SHARE_TYPE.title.latin).toMatchObject({ face: '--font-heading', weight: '--story-heading-weight-latin', tracking: 0, figures: 'lining' });
    expect(SHARE_TYPE.words.cjk).toMatchObject({ face: '--font-story-sans', tracking: '--story-tracking' });
    expect(SHARE_TYPE.words.latin).toMatchObject({ face: '--font-body', tracking: 0 });
    // Never negative tracking on a story's title (the reading design).
    expect(tokenValue(SHARE_TYPE.title.cjk.tracking)).toBeGreaterThan(0);
  });

  // Line budgets, not character counts: the tallest card each layout can draw still fits the safe zone.
  it.each([
    ['with a cover', true],
    ['without a cover', false],
  ])('fits its tallest card %s inside the safe zone', (_, cover) => {
    const { card, title, words, rule, byline } = SHARE_CARD;
    const inner = card.width - card.padding * 2;
    for (const script of ['cjk', 'latin'] as const) {
      const t = cover ? title.withCover : title.withoutCover;
      const w = cover ? words.withCover : words.withoutCover;
      const height =
        card.padding +
        (cover ? inner * SHARE_CARD.cover.ratio + SHARE_CARD.cover.gapBelow : 0) +
        t.size * tokenValue(title.type[script].leading) * t.maxLines +
        title.gapBelow +
        words.size * tokenValue(words.type[script].leading) * w.maxLines +
        words.gapBelow +
        rule.height +
        rule.gapBelow +
        byline.height +
        card.paddingBottom;
      expect(height, `${script}`).toBeLessThanOrEqual(card.maxHeight);
    }
    expect(SHARE_CARD.safeZone.bottom - SHARE_CARD.safeZone.top).toBeGreaterThanOrEqual(card.maxHeight);
    expect((SHARE_CARD.canvas.width - card.width) / 2).toBeGreaterThan(0);
  });

  it("takes a card's family from its cover, else from its id, and its wobble from its id", () => {
    expect(sharePalette({ id: 'card1', accentHue: 214 })).toBe(CARD_HUES.indexOf(215));
    expect(sharePalette({ id: 'card1' })).toBe(sharePalette({ id: 'card1', accentHue: null }));
    expect(sharePalette({ id: 'card1' })).toBeGreaterThanOrEqual(0);
    expect(shareSeed('card1')).toBe(shareSeed('card1'));
    expect(shareOutline(300, 400, 22, shareSeed('card1'))).toBe(shareOutline(300, 400, 22, shareSeed('card1')));
    expect(shareOutline(300, 400, 22, shareSeed('card1'))).not.toBe(shareOutline(300, 400, 22, shareSeed('card2')));
  });

  it("draws in the family's own colours", () => {
    for (let p = 0; p < CARD_HUES.length; p++) {
      const c = shareColours(p);
      expect(c.backdrop).toBe(CARD_FILLS[p]);
      expect(c.pen).toBe(CARD_BORDERS[p][0]);
      // The desktop StoryCard's paper and separator.
      expect(c.paper).toBe(`oklch(97.5% 0.012 ${CARD_HUES[p]})`);
      expect(c.rule).toBe(`oklch(55% 0.04 ${CARD_HUES[p]} / 0.4)`);
    }
  });
});
