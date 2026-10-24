import { FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { chatImageKeys, type ChatImageStore } from '@/lib/storage/chatImages';
import { normalizeUpload, UnsupportedImage } from '@/lib/storage/image';
import { CHAT_IMAGES, chatImageRef } from './chatImages';
import { mayMessage, pairOf } from './conversations';
import { ApiFailure } from './http';

/** POST /api/v1/chat-images's answer: the picture's id and its size as kept. */
export interface UploadedChatImage {
  id: string;
  width: number;
  height: number;
}

/** The same picture uploaded again (its clientId): what was kept answers, if it is this sender's for this conversation. */
function resent(existing: DocumentSnapshot, uid: string, pair: string): UploadedChatImage {
  if (existing.get('senderId') !== uid || existing.get('pair') !== pair) throw new ApiFailure('invalid_request', 'Not a valid client id.');
  return { id: existing.id, width: Number(existing.get('width')), height: Number(existing.get('height')) };
}

/**
 * The picture a resend names, if it was kept already (its clientId) — asked
 * before anything is spent, so the outbox's retries of a picture the server
 * has cost nothing; null when there is none yet.
 */
export async function keptChatImage(db: Firestore, uid: string, to: string, clientId: string): Promise<UploadedChatImage | null> {
  if (isReservedId(clientId) || isReservedId(to)) return null;
  const existing = await chatImageRef(db, clientId).get();
  return existing.exists ? resent(existing, uid, pairOf(uid, to)) : null;
}

/**
 * Keeps a picture `uid` is about to send `to`: refused for someone they may
 * not message, re-encoded (upright, metadata gone; the thread's size made
 * from the kept one, not the upload, so the upload is decoded once), stored,
 * and recorded unsent (`unsentAt`). A `clientId` becomes its id, so an upload
 * sent again after a lost answer finds the picture already kept and stores
 * nothing. A record never names a file that isn't there, and no file is kept
 * without a record to find it by.
 */
export async function uploadChatImage(
  db: Firestore,
  store: ChatImageStore,
  uid: string,
  input: { to: string; clientId?: string | null; bytes: Uint8Array },
): Promise<UploadedChatImage> {
  if (input.clientId && isReservedId(input.clientId)) throw new ApiFailure('invalid_request', 'Not a valid client id.');
  // An id Firestore keeps for itself names no one to message.
  if (isReservedId(input.to)) throw new ApiFailure('forbidden', 'You can message people you are connected with.');
  const pair = pairOf(uid, input.to);
  const ref = input.clientId ? chatImageRef(db, input.clientId) : db.collection(CHAT_IMAGES).doc();
  if (input.clientId) {
    const existing = await ref.get();
    if (existing.exists) return resent(existing, uid, pair);
  }
  await mayMessage(db, uid, input.to);

  let full, thumb;
  try {
    full = await normalizeUpload(input.bytes, 'image');
    thumb = await normalizeUpload(full.data, 'thumb');
  } catch (e) {
    if (e instanceof UnsupportedImage) throw new ApiFailure('invalid_request', 'Not a picture that can be sent.');
    throw e;
  }
  const { key, thumbKey } = chatImageKeys();
  const forget = () => Promise.allSettled([store.delete(key), store.delete(thumbKey)]);
  const stored = await Promise.allSettled([store.put(key, full.data, full.contentType), store.put(thumbKey, thumb.data, thumb.contentType)]);
  const failed = stored.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) {
    // Both or neither: a file kept alone would have no record to find it by.
    await forget();
    throw failed.reason;
  }
  try {
    await ref.create({
      senderId: uid,
      to: input.to,
      pair,
      key,
      thumbKey,
      width: full.width,
      height: full.height,
      bytes: full.data.byteLength,
      animated: full.animated,
      unsentAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // The record may be there all the same — this one, written before its answer was lost (the SDK retries a
    // commit), or another upload's of the same picture at once. Its files are kept only for a record naming them.
    const kept = await ref.get().catch(() => null);
    if (kept?.exists && kept.get('key') === key) return { id: ref.id, width: full.width, height: full.height };
    await forget();
    if (kept?.exists) return resent(kept, uid, pair);
    throw e;
  }
  return { id: ref.id, width: full.width, height: full.height };
}
