/**
 * Short exclusive leases: one holder of a key at a time, for at most `ttlMs`.
 * A key names the row the lease guards (`recommendations/{uid}`): the
 * Firestore adapter keeps it there as `leaseUntil`, taken in a transaction
 * (infra/firestore/lease.ts), the memory one on the memory row; contract:
 * src/server/contract/lease.contract.ts. The reader's picks build keeps its
 * own lease in the recommend repository instead (app/recommendDaily.ts): it
 * is taken only while a build is still due, which the same transaction reads.
 */
export interface LeaseStore {
  /** Take the key until `now + ttlMs`; false while someone else holds it. */
  acquire(key: string, ttlMs: number, now: number): Promise<boolean>;
  /** Give it back early (a lease that lapses needs no release). */
  release(key: string): Promise<void>;
}
