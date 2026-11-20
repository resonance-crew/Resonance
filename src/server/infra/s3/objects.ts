import type { ObjectStore, PrivateObjectStore } from '@/server/ports/objects';
import { lazyAsync, notWired } from '../wiring';

/**
 * The public bucket: src/lib/storage's getStorageProvider() (R2, or a folder
 * on this machine against the emulators), loaded on first use so a context
 * pulls in no S3 SDK until a picture is stored. The storage lane moves it here.
 */
export function publicObjectStore(): ObjectStore {
  return lazyAsync<ObjectStore>(async () => (await import('@/lib/storage')).getStorageProvider());
}

/**
 * Not wired yet: whether the chat bucket exists (null) is decided by
 * src/lib/storage/chatImages getChatImageStore(), which the storage lane
 * moves here; until then the chat routes use it directly, as before.
 */
export function chatObjectStore(): PrivateObjectStore | null {
  return notWired<PrivateObjectStore>('chatObjects');
}
