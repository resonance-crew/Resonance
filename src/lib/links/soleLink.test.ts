import { describe, expect, it } from 'vitest';
import { cardableLink, linkTarget, linkWords, LINK_WORDS_MAX, wordsAreTheAddress } from './soleLink';

describe('the link editor’s address (linkTarget)', () => {
  it('takes http(s), giving a bare address its https://, in the writer’s own spelling', () => {
    expect(linkTarget('https://example.com/rain')).toBe('https://example.com/rain');
    expect(linkTarget('  http://example.com  ')).toBe('http://example.com');
    expect(linkTarget('www.example.com')).toBe('https://www.example.com');
    expect(linkTarget('example.com/rain')).toBe('https://example.com/rain');
    expect(linkTarget('example.com:443/x')).toBe('https://example.com:443/x');
    expect(linkTarget('//example.com/x')).toBe('https://example.com/x');
    expect(linkTarget('https://zh.wikipedia.org/wiki/雨')).toBe('https://zh.wikipedia.org/wiki/雨');
    // What the story can't carry as written goes in normalized.
    expect(linkTarget('https://example.com/a b')).toBeNull();
    expect(linkTarget('https://example.com/a"b')).toBe('https://example.com/a%22b');
  });

  it('refuses every other scheme, a user name, a name with no dot, and nothing', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'mailto:a@b.co', 'tel:123', 'ftp://example.com', 'https://a@example.com', 'https://example.com@evil.example', 'localhost:3000', 'intranet', '', '   ']) {
      expect(linkTarget(bad), bad).toBeNull();
    }
  });
});

describe('words for a link shown as words (linkWords)', () => {
  it('is the host without www. and the path — never an address the rules take', () => {
    expect(linkWords('https://www.example.com/rain/?q=1#top')).toBe('example.com/rain');
    expect(linkWords('https://example.com/')).toBe('example.com');
    expect(linkWords('https://zh.wikipedia.org/wiki/%E9%9B%A8')).toBe('zh.wikipedia.org/wiki/雨');
    expect(wordsAreTheAddress(linkWords('https://www.example.com/rain'), 'https://www.example.com/rain')).toBe(false);
  });

  it('is cut with 「…」 past its length', () => {
    const words = linkWords(`https://example.com/${'a'.repeat(100)}`);
    expect(Array.from(words)).toHaveLength(LINK_WORDS_MAX);
    expect(words.endsWith('…')).toBe(true);
  });
});

describe('which addresses may be a card (cardableLink)', () => {
  it('is any address the rules take but our own pages and IP addresses', () => {
    expect(cardableLink('https://example.com/rain')).toBe(true);
    expect(cardableLink('www.example.com')).toBe(true);
    expect(cardableLink('https://resonance.channel/en/card/x')).toBe(false);
    expect(cardableLink('https://www.resonance.channel/')).toBe(false);
    expect(cardableLink('https://resonance-world.vercel.app/x')).toBe(false);
    expect(cardableLink('https://203.0.113.9/x')).toBe(false);
    expect(cardableLink('/card/x')).toBe(false);
    expect(cardableLink('javascript:alert(1)')).toBe(false);
  });
});
