import { FieldValue, Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { READER_SIGNALS } from '@/lib/api/v1/reading';
import type { WeekRead } from '@/server/domain/push/readSummary';
import type { BellData, BellRow, BellTxRepo, PushedRow } from '@/server/ports/repos/bell';
import type { AdminDb } from '../db';

// The bell rows' Firestore code of src/lib/push (send, tapBell, readSummary), moved.

export const NOTIFICATIONS = 'notifications';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null);
const millis = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);

function rowOf(snap: DocumentSnapshot): BellRow | null {
  if (!snap.exists) return null;
  const payload: unknown = snap.get('payload');
  return {
    id: snap.id,
    userId: strOrNull(snap.get('userId')),
    type: strOrNull(snap.get('type')),
    payload: payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {},
    pushed: snap.get('pushedAt') != null,
    read: snap.get('readAt') != null,
  };
}

/** A row written already pushed: unread, made and pushed at `atMs`. */
function pushedRow(row: PushedRow) {
  const at = Timestamp.fromMillis(row.atMs);
  return { userId: row.userId, type: row.type, payload: row.payload, readAt: null, createdAt: at, pushedAt: at };
}

export function bellTx(db: AdminDb, tx: Transaction): BellTxRepo {
  const ref = (id: string) => db.doc(`${NOTIFICATIONS}/${id}`);
  return {
    async getRow(id) {
      return rowOf(await tx.get(ref(id)));
    },
    markPushed(id) {
      tx.update(ref(id), { pushedAt: FieldValue.serverTimestamp() });
    },
    putRow(id, row) {
      tx.set(ref(id), pushedRow(row));
    },
    bumpTapRow(id, fromUserIds, atMs) {
      tx.update(ref(id), { 'payload.fromUserIds': fromUserIds, readAt: null, createdAt: Timestamp.fromMillis(atMs) });
    },
    setRowReaders(id, fromUserIds) {
      tx.update(ref(id), { 'payload.fromUserIds': fromUserIds });
    },
    deleteRow(id) {
      tx.delete(ref(id));
    },
  };
}

/** Reading records fetched per page by the weekly read summary. */
const PAGE = 500;

export function bellData(db: AdminDb): BellData {
  return {
    async insertIfAbsent(id, row) {
      return db
        .doc(`${NOTIFICATIONS}/${id}`)
        .create(pushedRow(row))
        .then(
          () => 'inserted' as const,
          (e: { code?: number }) => {
            // ALREADY_EXISTS.
            if (e?.code === 6) return 'exists' as const;
            throw e;
          },
        );
    },
    async listRowIdsNaming(uid) {
      const rows = await db.collection(NOTIFICATIONS).where('payload.fromUserIds', 'array-contains', uid).select().get();
      return rows.docs.map((d) => d.id);
    },
    async listReachedEnd(sinceMs, untilMs) {
      // A page at a time, one range on reachedEndAt: its single-field index.
      const out: WeekRead[] = [];
      let last: QueryDocumentSnapshot | null = null;
      for (;;) {
        let q = db
          .collection(READER_SIGNALS)
          .where('reachedEndAt', '>=', Timestamp.fromMillis(sinceMs))
          .where('reachedEndAt', '<', Timestamp.fromMillis(untilMs))
          .orderBy('reachedEndAt')
          .select('cardId', 'userId', 'reachedEndAt', 'rereadAt')
          .limit(PAGE);
        if (last) q = q.startAfter(last);
        const page = await q.get();
        for (const d of page.docs) {
          const at = millis(d.get('reachedEndAt'));
          if (at !== null && str(d.get('cardId')) && str(d.get('userId'))) {
            out.push({ cardId: str(d.get('cardId')), userId: str(d.get('userId')), reachedEndAt: at, rereadAt: millis(d.get('rereadAt')) });
          }
        }
        if (page.size < PAGE) return out;
        last = page.docs[page.size - 1];
      }
    },
    async getSummaryCards(ids) {
      if (!ids.length) return [];
      const cards = await db.getAll(...ids.map((id) => db.doc(`cards/${id}`)), {
        fieldMask: ['authorId', 'publishedAt', 'trashedAt', 'anonymous', 'visibility'],
      });
      return cards.map((card) =>
        card.exists
          ? {
              authorId: str(card.get('authorId')),
              published: card.get('publishedAt') != null,
              trashed: card.get('trashedAt') != null,
              anonymous: card.get('anonymous') === true,
              visibility: card.get('visibility'),
            }
          : null,
      );
    },
  };
}
