/**
 * The `account` aggregate's repositories (accountDeletions, and the account-wide reads and deletes the registry drives).
 *
 * Filled by the account lane (`src/lib/account/{deletion,export}.ts`, registry-driven: plan section 3.7). Until then the interfaces are empty: the skeleton
 * (Phase 1 wave 1) only fixed where they live, so lanes never edit each
 * other's files. Methods take and answer domain types (`Date`, `Instant`,
 * plain objects), never a Firestore `DocumentData`, `Timestamp`,
 * `DocumentReference`, snapshot, `Transaction` or `FieldValue`.
 */

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AccountTxRepo {}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AccountData {}
