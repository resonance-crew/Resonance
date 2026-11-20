import { isReservedId } from '@/lib/db/firestore/reservedId';
import { runPool } from '@/lib/push/pool';
import type { ServerCtx } from '@/server/ctx';
import { PICTURE_ID, UNSENT_KEEP_MS } from '@/server/domain/conversations';
import type { PrivateObjectStore } from '@/server/ports/objects';
import type { ChatImageRecord } from '@/server/ports/repos/conversations';
import { instantMillis, type Instant } from '@/server/ports/time';

// Pictures sent in chat as application services: reading one, purging those
// never sent (keeping an upload: ./chatImageUpload, apart, so that only the
// upload's route loads the image codec — src/lib/links/sharpImports.test.ts).
// Why: the module comment of src/lib/api/v1/chatImages.ts (the legacy
// facades). The files are in ctx.chatObjects.

const noStore = () => new Error('The chat pictures’ store is not set up (R2_CHAT_BUCKET)');
export const store = (ctx: ServerCtx): PrivateObjectStore => {
  if (!ctx.chatObjects) throw noStore();
  return ctx.chatObjects;
};

/** The files of a picture's record (both sizes). */
export const chatImageFilesOf = (picture: Pick<ChatImageRecord, 'key' | 'thumbKey'>) =>
  [picture.key, picture.thumbKey].filter((k): k is string => typeof k === 'string' && k.length > 0);

/** See src/lib/api/v1/chatImages.ts `readChatImage`. */
export async function readChatImageIn(ctx: ServerCtx, uid: string, id: string, size: 'full' | 'thumb'): Promise<Uint8Array | null> {
  const files = store(ctx);
  return readChecked(ctx, uid, id, size, (key) => files.get(key), () => {});
}

/** See src/lib/api/v1/chatImages.ts `streamChatImage`. */
export async function streamChatImageIn(
  ctx: ServerCtx,
  uid: string,
  id: string,
  size: 'full' | 'thumb',
): Promise<ReadableStream<Uint8Array> | Uint8Array | null> {
  const files = store(ctx);
  return readChecked<ReadableStream<Uint8Array> | Uint8Array>(
    ctx,
    uid,
    id,
    size,
    (key) => (files.stream ? files.stream(key) : files.get(key)),
    (body) => {
      if (body instanceof ReadableStream) body.cancel().catch(() => {});
    },
  );
}

async function readChecked<T>(
  ctx: ServerCtx,
  uid: string,
  id: string,
  size: 'full' | 'thumb',
  open: (key: string) => Promise<T | null>,
  discard: (body: T) => void,
): Promise<T | null> {
  if (!PICTURE_ID.test(id) || isReservedId(id)) return null;
  const repo = ctx.data.conversations;
  const picture = await repo.getChatImage(id);
  const pair = picture?.pair;
  const messageId = picture?.messageId;
  if (!picture || typeof pair !== 'string' || typeof messageId !== 'string' || !PICTURE_ID.test(messageId) || isReservedId(messageId)) {
    return null;
  }
  // The file is fetched beside the checks below and handed out only once they pass (a refused request costs a
  // read of the store, nothing more).
  const key = size === 'thumb' ? picture.thumbKey : picture.key;
  const bytes = typeof key === 'string' ? open(key) : null;
  bytes?.catch(() => {});
  // Refused: whatever was opened is let go unread.
  const refuse = () => {
    bytes?.then((b) => b && discard(b), () => {});
    return null;
  };
  const [convo, message] = await Promise.all([repo.getConversation(pair), repo.getMessage(pair, messageId)]).catch((e: unknown) => {
    // A failed read lets the opened file go too, or its connection is held until it times out.
    refuse();
    throw e;
  });
  if (!convo || !convo.participants?.includes(uid)) return refuse();
  if (!message || message.image?.id !== id) return refuse();
  const sentAt = message.sentAt;
  const since = convo.createdAt;
  if (sentAt && since && instantMillis(sentAt) < instantMillis(since)) return refuse();
  return bytes;
}

export interface UnsentPurge {
  deleted: number;
  failed: number;
}

/** How many unsent pictures a page of the purge reads. */
const UNSENT_PAGE = 100;
/** How many of a page's pictures are deleted at once (each a transaction, then its two files). */
export const UNSENT_CONCURRENCY = 4;

/** See src/lib/api/v1/chatImages.ts `purgeUnsentChatImages` (the store: ctx.chatObjects). */
export async function purgeUnsentChatImagesIn(
  ctx: ServerCtx,
  { now = ctx.clock.now(), deadline = Infinity, clock = () => ctx.clock.now() }: { now?: number; deadline?: number; clock?: () => number } = {},
): Promise<UnsentPurge> {
  const files = store(ctx);
  const repo = ctx.data.conversations;
  const cutoff = new Date(now - UNSENT_KEEP_MS);
  let deleted = 0;
  let failed = 0;
  let after: { t: Instant; id: string } | null = null;
  for (;;) {
    // Past the ones that failed: one that keeps failing never pins the head.
    const unsent = await repo.dueUnsentChatImages(cutoff, UNSENT_PAGE, after);
    const late = () => clock() > deadline;
    await runPool(
      unsent,
      UNSENT_CONCURRENCY,
      async (d) => {
        try {
          const gone = await ctx.uow.run(
            async ({ conversations: tx }) => {
              const fresh = await tx.getChatImage(d.id);
              if (!fresh || !fresh.unsent) return false;
              tx.deleteChatImage(d.id);
              return true;
            },
            { label: 'purgeUnsentChatImage' },
          );
          if (!gone) return;
          // The record went first, so no message can take the picture now; its files follow (best effort).
          const results = await Promise.allSettled(chatImageFilesOf(d).map((key) => files.delete(key)));
          if (results.some((r) => r.status === 'rejected')) ctx.log.error(`[chatImages] files of ${d.id} not deleted`);
          deleted++;
        } catch (err) {
          failed++;
          ctx.log.error(`[chatImages] unsent ${d.id} not purged`, err);
        }
      },
      { stop: late, tag: '[chatImages]' },
    );
    if (unsent.length < UNSENT_PAGE || late()) return { deleted, failed };
    const last = unsent[unsent.length - 1];
    after = last.unsentAt ? { t: last.unsentAt, id: last.id } : null;
    if (!after) return { deleted, failed };
  }
}
