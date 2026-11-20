import { decodeCursor, encodeCursor, instantFromParts, instantParts, isInstant, type CursorPosition } from '@/server/ports/time';
import type { PageEnd, PageStart } from '@/server/ports/repos/cards';
import { ApiFailure } from './http';

/**
 * Paging the newest-first lists (GET /feed, /users/{handle}/cards) and an
 * author's tap list.
 *
 * A page ends at its last card's publishedAt, to the microsecond Firestore
 * keeps, and its id: cards published at the same instant (a batch import
 * gives many the same millisecond) are ordered by id, so the next page
 * resumes exactly after that card. Clients get it as an opaque
 * `nextPageToken` and send it back as `pageToken`.
 *
 * Two token formats are read, and will be forever (clients keep tokens as
 * opaque strings): the neutral `c1.` + base64url `{ t: Instant, id }`
 * (src/server/ports/time.ts), and the first one, base64url JSON
 * `[seconds, nanos, id]`. Tokens are still *issued* in the first format:
 * test/emulator/apiV1Reads.emulator.test.ts reads a token's card id out of
 * it (`JSON.parse(…)[2]`), and that suite never changes — so the `c1.` form is
 * read, ready for the day the server switches, and not yet written.
 *
 * The older `cursor` / `nextCursor` stays as it was for the builds that use
 * it (a Kotlin client parses it as a date, so it can't become opaque): the
 * ISO time to the millisecond, resuming after that time — which skips cards
 * sharing the boundary's millisecond.
 *
 * The Firestore side (startAfter, a raw page's end) is
 * src/server/infra/firestore/paging.ts.
 */

export type { PageEnd, PageStart };

const notAToken = () =>
  new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'pageToken', message: 'Not a valid page token.' }]);

/** A document id a token may name (it ends up in a query's startAfter). */
const TOKEN_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** A page token in the format every server issues today (seconds and nanoseconds, as a store's timestamp holds them). */
export function encodePageToken(at: { seconds: number; nanoseconds: number }, id: string): string {
  return Buffer.from(JSON.stringify([at.seconds, at.nanoseconds, id]), 'utf8').toString('base64url');
}

/** A legacy `[seconds, nanos, id]` token's position, or null for anything else. */
function legacyPosition(token: string): CursorPosition | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [seconds, nanos, id] = parsed as unknown[];
  if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanos) || (nanos as number) < 0 || (nanos as number) >= 1e9 || typeof id !== 'string' || !id) {
    return null;
  }
  try {
    const t = instantFromParts(seconds as number, nanos as number);
    return isInstant(t) ? { t, id } : null;
  } catch {
    return null;
  }
}

/**
 * Where a page token of either format says its page ended, or null when it
 * is neither. Any id the format allows: pageTokenPosition is what a request
 * may send.
 */
export function readPageToken(token: string | null | undefined): CursorPosition | null {
  if (typeof token !== 'string' || !token) return null;
  if (token.startsWith('c1.')) return decodeCursor(token);
  return legacyPosition(token);
}

/** The neutral format's token for a position (what the server issues once no reader parses the first format). */
export const encodeNeutralPageToken = encodeCursor;

/** A request's page token back into its boundary — invalid_request when it isn't one this server made. */
export function pageTokenPosition(token: string): CursorPosition {
  const position = readPageToken(token);
  if (!position || !TOKEN_ID.test(position.id)) throw notAToken();
  return position;
}

/** A boundary's seconds and nanoseconds (to build a store's timestamp from). */
export function positionParts(position: CursorPosition): { seconds: number; nanos: number } {
  return instantParts(position.t);
}

// The Firestore side (decodePageToken answers a firebase-admin Timestamp), kept at this path for its importers.
export { decodePageToken, pageEnd, pageQuery } from '@/server/infra/firestore/paging';
