import type { IStorageProvider } from './interfaces';
import { againstEmulators, LocalStorageProvider } from './local';
import { R2StorageProvider } from './r2';

/** R2 — or, against the emulators without R2 (`npm run dev:emulator` blanks it), a folder on this machine. */
export function getStorageProvider(): IStorageProvider {
  if (!process.env.R2_ENDPOINT && againstEmulators()) return new LocalStorageProvider();
  return new R2StorageProvider();
}

export type * from './types';
export type * from './interfaces';
