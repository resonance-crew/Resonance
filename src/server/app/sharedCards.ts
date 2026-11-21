import { ApiFailure } from '@/lib/api/v1/http';
import type { Card } from '@/lib/db/types';
import type { ServerCtx } from '@/server/ctx';
import { idOk, keptPrivate, otherInPair, pairOf } from '@/server/domain/conversations';
import { threadChanged } from '@/server/domain/realtimeInbox';
import { instantMillis } from '@/server/ports/time';
import { signal } from './inbox';

// A 私人卡 shared in a conversation, as application services. Why: the module
// comment of src/lib/api/v1/sharedCards.ts (the legacy facades).

/** What sharedWith reads a card by: present's visibility fields. */
export type SharedCard = Pick<Card, 'id' | 'authorId' | 'anonymous' | 'trashedAt' | 'publishedAt' | 'visibility'>;

/** How many of an author's marked messages sharing the cards asked for are read (the same card sent again and again shares no more). */
const SENT_READ = 60;
/** Firestore's `in` takes at most 30 values. */
const IN_MAX = 30;
/** How many of the messages sharing a card one transaction unmarks (the same card sent more often: the next, right after). */
const UNMARK_IN_TRANSACTION = 400;

/** See src/lib/api/v1/sharedCards.ts `sharedAmong`. */
export async function sharedAmongIn<C extends SharedCard>(ctx: ServerCtx, viewerId: string, cards: C[]): Promise<Set<C>> {
  const shared = new Set<C>();
  if (!idOk(viewerId)) return shared;
  const repo = ctx.data.conversations;
  const candidates = cards.filter(
    (c) => idOk(c.id) && idOk(c.authorId) && c.authorId !== viewerId && c.trashedAt == null && c.anonymous !== true && keptPrivate(c),
  );
  const byAuthor = new Map<string, C[]>();
  for (const c of candidates) byAuthor.set(c.authorId, [...(byAuthor.get(c.authorId) ?? []), c]);
  await Promise.all(
    [...byAuthor].map(async ([author, theirs]) => {
      const ids = [...new Set(theirs.map((c) => c.id))].slice(0, IN_MAX);
      const pair = pairOf(viewerId, author);
      const [blockOut, blockIn, convo, sent] = await Promise.all([
        repo.blocks(viewerId, author),
        repo.blocks(author, viewerId),
        repo.getConversation(pair),
        repo.sharePasses(pair, author, ids, SENT_READ),
      ]);
      if (blockOut || blockIn || !convo) return;
      const participants = convo.participants;
      if (!participants || !participants.includes(viewerId) || !participants.includes(author)) return;
      // A message older than the conversation outlived its deletion (messages go before the conversation does):
      // it shares nothing once the two talk again, as its picture would show nothing (chatImages).
      const since = convo.createdAt;
      const passes = new Set(sent.filter((m) => !(m.sentAt && since && instantMillis(m.sentAt) < instantMillis(since))).map((m) => m.cardRef));
      for (const c of theirs) if (passes.has(c.id)) shared.add(c);
    }),
  );
  return shared;
}

/** See src/lib/api/v1/sharedCards.ts `wasSharedPrivately`. */
export async function wasSharedPrivatelyIn(ctx: ServerCtx, uid: string, cardId: string): Promise<boolean> {
  if (!idOk(cardId)) throw new ApiFailure('not_found', 'No such card.');
  const repo = ctx.data.conversations;
  const [card, sharedBy] = await Promise.all([repo.getCard(cardId), repo.privateShareAuthor(cardId)]);
  if (!card || card.authorId !== uid) throw new ApiFailure('not_found', 'No such card.');
  return sharedBy === uid;
}

/** See src/lib/api/v1/sharedCards.ts `stopSharing`. */
export async function stopSharingIn(ctx: ServerCtx, uid: string, pair: string, cardId: string): Promise<{ unmarked: number }> {
  const other = idOk(uid) ? otherInPair(pair, uid) : null;
  if (!other || !idOk(cardId)) throw new ApiFailure('not_found', 'No such conversation.');
  let unmarked = 0;
  for (;;) {
    const page = await ctx.uow.run(
      async ({ conversations: tx }) => {
        const [convo, sent] = await Promise.all([tx.getConversation(pair), tx.sharePassesOf(pair, uid, cardId, UNMARK_IN_TRANSACTION)]);
        if (!convo?.participants?.includes(uid)) throw new ApiFailure('not_found', 'No such conversation.');
        for (const id of sent) tx.unmarkShare(pair, id);
        return sent.length;
      },
      { label: 'stopSharing' },
    );
    unmarked += page;
    if (page < UNMARK_IN_TRANSACTION) {
      // After the commits: the thread both people see lost its passes.
      if (unmarked) await signal(ctx, threadChanged(pair, uid, other));
      return { unmarked };
    }
  }
}
