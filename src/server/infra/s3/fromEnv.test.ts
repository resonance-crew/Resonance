import { afterEach, describe, expect, it, vi } from 'vitest';

// The chat pictures' store is asked for on every request that reads or writes
// a picture (the thread draws one request per picture): each must reuse the
// one S3 client its configuration has, not make a client (its own connection
// pool and signer) every time.

const made = vi.hoisted(() => ({ clients: [] as unknown[] }));
vi.mock('@aws-sdk/client-s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    send = vi.fn();
    constructor(readonly config: unknown) {
      made.clients.push(this);
    }
  },
}));

const { chatImageStoreFromEnv } = await import('./fromEnv');
const { r2Client } = await import('./r2');

afterEach(() => vi.unstubAllEnvs());

const env = (vars: Record<string, string>) => Object.entries(vars).forEach(([k, v]) => vi.stubEnv(k, v));
const clientOf = (store: unknown) => (store as { client: unknown }).client;

describe('R2 clients', () => {
  it('makes one S3 client per configuration, however many requests ask for the chat store', () => {
    env({ R2_ENDPOINT: 'https://r2.example', R2_CHAT_BUCKET: 'chat', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret' });
    const before = made.clients.length;
    const stores = Array.from({ length: 5 }, () => chatImageStoreFromEnv());
    expect(made.clients.length - before).toBe(1);
    expect(new Set(stores.map(clientOf)).size).toBe(1);
    // The account's own keys through r2Client() are the same configuration: the same client.
    expect(r2Client()).toBe(clientOf(stores[0]));
  });

  it('keeps clients apart by endpoint and keys: a bucket with keys of its own gets its own', () => {
    env({ R2_ENDPOINT: 'https://r2.example', R2_CHAT_BUCKET: 'chat', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret' });
    const account = clientOf(chatImageStoreFromEnv());
    env({ R2_CHAT_ACCESS_KEY_ID: 'chat-id', R2_CHAT_SECRET_ACCESS_KEY: 'chat-secret' });
    const own = clientOf(chatImageStoreFromEnv());
    expect(own).not.toBe(account);
    expect(clientOf(chatImageStoreFromEnv())).toBe(own);
    env({ R2_ENDPOINT: 'https://other.example' });
    expect(clientOf(chatImageStoreFromEnv())).not.toBe(own);
  });
});
