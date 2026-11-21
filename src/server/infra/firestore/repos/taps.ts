import { FieldPath, FieldValue, Timestamp, type DocumentData, type DocumentSnapshot, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { hasPenName, letterRef, lettersLeft, openRequest, pairOf } from '@/lib/api/v1/conversations';
import { decodePageToken, encodePageToken } from '@/lib/api/v1/paging';
import { CARD_VISIBILITY_FIELDS, blockedByViewer, canView, toAuthor } from '@/lib/api/v1/present';
import { visibleCardById } from '@/lib/api/v1/reads';
import type { AuthorBody } from '@/lib/api/v1/schemas';
import { storedPick } from '@/lib/api/v1/tapPassages';
import { mapCard } from '@/lib/db/firestore/mapper';
import { READER_SIGNALS, SIGNAL_KEEP_DAYS, DAY_MS, clamp, finite, type SessionState, type SignalState } from '@/server/domain/reading';
import { CARD_READS, TAPS, docIdOk } from '@/server/domain/taps';
import type { ReadDayMark, ReaderStanding, TapGate, TapPage, Tapper, TapsData, TapsTxRepo } from '@/server/ports/repos/taps';
import type { AdminDb } from '../db';

// Today's queries and transactions of src/lib/api/v1/{taps,reading,cardReads}.ts,
// moved here as they were: the same documents, field masks, `in` chunks,
// getAll batches and FieldValue.increment.

/** How many uids one `in` filter takes. */
const TAP_IN_CHUNK = 30;
/** A batch's limit on writes. */
const BATCH_MAX = 500;

export const tapRef = (db: AdminDb, cardId: string, uid: string) => db.doc(`${TAPS}/${cardId}_${uid}`);
export const signalRef = (db: AdminDb, uid: string, cardId: string) => db.collection(READER_SIGNALS).doc(`${uid}_${cardId}`);
export const cardReadRef = (db: AdminDb, uid: string, cardId: string) => db.collection(CARD_READS).doc(`${uid}_${cardId}`);

const millisOf = (v: unknown): number => (v instanceof Timestamp ? v.toMillis() : 0);
const dateOf = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : null);

const tapperOf = (d: QueryDocumentSnapshot | DocumentSnapshot): Tapper | null => {
  const uid = d.get('userId');
  return docIdOk(uid) ? { uid, at: millisOf(d.get('at')), passage: storedPick(d.get('passage')) } : null;
};

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' && Number.isFinite(v) ? v : null);
const ts = (n: number) => Timestamp.fromMillis(n);

/** A stored record as the fold reads it (anything odd read as absent). */
export function signalState(data: DocumentData | undefined): SignalState | null {
  if (!data) return null;
  const sessions: SessionState[] = Array.isArray(data.sessions)
    ? data.sessions
        .filter((s: unknown): s is DocumentData => !!s && typeof s === 'object' && typeof (s as DocumentData).id === 'string')
        .map((s: DocumentData) => ({
          id: s.id,
          active: finite(s.active),
          progress: clamp(finite(s.progress), 0, 1),
          startedAt: ms(s.startedAt) ?? 0,
          at: ms(s.at) ?? 0,
          endSeen: s.endSeen === true,
          end: s.end === true,
          rereadable: s.rereadable === true,
          reread: s.reread === true,
        }))
    : [];
  return {
    firstAt: ms(data.firstAt) ?? 0,
    lastAt: ms(data.lastAt) ?? 0,
    days: Array.isArray(data.days) ? data.days.filter((d: unknown): d is string => typeof d === 'string') : [],
    sessions,
    activeSeconds: Math.max(0, finite(data.activeSeconds)),
    maxProgress: clamp(finite(data.maxProgress), 0, 1),
    reachedEndAt: ms(data.reachedEndAt),
    rereads: Math.max(0, Math.floor(finite(data.rereads))),
    rereadAt: ms(data.rereadAt),
    shared: data.shared === true,
    reportDay: typeof data.reportDay === 'string' ? data.reportDay : '',
    reportsToday: Math.max(0, Math.floor(finite(data.reportsToday))),
  };
}

/** A record as stored (server Timestamps). */
export function signalDoc(uid: string, cardId: string, s: SignalState): DocumentData {
  return {
    userId: uid,
    cardId,
    firstAt: ts(s.firstAt),
    lastAt: ts(s.lastAt),
    days: s.days,
    sessions: s.sessions.map((x) => ({ ...x, startedAt: ts(x.startedAt), at: ts(x.at) })),
    activeSeconds: s.activeSeconds,
    maxProgress: s.maxProgress,
    reachedEndAt: s.reachedEndAt === null ? null : ts(s.reachedEndAt),
    rereads: s.rereads,
    rereadAt: s.rereadAt === null ? null : ts(s.rereadAt),
    shared: s.shared,
    reportDay: s.reportDay,
    reportsToday: s.reportsToday,
    expireAt: ts(s.lastAt + SIGNAL_KEEP_DAYS * DAY_MS),
  };
}

/** Every document of `collection` with this `cardId`, a batch at a time. */
async function deleteAllOn(db: AdminDb, collection: string, cardId: string): Promise<void> {
  const q = db.collection(collection).where('cardId', '==', cardId).select().limit(BATCH_MAX);
  for (;;) {
    const page = await q.get();
    if (page.empty) return;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < BATCH_MAX) return;
  }
}

/** `taps` inside a Firestore transaction. */
export function tapsTx(db: AdminDb, tx: Transaction): TapsTxRepo {
  return {
    async getTap(cardId, uid) {
      const snap = await tx.get(tapRef(db, cardId, uid));
      return snap.exists ? { on: snap.get('on') === true, rangAt: dateOf(snap.get('rangAt') ?? null) } : null;
    },
    async getTapCard(cardId) {
      const [current] = await tx.getAll(db.doc(`cards/${cardId}`), { fieldMask: [...CARD_VISIBILITY_FIELDS] });
      return current.exists ? mapCard(current.id, current.data()!) : null;
    },
    async connected(a, b) {
      return (await tx.get(db.doc(`connections/${pairOf(a, b)}`))).exists;
    },
    putTapOn(cardId, uid, at, rangAt) {
      tx.set(tapRef(db, cardId, uid), { cardId, userId: uid, on: true, at: Timestamp.fromDate(at), rangAt: rangAt ? Timestamp.fromDate(rangAt) : null });
    },
    turnTapOff(cardId, uid) {
      // Taking it back takes the pick with it (round 27): turning it on again starts without one.
      tx.update(tapRef(db, cardId, uid), { on: false, passage: null });
    },
    async getPassageCard(cardId) {
      const [current] = await tx.getAll(db.doc(`cards/${cardId}`), { fieldMask: [...CARD_VISIBILITY_FIELDS, 'story', 'tapPassages'] });
      return current.exists ? mapCard(current.id, current.data()!) : null;
    },
    setTapPassage(cardId, uid, passage) {
      tx.update(tapRef(db, cardId, uid), { passage: passage ? { id: passage.id, text: passage.text } : null });
    },

    async getSignal(uid, cardId) {
      return signalState((await tx.get(signalRef(db, uid, cardId))).data());
    },
    async cardLive(cardId) {
      const [current] = await tx.getAll(db.doc(`cards/${cardId}`), { fieldMask: ['publishedAt', 'trashedAt'] });
      return current.exists && current.get('trashedAt') == null && current.get('publishedAt') != null;
    },
    putSignal(uid, cardId, state, expectedSeconds) {
      // The story's reading time beside it: the recommender weighs a part read by it (lib/recommend/weights).
      tx.set(signalRef(db, uid, cardId), { ...signalDoc(uid, cardId, state), expectedSeconds });
    },

    async insertReadDayIfAbsent(uid, cardId, day, expireAt): Promise<ReadDayMark> {
      const marker = cardReadRef(db, uid, cardId);
      const [mark, current] = await tx.getAll(marker, db.doc(`cards/${cardId}`));
      if (mark.get('day') === day) return 'exists';
      if (!current.exists || current.get('trashedAt') != null) return 'gone';
      tx.set(marker, { userId: uid, cardId, day, expireAt: Timestamp.fromDate(expireAt) });
      return 'inserted';
    },
    incrementReadCount(cardId, by = 1) {
      // Never updatedAt: a read changes nothing a list shows.
      tx.update(db.doc(`cards/${cardId}`), { readCount: FieldValue.increment(by) });
    },
  };
}

/** `taps` outside a transaction. */
export function tapsData(db: AdminDb): TapsData {
  return {
    visibleCard: (viewerId, cardId) => visibleCardById(db, viewerId, cardId, CARD_VISIBILITY_FIELDS),
    canView: (card, viewerId) => canView(db, card, viewerId),

    async tapGate(uid, authorId): Promise<TapGate> {
      // Read alike for every card, whatever stands between the two.
      const [me, out, inn] = await db.getAll(db.doc(`users/${uid}`), db.doc(`users/${uid}/blocks/${authorId}`), db.doc(`users/${authorId}/blocks/${uid}`));
      return { penName: hasPenName(me), blocked: out.exists || inn.exists };
    },
    async blockedEitherWay(a, b) {
      const [ab, ba] = await db.getAll(db.doc(`users/${a}/blocks/${b}`), db.doc(`users/${b}/blocks/${a}`));
      return ab.exists || ba.exists;
    },
    async readerStanding(viewerId, authorId): Promise<ReaderStanding> {
      const pair = pairOf(viewerId, authorId);
      const [ab, ba, connection, letter, convo] = await db.getAll(
        db.doc(`users/${viewerId}/blocks/${authorId}`),
        db.doc(`users/${authorId}/blocks/${viewerId}`),
        db.doc(`connections/${pair}`),
        letterRef(db, viewerId, authorId),
        db.doc(`conversations/${pair}`),
      );
      return { blocked: ab.exists || ba.exists, connected: connection.exists, lettersLeft: lettersLeft(letter), requestFrom: openRequest(convo)?.from ?? null };
    },
    blockedBy: (uid) => blockedByViewer(db, uid),
    async blockersOf(uids, of) {
      const ids = uids.filter(docIdOk);
      const out = new Set<string>();
      for (let i = 0; i < ids.length; i += 100) {
        const snaps = await db.getAll(...ids.slice(i, i + 100).map((id) => db.doc(`users/${id}/blocks/${of}`)));
        snaps.forEach((s, j) => {
          if (s.exists) out.add(ids[i + j]);
        });
      }
      return out;
    },
    async tapIsOn(cardId, uid) {
      const own = await tapRef(db, cardId, uid).get();
      return own.exists && own.get('on') === true;
    },
    async ownTap(cardId, uid) {
      const own = await tapRef(db, cardId, uid).get();
      const on = own.exists && own.get('on') === true;
      return { on, passage: on ? storedPick(own.get('passage')) : null };
    },
    async connectionsOf(uid) {
      const links = await db.collection('connections').where('userIds', 'array-contains', uid).select('userIds').get();
      return [
        ...new Set(
          links.docs.flatMap((d) => {
            const ids = d.get('userIds');
            return Array.isArray(ids) ? ids.filter((id): id is string => docIdOk(id) && id !== uid) : [];
          }),
        ),
      ];
    },
    async tapsOnBy(cardId, uids) {
      // Only the taps that are on (B4): a query per 30 uids, side by side — billed by what it finds.
      const chunks: string[][] = [];
      for (let i = 0; i < uids.length; i += TAP_IN_CHUNK) chunks.push(uids.slice(i, i + TAP_IN_CHUNK));
      const pages = await Promise.all(
        chunks.map((ids) => db.collection(TAPS).where('cardId', '==', cardId).where('on', '==', true).where('userId', 'in', ids).get()),
      );
      return pages.flatMap((page) => page.docs.map(tapperOf).filter((t): t is Tapper => !!t));
    },
    async tapsOnPage(cardId, limit, after, passage): Promise<TapPage> {
      const from = after ? decodePageToken(after) : undefined;
      let base = db.collection(TAPS).where('cardId', '==', cardId).where('on', '==', true);
      // One picked sentence's people (round 29): the composite index (cardId, on, passage.id, at desc).
      if (passage) base = base.where('passage.id', '==', passage);
      let q = base
        .orderBy('at', 'desc')
        .orderBy(FieldPath.documentId(), 'desc')
        .limit(limit);
      if (from) q = q.startAfter(from.at, from.id);
      const page = await q.get();
      const last = page.docs.at(-1);
      const at = last?.get('at');
      return {
        tappers: page.docs.map(tapperOf).filter((t): t is Tapper => !!t),
        next: last && at instanceof Timestamp ? encodePageToken(at, last.id) : null,
        full: page.size === limit,
      };
    },
    async profiles(uids) {
      const ids = [...new Set(uids)].filter(docIdOk);
      const out = new Map<string, AuthorBody>();
      for (let i = 0; i < ids.length; i += 100) {
        const snaps = await db.getAll(...ids.slice(i, i + 100).map((id) => db.doc(`users/${id}`)));
        for (const s of snaps) if (s.exists) out.set(s.id, toAuthor(s.id, s.data()!));
      }
      return out;
    },
    async latestNotesTo(cardId, authorId, uids) {
      const out = new Map<string, { at: number; text: string }>();
      const ids = uids.filter(docIdOk);
      for (let i = 0; i < ids.length; i += 30) {
        const snap = await db
          .collection('notes')
          .where('cardId', '==', cardId)
          .where('fromUserId', 'in', ids.slice(i, i + 30))
          .select('fromUserId', 'toUserId', 'text', 'createdAt')
          .get();
        for (const d of snap.docs) {
          const from = d.get('fromUserId');
          const text = d.get('text');
          if (d.get('toUserId') !== authorId || typeof from !== 'string' || typeof text !== 'string') continue;
          const at = millisOf(d.get('createdAt'));
          const was = out.get(from);
          if (!was || at > was.at) out.set(from, { at, text });
        }
      }
      return new Map([...out].map(([uid, n]) => [uid, n.text]));
    },
    deleteTapsOn: (cardId) => deleteAllOn(db, TAPS, cardId),

    async readingGate(uid, cardId) {
      const [snap, kept] = await db.getAll(db.doc(`cards/${cardId}`), signalRef(db, uid, cardId), {
        fieldMask: [...CARD_VISIBILITY_FIELDS, 'story', 'reportDay', 'reportsToday'],
      });
      return {
        card: snap.exists ? mapCard(snap.id, snap.data()!) : null,
        kept: kept.exists ? { reportDay: kept.get('reportDay'), reportsToday: Number(kept.get('reportsToday')) } : null,
      };
    },
    deleteSignalsOn: (cardId) => deleteAllOn(db, READER_SIGNALS, cardId),

    async readCard(cardId) {
      const [snap] = await db.getAll(db.doc(`cards/${cardId}`), { fieldMask: [...CARD_VISIBILITY_FIELDS] });
      return snap.exists ? mapCard(snap.id, snap.data()!) : null;
    },
    async readMarkDay(uid, cardId) {
      const day = (await cardReadRef(db, uid, cardId).get()).get('day');
      return typeof day === 'string' ? day : null;
    },
  };
}
