/**
 * The `bell` aggregate's repositories: `notifications` — the bell's rows —
 * as the push lane writes and rings them (a row's push claim, the tap's day
 * row, the weekly read summary). The bell lane adds the summaries and their
 * translations here beside them.
 *
 * Methods take and answer domain types (`Date`, `Instant`, epoch ms, plain
 * objects), never a Firestore `DocumentData`, `Timestamp`, `DocumentReference`,
 * snapshot, `Transaction` or `FieldValue`.
 */
import type { WeekRead } from '@/server/domain/push/readSummary';
import type { Instant, PageCursor } from '../time';

/** A bell row as the push reads it. */
export interface BellRow {
  id: string;
  userId: string | null;
  type: string | null;
  /** The stored payload (`{}` when it isn't an object). */
  payload: Record<string, unknown>;
  /** `pushedAt` / `readAt` set at all. */
  pushed: boolean;
  read: boolean;
}

/** A row written already pushed (nothing rings it): `readAt` null, `createdAt` = `pushedAt` = `atMs`. */
export interface PushedRow {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  atMs: number;
}

// --- Phase 2 inbox (2a-inbox): the bell as the clients list it, read through /api/v1

/** A bell row as the bell lists it. */
export interface ListedBellRow {
  id: string;
  type: string;
  /** The stored payload (`{}` when it isn't an object). */
  payload: Record<string, unknown>;
  createdAt: Instant;
  readAt: Instant | null;
}

export interface BellPage {
  rows: ListedBellRow[];
  /** Resumes after the page's last row; null when the page wasn't full. */
  next: PageCursor | null;
}

/** A card as the weekly read summary weighs it. */
export interface SummaryCard {
  authorId: string;
  published: boolean;
  trashed: boolean;
  anonymous: boolean;
  visibility: unknown;
}

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
export interface BellTxRepo {
  getRow(id: string): Promise<BellRow | null>;
  /** Claim the row's push: `pushedAt` = the server's time. */
  markPushed(id: string): void;
  /** Write the row (replacing any). */
  putRow(id: string, row: PushedRow): void;
  /** A tap row's next ring: its readers, unread again, `createdAt` = `atMs`. */
  bumpTapRow(id: string, fromUserIds: string[], atMs: number): void;
  setRowReaders(id: string, fromUserIds: string[]): void;
  deleteRow(id: string): void;
}

/** Outside a transaction: reads, and writes that need none (batches, bulk deletes). */
export interface BellData {
  /** Write the row unless one with this id exists. */
  insertIfAbsent(id: string, row: PushedRow): Promise<'inserted' | 'exists'>;
  /** The ids of the rows naming `uid` among their readers (`payload.fromUserIds`). */
  listRowIdsNaming(uid: string): Promise<string[]>;
  /** The reading records reaching the end in [sinceMs, untilMs), in that order. */
  listReachedEnd(sinceMs: number, untilMs: number): Promise<WeekRead[]>;
  /** `uid`'s rows (`userId ==`), `(createdAt, id)` descending, after `before` (invalid_request when it isn't a cursor). */
  listRows(uid: string, limit: number, before?: PageCursor): Promise<BellPage>;
  /** Of these rows, those that are `uid`'s and unread get `readAt` = the server's time; answers how many. */
  markRead(uid: string, ids: string[]): Promise<number>;
  /** `uid`'s unread rows made at `before` or earlier — of the newest `scan` such rows — read now; answers how many. */
  markReadBefore(uid: string, before: Instant, scan: number): Promise<number>;
  /** The cards by id (null where none), as the read summary weighs them. */
  getSummaryCards(ids: string[]): Promise<(SummaryCard | null)[]>;
}
