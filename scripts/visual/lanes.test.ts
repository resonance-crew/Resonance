import { describe, expect, it } from 'vitest';
import { BlockQueue, secondPhoneWanted, variantBlocks } from './lanes';
import { groups, plan } from './variants';

describe('the phone’s work, shared with a second phone once the tablet is done', () => {
  it('cuts the phone’s release plan into one block per variant, light zh-TW first, every capture in exactly one', () => {
    for (const platform of ['android', 'ios'] as const) {
      const device = platform === 'android' ? 'phone' : 'iphone';
      const all = groups(plan(platform, device, 'release', []));
      const blocks = variantBlocks(all);
      expect(blocks.map((b) => `${b[0].variant.theme}-${b[0].variant.locale}`)).toEqual(['light-zh-TW', 'dark-zh-TW', 'light-en']);
      expect(blocks.flat()).toEqual(all);
      for (const block of blocks) expect(new Set(block.map((g) => `${g.variant.theme}-${g.variant.locale}`)).size).toBe(1);
    }
  });

  it('gives the first phone the front and the second the back, each block once, however the two interleave', () => {
    const q = new BlockQueue(['light-zh', 'dark-zh', 'light-en']);
    expect(q.front()).toBe('light-zh');
    expect(q.back()).toBe('light-en');
    expect(q.left).toBe(1);
    expect(q.front()).toBe('dark-zh');
    expect(q.back()).toBeUndefined();
    expect(q.front()).toBeUndefined();
  });

  it('boots a second phone only with work left, the tablet seen down, and neither switch turned off', () => {
    expect(secondPhoneWanted({ left: 1, tabletDown: true, env: {} })).toBe(true);
    expect(secondPhoneWanted({ left: 0, tabletDown: true, env: {} })).toBe(false);
    expect(secondPhoneWanted({ left: 2, tabletDown: false, env: {} })).toBe(false);
    expect(secondPhoneWanted({ left: 2, tabletDown: true, env: { VISUAL_SECOND_PHONE: '0' } })).toBe(false);
    expect(secondPhoneWanted({ left: 2, tabletDown: true, env: { VISUAL_PARALLEL: '0' } })).toBe(false);
  });
});
