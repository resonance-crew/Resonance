import { createHash } from 'node:crypto';
import type { MediaUrlResolver } from '@/server/ports/media';
import type { ObjectStore, PrivateObjectStore } from '@/server/ports/objects';
import type { StoredObject } from '@/lib/storage/types';
import { memoryMediaUrls } from '../env/media';
import { objectKey, PAGE_KEYS } from '../s3/keys';

interface Kept {
  body: Uint8Array;
  contentType: string;
}

/** The public bucket in memory, its objects inspectable (`objects`); URLs from `media` (memoryMediaUrls by default). */
export interface MemoryObjectStore extends ObjectStore {
  readonly objects: Map<string, Kept>;
}

const md5 = (bytes: Uint8Array) => createHash('md5').update(bytes).digest('hex');

export function memoryObjectStore(media: MediaUrlResolver = memoryMediaUrls(), pageKeys = PAGE_KEYS): MemoryObjectStore {
  const objects = new Map<string, Kept>();
  const put = (key: string, contentType: string, body: Uint8Array): StoredObject => {
    objects.set(key, { body: new Uint8Array(body), contentType });
    return { key, publicUrl: media.publicUrl(key) };
  };
  const sortedKeys = () => [...objects.keys()].sort();
  return {
    objects,
    uploadObject: async (intent, body) => put(objectKey(intent), intent.contentType, body),
    putObject: async (key, contentType, body) => put(key, contentType, body),
    async getObject(key, maxBytes) {
      const kept = objects.get(key);
      if (!kept) return null;
      if (kept.body.byteLength > maxBytes) throw new Error(`Object ${key} is larger than ${maxBytes} bytes`);
      return new Uint8Array(kept.body);
    },
    deleteObject: async (key) => void objects.delete(key),
    deleteObjects: async (keys) => keys.forEach((key) => objects.delete(key)),
    async copyObject(fromKey, toKey) {
      const kept = objects.get(fromKey);
      if (!kept) throw new Error(`No object ${fromKey}`);
      objects.set(toKey, { body: new Uint8Array(kept.body), contentType: kept.contentType });
    },
    async deletePrefix(prefix) {
      const keys = sortedKeys().filter((key) => key.startsWith(prefix));
      keys.forEach((key) => objects.delete(key));
      return keys.length;
    },
    async list(prefix, cursor) {
      const keys = sortedKeys().filter((key) => key.startsWith(prefix) && (!cursor || key > cursor));
      const page = keys.slice(0, pageKeys);
      return {
        objects: page.map((key) => ({ key, size: objects.get(key)!.body.byteLength, etag: md5(objects.get(key)!.body) })),
        cursor: keys.length > pageKeys ? page[page.length - 1] : null,
      };
    },
    async head(key) {
      const kept = objects.get(key);
      return kept ? { size: kept.body.byteLength, etag: md5(kept.body), contentType: kept.contentType } : null;
    },
  };
}

/** The chat bucket in memory, its objects inspectable. */
export interface MemoryPrivateObjectStore extends PrivateObjectStore {
  readonly objects: Map<string, Kept>;
}

export function memoryPrivateObjectStore(): MemoryPrivateObjectStore {
  const objects = new Map<string, Kept>();
  const get = (key: string) => {
    const kept = objects.get(key);
    return kept ? new Uint8Array(kept.body) : null;
  };
  return {
    objects,
    put: async (key, body, contentType) => void objects.set(key, { body: new Uint8Array(body), contentType }),
    get: async (key) => get(key),
    async stream(key) {
      const bytes = get(key);
      if (!bytes) return null;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },
    delete: async (key) => void objects.delete(key),
    deleteMany: async (keys) => keys.forEach((key) => objects.delete(key)),
  };
}
