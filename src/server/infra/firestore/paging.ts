import { FieldPath, Timestamp, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { encodePageToken, pageTokenPosition, positionParts } from '@/lib/api/v1/paging';
import type { PageEnd, PageStart } from '@/server/ports/repos/cards';

/** A page token (either format, src/lib/api/v1/paging.ts) as a Firestore boundary — invalid_request when it isn't one this server made. */
export function decodePageToken(token: string): { at: Timestamp; id: string } {
  const position = pageTokenPosition(token);
  const { seconds, nanos } = positionParts(position);
  return { at: new Timestamp(seconds, nanos), id: position.id };
}

/**
 * `q` newest first — by publishedAt, then by id (the order Firestore gives it
 * anyway, made explicit so a token can name a card) — resuming as `start`
 * says. A page token wins over a cursor.
 */
export function pageQuery(q: Query, start: PageStart = {}): Query {
  const ordered = q.orderBy('publishedAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (start.pageToken) {
    const { at, id } = decodePageToken(start.pageToken);
    return ordered.startAfter(at, id);
  }
  if (start.cursor) return ordered.startAfter(Timestamp.fromDate(new Date(start.cursor)));
  return ordered;
}

/**
 * A page's way on, in both forms, from the raw query's documents (before
 * anything was filtered out of it) when it came back full; nulls at the end.
 */
export function pageEnd(docs: QueryDocumentSnapshot[], limit: number): PageEnd {
  const last = docs.at(-1);
  const at = last?.get('publishedAt');
  if (docs.length !== limit || !last || !(at instanceof Timestamp)) return { nextCursor: null, nextPageToken: null };
  return { nextCursor: at.toDate().toISOString(), nextPageToken: encodePageToken(at, last.id) };
}
