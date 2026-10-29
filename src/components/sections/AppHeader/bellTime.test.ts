import { describe, expect, it } from 'vitest';
import { bellGroup, bellWhen } from './bellTime';

// The bell's parts and times keep step: a row under 這週 never says "2 小時前", whatever the clock says.
describe('bell time', () => {
  const now = new Date(2026, 9, 29, 0, 30); // 00:30 local
  const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

  it('parts the list by the viewer’s calendar days, not by 24-hour spans', () => {
    expect(bellGroup(at(2026, 10, 29, 0, 10), now)).toBe('today');
    // An hour ago, but yesterday: this week, and said as yesterday.
    expect(bellGroup(at(2026, 10, 28, 23, 30), now)).toBe('thisWeek');
    expect(bellWhen(at(2026, 10, 28, 23, 30), now, 'zh-TW', '剛剛')).toBe('昨天');
    expect(bellGroup(at(2026, 10, 23), now)).toBe('thisWeek');
    expect(bellGroup(at(2026, 10, 22), now)).toBe('earlier');
  });

  it('says the minutes and hours today, the days this week, then the date', () => {
    expect(bellWhen(at(2026, 10, 29, 0, 30), now, 'zh-TW', '剛剛')).toBe('剛剛');
    expect(bellWhen(at(2026, 10, 29, 0, 10), now, 'zh-TW', '剛剛')).toBe('20 分鐘前');
    expect(bellWhen(at(2026, 10, 26), now, 'en', 'Just now')).toBe('3 days ago');
    expect(bellWhen(at(2026, 10, 20), now, 'zh-TW', '剛剛')).toBe('10/20');
    expect(bellWhen(at(2025, 12, 20), now, 'en', 'Just now')).toBe('12/20/2025');
    // A clock a little behind the server's: never "in 1 minute".
    expect(bellWhen(new Date(now.getTime() + 30_000), now, 'en', 'Just now')).toBe('Just now');
  });
});
