import type { ChatImageStore } from '@/lib/storage/chatImages';
import { purgeUnsentChatImagesIn, readChatImageIn, streamChatImageIn, type UnsentPurge } from '@/server/app/chatImages';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

/**
 * Pictures sent in chat (POST /api/v1/chat-images — ./chatImageUpload — then
 * a message naming it). Each is `chatImages/{id}` — server-only — beside its two files in the
 * chat store (lib/storage/chatImages): as kept (≤ 2048 px) and as a thread
 * draws it (≤ 960 px), both WebP re-encoded from the upload with no metadata.
 *
 * `{ senderId, to, pair, key, thumbKey, width, height, bytes, animated, createdAt }`
 * and, until a message carries it, `unsentAt` (when it was uploaded); then
 * `messageId`. A
 * picture belongs to one conversation and one message: only its sender may
 * send it, only there, only once (a resend of that message is that message).
 * It is read by the two people of its conversation while that message is
 * there — a conversation deleted takes its pictures with it, as far as anyone
 * can tell; the files themselves go with the sender's account, or with the
 * other person's (lib/account/deletion). One never sent goes after a day
 * (purgeUnsentChatImages).
 */

// Legacy facades: the services are src/server/app/chatImages.ts, their
// Firestore code src/server/infra/firestore/repos/conversations.ts.

export { CHAT_IMAGES, UNSENT_KEEP_MS, messageImageOf, type MessageImage } from '@/server/domain/conversations';
export { chatImageFiles, chatImageRef } from '@/server/infra/firestore/repos/conversations';
export { UNSENT_CONCURRENCY, type UnsentPurge } from '@/server/app/chatImages';

/**
 * A sent picture's bytes for `uid` — `thumb` the thread's size, else as kept —
 * or null for anything they may not read: no such picture, never sent, not
 * in a conversation of theirs, or its message gone (a deleted conversation) —
 * or older than the conversation it is in now (one that outlived its
 * conversation's deletion, the client deleting messages before the
 * conversation, is not shown again when the two talk again). Never says which.
 */
export async function readChatImage(db: AdminDb, store: ChatImageStore, uid: string, id: string, size: 'full' | 'thumb'): Promise<Uint8Array | null> {
  return readChatImageIn(ctxFor(db, { chatObjects: store }), uid, id, size);
}

/**
 * readChatImage's picture as a stream (B14), for the route to hand on as it
 * arrives — the same checks, the stream opened beside them and cancelled when
 * they refuse. A store that can't stream answers its bytes.
 */
export async function streamChatImage(
  db: AdminDb,
  store: ChatImageStore,
  uid: string,
  id: string,
  size: 'full' | 'thumb',
): Promise<ReadableStream<Uint8Array> | Uint8Array | null> {
  return streamChatImageIn(ctxFor(db, { chatObjects: store }), uid, id, size);
}

/**
 * Deletes the pictures uploaded more than UNSENT_KEEP_MS ago that no message
 * carries (a picture picked and never sent, a send refused after its upload),
 * the longest waiting first, page after page, UNSENT_CONCURRENCY at a time:
 * each record only while it is still unsent — one sent meanwhile stays —
 * then its files. Starts none past `deadline`.
 */
export async function purgeUnsentChatImages(
  db: AdminDb,
  store: ChatImageStore,
  opts: { now?: number; deadline?: number; clock?: () => number } = {},
): Promise<UnsentPurge> {
  return purgeUnsentChatImagesIn(ctxFor(db, { chatObjects: store }), { now: opts.now ?? Date.now(), deadline: opts.deadline, clock: opts.clock ?? Date.now });
}
