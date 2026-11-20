import { describe, expect, it, vi } from 'vitest';
import type { RecommendationItem } from '@/lib/db/types';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { LEASE_MS, dailyRecommendationsIn, warmRecommendationsIn, type BuildFeed } from './recommendDaily';
import type { FunnelResult } from './recommendFeed';

// A reader's daily picks on the memory context, end to end through the
// recommend repository and the unit of work (no Firestore): the build lease
// is taken once, a second request meanwhile waits for that build rather than
// starting its own, and the result is kept on `recommendations/{uid}` with
// the reader's ask and what they were shown.

const item = (cardId: string): RecommendationItem => ({ cardId, channel: 'insight', reason: `because ${cardId}`, score: 1 });

function deferredBuild() {
  let finish!: (r: FunnelResult) => void;
  const done = new Promise<FunnelResult>((resolve) => (finish = resolve));
  const build = vi.fn<BuildFeed>(() => done);
  return { build, finish };
}

describe('dailyRecommendationsIn on the memory context', () => {
  it('builds once for two requests at once: the lease is taken once, the second waits for the first build, the result is stored', async () => {
    const ctx = memoryCtx();
    const now = ctx.clock.now;
    const today = new Date(now()).toISOString().slice(0, 10);
    const { build, finish } = deferredBuild();

    const first = dailyRecommendationsIn(ctx, 'alice', { build, now, pollMs: 5 });
    // Let the first request take its lease and start building.
    await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1));
    expect(ctx.state.get('recommendations', 'alice')).toEqual({ leaseUntil: new Date(now() + LEASE_MS) });

    const second = dailyRecommendationsIn(ctx, 'alice', { build, now, pollMs: 5 });
    finish({ items: [item('c1'), item('c2')], partial: false });
    const [a, b] = await Promise.all([first, second]);

    expect(build).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({ items: [item('c1'), item('c2')], cached: false, status: 'fresh', refresh: null, asked: null });
    // The second answered from what the first stored, its ask already on record.
    expect(b).toMatchObject({ items: [item('c1'), item('c2')], cached: true, status: 'fresh', refresh: null, asked: null });

    const row = ctx.state.get('recommendations', 'alice')!;
    expect(row).toMatchObject({
      date: today,
      items: [item('c1'), item('c2')],
      partial: false,
      coldStart: false,
      askedOn: today,
      shown: { c1: { n: 1, lastDay: today }, c2: { n: 1, lastDay: today } },
    });
    expect(row.generatedAt).toBeInstanceOf(Date);
    // The lease went with the result.
    expect(row).not.toHaveProperty('leaseUntil');
    expect(row).not.toHaveProperty('warm');
  });

  it('answers yesterday\'s picks at once as stale, and their rebuild runs once however often it is asked for', async () => {
    const ctx = memoryCtx();
    const now = ctx.clock.now;
    ctx.state.seed('recommendations', { bob: { date: '2026-11-19', items: [item('old')], askedOn: '2026-11-19' } });
    const { build, finish } = deferredBuild();

    const served = await dailyRecommendationsIn(ctx, 'bob', { build, now });
    expect(served).toMatchObject({ items: [item('old')], cached: true, status: 'stale' });
    expect(build).not.toHaveBeenCalled();

    // The route runs `refresh` after its response; a second request's refresh finds the lease held.
    const refreshes = [served.refresh!(), served.refresh!()];
    await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1));
    // The warm-up cron is refused the lease too.
    expect(await warmRecommendationsIn(ctx, 'bob', { build, now })).toBe('skipped');
    finish({ items: [item('new')], partial: false });
    await Promise.all(refreshes);
    expect(build).toHaveBeenCalledTimes(1);

    const today = new Date(now()).toISOString().slice(0, 10);
    expect(ctx.state.get('recommendations', 'bob')).toMatchObject({ date: today, items: [item('new')], askedOn: today });
    // A refresh after the response counts nothing as shown: the reader saw the old picks.
    expect(ctx.state.get('recommendations', 'bob')).not.toHaveProperty('shown');

    // The reader's ask of the stale picks is recorded after the response, with what they were shown.
    await served.asked!();
    expect(ctx.state.get('recommendations', 'bob')).toMatchObject({ askedOn: today, shown: { old: { n: 1, lastDay: today } } });
  });

  it('records a failed build, drops the lease, and tries none again within the hour', async () => {
    const ctx = memoryCtx();
    const now = ctx.clock.now;
    const build = vi.fn<BuildFeed>(async () => {
      throw new Error('model down');
    });
    const answer = await dailyRecommendationsIn(ctx, 'cat', { build, now });
    expect(answer).toMatchObject({ items: [], cached: false, status: 'stale' });
    expect(ctx.state.get('recommendations', 'cat')).toEqual({ failedAt: new Date(now()) });
    expect(ctx.log.lines.some((l) => l.level === 'error' && l.message.includes('build failed'))).toBe(true);

    ctx.clock.advance(30 * 60_000);
    expect(await dailyRecommendationsIn(ctx, 'cat', { build, now })).toMatchObject({ items: [], cached: true, status: 'stale' });
    expect(build).toHaveBeenCalledTimes(1);
  });
});
