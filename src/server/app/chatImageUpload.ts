import { ApiFailure } from '@/lib/api/v1/http';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { chatImageKeys } from '@/lib/storage/chatImages';
import { normalizeUploadWithThumb, UnsupportedImage } from '@/lib/storage/image';
import type { ServerCtx } from '@/server/ctx';
import { pairOf } from '@/server/domain/conversations';
import type { ChatImageRecord } from '@/server/ports/repos/conversations';
import { store } from './chatImages';
import { mayMessageIn } from './conversations';

// Keeping a picture to send in chat, as an application service. Why: the
// module comment of src/lib/api/v1/chatImageUpload.ts (the legacy facades).
// The files go to ctx.chatObjects.

/** POST /api/v1/chat-images's answer: the picture's id and its size as kept. */
export interface UploadedChatImage {
  id: string;
  width: number;
  height: number;
}

/** The same picture uploaded again (its clientId): what was kept answers, if it is this sender's for this conversation. */
function resent(existing: ChatImageRecord, uid: string, pair: string): UploadedChatImage {
  if (existing.senderId !== uid || existing.pair !== pair) throw new ApiFailure('invalid_request', 'Not a valid client id.');
  return { id: existing.id, width: Number(existing.width), height: Number(existing.height) };
}

/** See src/lib/api/v1/chatImageUpload.ts `keptChatImage`. */
export async function keptChatImageIn(ctx: ServerCtx, uid: string, to: string, clientId: string): Promise<UploadedChatImage | null> {
  if (isReservedId(clientId) || isReservedId(to)) return null;
  const existing = await ctx.data.conversations.getChatImage(clientId);
  return existing ? resent(existing, uid, pairOf(uid, to)) : null;
}

/** See src/lib/api/v1/chatImageUpload.ts `uploadChatImage` (the store: ctx.chatObjects). */
export async function uploadChatImageIn(
  ctx: ServerCtx,
  uid: string,
  input: { to: string; clientId?: string | null; bytes: Uint8Array },
  opts: { spent?: Promise<void>; resendAsked?: boolean } = {},
): Promise<UploadedChatImage> {
  const files = store(ctx);
  const repo = ctx.data.conversations;
  const pair = pairOf(uid, input.to);
  const id = input.clientId && !isReservedId(input.clientId) ? input.clientId : ctx.ids.id();
  const allowed = async (): Promise<UploadedChatImage | null> => {
    if (input.clientId && isReservedId(input.clientId)) throw new ApiFailure('invalid_request', 'Not a valid client id.');
    // An id Firestore keeps for itself names no one to message.
    if (isReservedId(input.to)) throw new ApiFailure('forbidden', 'You can message people you are connected with.');
    if (input.clientId && !opts.resendAsked) {
      const existing = await repo.getChatImage(id);
      if (existing) return resent(existing, uid, pair);
    }
    await mayMessageIn(ctx, uid, input.to);
    return null;
  };
  const [budget, gate] = await Promise.allSettled([opts.spent ?? Promise.resolve(), allowed()]);
  if (budget.status === 'rejected') throw budget.reason;
  if (gate.status === 'rejected') throw gate.reason;
  if (gate.value) return gate.value;

  let full, thumb;
  try {
    ({ full, thumb } = await normalizeUploadWithThumb(input.bytes));
  } catch (e) {
    if (e instanceof UnsupportedImage) throw new ApiFailure('invalid_request', 'Not a picture that can be sent.');
    throw e;
  }
  const { key, thumbKey } = chatImageKeys();
  const forget = () => Promise.allSettled([files.delete(key), files.delete(thumbKey)]);
  const stored = await Promise.allSettled([files.put(key, full.data, full.contentType), files.put(thumbKey, thumb.data, thumb.contentType)]);
  const failed = stored.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) {
    // Both or neither: a file kept alone would have no record to find it by.
    await forget();
    throw failed.reason;
  }
  let failure: unknown = null;
  const outcome = await repo
    .insertChatImageIfAbsent(
      id,
      { senderId: uid, to: input.to, pair, key, thumbKey, width: full.width, height: full.height, bytes: full.data.byteLength, animated: full.animated },
      ctx.clock.date(),
    )
    .catch((e: unknown) => {
      failure = e;
      return 'failed' as const;
    });
  if (outcome !== 'inserted') {
    // The record may be there all the same — this one, written before its answer was lost (the SDK retries a
    // commit), or another upload's of the same picture at once. Its files are kept only for a record naming them.
    const kept = await repo.getChatImage(id).catch(() => null);
    if (kept && kept.key === key) return { id, width: full.width, height: full.height };
    await forget();
    if (kept) return resent(kept, uid, pair);
    throw failure ?? new Error(`The picture's record ${id} could not be kept`);
  }
  return { id, width: full.width, height: full.height };
}

