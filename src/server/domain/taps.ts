import { isReservedId } from '@/lib/db/firestore/reservedId';

/**
 * The taps aggregate's pure policy and names: the resonance tap (共振), and
 * the day marker behind a card's read count. Why each is as it is:
 * src/lib/api/v1/taps.ts and cardReads.ts (their module comments); the
 * services are src/server/app/{taps,cardReads}.ts.
 */

/** `resonanceTaps/{cardId}_{uid}` = `{ cardId, userId, on, at, rangAt }`. */
export const TAPS = 'resonanceTaps';

/** `cardReads/{uid}_{cardId}` = `{ userId, cardId, day, expireAt }`. */
export const CARD_READS = 'cardReads';

/** How many people a page of the author's list holds. */
export const TAP_PAGE = 30;

/**
 * How many of a card's taps a reader's people are read from directly (src/server/app/taps.ts readerPeople): a card
 * with fewer taps on is read whole and its tappers checked against the reader's connections by id; a card with this
 * many or more falls back to every connection of the reader's. Bounds what a popular card costs over the old read.
 */
export const READER_TAP_SCAN = 40;

/** How much of a note the author's list shows: its first line, at most this many characters. */
export const TAP_NOTE_EXCERPT = 80;

/** A document id a request may name: a non-empty string without a slash, never one Firestore keeps for itself. */
export const docIdOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/') && !isReservedId(id);

/** The first `n` code points (conversations `cut`). */
const cut = (text: string, n: number) => Array.from(text).slice(0, n).join('');

/** A note's first line with words in it, trimmed and cut to TAP_NOTE_EXCERPT code points. */
export function noteExcerpt(text: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return cut(line, TAP_NOTE_EXCERPT);
}

/** The UTC day `now` falls on, as YYYY-MM-DD. */
export const readDay = (now: number) => new Date(now).toISOString().slice(0, 10);

export interface TapOutcome {
  on: boolean;
  /** False when it already was so: nothing written, nothing to ring. */
  changed: boolean;
  /** Turned on and never rang the author: ring them after the response (lib/push/tapBell ringTap). */
  ring: boolean;
}
