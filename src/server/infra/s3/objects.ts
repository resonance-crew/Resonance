import type { ObjectStore, PrivateObjectStore } from '@/server/ports/objects';
import { lazyAsync } from '../wiring';
import { chatImageStoreConfigured } from './fromEnv';

/**
 * The public bucket: src/lib/storage's getStorageProvider() (R2, or a folder
 * on this machine against the emulators: ./fromEnv), loaded on first use so
 * a context pulls in no S3 SDK until a picture is stored. Reached through
 * '@/lib/storage', the path unit tests mock.
 */
export function publicObjectStore(): ObjectStore {
  return lazyAsync<ObjectStore>(async () => (await import('@/lib/storage')).getStorageProvider());
}

/**
 * The chat pictures' private bucket, or null where the environment sets up
 * none (as getChatImageStore() answers null). Each call asks
 * src/lib/storage/chatImages getChatImageStore() for the store — as each
 * request does today, and the path the emulator suites mock with a folder of
 * their own — loading no SDK until a picture is stored or read.
 */
export function chatObjectStore(): PrivateObjectStore | null {
  if (!chatImageStoreConfigured()) return null;
  const store = async () => {
    const found = (await import('@/lib/storage/chatImages')).getChatImageStore();
    if (!found) throw new Error('The chat pictures’ store is not set up (R2_CHAT_BUCKET)');
    return found;
  };
  return {
    put: async (key, body, contentType) => (await store()).put(key, body, contentType),
    get: async (key) => (await store()).get(key),
    stream: async (key) => {
      const found = await store();
      if (found.stream) return found.stream(key);
      const bytes = await found.get(key);
      return bytes ? new Blob([bytes as Uint8Array<ArrayBuffer>]).stream() : null;
    },
    delete: async (key) => (await store()).delete(key),
    deleteMany: async (keys) => (await store()).deleteMany(keys),
  };
}
