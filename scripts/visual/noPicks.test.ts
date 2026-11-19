import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { dailyRecommendations, planServe, readStored } from '../../src/lib/recommend/daily';
import { noPicks } from './noPicks';
import { SCREENS } from './screens';
import { seedEnv } from './stack';
import { ROOT } from './util';

// Run 20261118-235458: home showed carol's pick and 顯示更多 on the apps' light captures and the latest cards on the
// web and the Android dark tablet — whether picks led depended on what an earlier capture had built and stored, and on
// the day. The visual world gives nobody picks, so home is the latest cards everywhere.

/** `recommendations/{uid}` as the seed leaves it, read as the server reads it. */
const seeded = () => noPicks() as unknown as Record<string, unknown>;
const dbHolding = (doc: Record<string, unknown>) =>
  ({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => doc }) }) }) }) as unknown as Firestore;

describe('the visual world has no picks', () => {
  it('serves alice no picks and builds none, today or any day after', async () => {
    for (const day of ['2026-11-19T00:30:00Z', '2026-11-19T23:59:59Z', '2031-06-01T12:00:00Z', '9000-01-01T00:00:00Z']) {
      const now = Date.parse(day);
      expect(planServe(readStored(seeded()), now)).toEqual({ kind: 'cooldown' });
      const build = vi.fn(async () => ({ items: [{ cardId: 'bridge-rain', channel: 'insight' as const, reason: '', score: 1 }], partial: false }));
      const answer = await dailyRecommendations(dbHolding(seeded()), 'alice', { build, now: () => now });
      expect(answer.items).toEqual([]);
      expect(answer.refresh).toBeNull();
      expect(build).not.toHaveBeenCalled();
    }
  });

  it('is what the stack seeds with, for every seeded account', () => {
    expect(seedEnv().SEED_PICKS).toBe('none');
    const seed = readFileSync(join(ROOT, 'scripts/seed-emulator.ts'), 'utf8');
    expect(seed).toMatch(/if \(process\.env\.SEED_PICKS === 'none'\) \{[\s\S]*?for \(const u of SEED_USERS\) await db\.doc\(`recommendations\/\$\{u\.uid\}`\)\.set\(noPicks\(\)\);/);
    // After the readings, which would otherwise give the recommender its pool.
    expect(seed.indexOf("SEED_PICKS === 'none'")).toBeGreaterThan(seed.indexOf('await seedReadings(db);'));
  });

  it('no screen asks for picks: home is the latest cards, as its expect line says', () => {
    const home = SCREENS.find((s) => s.id === 'home')!;
    expect(home.expect).toMatch(/story cards/);
    for (const s of SCREENS) expect(s.expect, s.id).not.toMatch(/推薦|picks?\b|recommend/i);
  });
});
