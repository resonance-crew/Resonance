import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/emulator-storage/[...key]/route';
import { getStorageProvider } from './index';
import { LocalStorageProvider } from './local';
import { storageKeyOf } from './publicUrl';

// Against the emulators a picture is stored in a folder on this machine and
// served by the dev server at its own address — the R2_PUBLIC_BASE every
// "is this ours" check reads — and nowhere else is anything served from disk.

const BASE = 'http://localhost:3100/api/emulator-storage';
const intent = { filename: 'upload.webp', contentType: 'image/webp', size: 3, ownerId: 'alice', kind: 'image' as const };
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'local-storage-test-'));
  vi.stubEnv('EMULATOR_STORAGE_DIR', root);
  vi.stubEnv('R2_PUBLIC_BASE', BASE);
  vi.stubEnv('R2_ENDPOINT', '');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_EMULATOR', 'true');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const serve = (key: string) => GET(new Request(`${BASE}/${key}`), { params: Promise.resolve({ key: key.split('/') }) });

describe('the emulators’ storage', () => {
  it('stores an upload under a key naming no one, at the dev server’s address, and serves it back', async () => {
    const storage = getStorageProvider();
    expect(storage).toBeInstanceOf(LocalStorageProvider);
    const stored = await storage.uploadObject(intent, new Uint8Array([1, 2, 3]));
    expect(stored.key).toMatch(/^image\/\d{4}-\d{2}\/[0-9a-f-]{36}\.webp$/);
    expect(stored.publicUrl).toBe(`${BASE}/${stored.key}`);
    // A picture we stored, as the server's own checks see it.
    expect(storageKeyOf(stored.publicUrl)).toBe(stored.key);

    const res = await serve(stored.key);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(await storage.getObject(stored.key, 2).catch((e: Error) => e.message)).toMatch(/larger than 2 bytes/);

    await storage.deleteObject(stored.key);
    expect((await serve(stored.key)).status).toBe(404);
  });

  it('copies and deletes by prefix, as the backfills and the account purge ask R2 to', async () => {
    const storage = new LocalStorageProvider();
    const a = await storage.uploadObject(intent, new Uint8Array([1]));
    const b = await storage.uploadObject({ ...intent, kind: 'video', filename: 'clip.mp4' }, new Uint8Array([2]));
    await storage.copyObject(a.key, 'image/2026-01/copy.webp');
    expect(await storage.getObject('image/2026-01/copy.webp', 10)).toEqual(new Uint8Array([1]));
    expect(await storage.deletePrefix('image/')).toBe(2);
    expect(await storage.getObject(a.key, 10)).toBeNull();
    expect(await storage.getObject(b.key, 10)).toEqual(new Uint8Array([2]));
  });

  it('serves nothing outside its folder, nothing it would not store, and nothing at all without the emulators', async () => {
    const stored = await new LocalStorageProvider().uploadObject(intent, new Uint8Array([1]));
    for (const key of ['../secret.webp', 'image/../../etc/passwd.webp', 'image//x.webp', 'image/2026-10/x.txt', 'image/2026-10/missing.webp']) {
      const res = await serve(key);
      expect(res.status, key).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_EMULATOR', '');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
    expect((await serve(stored.key)).status).toBe(404);
  });
});
