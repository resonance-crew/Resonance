import type { IStorageProvider } from '@/lib/storage/interfaces';

/**
 * The public bucket (covers, avatars, illustrations): src/lib/storage's
 * IStorageProvider without `createPresignedUpload` (nothing calls it) and
 * without `getPublicUrl` (a URL is MediaUrlResolver's), so every method is
 * asynchronous and the adapter may load its SDK on first use. Phase 3 adds
 * `list(prefix, cursor)` and `head(key)` for the migration's checks.
 */
export type ObjectStore = Omit<IStorageProvider, 'createPresignedUpload' | 'getPublicUrl'>;

/**
 * The private bucket chat pictures live in (src/lib/storage/chatImages.ts
 * ChatImageStore, the same shape): no public address, read only through the
 * route that asks who is reading.
 */
export interface PrivateObjectStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The object's bytes; null when there is no such object. */
  get(key: string): Promise<Uint8Array | null>;
  /** The bytes as they arrive; null when there is no such object. */
  stream?(key: string): Promise<ReadableStream<Uint8Array> | null>;
  /** Removes it (one already gone is no error). */
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
}
