import { storageProviderFromEnv } from '@/server/infra/s3/fromEnv';
import type { IStorageProvider } from './interfaces';

/** R2 — or, against the emulators without R2 (`npm run dev:emulator` blanks it), a folder on this machine. */
export function getStorageProvider(): IStorageProvider {
  return storageProviderFromEnv();
}

export type * from './types';
export type * from './interfaces';
