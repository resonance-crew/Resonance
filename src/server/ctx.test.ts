import { beforeEach, describe, expect, it, vi } from 'vitest';

// How the production context is put together: from whatever database
// '@/lib/db/firestore/admin' answers (the path the emulator suites mock), built
// once per database, loading no SDK until a port is used, and delegating to
// today's modules where a lane hasn't moved them yet.

const mocks = vi.hoisted(() => ({
  db: { name: 'db-1' } as object,
  revalidateLocalized: vi.fn((paths: Iterable<string>) => [...paths].map((p) => `/en${p}`)),
}));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
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
    // (push is wired since the push lane, leases since the recommend lane; the model stays out on purpose.)
    expect(() => ctx.llm.chat({} as never, {} as never)).toThrow(NotWiredError);
  });

  it('is built once per database, overrides laid over it in a fresh object that leaves it alone', () => {
    const ctx = ctxFor(db);
    expect(ctxFor(db)).toBe(ctx);
    expect(ctxFor(db).data).toBe(ctx.data);
    // Another database (another test's emulator, a fake): its own.
    const other = { ...db } as typeof db;
    expect(ctxFor(other)).not.toBe(ctx);
    expect(ctxFor(other).limits).not.toBe(ctx.limits);

    const push = { send: vi.fn(async () => ({ sent: 1, dead: [] })) };
    const pushed = ctxFor(db, { push });
    expect(pushed).not.toBe(ctx);
    expect(pushed.push).toBe(push);
    expect(pushed.data).toBe(ctx.data);
    expect(ctxFor(db).push).not.toBe(push);
    // Nobody can change the shared one for the next caller.
    expect(Object.isFrozen(ctx)).toBe(true);

    // A logger of the caller's own: realtime and the after-response work log through it, so it is built whole.
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logged = ctxFor(db, { log });
    expect(logged.log).toBe(log);
    expect(logged.realtime).not.toBe(ctx.realtime);
  });

  it('keeps the context with a chat store apart from the one without (the environment, when it was built)', () => {
    vi.stubEnv('R2_CHAT_BUCKET', '');
    vi.stubEnv('R2_ENDPOINT', '');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_EMULATOR', '');
    const fresh = { ...db } as typeof db;
    expect(ctxFor(fresh).chatObjects).toBeNull();
    vi.stubEnv('R2_CHAT_BUCKET', 'chat');
    vi.stubEnv('R2_ENDPOINT', 'https://r2.example');
    expect(ctxFor(fresh).chatObjects).not.toBeNull();
    vi.unstubAllEnvs();
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
