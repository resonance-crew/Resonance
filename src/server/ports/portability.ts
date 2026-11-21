import type { EntityName } from '@/server/domain/schema/registry';
import type { CanonicalRow } from '@/server/domain/schema/canonical';

/**
 * The portability tools' two seams (plan §4.2, scripts/portability): a
 * store read whole as canonical rows, and a store written from them. The
 * export, the import and the parity check know only these — Firestore,
 * memory and (the PostgreSQL lane's) a relational store each give one.
 */

/** One stored row read as its canonical row, and what reading it noticed (field paths, never values). */
export interface CanonicalRead {
  row: CanonicalRow;
  /** Paths whose value was off its kind (a lenient read wrote them generically). */
  offSchema: string[];
  /** Top-level fields the entity's schema doesn't name. */
  extras: string[];
}

export interface EntitySource {
  /** `emulator`, `memory`, `export`, … (the export's directory name carries it). */
  readonly kind: string;
  /** Every row of the entity, in any order (the export sorts). */
  read(entity: EntityName): AsyncIterable<CanonicalRead>;
  /** Collections (tables) the store holds that no registered entity is: names only. */
  unregistered(): Promise<string[]>;
}

export interface ImportTarget {
  readonly kind: string;
  /** Write these canonical rows of one entity (a batch; called many times). */
  write(entity: EntityName, rows: readonly CanonicalRow[]): Promise<void>;
  /** Everything written is durable. */
  finish(): Promise<void>;
}
