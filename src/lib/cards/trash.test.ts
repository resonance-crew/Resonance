import { describe, expect, it } from 'vitest';
import { DAY_MS, TRASH_DAYS, daysLeft, purgeAtOf, restorableVisibility, trashExpired } from './trash';

// The trash's clock: 30 days from the moment a card went in, the same on the
// server (what restore and the shelf refuse) and in the browser (what the
// shelf and the banner say).

const trashedAt = new Date('2026-10-01T08:00:00Z');

describe('the trash clock', () => {
  it('purges a card thirty days after it went in, and not a moment before', () => {
    expect(TRASH_DAYS).toBe(30);
    const purgeAt = purgeAtOf(trashedAt);
    expect(purgeAt.toISOString()).toBe('2026-10-31T08:00:00.000Z');
    expect(purgeAtOf(trashedAt.getTime()).getTime()).toBe(purgeAt.getTime());
    expect(trashExpired(trashedAt, purgeAt.getTime() - 1)).toBe(false);
    expect(trashExpired(trashedAt, purgeAt)).toBe(true);
    expect(trashExpired(trashedAt, purgeAt.getTime() + DAY_MS)).toBe(true);
  });

  it('counts the days left as whole days, rounded up, with the last one said as such', () => {
    const purgeAt = purgeAtOf(trashedAt);
    // Just in: all thirty.
    expect(daysLeft(purgeAt, trashedAt)).toEqual({ lastDay: false, days: 30 });
    // A minute in: still the thirtieth day.
    expect(daysLeft(purgeAt, trashedAt.getTime() + 60_000)).toEqual({ lastDay: false, days: 30 });
    // A day and an hour to go: two days.
    expect(daysLeft(purgeAt, purgeAt.getTime() - DAY_MS - 3_600_000)).toEqual({ lastDay: false, days: 2 });
    // Exactly a day, and less: the last day.
    expect(daysLeft(purgeAt, purgeAt.getTime() - DAY_MS)).toEqual({ lastDay: true, days: 1 });
    expect(daysLeft(purgeAt, purgeAt.getTime() - 1)).toEqual({ lastDay: true, days: 1 });
    // Past it (before the cron came): never fewer than one.
    expect(daysLeft(purgeAt, purgeAt.getTime() + 5)).toEqual({ lastDay: true, days: 1 });
  });

  it('restores only a visibility the contract knows, anything else as private', () => {
    expect(restorableVisibility('public')).toBe('public');
    expect(restorableVisibility('connections')).toBe('connections');
    expect(restorableVisibility('private')).toBe('private');
    expect(restorableVisibility('everyone')).toBe('private');
    expect(restorableVisibility(undefined)).toBe('private');
  });
});
