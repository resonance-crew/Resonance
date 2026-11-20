import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IStorageProvider } from '@/lib/storage/interfaces';
import type { PrivateObjectStore } from '@/server/ports/objects';
import { againstEmulators, LocalChatImages, LocalStorageProvider } from './local';
import { R2ChatImages, R2StorageProvider, r2Client } from './r2';

// Which store the environment names. src/lib/storage's getStorageProvider()
// and getChatImageStore() answer these; the context's adapters (./objects)
// reach them through those, so a suite that mocks them is obeyed.

/** R2 — or, against the emulators without R2 (`npm run dev:emulator` blanks it), a folder on this machine. */
export function storageProviderFromEnv(): IStorageProvider {
  if (!process.env.R2_ENDPOINT && againstEmulators()) return new LocalStorageProvider();
  return new R2StorageProvider();
}

/** Whether the environment sets up a chat store at all (what getChatImageStore answers null for, when not). */
export function chatImageStoreConfigured(): boolean {
  return !!(process.env.R2_CHAT_BUCKET && process.env.R2_ENDPOINT) || againstEmulators();
}

/**
 * The store chat pictures go to, or null when none is set up (production
 * without R2_CHAT_BUCKET: pictures can't be sent, and the routes say so).
 * The bucket may have keys of its own (R2_CHAT_ACCESS_KEY_ID /
 * R2_CHAT_SECRET_ACCESS_KEY); otherwise the account's R2 keys must reach it.
 * Against the emulators, a folder (EMULATOR_CHAT_IMAGES_DIR, else one in the temp dir).
 */
export function chatImageStoreFromEnv(): PrivateObjectStore | null {
  const bucket = process.env.R2_CHAT_BUCKET;
  if (bucket && process.env.R2_ENDPOINT) {
    const id = process.env.R2_CHAT_ACCESS_KEY_ID;
    const secret = process.env.R2_CHAT_SECRET_ACCESS_KEY;
    return new R2ChatImages(r2Client(id && secret ? { accessKeyId: id, secretAccessKey: secret } : undefined), bucket);
  }
  if (againstEmulators()) {
    return new LocalChatImages(process.env.EMULATOR_CHAT_IMAGES_DIR || join(tmpdir(), 'resonance-emulator-chat-images'));
  }
  return null;
}
