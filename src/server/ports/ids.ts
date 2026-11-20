/** New ids, injectable so a test can predict them. */
export interface IdGenerator {
  /** A 20-character id of [A-Za-z0-9], the shape of a Firestore auto id (rows that got one keep it). */
  id(): string;
  /** A random RFC 4122 v4 UUID (object keys, idempotency keys). */
  uuid(): string;
}
