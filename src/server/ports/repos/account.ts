import type { ExportSection, PurgePlan } from '@/server/domain/schema/registry';

/**
 * The `account` aggregate's repositories: `accountDeletions`, and the
 * account-wide reads and deletes the registry drives
 * (`src/server/domain/schema/registry.ts`, plan section 3.7) — the purge and
 * the export. Records are named by their path (`cards/x`,
 * `users/u/blocks/v`): the collections are the registry's, and a path is the
 * one handle every store (Firestore, memory, PostgreSQL by table and key)
 * can turn back into a row. Methods take and answer domain types (`Date`,
 * plain objects), never a Firestore `DocumentData`, `Timestamp`,
 * `DocumentReference`, snapshot, `Transaction` or `FieldValue`.
 */

export interface AccountDeletion {
  uid: string;
  requestedAt: Date;
  purgeAfter: Date;
}

/** A deletion that is due, with when it was last tried (or became due), in ms. */
export interface DueDeletion {
  uid: string;
  at: number;
}

/** Everything a purge removes, found from the registry's plan (see `collect`). */
export interface AccountCollection {
  /** Documents deleted with everything under them, first: the account's cards and conversations. */
  trees: string[];
  /** The account's own roots (`{collection}/{uid}`), deleted last — the profile among them. */
  roots: string[];
  /** Single records naming the account, neither inside a tree nor found through a card. */
  singles: string[];
  /** Records found through one of the account's cards, by the card's path: deleted just before it. */
  byCard: Map<string, string[]>;
  /** The cached pages that showed the account (logical paths): its published cards, its profile, the landing. */
  pages: string[];
  /** The account's pen name ('' when none). */
  handle: string;
}

/**
 * One purge run's deletes, shared by the accounts it purges (Firestore: one
 * BulkWriter). `deleteDoc` answers when that delete is done (or failed);
 * `flush` waits for every delete given so far.
 */
export interface PurgeSession {
  deleteTree(path: string): Promise<void>;
  deleteDoc(path: string): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

/** A row of the export: its id and its fields as plain JSON (times as ISO strings). */
export interface ExportRow {
  id: string;
  data: Record<string, unknown>;
}

/** What the export says of a card someone else wrote: its title only while they may read it, and its link. */
export interface ExportCardLine {
  cardId: string;
  title: string | null;
  link: string;
}

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AccountTxRepo {}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
export interface AccountData {
  // --- accountDeletions ---
  putDeletion(deletion: AccountDeletion): Promise<void>;
  getDeletion(uid: string): Promise<AccountDeletion | null>;
  deleteDeletion(uid: string): Promise<void>;
  /** Deletions whose `purgeAfter` is at or before `now`. */
  dueDeletions(now: Date): Promise<DueDeletion[]>;
  /** Notes a cut-short or failed try (`triedAt`); best effort. */
  noteTried(uid: string, now: Date): Promise<void>;
  /** Removes the account's push registrations at once (scheduling signs every device out). */
  removeDevices(uid: string): Promise<void>;

  // --- the purge ---
  /** Every record of the account, as the plan finds them. */
  collect(uid: string, plan: PurgePlan): Promise<AccountCollection>;
  /** Deletes these records (a card's few, before the card), in batches. */
  deleteDocs(paths: string[]): Promise<void>;
  /** A card's id stays dead and its slug retired: written before the card goes. */
  retireCard(path: string): Promise<void>;
  /** The pen name held for no one (when it can be a key), before its reservation goes. */
  holdHandle(handle: string): Promise<void>;
  /** Takes the account out of others' bell rows of taps naming it among several (step `tapRows`). */
  removeFromTapRows(uid: string): Promise<number>;
  /** The storage keys of the pictures `uploads/*` records as the account's. */
  uploadedKeys(uid: string): Promise<string[]>;
  /** A page of the chat pictures whose `field` is the account: their records' paths and their files' keys. */
  chatPicturePage(uid: string, field: 'senderId' | 'to', limit: number): Promise<{ paths: string[]; files: string[] }>;
  openSession(): PurgeSession;

  // --- the export ---
  /** The document `{uid}` of the section's entity, plain, or null. */
  exportDoc(section: ExportSection, uid: string): Promise<Record<string, unknown> | null>;
  /** The ids of the trees (the section entity's parent) the account is in. */
  exportTrees(section: ExportSection, uid: string): Promise<string[]>;
  /** The section's rows, a page at a time in id order (`treeId` for an `inTrees` section). */
  exportRows(section: ExportSection, uid: string, treeId?: string): AsyncIterable<ExportRow[]>;
  /** What the export says of these cards (by id) to the account. */
  cardLines(uid: string, ids: string[]): Promise<Map<string, ExportCardLine>>;
}
