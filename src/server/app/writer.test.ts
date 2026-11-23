import { describe, expect, it, vi } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import { LIMITS } from '@/server/domain/rateLimit';
import { describeWriterContract } from '@/server/contract/writer.contract';
import { memoryCtx } from '@/server/infra/memory/ctx';
import { applyMapOpsIn, createDraftIn, deletePendingEditIn, putPendingEditIn, saveDraftIn } from './writer';

// The writer's services over memory: the contract Firestore's emulator runs
// too (test/emulator/ports.writer.emulator.test.ts), then what only a memory
// context shows cheaply — the signal touched after each write and never for
// one that changed nothing, and the autosave budget.

const split = (path: string) => {
  const i = path.lastIndexOf('/');
  return { table: path.slice(0, i), id: path.slice(i + 1) };
};

describeWriterContract('memory', () => {
  const ctx = memoryCtx();
  return {
    ctx,
    touches: ctx.realtime.touches,
    async seed(path, row) {
      const { table, id } = split(path);
      ctx.state.put(table, id, row);
    },
    async read(path) {
      const { table, id } = split(path);
      return ctx.state.get(table, id);
    },
  };
});

describe('the writer, a whole session on memory', () => {
  it('touches only its author, once per write that changed something: map, then drafts', async () => {
    const ctx = memoryCtx();
    const id = 'Q1w2E3r4T5y6U7i8O9p0';
    await applyMapOpsIn(ctx, 'alice', [{ op: 'addNode', cardId: 'c1', x: 0, y: 0 }]);
    await createDraftIn(ctx, 'alice', { id, thoughtCore: '', story: '', tags: [], visibility: 'private' });
    await saveDraftIn(ctx, 'alice', id, { rev: 1, story: '一' });
    await saveDraftIn(ctx, 'alice', id, { rev: 1, story: '一' });
    await ctx.state.put('cards', 'live', { authorId: 'alice', visibility: 'public', publishedAt: new Date() });
    await putPendingEditIn(ctx, 'alice', 'live', { rev: 1, thoughtCore: 't', story: 's', tags: [], visibility: 'public', anonymous: false });
    await deletePendingEditIn(ctx, 'alice', 'live');
    await deletePendingEditIn(ctx, 'alice', 'live');
    expect(ctx.realtime.touches).toEqual([
      { uid: 'alice', topics: ['map'] },
      { uid: 'alice', topics: ['drafts'] },
      { uid: 'alice', topics: ['drafts'] },
      { uid: 'alice', topics: ['drafts'] },
      { uid: 'alice', topics: ['drafts'] },
    ]);
  });

  it('a touch that fails never fails the write', async () => {
    const ctx = memoryCtx({ realtime: { touch: () => Promise.reject(new Error('down')) } });
    expect(await applyMapOpsIn(ctx, 'alice', [{ op: 'addNode', cardId: 'c1', x: 0, y: 0 }])).toEqual({ applied: 1, skipped: [] });
    expect(ctx.log.lines.some((l) => l.level === 'error' && l.message === '[writer] touch')).toBe(true);
  });

  it('spends the autosave budget: past it a save is 429, the draft as it was', async () => {
    const ctx = memoryCtx();
    const id = 'Z1x2C3v4B5n6M7a8S9d0';
    await createDraftIn(ctx, 'alice', { id, thoughtCore: '', story: '起', tags: [], visibility: 'private' });
    ctx.state.put('rateLimits', 'alice_draftSave', { userId: 'alice', bucket: 'draftSave', windowStart: Date.now(), used: LIMITS.draftSave.max });
    const e = await saveDraftIn(ctx, 'alice', id, { rev: 1, story: '過' }).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(ApiFailure);
    expect((e as ApiFailure).code).toBe('rate_limited');
    expect(ctx.state.get('cards', id)!.story).toBe('起');
  });

  // BE-7: the autosave spent its budget, then read the card: two round trips one after the other, every 1.5 s. The
  // budget runs beside the read now, and nothing is written until it is spent. BE-6: the read leaves the words out.
  it('spends the budget beside the read, writes only once it is spent, and reads the card without its words', async () => {
    const base = memoryCtx();
    const id = 'P1o2I3u4Y5t6R7e8W9q0';
    await createDraftIn(base, 'alice', { id, thoughtCore: '', story: '很長的故事', tags: [], visibility: 'private' });
    let spend!: () => void;
    const spent = new Promise<void>((r) => (spend = r));
    let reads = 0;
    const ctx = memoryCtx({
      state: base.state,
      limits: { ...base.limits, spend: () => spent },
      uow: { run: (fn, o) => base.uow.run((tx) => fn({ ...tx, writer: { ...tx.writer, getDraftHead: (cid: string) => (reads++, tx.writer.getDraftHead(cid)) } }), o) },
    });
    const head = await base.uow.run((tx) => tx.writer.getDraftHead(id));
    expect(head).toMatchObject({ authorId: 'alice' });
    expect(head).not.toHaveProperty('story');

    const save = saveDraftIn(ctx, 'alice', id, { rev: 1, story: '改過' });
    await vi.waitFor(() => expect(reads).toBe(1));
    // read while the budget is still out — and nothing written yet
    expect(base.state.get('cards', id)!.story).toBe('很長的故事');
    spend();
    await expect(save).resolves.toMatchObject({ applied: true });
    expect(base.state.get('cards', id)!.story).toBe('改過');
  });
});
