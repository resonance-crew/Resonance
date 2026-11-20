/**
 * Change capture inside a transaction (plan section 4.3, Phase 3): each
 * write also records which row changed, so a migration can follow along.
 * Not in TxRepos yet — Phase 3 adds `outbox` there.
 */
export type OutboxOp = 'upsert' | 'delete';

export interface OutboxWriter {
  /** Record that `entity/id` changed in this transaction (a write: after every read). */
  record(entity: string, id: string, op: OutboxOp, version?: number): void;
}
