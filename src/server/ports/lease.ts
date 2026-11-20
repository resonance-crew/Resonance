/**
 * Short exclusive leases: one holder of a key at a time, for at most `ttlMs`
 * (a reader's picks build: src/lib/recommend/daily.ts `takeLease`, today a
 * field on the recommendations row — the recommend lane decides whether that
 * stays a repo method or becomes this port).
 */
export interface LeaseStore {
  /** Take the key until `now + ttlMs`; false while someone else holds it. */
  acquire(key: string, ttlMs: number, now: number): Promise<boolean>;
  /** Give it back early (a lease that lapses needs no release). */
  release(key: string): Promise<void>;
}
