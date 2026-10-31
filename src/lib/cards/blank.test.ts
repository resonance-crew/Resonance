import { describe, expect, it } from 'vitest';
import { blankCard, blankFeedCard } from './blank';

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
