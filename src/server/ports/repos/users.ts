import type { User } from '@/lib/db/types';

/**
 * The `users` aggregate's repositories (users, handles, handleHolds, blocks).
 *
 * Filled by the cardsRead lane (`src/lib/db/firestore/{handles,mapper}.ts`); the skeleton put `findByHandle` here for the profile layout. Until then the interfaces are empty: the skeleton
 * (Phase 1 wave 1) only fixed where they live, so lanes never edit each
 * other's files. Methods take and answer domain types (`Date`, `Instant`,
 * plain objects), never a Firestore `DocumentData`, `Timestamp`,
 * `DocumentReference`, snapshot, `Transaction` or `FieldValue`.
 */

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UsersTxRepo {}

// --- read side (cardsRead lane)

/**
 * A profile as stored, for the presenters (src/lib/api/v1/present.ts): its
 * fields as they are, times as `Date` (never a store's own time type). Old or
 * hand-edited profiles may hold anything, so every field is `unknown` and the
 * presenters check what they draw.
 */
export interface PersonRow {
  readonly [field: string]: unknown;
}

/** A scheduled account deletion (src/lib/account/deletion.ts). */
export interface ScheduledDeletion {
  requestedAt: Date;
  purgeAfter: Date;
}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
export interface UsersData {
  /** The person who goes by a pen name (any case, spaces around it ignored), through its reservation; null when no one does. */
  findByHandle(handle: string): Promise<User | null>;
  /** Who goes by `handle` (its reservation, else the earliest-joined profile by it), or null (src/lib/db/firestore/handles.ts uidForHandle). */
  idForHandle(handle: string): Promise<string | null>;
  /** A profile as stored (PersonRow), or null. */
  getRow(uid: string): Promise<PersonRow | null>;
  /** A profile as the app's User (only the `fields` named, when given), or null — for an id that can't name one too. */
  getUser(uid: string, fields?: readonly string[]): Promise<User | null>;
  /** Of these people, the byline fields of each who has a profile (`fields`), by id — one batched read. */
  rowsOf(ids: string[], fields: readonly string[]): Promise<Map<string, PersonRow>>;
  /** Everyone `uid` blocked. */
  blockedBy(uid: string): Promise<Set<string>>;
  /** Whether `uid` blocked `other`. */
  hasBlocked(uid: string, other: string): Promise<boolean>;
  /** Whether two people are connected (never someone to themselves). */
  connected(a: string, b: string): Promise<boolean>;
  /** Of `others`, those connected to `uid` — one batched read. */
  connectedAmong(uid: string, others: string[]): Promise<Set<string>>;
  /** `uid`'s scheduled deletion, if any. */
  deletionOf(uid: string): Promise<ScheduledDeletion | null>;
  /**
   * For an app build made before letters (src/lib/api/v1/preLetter.ts): whether
   * `writerId`'s letter waits for `viewerId`'s answer, which such a build is
   * told reads as a connection.
   */
  letterReadsAsConnection(viewerId: string, writerId: string): Promise<boolean>;
}
