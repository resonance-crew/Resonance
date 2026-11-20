import type { ObjectStore } from '@/server/ports/objects';

/**
 * The public bucket as src/lib knows it: the middle layer's ObjectStore
 * (src/server/ports/objects.ts, where each method is described) and the
 * public URL of a key on the current base. Adapters: src/server/infra/s3
 * (R2, and the emulators' folder).
 */
export interface IStorageProvider extends ObjectStore {
  getPublicUrl(key: string): string;
}
