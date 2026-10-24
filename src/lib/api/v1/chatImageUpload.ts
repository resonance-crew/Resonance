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
 * Keeps a picture `uid` is about to send `to`: refused for someone they may
 * not message, re-encoded (upright, metadata gone, two sizes), stored, and
 * recorded unsent. A `clientId` becomes its id, so an upload sent again after
 * a lost answer finds the picture already kept and stores nothing.
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
    [full, thumb] = await Promise.all([normalizeUpload(input.bytes, 'image'), normalizeUpload(input.bytes, 'thumb')]);
  } catch (e) {
    if (e instanceof UnsupportedImage) throw new ApiFailure('invalid_request', 'Not a picture that can be sent.');
    throw e;
  }
  const { key, thumbKey } = chatImageKeys();
  await Promise.all([store.put(key, full.data, full.contentType), store.put(thumbKey, thumb.data, thumb.contentType)]);
  try {
    await ref.create({
      senderId: uid,
      pair,
      key,
      thumbKey,
      width: full.width,
      height: full.height,
      bytes: full.data.byteLength,
      animated: full.animated,
      unsent: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // Never left behind with no record to find it by.
    await Promise.allSettled([store.delete(key), store.delete(thumbKey)]);
    // The same upload twice at once: the one kept answers both.
    if ((e as { code?: unknown }).code === 6) return resent(await ref.get(), uid, pair);
    throw e;
  }
  return { id: ref.id, width: full.width, height: full.height };
}
