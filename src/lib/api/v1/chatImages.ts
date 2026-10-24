import { Timestamp, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { ChatImageStore } from '@/lib/storage/chatImages';
import { ApiFailure } from './http';

/**
 * Pictures sent in chat (POST /api/v1/chat-images — ./chatImageUpload — then
 * a message naming it). Each is `chatImages/{id}` — server-only — beside its two files in the
 * chat store (lib/storage/chatImages): as kept (≤ 2048 px) and as a thread
 * draws it (≤ 960 px), both WebP re-encoded from the upload with no metadata.
 *
 * `{ senderId, pair, key, thumbKey, width, height, bytes, animated, createdAt }`
 * and, until a message carries it, `unsent: true`; then `messageId`. A
 * picture belongs to one conversation and one message: only its sender may
 * send it, only there, only once (a resend of that message is that message).
 * It is read by the two people of its conversation while that message is
 * there — a conversation deleted takes its pictures with it, as far as anyone
 * can tell; the files themselves go with the sender's account, or with the
 * other person's (lib/account/deletion). One never sent goes after a day
 * (purgeUnsentChatImages).
 */
export const CHAT_IMAGES = 'chatImages';

/** How long an uploaded picture waits for its message before it is deleted. */
export const UNSENT_KEEP_MS = 24 * 60 * 60 * 1000;

/** What a message keeps of the picture it carries (its document's `image`). */
export interface MessageImage {
  id: string;
  width: number;
  height: number;
}

export const chatImageRef = (db: Firestore, id: string) => db.collection(CHAT_IMAGES).doc(id);

/**
 * What sendMessage keeps of the picture a message names, read in its
 * transaction: this sender's, for this conversation, and not sent in another
 * message — else one 400 for all of it (whose pictures exist is no one's to
 * learn). `messageId` is the message being written: its own resend finds it
 * already carrying the picture.
 */
export function pictureToSend(picture: DocumentSnapshot, uid: string, pair: string, messageId: string): MessageImage {
  const sent = picture.get('messageId');
  if (
    !picture.exists ||
    picture.get('senderId') !== uid ||
    picture.get('pair') !== pair ||
    (picture.get('unsent') !== true && sent !== messageId)
  ) {
    throw new ApiFailure('invalid_request', 'That is not a picture you can send here.');
  }
  return { id: picture.id, width: Number(picture.get('width')), height: Number(picture.get('height')) };
}

/** The message's `image`, as it was stored — or null for a message without one. */
export function messageImageOf(value: unknown): MessageImage | null {
  const image = value as { id?: unknown; width?: unknown; height?: unknown } | null | undefined;
  if (!image || typeof image !== 'object' || typeof image.id !== 'string' || !image.id) return null;
  const width = Number(image.width);
  const height = Number(image.height);
  return { id: image.id, width: Number.isFinite(width) ? width : 0, height: Number.isFinite(height) ? height : 0 };
}

/**
 * A sent picture's bytes for `uid` — `thumb` the thread's size, else as kept —
 * or null for anything they may not read: no such picture, never sent, not
 * in a conversation of theirs, or its message gone (a deleted conversation).
 * Never says which.
 */
export async function readChatImage(
  db: Firestore,
  store: ChatImageStore,
  uid: string,
  id: string,
  size: 'full' | 'thumb',
): Promise<Uint8Array | null> {
  if (isReservedId(id)) return null;
  const picture = await chatImageRef(db, id).get();
  const pair = picture.get('pair');
  const messageId = picture.get('messageId');
  if (!picture.exists || typeof pair !== 'string' || typeof messageId !== 'string' || isReservedId(messageId)) return null;
  const [convo, message] = await Promise.all([
    db.doc(`conversations/${pair}`).get(),
    db.doc(`conversations/${pair}/messages/${messageId}`).get(),
  ]);
  const participants = convo.get('participants');
  if (!convo.exists || !Array.isArray(participants) || !participants.includes(uid)) return null;
  if (!message.exists || messageImageOf(message.get('image'))?.id !== id) return null;
  const key = picture.get(size === 'thumb' ? 'thumbKey' : 'key');
  return typeof key === 'string' ? store.get(key) : null;
}

/** The files of the pictures these records name (both sizes). */
export function chatImageFiles(docs: DocumentSnapshot[]): string[] {
  return docs.flatMap((d) => [d.get('key'), d.get('thumbKey')].filter((k): k is string => typeof k === 'string' && k.length > 0));
}

export interface UnsentPurge {
  deleted: number;
  failed: number;
}

/**
 * Deletes the pictures uploaded more than UNSENT_KEEP_MS ago that no message
 * carries (a picture picked and never sent, a send refused after its upload):
 * each record only while it is still unsent — one sent meanwhile stays — then
 * its files. Starts none past `deadline`.
 */
export async function purgeUnsentChatImages(
  db: Firestore,
  store: ChatImageStore,
  { now = Date.now(), deadline = Infinity, clock = Date.now }: { now?: number; deadline?: number; clock?: () => number } = {},
): Promise<UnsentPurge> {
  const cutoff = now - UNSENT_KEEP_MS;
  // Few at any time (sent pictures leave this query): no index beyond the field's own.
  const unsent = await db.collection(CHAT_IMAGES).where('unsent', '==', true).limit(500).get();
  let deleted = 0;
  let failed = 0;
  for (const d of unsent.docs) {
    if (clock() > deadline) break;
    const at = d.get('createdAt');
    if (!(at instanceof Timestamp) || at.toMillis() > cutoff) continue;
    try {
      const gone = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(d.ref);
        if (!fresh.exists || fresh.get('unsent') !== true) return false;
        tx.delete(d.ref);
        return true;
      });
      if (!gone) continue;
      // The record went first, so no message can take the picture now; its files follow (best effort).
      const results = await Promise.allSettled(chatImageFiles([d]).map((key) => store.delete(key)));
      if (results.some((r) => r.status === 'rejected')) console.error(`[chatImages] files of ${d.id} not deleted`);
      deleted++;
    } catch (err) {
      failed++;
      console.error(`[chatImages] unsent ${d.id} not purged`, err);
    }
  }
  return { deleted, failed };
}
