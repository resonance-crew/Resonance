import { FieldPath, FieldValue, Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { READER_SIGNALS } from '@/lib/api/v1/reading';
import type { WeekRead } from '@/server/domain/push/readSummary';
import type { BellData, BellRow, BellTxRepo, ListedBellRow, PushedRow } from '@/server/ports/repos/bell';
import { decodeCursor, encodeCursor, instantFromParts, instantParts, type Instant } from '@/server/ports/time';
import type { AdminDb } from '../db';

// The bell rows' Firestore code of src/lib/push (send, tapBell, readSummary), moved.

export const NOTIFICATIONS = 'notifications';

/**
 * A bell row's change time: every server write to what the bell shows of a row (made, read, rung again, its
 * readers changed) stamps it with the commit's own time, so GET /me/bell?updatedAfter= reads only the rows
 * changed since an answer (`userId ==`, `editedAt >`: the composite index notifications userId ASC, editedAt
 * ASC). `madeAt`, the same time on the write that makes the row, tells a new row from a changed one — with
 * the rows' count, what says a row went (app/inbox listBellIn). Never shown to a client. An older client's
 * own `readAt` write (firestore.rules) stamps neither: such a change shows on the next whole read.
 */
export const BELL_EDITED_AT = 'editedAt';
export const BELL_MADE_AT = 'madeAt';

/** The stamps of a write that changes a row. */
export const bellEdited = () => ({ [BELL_EDITED_AT]: FieldValue.serverTimestamp() });
/** The stamps of a write that makes a row. */
export const bellMade = () => ({ [BELL_EDITED_AT]: FieldValue.serverTimestamp(), [BELL_MADE_AT]: FieldValue.serverTimestamp() });

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

const instantOf = (v: unknown): Instant | null => (v instanceof Timestamp ? instantFromParts(v.seconds, v.nanoseconds) : null);
const timestampOf = (t: Instant) => {
  const { seconds, nanos } = instantParts(t);
  return new Timestamp(seconds, nanos);
};

/** A row as the bell lists it; null for one without a time to order it by. */
function listedOf(snap: DocumentSnapshot): ListedBellRow | null {
  const createdAt = instantOf(snap.get('createdAt'));
  if (!createdAt) return null;
  const payload: unknown = snap.get('payload');
  return {
    id: snap.id,
    type: str(snap.get('type')),
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {},
    createdAt,
    readAt: instantOf(snap.get('readAt')),
    madeAt: instantOf(snap.get(BELL_MADE_AT)),
  };
}

/** Each row unread among these gets `readAt` = the server's time, in one batch (the rule's `readAt == request.time`). */
async function readNow(db: AdminDb, snaps: DocumentSnapshot[], uid: string): Promise<number> {
  const unread = snaps.filter((s) => s.exists && s.get('userId') === uid && s.get('readAt') == null);
  if (!unread.length) return 0;
  const batch = db.batch();
  for (const s of unread) batch.update(s.ref, { readAt: FieldValue.serverTimestamp(), ...bellEdited() });
  await batch.commit();
  return unread.length;
}

/** A row written already pushed: unread, made and pushed at `atMs`. */
function pushedRow(row: PushedRow) {
  const at = Timestamp.fromMillis(row.atMs);
  return { userId: row.userId, type: row.type, payload: row.payload, readAt: null, createdAt: at, pushedAt: at, ...bellMade() };
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
      tx.update(ref(id), { 'payload.fromUserIds': fromUserIds, readAt: null, createdAt: Timestamp.fromMillis(atMs), ...bellEdited() });
    },
    setRowReaders(id, fromUserIds) {
      tx.update(ref(id), { 'payload.fromUserIds': fromUserIds, ...bellEdited() });
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
    async listRows(uid, limit, before) {
      let at: { t: Instant; id: string } | null = null;
      if (before !== undefined) {
        at = decodeCursor(before);
        if (!at) throw new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'pageToken', message: 'Not a valid page token.' }]);
      }
      // The clients' own listener's query (userId ==, createdAt desc), its index's implicit __name__ breaking ties.
      let q = db.collection(NOTIFICATIONS).where('userId', '==', uid).orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(limit);
      if (at) q = q.startAfter(timestampOf(at.t), at.id);
      const snap = await q.get();
      const rows = snap.docs.map(listedOf).filter((r): r is ListedBellRow => r !== null);
      const last = snap.docs[snap.docs.length - 1];
      const lastAt = last ? instantOf(last.get('createdAt')) : null;
      return { rows, next: snap.size === limit && last && lastAt ? encodeCursor({ t: lastAt, id: last.id }) : null, mark: instantOf(snap.readTime) };
    },
    async listRowsChangedAfter(uid, limit, since) {
      // `editedAt` is a commit's own time (serverTimestamp), and a query sees every commit up to its readTime:
      // a change it doesn't see has an editedAt after that readTime, so the readTime is the next mark.
      const snap = await db
        .collection(NOTIFICATIONS)
        .where('userId', '==', uid)
        .where(BELL_EDITED_AT, '>', timestampOf(since))
        .orderBy(BELL_EDITED_AT, 'asc')
        .limit(limit)
        .get();
      const rows = snap.docs.map(listedOf).filter((r): r is ListedBellRow => r !== null);
      return { rows, mark: snap.size >= limit ? null : instantOf(snap.readTime) };
    },
    async countRows(uid) {
      const snap = await db.collection(NOTIFICATIONS).where('userId', '==', uid).count().get();
      return snap.data().count;
    },
    async markRead(uid, ids) {
      if (!ids.length) return 0;
      const snaps = await db.getAll(...ids.map((id) => db.doc(`${NOTIFICATIONS}/${id}`)), { fieldMask: ['userId', 'readAt'] });
      return readNow(db, snaps, uid);
    },
    async markReadBefore(uid, before, scan) {
      const snap = await db
        .collection(NOTIFICATIONS)
        .where('userId', '==', uid)
        .where('createdAt', '<=', timestampOf(before))
        .orderBy('createdAt', 'desc')
        .limit(scan)
        .get();
      return readNow(db, snap.docs, uid);
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
