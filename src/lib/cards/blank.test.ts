import { describe, expect, it } from 'vitest';
import { blankCard, blankFeedCard, LISTED_MIN_UNITS, thinCard, unlistedCard } from './blank';

// What counts as a blank card — the rule every list that picks cards for
// readers leaves out (the feeds, related cards, the landing page, pushes).

describe('blankCard', () => {
  it('is a card without a title, or whose story has no words a reader would read', () => {
    expect(blankCard({ thoughtCore: 'My First Story', story: '' })).toBe(true);
    expect(blankCard({ thoughtCore: '   ', story: 'a real story' })).toBe(true);
    expect(blankCard({ thoughtCore: 'Title', story: '  \n\n  ' })).toBe(true);
    // Markdown with nothing inside it, a lone picture or a bare address: still no words.
    expect(blankCard({ thoughtCore: 'Title', story: '#\n\n> \n\n---\n\n**  **' })).toBe(true);
    expect(blankCard({ thoughtCore: 'Title', story: '![](https://img.resonance.channel/a.webp)' })).toBe(true);
    expect(blankCard({ thoughtCore: 'Title', story: '<https://example.com/page>' })).toBe(true);
    // Missing or malformed fields read as empty.
    expect(blankCard({})).toBe(true);
    expect(blankCard({ thoughtCore: 42, story: 'words' })).toBe(true);
  });

  it('is not a card with a title and any words, however few', () => {
    expect(blankCard({ thoughtCore: 'Title', story: '嗯' })).toBe(false);
    expect(blankCard({ thoughtCore: 'Title', story: '![sunset](https://img.resonance.channel/a.webp)\n\nThe evening.' })).toBe(false);
    expect(blankCard({ thoughtCore: 'Title', story: '[a link with words](https://example.com)' })).toBe(false);
  });
});

describe('blankFeedCard', () => {
  it("judges a list's card by its title and excerpt — what it already holds", () => {
    expect(blankFeedCard({ title: 'My First Story', excerpt: '' })).toBe(true);
    expect(blankFeedCard({ title: '', excerpt: 'words' })).toBe(true);
    expect(blankFeedCard({ title: 'Title', excerpt: 'words' })).toBe(false);
  });
});

describe('thinCard', () => {
  it('is a card whose title and story together hold fewer words than a stranger should be shown', () => {
    // The production card that started this: 「測試」 over 「測試」.
    expect(thinCard({ thoughtCore: '測試', story: '測試' })).toBe(true);
    expect(thinCard({ thoughtCore: 'test', story: 'test test' })).toBe(true);
    // Markdown, pictures and addresses carry no words.
    expect(thinCard({ thoughtCore: '測試', story: '**測試** ![](https://img.resonance.channel/a.webp) <https://example.com/a-long-path>' })).toBe(true);
    expect(thinCard({})).toBe(true);
  });

  it('is not a short card that says something, nor anything at the line or past it', () => {
    expect(thinCard({ thoughtCore: '雨天', story: '學會一個人吃飯' })).toBe(false);
    expect(thinCard({ thoughtCore: 'Rain', story: 'Today I finally learned to eat alone, and liked it.' })).toBe(false);
    const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
    expect(thinCard({ thoughtCore: '', story: words(LISTED_MIN_UNITS) })).toBe(false);
    expect(thinCard({ thoughtCore: '', story: words(LISTED_MIN_UNITS - 1) })).toBe(true);
  });
});

describe('unlistedCard', () => {
  it("reads only the server's two marks: the save's `thin` and the index's `signature.placeholder`", () => {
    expect(unlistedCard({ thin: true })).toBe(true);
    expect(unlistedCard({ signature: { placeholder: true } })).toBe(true);
    expect(unlistedCard({})).toBe(false);
    expect(unlistedCard({ thin: false, signature: { placeholder: false, coreInsight: 'x' } })).toBe(false);
    // Only a plain true counts.
    expect(unlistedCard({ thin: 'true', signature: { placeholder: 1 } })).toBe(false);
    expect(unlistedCard({ signature: null })).toBe(false);
  });
});
