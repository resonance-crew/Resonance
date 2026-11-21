import { beforeEach, describe, expect, it, vi } from 'vitest';

// lib/api/v1/reads (the legacy facade) and server/app/cardsRead (the service) import each other through
// server/infra/firestore/repos/graph. Whichever a page loads first, every value the facade hands on must be
// there: a copy taken at load time (`export const X = app.X`) threw "Cannot access 'TRASH_SHELF_LIMIT' before
// initialization" and the card page answered 500 (Phase 2b web A's capture of card-other).
const ENTRIES = [
  '@/server/infra/firestore/repos/graph',
  '@/server/app/cardsRead',
  '@/lib/api/v1/reads',
  '@/app/[locale]/(app)/card/[slug]/cardPageData',
] as const;

describe('the cards read facade and its service load in any order', () => {
  beforeEach(() => vi.resetModules());

  for (const first of ENTRIES) {
    it(`loading ${first} first`, async () => {
      await import(first);
      const reads = await import('@/lib/api/v1/reads');
      const app = await import('@/server/app/cardsRead');
      expect(reads.TRASH_SHELF_LIMIT).toBe(100);
      expect(reads.TRASH_SHELF_LIMIT).toBe(app.TRASH_SHELF_LIMIT);
    });
  }
});
