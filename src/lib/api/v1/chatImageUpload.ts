import type { ChatImageStore } from '@/lib/storage/chatImages';
import { keptChatImageIn, uploadChatImageIn, type UploadedChatImage } from '@/server/app/chatImageUpload';
import { ctxFor } from '@/server/infra/firestore/ctx';
import type { AdminDb } from '@/server/infra/firestore/db';

// Legacy facades: the services are src/server/app/chatImages.ts, their
// Firestore code src/server/infra/firestore/repos/conversations.ts.

export type { UploadedChatImage } from '@/server/app/chatImageUpload';

/**
 * The picture a resend names, if it was kept already (its clientId) — asked
 * before anything is spent, so the outbox's retries of a picture the server
 * has cost nothing; null when there is none yet.
 */
export async function keptChatImage(db: AdminDb, uid: string, to: string, clientId: string): Promise<UploadedChatImage | null> {
  return keptChatImageIn(ctxFor(db), uid, to, clientId);
}

/**
 * Keeps a picture `uid` is about to send `to`: refused for someone they may
 * not message, re-encoded (upright, metadata gone; both sizes from one
 * opening of the upload, side by side), stored, and recorded unsent
 * (`unsentAt`). A `clientId` becomes its id, so an upload sent again after a
 * lost answer finds the picture already kept and stores nothing. A record
 * never names a file that isn't there, and no file is kept without a record
 * to find it by.
 *
 * `spent` is the sender's budget for it (the route's spendAll), asked beside
 * whether they may message `to`: its refusal (429) is the answer whatever
 * else is wrong, as when it was spent first, and nothing is decoded before
 * both are in. `resendAsked`: the caller has asked keptChatImage already.
 */
export async function uploadChatImage(
  db: AdminDb,
  store: ChatImageStore,
  uid: string,
  input: { to: string; clientId?: string | null; bytes: Uint8Array },
  opts: { spent?: Promise<void>; resendAsked?: boolean } = {},
): Promise<UploadedChatImage> {
  return uploadChatImageIn(ctxFor(db, { chatObjects: store }), uid, input, opts);
}
