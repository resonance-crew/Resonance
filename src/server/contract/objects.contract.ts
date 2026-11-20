import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ObjectStore, PrivateObjectStore } from '@/server/ports/objects';

// What every public-bucket adapter does (R2's own calls are pinned by
// src/lib/storage/r2.test.ts with the SDK faked): run on memory and on the
// emulators' folder. `make(pageKeys)` gives a fresh, empty store whose
// listing pages hold `pageKeys` keys.

const bytes = (...n: number[]) => new Uint8Array(n);
const md5 = (b: Uint8Array) => createHash('md5').update(b).digest('hex');

export function describeObjectStoreContract(name: string, make: (pageKeys: number) => Promise<ObjectStore> | ObjectStore) {
  describe(`ObjectStore contract: ${name}`, () => {
    it('stores under a fresh key that names no one, and reads it back within its size limit', async () => {
      const store = await make(1000);
      const stored = await store.uploadObject({ filename: 'a.webp', contentType: 'image/webp', size: 3, ownerId: 'alice', kind: 'image' }, bytes(1, 2, 3));
      expect(stored.key).toMatch(/^image\/\d{4}-\d{2}\/[0-9a-f-]{36}\.webp$/);
      expect(stored.key).not.toContain('alice');
      expect(stored.publicUrl.endsWith(`/${stored.key}`)).toBe(true);
      expect(await store.getObject(stored.key, 3)).toEqual(bytes(1, 2, 3));
      await expect(store.getObject(stored.key, 2)).rejects.toThrow('larger than 2 bytes');
      expect(await store.getObject('image/2026-11/none.webp', 10)).toBeNull();
    });

    it('heads an object without its bytes: size, MD5 as the tag of a single upload, its type; null when absent', async () => {
      const store = await make(1000);
      const body = bytes(9, 8, 7, 6);
      await store.putObject('image/2026-11/a.webp', 'image/webp', body);
      expect(await store.head('image/2026-11/a.webp')).toEqual({ size: 4, etag: md5(body), contentType: 'image/webp' });
      expect(await store.head('image/2026-11/gone.webp')).toBeNull();
    });

    it('lists a prefix in key order, a page at a time, the cursor going on where the page ended', async () => {
      const store = await make(2);
      for (const key of ['image/2026-11/c.webp', 'image/2026-11/a.webp', 'image/2026-10/b.webp', 'video/2026-11/d.mp4', 'image/2026-11/e.webp']) {
        await store.putObject(key, 'image/webp', bytes(1, 2));
      }
      const first = await store.list('image/');
      expect(first.objects.map((o) => o.key)).toEqual(['image/2026-10/b.webp', 'image/2026-11/a.webp']);
      expect(first.objects[0]).toEqual({ key: 'image/2026-10/b.webp', size: 2, etag: md5(bytes(1, 2)) });
      expect(first.cursor).not.toBeNull();
      const second = await store.list('image/', first.cursor);
      expect(second.objects.map((o) => o.key)).toEqual(['image/2026-11/c.webp', 'image/2026-11/e.webp']);
      expect(second.cursor).toBeNull();
      expect((await store.list('image/2026-11/')).objects.map((o) => o.key)).toEqual(['image/2026-11/a.webp', 'image/2026-11/c.webp']);
      expect(await store.list('nothing/')).toEqual({ objects: [], cursor: null });
    });

    it('copies, deletes one, many and a prefix — what is not there is nothing', async () => {
      const store = await make(1000);
      await store.putObject('image/u1/a.webp', 'image/webp', bytes(1));
      await store.putObject('image/u1/b.webp', 'image/webp', bytes(2));
      await store.putObject('image/u2/c.webp', 'image/webp', bytes(3));
      await store.copyObject('image/u1/a.webp', 'image/u3/a.webp');
      expect(await store.getObject('image/u3/a.webp', 10)).toEqual(bytes(1));

      await store.deleteObject('image/u3/a.webp');
      await store.deleteObject('image/u3/a.webp');
      expect(await store.head('image/u3/a.webp')).toBeNull();
      await store.deleteObjects(['image/u2/c.webp', 'image/u2/never.webp']);
      expect(await store.head('image/u2/c.webp')).toBeNull();
      expect(await store.deletePrefix('image/u1/')).toBe(2);
      expect(await store.deletePrefix('image/u1/')).toBe(0);
      expect((await store.list('')).objects).toEqual([]);
    });
  });
}

/** What every chat-bucket adapter does. */
export function describePrivateObjectStoreContract(name: string, make: () => Promise<PrivateObjectStore> | PrivateObjectStore) {
  describe(`PrivateObjectStore contract: ${name}`, () => {
    it('keeps bytes by key, streams them, and forgets them — one gone is no error', async () => {
      const store = await make();
      await store.put('chat/2026-11/a.webp', bytes(1, 2), 'image/webp');
      await store.put('chat/2026-11/a-thumb.webp', bytes(3), 'image/webp');
      expect(await store.get('chat/2026-11/a.webp')).toEqual(bytes(1, 2));
      const stream = await store.stream?.('chat/2026-11/a.webp');
      expect(stream && new Uint8Array(await new Response(stream).arrayBuffer())).toEqual(bytes(1, 2));
      expect(await store.get('chat/2026-11/none.webp')).toBeNull();
      expect((await store.stream?.('chat/2026-11/none.webp')) ?? null).toBeNull();
      await store.delete('chat/2026-11/a.webp');
      await store.delete('chat/2026-11/a.webp');
      expect(await store.get('chat/2026-11/a.webp')).toBeNull();
      await store.deleteMany(['chat/2026-11/a-thumb.webp', 'chat/2026-11/never.webp']);
      expect(await store.get('chat/2026-11/a-thumb.webp')).toBeNull();
    });
  });
}
