/**
 * The `recommend` aggregate's repositories (userProfiles, recommendations, cardSignatures, config/recommendPool).
 *
 * Filled by the recommend lane (`src/lib/recommend/*`). Until then the interfaces are empty: the skeleton
 * (Phase 1 wave 1) only fixed where they live, so lanes never edit each
 * other's files. Methods take and answer domain types (`Date`, `Instant`,
 * plain objects), never a Firestore `DocumentData`, `Timestamp`,
 * `DocumentReference`, snapshot, `Transaction` or `FieldValue`.
 */

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RecommendTxRepo {}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RecommendData {}
