/**
 * Neutral time and page cursors (phase1-spec, "Neutral time and cursors").
 *
 * An `Instant` is an ISO 8601 UTC string with exactly six fractional digits,
 * `2026-11-20T03:04:05.123456Z`: microseconds, which a message's order needs
 * (a `Date` holds milliseconds and would skip messages sent in the same one)
 * and which PostgreSQL's `timestamptz` keeps. Fixed width, so two instants
 * compare as strings. Times nothing is ordered by stay `Date`.
 *
 * A `PageCursor` is opaque to clients. New ones are `c1.` + base64url JSON of
 * `{ t: Instant, id }`. The older `[seconds, nanos, id]` tokens
 * (src/lib/api/v1/paging.ts) are decoded by the cards-read lane, beside these.
 */

export type Instant = string;
export type PageCursor = string;

/** Where a page ended: the last row's ordering instant, and its id to break ties. */
export interface CursorPosition {
  t: Instant;
  id: string;
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const PREFIX = 'c1.';
/** Date.parse on the millisecond part only: how many fractional digits it takes is up to the engine. */
const parseMillis = (instant: string) => Date.parse(`${instant.slice(0, 23)}Z`);

export function isInstant(value: unknown): value is Instant {
  return typeof value === 'string' && INSTANT.test(value) && !Number.isNaN(parseMillis(value));
}

/** An instant from epoch milliseconds (or a Date), plus the microseconds within that millisecond (0–999). */
export function toInstant(at: number | Date, microsInMilli = 0): Instant {
  const ms = typeof at === 'number' ? at : at.getTime();
  if (!Number.isFinite(ms)) throw new RangeError('Not a time');
  const whole = Math.floor(ms);
  const micros = Math.min(999, Math.max(0, Math.floor(microsInMilli)));
  const iso = new Date(whole).toISOString(); // …T03:04:05.123Z
  return `${iso.slice(0, -1)}${String(micros).padStart(3, '0')}Z`;
}

/** An instant from seconds and nanoseconds (a Firestore Timestamp's parts); below a microsecond is dropped. */
export function instantFromParts(seconds: number, nanos: number): Instant {
  const micros = Math.floor(nanos / 1000);
  return toInstant(seconds * 1000 + Math.floor(micros / 1000), micros % 1000);
}

/** Its seconds and nanoseconds (a whole number of microseconds). */
export function instantParts(instant: Instant): { seconds: number; nanos: number } {
  if (!isInstant(instant)) throw new RangeError(`Not an instant: ${instant}`);
  const ms = parseMillis(instant);
  const seconds = Math.floor(ms / 1000);
  const micros = Number(instant.slice(20, 26));
  return { seconds, nanos: micros * 1000 };
}

/** Its epoch milliseconds (microseconds dropped). */
export function instantMillis(instant: Instant): number {
  return parseMillis(instant);
}

/** Negative, zero or positive, as `a` comes before, with or after `b`. */
export function compareInstants(a: Instant, b: Instant): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const toBase64Url = (text: string) => Buffer.from(text, 'utf8').toString('base64url');
const fromBase64Url = (text: string) => Buffer.from(text, 'base64url').toString('utf8');

/** A new-format page cursor (`c1.` …) for this position. */
export function encodeCursor(position: CursorPosition): PageCursor {
  if (!isInstant(position.t)) throw new RangeError(`Not an instant: ${position.t}`);
  if (typeof position.id !== 'string' || !position.id) throw new RangeError('A cursor needs an id');
  return PREFIX + toBase64Url(JSON.stringify({ t: position.t, id: position.id }));
}

/** The position a new-format cursor names; null for anything else (malformed, foreign, or an older token). */
export function decodeCursor(cursor: string | null | undefined): CursorPosition | null {
  if (typeof cursor !== 'string' || !cursor.startsWith(PREFIX)) return null;
  const body = cursor.slice(PREFIX.length);
  if (!body || !/^[A-Za-z0-9_-]+$/.test(body)) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(body));
    if (!parsed || typeof parsed !== 'object') return null;
    const { t, id } = parsed as Record<string, unknown>;
    if (!isInstant(t) || typeof id !== 'string' || !id) return null;
    return { t, id };
  } catch {
    return null;
  }
}

/** Whether row (t, id) comes after the cursor in an ascending (t, id) order. */
export function afterCursor(row: CursorPosition, cursor: CursorPosition): boolean {
  const byTime = compareInstants(row.t, cursor.t);
  return byTime > 0 || (byTime === 0 && row.id > cursor.id);
}
