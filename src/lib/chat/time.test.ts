import { describe, expect, it } from 'vitest';
import { fullMessageTime, timeOfDay } from './time';

// Review N7: the list said 「下午06:29」 and the menu's foot 「下午6:29」 — one formatter now, no leading zero.
describe('the chat’s times', () => {
  const evening = new Date(2026, 9, 27, 18, 29);
  const morning = new Date(2026, 9, 27, 9, 5);

  it('writes the hour without a leading zero, in either language', () => {
    expect(timeOfDay('zh-TW').format(evening)).toBe('下午6:29');
    expect(timeOfDay('zh-TW').format(morning)).toBe('上午9:05');
    expect(timeOfDay('en').format(morning)).toMatch(/^9:05\sAM$/);
  });

  it('writes a message’s full time with the same time of day', () => {
    expect(fullMessageTime('zh-TW').format(evening)).toContain('下午6:29');
    expect(fullMessageTime('en').format(morning)).toMatch(/9:05\sAM/);
  });
});
