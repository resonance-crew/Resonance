import type { WeekRead } from '@/server/domain/push/readSummary';
import { ApiFailure } from '@/lib/api/v1/http';
import type { BellData, BellRow, BellTxRepo, ListedBellRow, PushedRow } from '@/server/ports/repos/bell';
import { compareInstants, decodeCursor, encodeCursor, isInstant, toInstant, type Instant } from '@/server/ports/time';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';

/**
 * `bell` over memory: the `notifications` table (times as epoch ms), and the
 * read summary's `readerSignals` and `cards` as it reads them.
 */

const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Server time for memory writes (`pushedAt`). */
const serverNow = () => Date.now();

function rowOf(id: string, row: Row | null): BellRow | null {
  if (!row) return null;
  const payload = row.payload;
  return {
    id,
    userId: strOrNull(row.userId),
    type: strOrNull(row.type),
    payload: payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {},
    pushed: row.pushedAt != null,
    read: row.readAt != null,
  };
}

/** A stored time as an Instant: the writers here keep epoch ms or a Date; a seeded row may hold an Instant. */
function anyInstant(v: unknown): Instant | null {
  if (isInstant(v)) return v;
  if (v instanceof Date && Number.isFinite(v.getTime())) return toInstant(v);
  if (typeof v === 'number' && Number.isFinite(v)) return toInstant(v);
  return null;
}

function listedOf(id: string, row: Row): ListedBellRow | null {
  const createdAt = anyInstant(row.createdAt);
  if (!createdAt) return null;
  const payload = row.payload;
  return {
    id,
    type: typeof row.type === 'string' ? row.type : '',
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {},
    createdAt,
    readAt: anyInstant(row.readAt),
  };
}

const byPosition = (a: { t: Instant; id: string }, b: { t: Instant; id: string }) => compareInstants(a.t, b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const pushedRow = (row: PushedRow): Row => ({ userId: row.userId, type: row.type, payload: row.payload, readAt: null, createdAt: row.atMs, pushedAt: row.atMs });

export function bellTx(tx: MemoryTx): BellTxRepo {
  const payloadOf = (id: string) => (tx.state.get('notifications', id)?.payload as Row | undefined) ?? {};
  return {
    async getRow(id) {
      return rowOf(id, tx.get('notifications', id));
    },
    markPushed(id) {
      tx.merge('notifications', id, { pushedAt: serverNow() });
    },
    putRow(id, row) {
      tx.put('notifications', id, pushedRow(row));
    },
    bumpTapRow(id, fromUserIds, atMs) {
      tx.merge('notifications', id, { payload: { ...payloadOf(id), fromUserIds }, readAt: null, createdAt: atMs });
    },
    setRowReaders(id, fromUserIds) {
      tx.merge('notifications', id, { payload: { ...payloadOf(id), fromUserIds } });
    },
    deleteRow(id) {
      tx.delete('notifications', id);
    },
  };
}

export function bellData(state: MemoryState): BellData {
  return {
    async insertIfAbsent(id, row) {
      if (state.get('notifications', id)) return 'exists';
      state.put('notifications', id, pushedRow(row));
      return 'inserted';
    },
    async listRowIdsNaming(uid) {
      return state.rows('notifications', (row) => Array.isArray((row.payload as Row | undefined)?.fromUserIds) && ((row.payload as Row).fromUserIds as unknown[]).includes(uid)).map((r) => r.id);
    },
    async listReachedEnd(sinceMs, untilMs) {
      const out: WeekRead[] = [];
      for (const { row } of state.rows('readerSignals')) {
        const at = num(row.reachedEndAt);
        if (at === null || at < sinceMs || at >= untilMs || typeof row.cardId !== 'string' || !row.cardId || typeof row.userId !== 'string' || !row.userId) continue;
        out.push({ cardId: row.cardId, userId: row.userId, reachedEndAt: at, rereadAt: num(row.rereadAt) });
      }
      return out.sort((a, b) => a.reachedEndAt - b.reachedEndAt);
    },
    async listRows(uid, limit, before) {
      let at: { t: Instant; id: string } | null = null;
      if (before !== undefined) {
        at = decodeCursor(before);
        if (!at) throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'pageToken', message: 'Not a valid page token.' }]);
      }
      const from = at;
      const rows = newestFirst(state, uid)
        .filter((r) => !from || byPosition({ t: r.createdAt, id: r.id }, from) < 0)
        .slice(0, limit);
      const last = rows[rows.length - 1];
      return { rows, next: rows.length === limit && last ? encodeCursor({ t: last.createdAt, id: last.id }) : null };
    },
    async markRead(uid, ids) {
      let n = 0;
      for (const id of new Set(ids)) {
        const row = state.get('notifications', id);
        if (!row || row.userId !== uid || row.readAt != null) continue;
        state.merge('notifications', id, { readAt: serverNow() });
        n++;
      }
      return n;
    },
    async markReadBefore(uid, before, scan) {
      const due = newestFirst(state, uid)
        .filter((r) => compareInstants(r.createdAt, before) <= 0)
        .slice(0, scan)
        .filter((r) => r.readAt === null);
      for (const r of due) state.merge('notifications', r.id, { readAt: serverNow() });
      return due.length;
    },
    async getSummaryCards(ids) {
      return ids.map((id) => {
        const card = state.get('cards', id);
        return card
          ? { authorId: typeof card.authorId === 'string' ? card.authorId : '', published: card.publishedAt != null, trashed: card.trashedAt != null, anonymous: card.anonymous === true, visibility: card.visibility }
          : null;
      });
    },
  };
}

/** `uid`'s rows, `(createdAt, id)` descending. */
function newestFirst(state: MemoryState, uid: string): ListedBellRow[] {
  return state
    .rows('notifications', (row) => row.userId === uid)
    .map(({ id, row }) => listedOf(id, row))
    .filter((r): r is ListedBellRow => r !== null)
    .sort((a, b) => -byPosition({ t: a.createdAt, id: a.id }, { t: b.createdAt, id: b.id }));
}
