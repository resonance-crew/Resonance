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

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
export interface UsersData {
  /** The person who goes by a pen name (any case, spaces around it ignored), through its reservation; null when no one does. */
  findByHandle(handle: string): Promise<User | null>;
}
