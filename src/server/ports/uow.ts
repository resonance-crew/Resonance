import type { AccountData, AccountTxRepo } from './repos/account';
import type { BellData, BellTxRepo } from './repos/bell';
import type { CardsData, CardsTxRepo } from './repos/cards';
import type { ConversationsData, ConversationsTxRepo } from './repos/conversations';
import type { GraphData, GraphTxRepo } from './repos/graph';
import type { InfraData, InfraTxRepo } from './repos/infra';
import type { PushStateData, PushStateTxRepo } from './repos/pushState';
import type { RecommendData, RecommendTxRepo } from './repos/recommend';
import type { TapsData, TapsTxRepo } from './repos/taps';
import type { UsersData, UsersTxRepo } from './repos/users';

/**
 * The repositories a transaction sees: one per aggregate. Every read comes
 * before any write — Firestore requires it, and the memory UoW throws
 * ReadAfterWriteError when a repo reads after the transaction wrote, so a
 * service written against one runs on the other (and later on PostgreSQL).
 */
export interface TxRepos {
  pushState: PushStateTxRepo;
  taps: TapsTxRepo;
  bell: BellTxRepo;
  cards: CardsTxRepo;
  users: UsersTxRepo;
  graph: GraphTxRepo;
  conversations: ConversationsTxRepo;
  recommend: RecommendTxRepo;
  account: AccountTxRepo;
  infra: InfraTxRepo;
}

/** The same aggregates outside a transaction: reads, and writes that need none. */
export interface DataRepos {
  pushState: PushStateData;
  taps: TapsData;
  bell: BellData;
  cards: CardsData;
  users: UsersData;
  graph: GraphData;
  conversations: ConversationsData;
  recommend: RecommendData;
  account: AccountData;
  infra: InfraData;
}

export interface UowOptions {
  /** Names the transaction in logs and errors. */
  label?: string;
}

/**
 * Transactions. `R` is TxRepos in production; the port contracts
 * (src/server/contract) run it over a probe repository of their own.
 */
export interface UnitOfWork<R = TxRepos> {
  /**
   * Run `fn` as one serializable transaction and answer what it answers;
   * nothing it wrote is kept when it throws. `fn` may run more than once
   * (Firestore retries on contention), so it never pushes, calls a model,
   * writes to an object store or touches anything outside `tx` — do that
   * after `run` resolves. Never nest one `run` in another.
   */
  run<T>(fn: (tx: R) => Promise<T>, opts?: UowOptions): Promise<T>;
}

/**
 * A transaction read after it had written. Firestore refuses that; the memory
 * UoW refuses it the same way, and the Firestore UoW answers Firestore's
 * refusal as this error, so both look alike to a service and its tests.
 */
export class ReadAfterWriteError extends Error {
  constructor(label?: string) {
    super(`A transaction${label ? ` (${label})` : ''} read after it wrote: every read must come before any write`);
    this.name = 'ReadAfterWriteError';
  }
}
