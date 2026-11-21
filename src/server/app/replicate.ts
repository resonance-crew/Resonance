import type { ChangeEntry } from '@/server/domain/outbox';
import type { Logger } from '@/server/ports/log';

/**
 * The outbox's replicator (plan section 4.3): reads `changeLog` in ulid
 * order, reads each row's latest state from the source (never the entry:
 * it holds no content), applies it to the target only when its version is
 * newer than what the target last applied for that row, and marks the
 * entries done. Idempotent: replaying entries — a run cut short, a retry, the
 * same row changed twice — leaves the target as one run would, because each
 * apply is "the source's latest, if newer".
 *
 * Phase 3 replicates into memory or a local PostgreSQL to prove it out;
 * nothing schedules it in production (docs/ops/scheduler.md).
 */

export type Doc = Record<string, unknown>;

export interface PendingChange {
  /** The entry's own id (its ulid). */
  logId: string;
  entry: Pick<ChangeEntry, 'entity' | 'id' | 'op' | 'version'>;
}

/** Where changes come from: the primary's outbox and its rows. */
export interface ChangeSource {
  /** Up to `limit` entries not yet done, oldest (lowest ulid) first. */
  pending(limit: number): Promise<PendingChange[]>;
  /**
   * The row as it is now, and its version (µs: Firestore's update time; for
   * a row that is gone, the time it was read, so the delete is newer than
   * anything applied before it). `recorded` is the newest entry's version for
   * the row: a source that keeps no versions of its own answers it.
   */
  read(entity: string, id: string, recorded: number): Promise<{ row: Doc | null; version: number }>;
  markDone(logIds: readonly string[]): Promise<void>;
}

/** Where they go: a secondary database. */
export interface ReplicaTarget {
  /** Write the row (null: delete it) if `version` is above the last one applied to it; `stale` otherwise. */
  apply(entity: string, id: string, row: Doc | null, version: number): Promise<'applied' | 'stale'>;
}

export interface ReplicateResult {
  /** Entries read. */
  seen: number;
  /** Rows the target took. */
  applied: number;
  /** Rows the target already had as new or newer. */
  stale: number;
  /** Whether entries may be left (a full batch, or the deadline). */
  more: boolean;
}

export interface ReplicateOptions {
  batch?: number;
  /** Stop starting batches past this time (ms since the epoch). */
  deadline?: number;
  now?: () => number;
  log?: Logger;
}

/** One run: batches of pending entries until none are left or the deadline passes. */
export async function replicate(source: ChangeSource, target: ReplicaTarget, opts: ReplicateOptions = {}): Promise<ReplicateResult> {
  const batch = opts.batch ?? 200;
  const now = opts.now ?? Date.now;
  const result: ReplicateResult = { seen: 0, applied: 0, stale: 0, more: false };
  for (;;) {
    if (opts.deadline !== undefined && now() >= opts.deadline) {
      result.more = true;
      break;
    }
    const pending = await source.pending(batch);
    result.seen += pending.length;
    // A row changed several times in the batch is read and applied once: its latest state.
    const rows = new Map<string, { entity: string; id: string; recorded: number }>();
    for (const p of pending) {
      const key = JSON.stringify([p.entry.entity, p.entry.id]);
      const recorded = Math.max(rows.get(key)?.recorded ?? 0, Number(p.entry.version) || 0);
      rows.set(key, { entity: p.entry.entity, id: p.entry.id, recorded });
    }
    for (const { entity, id, recorded } of rows.values()) {
      const { row, version } = await source.read(entity, id, recorded);
      if ((await target.apply(entity, id, row, version)) === 'applied') result.applied++;
      else result.stale++;
    }
    // Done only once applied: a run that fails part-way leaves its entries pending for the next.
    if (pending.length) await source.markDone(pending.map((p) => p.logId));
    if (pending.length < batch) break;
  }
  // Counts only: no entity ids (they may name people).
  opts.log?.info('[replicate]', { seen: result.seen, applied: result.applied, stale: result.stale, more: result.more });
  return result;
}
