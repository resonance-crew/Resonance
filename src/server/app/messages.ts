import { ApiFailure } from '@/lib/api/v1/http';
import type { SetReactionInput } from '@/lib/api/v1/schemas';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import type { MessagePush } from '@/lib/push/chat';
import { runPool } from '@/lib/push/pool';
import type { ServerCtx } from '@/server/ctx';
import {
  NOTE_MESSAGE_KIND,
  QUOTES_IN_TRANSACTION,
  UNSEND_WINDOW_MS,
  UNSENT_COPY_KEEP_MS,
  otherInPair,
} from '@/server/domain/conversations';
import type { ConversationHead } from '@/server/ports/repos/conversations';
import { instantMillis, type Instant } from '@/server/ports/time';
import { noPenName } from './conversations';

// Reactions and unsending (round 16) as application services. Why: the
// module comment of src/lib/api/v1/messageActions.ts (the legacy facades).

const notFound = () => new ApiFailure('not_found', 'No such message.');

const participates = (convo: ConversationHead | null, uid: string) => !!convo?.participants?.includes(uid);

/** See src/lib/api/v1/messageActions.ts `setReaction`. */
export async function setReactionIn(ctx: ServerCtx, uid: string, pair: string, messageId: string, input: SetReactionInput): Promise<void> {
  const other = otherInPair(pair, uid);
  if (!other || isReservedId(messageId)) throw notFound();
  await ctx.uow.run(
    async ({ conversations: tx }) => {
      const [convo, message, me, blockOut, blockIn, connection] = await Promise.all([
        tx.getConversation(pair),
        tx.getMessage(pair, messageId),
        tx.getSpeaker(uid),
        tx.blocks(uid, other),
        tx.blocks(other, uid),
        tx.connected(uid, other),
      ]);
      if (!participates(convo, uid) || !message || message.unsent) throw notFound();
      if (!me.penName) throw noPenName();
      if (blockOut || blockIn) throw new ApiFailure('blocked', 'You cannot react to this message.');
      if (!connection) throw new ApiFailure('forbidden', 'You can react once you are connected.');
      if (message.reactions[uid] === input.reaction) return;
      tx.setReaction(pair, messageId, uid, input.reaction);
    },
    { label: 'setReaction' },
  );
}

/** See src/lib/api/v1/messageActions.ts `removeReaction`. */
export async function removeReactionIn(ctx: ServerCtx, uid: string, pair: string, messageId: string): Promise<void> {
  const other = otherInPair(pair, uid);
  if (!other || isReservedId(messageId)) throw notFound();
  await ctx.uow.run(
    async ({ conversations: tx }) => {
      const [convo, message] = await Promise.all([tx.getConversation(pair), tx.getMessage(pair, messageId)]);
      if (!participates(convo, uid) || !message) throw notFound();
      if (message.reactions[uid] === undefined) return;
      tx.setReaction(pair, messageId, uid, null);
    },
    { label: 'removeReaction' },
  );
}

export interface UnsentMessage {
  /** What `pushUnsend` needs after the response — null when the message was unsent already (nothing new to tell). */
  push: MessagePush | null;
}

/** See src/lib/api/v1/messageActions.ts `unsendMessage`. */
export async function unsendMessageIn(ctx: ServerCtx, uid: string, pair: string, messageId: string, now = ctx.clock.now()): Promise<UnsentMessage> {
  const other = otherInPair(pair, uid);
  if (!other || isReservedId(messageId)) throw notFound();

  const done = await ctx.uow.run(
    async ({ conversations: tx }) => {
      const [message, convo, quotes] = await Promise.all([
        tx.getMessage(pair, messageId),
        tx.getConversation(pair),
        tx.quotesOf(pair, messageId, QUOTES_IN_TRANSACTION),
      ]);
      if (!message || message.senderId !== uid || !participates(convo, uid)) throw notFound();
      if (message.kind === NOTE_MESSAGE_KIND) throw new ApiFailure('invalid_request', "A note can't be unsent.");
      if (message.unsent) return { unsent: false, more: false };
      const sentAt = message.sentAt;
      if (!sentAt || now - instantMillis(sentAt) > UNSEND_WINDOW_MS) {
        throw new ApiFailure('conflict', 'This message can no longer be unsent.');
      }

      const at = ctx.clock.date();
      tx.unsendMessage(pair, messageId, uid, sentAt, at);
      for (const quote of quotes) tx.emptyQuote(pair, quote, messageId, uid);
      // The preview names no message: it is this one when it was written with it (the same commit's time, same sender).
      const last = convo!.lastMessage;
      if (last && last.senderId === uid && last.sentAt === sentAt) tx.previewUnsent(pair, uid, sentAt);
      tx.putUnsentCopy(
        {
          pair,
          messageId,
          senderId: uid,
          to: other,
          ...(typeof message.text === 'string' && message.text ? { text: message.text } : {}),
          ...(message.cardRef ? { cardRef: message.cardRef } : {}),
          ...(message.noteRef ? { noteRef: message.noteRef } : {}),
          ...(message.image ? { image: message.image } : {}),
          ...(message.sticker ? { sticker: message.sticker } : {}),
          ...(message.album ? { album: message.album } : {}),
          sentAt,
        },
        at,
      );
      return { unsent: true, more: quotes.length >= QUOTES_IN_TRANSACTION };
    },
    { label: 'unsendMessage' },
  );

  if (!done.unsent) return { push: null };
  // A message quoted more often than one transaction writes: the rest right after it.
  if (done.more) await emptyQuotes(ctx, pair, messageId, uid);
  return { push: { conversationId: pair, messageId, from: uid, to: other } };
}

/** Every quote of the unsent message still holding its words, page by page. */
async function emptyQuotes(ctx: ServerCtx, pair: string, messageId: string, senderId: string): Promise<void> {
  const repo = ctx.data.conversations;
  let after: string | null = null;
  for (;;) {
    const page = await repo.quotesPage(pair, messageId, QUOTES_IN_TRANSACTION, after);
    const due = page.filter((q) => !q.emptied).map((q) => q.id);
    if (due.length) await repo.emptyQuotes(pair, due, messageId, senderId);
    if (page.length < QUOTES_IN_TRANSACTION) return;
    after = page[page.length - 1].id;
  }
}

const iso = (t: Instant | null): string | null => (t ? new Date(instantMillis(t)).toISOString() : null);

/** See src/lib/api/v1/messageActions.ts `unsentCopiesFor`. */
export async function unsentCopiesIn(ctx: ServerCtx, pair: string, now = ctx.clock.now()) {
  const kept = await ctx.data.conversations.unsentCopiesOf(pair);
  return kept
    .filter((d) => d.unsentAt !== null && now - instantMillis(d.unsentAt) <= UNSENT_COPY_KEEP_MS)
    .sort((a, b) => (a.sentAt ? instantMillis(a.sentAt) : 0) - (b.sentAt ? instantMillis(b.sentAt) : 0))
    .map((d) => ({
      id: String(d.messageId ?? ''),
      senderId: String(d.senderId ?? ''),
      text: typeof d.text === 'string' ? d.text : '',
      sentAt: iso(d.sentAt),
      unsentAt: iso(d.unsentAt),
      ...(typeof d.cardRef === 'string' ? { cardRef: d.cardRef } : {}),
      ...(d.noteRef && typeof d.noteRef === 'object' ? { noteRef: d.noteRef } : {}),
      // Its picture: `npm run moderation picture <id>` opens it (kept with the copy).
      ...(d.image ? { image: d.image } : {}),
      ...(d.album ? { album: d.album } : {}),
      ...(d.sticker ? { sticker: d.sticker } : {}),
      unsent: true as const,
    }));
}

export interface UnsentCopyPurge {
  deleted: number;
  failed: number;
}

/** How many copies a page of the purge reads. */
const COPY_PAGE = 100;
/** How many of a page's copies are deleted at once (each its picture's files, then a batch). */
const COPY_CONCURRENCY = 4;

const filesOf = (picture: { key: unknown; thumbKey: unknown }) =>
  [picture.key, picture.thumbKey].filter((k): k is string => typeof k === 'string' && k.length > 0);

/** See src/lib/api/v1/messageActions.ts `purgeUnsentCopies` (the store: ctx.chatObjects). */
export async function purgeUnsentCopiesIn(
  ctx: ServerCtx,
  { now = ctx.clock.now(), deadline = Infinity, clock = () => ctx.clock.now() }: { now?: number; deadline?: number; clock?: () => number } = {},
): Promise<UnsentCopyPurge> {
  const repo = ctx.data.conversations;
  const store = ctx.chatObjects;
  const cutoff = new Date(now - UNSENT_COPY_KEEP_MS);
  let deleted = 0;
  let failed = 0;
  let after: { t: Instant; id: string } | null = null;
  for (;;) {
    // Past the ones that failed: one that keeps failing never pins the head.
    const due = await repo.dueUnsentCopies(cutoff, COPY_PAGE, after);
    const late = () => clock() > deadline;
    await runPool(
      due,
      COPY_CONCURRENCY,
      async (d) => {
        try {
          const picture = d.image ? await repo.getChatImage(d.image.id) : null;
          // Only the picture this message carried (its record names it), never another message's.
          const ours = !!picture && picture.messageId === d.messageId && picture.pair === d.pair;
          if (ours && store) {
            const results = await Promise.allSettled(filesOf(picture).map((key) => store.delete(key)));
            if (results.some((r) => r.status === 'rejected')) ctx.log.error(`[unsent] files of picture ${picture.id} not deleted`);
          }
          // Without the store its files can't go: the record stays for the account purge, never naming files that are gone.
          await repo.deleteUnsentCopy(d.id, ours && store ? picture.id : null);
          deleted++;
        } catch (err) {
          failed++;
          ctx.log.error(`[unsent] copy ${d.id} not purged`, err);
        }
      },
      { stop: late, tag: '[unsent]' },
    );
    if (due.length < COPY_PAGE || late()) return { deleted, failed };
    const last = due[due.length - 1];
    after = last.unsentAt ? { t: last.unsentAt, id: last.id } : null;
    if (!after) return { deleted, failed };
  }
}
