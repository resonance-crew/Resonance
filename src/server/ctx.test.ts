import { beforeEach, describe, expect, it, vi } from 'vitest';

// How the production context is put together: from whatever database
// '@/lib/db/firestore/admin' answers (the path the emulator suites mock), built
// once per database, loading no SDK until a port is used, and delegating to
// today's modules where a lane hasn't moved them yet.

const mocks = vi.hoisted(() => ({
  db: { name: 'db-1' } as object,
  spend: vi.fn(async () => {}),
  revalidateLocalized: vi.fn((paths: Iterable<string>) => [...paths].map((p) => `/en${p}`)),
}));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/api/rateLimit', () => ({ spend: mocks.spend, spendAll: vi.fn(), limited: vi.fn() }));
vi.mock('@/lib/api/revalidate', () => ({ revalidateLocalized: mocks.revalidateLocalized }));

const { serverCtx } = await import('./ctx');
const { ctxFor } = await import('./infra/firestore/ctx');
const { NotWiredError, lazyAsync } = await import('./infra/wiring');
const { FirestoreVectorStore } = await import('./infra/firestore/vectors');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('serverCtx', () => {
  it('is built once per database', () => {
    mocks.db = { name: 'db-1' };
    const first = serverCtx();
    expect(serverCtx()).toBe(first);
    mocks.db = { name: 'db-2' };
    expect(serverCtx()).not.toBe(first);
  });

  it('has no model unless the route passes one (rule 9: only routes pinned to hnd1 reach OpenAI)', async () => {
    expect(() => serverCtx().llm.chat([], { signal: AbortSignal.timeout(1) })).toThrow(/hnd1/);
    const llm = { chat: vi.fn(async () => 'ok'), json: vi.fn(), embed: vi.fn(), image: vi.fn() };
    expect(await serverCtx({ llm }).llm.chat([], { signal: AbortSignal.timeout(1000) })).toBe('ok');
    // …for that call only.
    expect(() => serverCtx().llm.chat([], { signal: AbortSignal.timeout(1) })).toThrow(NotWiredError);
  });
});

describe('ctxFor', () => {
  const db = { name: 'emulator' } as unknown as Parameters<typeof ctxFor>[0];

  it('binds the database-backed ports to the database it was given', async () => {
    const ctx = ctxFor(db);
    await ctx.limits.spend('u1', 'note', 2, 1000);
    expect(mocks.spend).toHaveBeenCalledWith(db, 'u1', 'note', 2, 1000);
    // The vector index on this database, built without a read.
    expect(ctx.vectors).toBeInstanceOf(FirestoreVectorStore);
    expect((ctx.vectors as unknown as { firestore: unknown }).firestore).toBe(db);
  });

  it('drops pages through revalidateLocalized', () => {
    expect(ctxFor(db).pages.revalidate(['/card/x'])).toEqual(['/en/card/x']);
  });

  it('takes overrides, port by port', async () => {
    const push = { send: vi.fn(async () => ({ sent: 1, dead: [] })) };
    const ctx = ctxFor(db, { push });
    await ctx.push.send(['t'], { data: {} });
    expect(push.send).toHaveBeenCalled();
  });

  it('a port no lane has wired throws NotWiredError on use, never on build', () => {
    const ctx = ctxFor(db);
    expect(() => ctx.push.send(['t'], { data: {} })).toThrow(NotWiredError);
  });

  it('wires leases on the database (infra/firestore/lease.ts): a key is a document path', async () => {
    await expect(ctxFor(db).leases.release('k')).rejects.toThrow(/document path/);
  });
});

describe('lazyAsync', () => {
  it('loads once on first call, and again after a failed load', async () => {
    let loads = 0;
    const port = lazyAsync<{ hi(name: string): Promise<string> }>(async () => {
      if (++loads === 1) throw new Error('offline');
      return { hi: async (name) => `hi ${name}` };
    });
    expect(loads).toBe(0);
    await expect(port.hi('a')).rejects.toThrow('offline');
    expect(await port.hi('b')).toBe('hi b');
    expect(await port.hi('c')).toBe('hi c');
    expect(loads).toBe(2);
  });
});
