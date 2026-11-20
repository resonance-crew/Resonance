import type { CardEvents } from '@/lib/recommend/weights';
import type { ServerCtx } from '@/server/ctx';
import type { ReaderActivity } from '@/server/ports/repos/recommend';

/**
 * What a reader did, read for their own picks (round 26 §A3): the cards they
 * wrote, replied to with a card, left a note on (that one was sent — the
 * text is never read), tapped 共振, saved, read (lib/api/v1/reading's
 * records), and were shown in their picks. Each describes the reader's own
 * taste; none is counted across readers or lifts a card for anyone else.
 * Signals on an anonymous card feed only the reader's content taste: the
 * author boost counts named originals only (safety.md).
 */

/** How many of each kind are read (the newest are what the taste keeps anyway). */
export const EVENTS_READ = 300;

const idOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/');
const finite = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
/** The latest of two times (null: neither). */
const latest = (a: number | undefined, b: number | null) => (b === null ? a : a === undefined ? b : Math.max(a, b));

/** Everything the reader did, by card (lib/recommend/weights CardEvents). Pure. */
export function eventsOf(activity: ReaderActivity): CardEvents[] {
  const byCard = new Map<string, CardEvents>();
  const of = (cardId: string) => {
    const e = byCard.get(cardId) ?? { cardId };
    byCard.set(cardId, e);
    return e;
  };
  for (const d of activity.own) {
    const at = d.publishedAt;
    if (at === null || d.trashed) continue;
    of(d.id).wrote = at;
    const ref = d.referenceCardId;
    if (idOk(ref)) of(ref).replied = latest(of(ref).replied, at);
  }
  for (const d of activity.notes) {
    if (idOk(d.cardId)) of(d.cardId).noted = latest(of(d.cardId).noted, d.createdAt ?? 0);
  }
  for (const d of activity.taps) {
    if (!idOk(d.cardId)) continue;
    of(d.cardId).tappedEver = true;
    if (d.on) of(d.cardId).tapped = d.at ?? 0;
  }
  for (const d of activity.saved) {
    const cardId = d.cardId ?? d.id;
    if (idOk(cardId)) of(cardId).saved = d.createdAt ?? 0;
  }
  for (const d of activity.reading) {
    if (!idOk(d.cardId) || d.lastAt === null) continue;
    const expected = d.expectedSeconds;
    of(d.cardId).reading = {
      lastAt: d.lastAt,
      reachedEndAt: d.reachedEndAt,
      rereads: Math.max(0, Math.floor(finite(d.rereads))),
      rereadAt: d.rereadAt,
      shared: d.shared,
      activeSeconds: Math.max(0, finite(d.activeSeconds)),
      maxProgress: Math.min(1, Math.max(0, finite(d.maxProgress))),
      expectedSeconds: typeof expected === 'number' && Number.isFinite(expected) && expected > 0 ? expected : null,
    };
  }
  for (const [cardId, shown] of Object.entries(activity.shown)) of(cardId).shown = shown;
  return [...byCard.values()];
}

/** Everything `uid` did, by card, and the shown counts their picks keep. Reads only the fields it needs, never a note's text nor a story. */
export async function readerEventsIn(ctx: ServerCtx, uid: string): Promise<CardEvents[]> {
  return eventsOf(await ctx.data.recommend.readerActivity(uid, EVENTS_READ));
}

/** Whose named public cards the reader is connected with (their connections' uids). */
export function connectionIdsIn(ctx: ServerCtx, uid: string): Promise<string[]> {
  return ctx.data.recommend.connectionIds(uid);
}

/**
 * The light author boost's signal: authors whose cards this reader has
 * *responded to* by writing a card (a card with `referenceCardId`) — a
 * costly, deliberate act. A light lift for their other named cards (+0.15 in
 * the funnel), never a card's standing for anyone else.
 *
 * Only a resonance that reaches its original counts — published, public and
 * under the reader's name, as the original's list shows it: a draft or a
 * hidden one is nothing its author was ever shown, and would let a reader
 * point the boost at anyone they like to see what it lifts. And only a named
 * original: an anonymous card's author is no one's to know, and a boost would
 * point at them.
 */
export function engagedAuthorIdsIn(ctx: ServerCtx, uid: string): Promise<Set<string>> {
  return ctx.data.recommend.engagedAuthorIds(uid);
}

/**
 * Which of these cards are under their author's name, read as they are now
 * (the anonymity field alone, one batch): only those may be lifted for being
 * by an author the reader answered — lifting an anonymous one would say who
 * wrote it. A card gone, or one that can't be read, is left out.
 */
export function namedCardIdsIn(ctx: ServerCtx, cardIds: string[]): Promise<Set<string>> {
  return ctx.data.recommend.namedCardIds(cardIds);
}
