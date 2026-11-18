import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';

const world = vi.hoisted(() => ({ current: null as FakeAdminDb | null }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => world.current!.db }));

import { GET } from './route';

// The weekly read summary as Vercel Cron calls it (round 26 §R4): only with
// the secret, and over the week that ends at the start of the UTC hour it
// fires in — the Hobby plan fires a cron anywhere within its hour, so two
// Mondays' runs at 01:50 and then 01:05 (or 01:05 and then 01:50) must
// neither count a read twice nor miss one between them.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
// A Monday, 01:00 UTC: the hour the cron is scheduled for.
const MONDAY = Date.parse('2026-11-23T01:00:00Z');

const call = (authorization?: string) =>
  GET(new Request('http://localhost/api/cron/read-summary', { headers: authorization ? { authorization } : {} }));

/** Three readers who read bob's card `walk` to the end at `endedAt`. */
const readersAt = (endedAt: number) =>
  fakeAdminDb({
    'cards/walk': {
      authorId: 'bob', thoughtCore: 't', story: 's', visibility: 'public', anonymous: false, publishedAt: Timestamp.fromMillis(MONDAY - 30 * DAY),
    },
    ...Object.fromEntries(
      ['r1', 'r2', 'r3'].map((uid) => [
        `readerSignals/${uid}_walk`,
        { userId: uid, cardId: 'walk', reachedEndAt: Timestamp.fromMillis(endedAt), rereadAt: null },
      ]),
    ),
  });
const rows = () => Object.keys(world.current!.docs).filter((p) => p.startsWith('notifications/'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('CRON_SECRET', 's3cret');
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('/api/cron/read-summary', () => {
  it('refuses anyone but Vercel Cron, and everyone while the secret is unset', async () => {
    world.current = readersAt(MONDAY - DAY);
    vi.setSystemTime(MONDAY);
    expect((await call('Bearer nope')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer s3cret')).status).toBe(401);
    expect(rows()).toEqual([]);
  });

  it.each([
    ['01:50, then 01:05 a week on', 50, 5, 30],
    ['01:05, then 01:50 a week on', 5, 50, 20],
  ] as const)('counts a read in the run\'s hour exactly once when the runs fire at %s', async (_, first, second, readAt) => {
    // Read to the end in the hour of the first run, on the first Monday.
    world.current = readersAt(MONDAY + readAt * 60_000);
    vi.setSystemTime(MONDAY + first * 60_000);
    const one = await call('Bearer s3cret');
    expect(one.status).toBe(200);
    vi.setSystemTime(MONDAY + WEEK + second * 60_000);
    const two = await call('Bearer s3cret');
    expect(two.status).toBe(200);
    // In the second week, never the first — whichever run fired earlier in its hour.
    expect([(await one.json()).rows, (await two.json()).rows]).toEqual([0, 1]);
    expect(rows()).toEqual(['notifications/rsum_walk_20261130']);
    // The row's time is the week's end, the hour the cron is scheduled for.
    expect(world.current.docs['notifications/rsum_walk_20261130'].createdAt).toEqual(Timestamp.fromMillis(MONDAY + WEEK));
  });
});
