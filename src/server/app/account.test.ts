import { describe, expect, it } from 'vitest';
import { describeAccountPurgeContract, seedAccountWorld, UID } from '@/server/contract/account.contract';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { purgeAccountDataIn, purgeDueAccountsIn } from './account';

// The registry-driven purge on the memory store: the same contract the
// Firestore emulator runs (test/emulator/ports.account.emulator.test.ts).

function harness() {
  const ctx = memoryCtx();
  return {
    ctx,
    async seed(path: string, row: Record<string, unknown>) {
      const i = path.lastIndexOf('/');
      ctx.state.put(path.slice(0, i), path.slice(i + 1), row);
    },
    async dump() {
      return Object.entries(ctx.state.dump()).flatMap(([table, rows]) => Object.entries(rows).map(([id, row]) => ({ path: `${table}/${id}`, row })));
    },
  };
}

describeAccountPurgeContract('memory', harness);

describe('the purge on memory', () => {
  it('names the pages that showed the account: its published card by id and slug, its profile, the landing', async () => {
    const h = harness();
    await seedAccountWorld(h.seed);
    const report = await purgeAccountDataIn(h.ctx, UID);
    expect(report.pages.sort()).toEqual(['/', '/card/card-of-hers', '/card/her-story', '/u/AlicePen'].sort());
    expect(report.complete).toBe(true);
  });

  it('starts nothing past its deadline: the profile and the request stay for the next run', async () => {
    const h = harness();
    await seedAccountWorld(h.seed);
    const report = await purgeAccountDataIn(h.ctx, UID, { deadline: 0, clock: () => 1 });
    expect(report.complete).toBe(false);
    expect(h.ctx.state.get('users', UID)).not.toBeNull();
    expect(h.ctx.state.get('accountDeletions', UID)).not.toBeNull();
  });

  it('purges due accounts, and only those', async () => {
    const h = harness();
    await seedAccountWorld(h.seed);
    h.ctx.state.put('accountDeletions', 'u-later', { uid: 'u-later', requestedAt: new Date(), purgeAfter: new Date(Date.now() + 86_400_000) });
    const run = await purgeDueAccountsIn(h.ctx, { deleteAuthUser: async () => {} });
    expect(run).toEqual({ purged: [UID], failed: [], deferred: [] });
    expect(h.ctx.state.get('accountDeletions', 'u-later')).not.toBeNull();
  });
});
