import { chatImageStoreFromEnv } from '@/server/infra/s3/fromEnv';
import type { PrivateObjectStore } from '@/server/ports/objects';

/**
 * Where pictures sent in chat are kept. Unlike covers and avatars — public
 * files on the image host — a chat picture is only ever read through GET
 * /api/v1/chat-images/{id}, which asks who is reading: so they live in a
 * bucket of their own with no public address (R2_CHAT_BUCKET), under keys no
 * client is told. The bucket may have keys of its own
 * (R2_CHAT_ACCESS_KEY_ID / R2_CHAT_SECRET_ACCESS_KEY); otherwise the
 * account's R2 keys must reach it.
 *
 * Against the emulators nothing real is touched: pictures go to a folder on
 * this machine (EMULATOR_CHAT_IMAGES_DIR, else one in the temp dir).
 *
 * The middle layer's PrivateObjectStore (src/server/ports/objects.ts);
 * adapters in src/server/infra/s3 (R2ChatImages, LocalChatImages).
 */
export type ChatImageStore = PrivateObjectStore;

export { LocalChatImages } from '@/server/infra/s3/local';

/** `chat/{yyyy-mm}/{uuid}.webp` and its `-thumb` — a fresh name that says nothing of who sent it, or to whom. */
export function chatImageKeys(now = new Date()): { key: string; thumbKey: string } {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const name = `chat/${month}/${crypto.randomUUID()}`;
  return { key: `${name}.webp`, thumbKey: `${name}-thumb.webp` };
}

/**
 * The store pictures go to, or null when none is set up (production without
 * R2_CHAT_BUCKET: pictures can't be sent, and the routes say so).
 */
export function getChatImageStore(): ChatImageStore | null {
  return chatImageStoreFromEnv();
}
