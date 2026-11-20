import { beforeEach, describe, expect, it, vi } from 'vitest';

// How the production context is put together: from whatever database
// '@/lib/db/firestore/admin' answers (the path the emulator suites mock), built
// once per database, loading no SDK until a port is used, and delegating to
// today's modules where a lane hasn't moved them yet.

const mocks = vi.hoisted(() => ({
  db: { name: 'db-1' } as object,
  revalidateLocalized: vi.fn((paths: Iterable<string>) => [...paths].map((p) => `/en${p}`)),
  vectorStore: vi.fn(),
}));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/api/revalidate', () => ({ revalidateLocalized: mocks.revalidateLocalized }));
vi.mock('@/lib/recommend/vectorStore/firestore', () => ({
  FirestoreVectorStore: class {
    constructor(db: unknown) {
      mocks.vectorStore(db);
    }
    async deleteByCard(id: string) {
      return `deleted ${id}`;
    }
  },
}));

const { serverCtx } = await import('./ctx');
const { ctxFor } = await import('./infra/firestore/ctx');
const { NotWiredError, lazyAsync } = await import('./infra/wiring');

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
  const set = vi.fn();
  const db = {
    name: 'emulator',
    doc: (path: string) => ({ path }),
    runTransaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ getAll: async (...refs: unknown[]) => refs.map(() => ({ get: () => undefined })), set }),
    ),
  } as unknown as Parameters<typeof ctxFor>[0];

  it('binds the database-backed ports to the database it was given', async () => {
    const ctx = ctxFor(db);
    await ctx.limits.spend('u1', 'note', 2, 1000);
    expect(set).toHaveBeenCalledWith({ path: 'rateLimits/u1_note' }, { userId: 'u1', bucket: 'note', windowStart: 1000, used: 2 });
    expect(mocks.vectorStore).not.toHaveBeenCalled(); // nothing loaded until used
    expect(await ctx.vectors.deleteByCard('c1')).toBe('deleted c1');
    expect(mocks.vectorStore).toHaveBeenCalledWith(db);
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
    // (push is wired since the push lane: FCM, loaded on the first send — infra/fcm/push.test.ts.)
    expect(() => ctx.leases.release('k')).toThrow(NotWiredError);
    expect(() => ctx.leases.release('k')).toThrow(/ServerCtx\.leases is not wired/);
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
