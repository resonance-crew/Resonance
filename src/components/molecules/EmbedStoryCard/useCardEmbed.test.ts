import { describe, expect, it } from 'vitest';
import { cardKeyFromHref } from './useCardEmbed';

// A story's '/card/…' link is the author's text: a malformed escape in it
// must name no card rather than throw while the card page renders (which
// took down the page — its server render too — and the writer's panel).
describe('cardKeyFromHref', () => {
  it('reads the slug or id a card link names, decoded', () => {
    expect(cardKeyFromHref('/card/a-rainy-day')).toBe('a-rainy-day');
    expect(cardKeyFromHref('/card/%E9%9B%A8?x=1')).toBe('雨');
    expect(cardKeyFromHref('/u/ana')).toBeNull();
  });

  it('names no card for a malformed escape, instead of throwing', () => {
    expect(cardKeyFromHref('/card/%E0')).toBeNull();
    expect(cardKeyFromHref('/card/%')).toBeNull();
  });
});
