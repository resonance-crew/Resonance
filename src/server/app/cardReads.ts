import { ApiFailure } from '@/lib/api/v1/http';
import type { ServerCtx } from '@/server/ctx';
import { DAY_MS } from '@/server/domain/reading';
import { docIdOk, readDay } from '@/server/domain/taps';

// A card's readCount (one per reader, card and UTC day) as an application
// service. Why each check: the module comment of src/lib/api/v1/cardReads.ts
// (the legacy facade).

/** See src/lib/api/v1/cardReads.ts `countCardRead`. */
export async function countCardReadIn(ctx: ServerCtx, viewerId: string, cardId: string, now = ctx.clock.now()): Promise<boolean> {
  if (!docIdOk(viewerId) || !docIdOk(cardId)) return false;
  const taps = ctx.data.taps;
  const card = await taps.readCard(cardId);
  if (!card) return false;
  if (card.authorId === viewerId || !card.publishedAt || card.trashedAt != null) return false;
  if (!(await taps.canView(card, viewerId))) return false;
  if (card.anonymous !== true && (await taps.blockedEitherWay(viewerId, card.authorId))) return false;

  const day = readDay(now);
  // Already counted today: nothing written, nothing spent.
  if ((await taps.readMarkDay(viewerId, cardId)) === day) return false;
  try {
    await ctx.limits.spend(viewerId, 'read', 1, now);
  } catch (err) {
    // Over budget the read goes uncounted, quietly: a 429 here, and not on the next card, would say this one
    // was readable and not yet counted.
    if (err instanceof ApiFailure && err.code === 'rate_limited') return false;
    throw err;
  }

  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  return ctx.uow.run(
    async (tx) => {
      // A second tab racing this one, or the card gone or trashed meanwhile: nothing written.
      if ((await tx.taps.insertReadDayIfAbsent(viewerId, cardId, day, new Date(dayStart + 2 * DAY_MS))) !== 'inserted') return false;
      tx.taps.incrementReadCount(cardId);
      return true;
    },
    { label: 'countCardRead' },
  );
}
