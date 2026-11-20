import { afterEach, describe, expect, it, vi } from 'vitest';

// The context's buckets: ctx.chatObjects is null exactly where
// getChatImageStore() would answer null, and otherwise asks it for the store
// on every call — the path the emulator suites mock — so a suite that swaps
// the store between cases is obeyed.

const mocks = vi.hoisted(() => ({ store: null as unknown, provider: vi.fn() }));
vi.mock('@/lib/storage/chatImages', () => ({ getChatImageStore: () => mocks.store }));
vi.mock('@/lib/storage', () => ({ getStorageProvider: () => mocks.provider() }));

const { chatObjectStore, publicObjectStore } = await import('./objects');
const { memoryPrivateObjectStore } = await import('../memory/objects');

afterEach(() => vi.unstubAllEnvs());

const noEnv = () => {
  vi.stubEnv('R2_CHAT_BUCKET', '');
  vi.stubEnv('R2_ENDPOINT', '');
  vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_EMULATOR', '');
};

describe('chatObjectStore', () => {
  it('is null where no chat bucket is set up', () => {
    noEnv();
    expect(chatObjectStore()).toBeNull();
    vi.stubEnv('R2_CHAT_BUCKET', 'chat');
    expect(chatObjectStore()).toBeNull(); // no R2_ENDPOINT
    vi.stubEnv('R2_ENDPOINT', 'https://r2.example');
    expect(chatObjectStore()).not.toBeNull();
  });

  it('against the emulators, asks getChatImageStore() on every call', async () => {
    noEnv();
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8350');
    const chat = chatObjectStore()!;
    const first = memoryPrivateObjectStore();
    mocks.store = first;
    await chat.put('chat/2026-11/a.webp', new Uint8Array([1]), 'image/webp');
    const second = memoryPrivateObjectStore();
    mocks.store = second;
    expect(await chat.get('chat/2026-11/a.webp')).toBeNull();
    mocks.store = first;
    expect(await chat.get('chat/2026-11/a.webp')).toEqual(new Uint8Array([1]));
    const stream = await chat.stream!('chat/2026-11/a.webp');
    expect(new Uint8Array(await new Response(stream).arrayBuffer())).toEqual(new Uint8Array([1]));
    await chat.deleteMany(['chat/2026-11/a.webp']);
    expect(first.objects.size).toBe(0);
    mocks.store = null;
    await expect(chat.get('chat/2026-11/a.webp')).rejects.toThrow(/not set up/);
  });
});

describe('publicObjectStore', () => {
  it('loads getStorageProvider() on first use only', async () => {
    mocks.provider.mockReturnValue({ head: async (key: string) => ({ size: 1, etag: key, contentType: 'image/webp' }) });
    const objects = publicObjectStore();
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(await objects.head('k')).toEqual({ size: 1, etag: 'k', contentType: 'image/webp' });
    expect(await objects.head('j')).toMatchObject({ etag: 'j' });
    expect(mocks.provider).toHaveBeenCalledTimes(1);
  });
});
