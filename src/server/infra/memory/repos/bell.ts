import type { WeekRead } from '@/server/domain/push/readSummary';
import type { BellData, BellRow, BellTxRepo, PushedRow } from '@/server/ports/repos/bell';
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
