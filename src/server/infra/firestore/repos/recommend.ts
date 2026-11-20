import { FieldValue, Timestamp, type DocumentData, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import type { InsightSignature } from '@/lib/db/types';
import { RECOMMENDATIONS, readStored, shownCounts } from '@/lib/recommend/stored';
import type {
  CardIndexFields,
  ConnectionCard,
  PicksWrite,
  ReaderActivity,
  RecommendData,
  RecommendTxRepo,
  StoredPoolStats,
} from '@/server/ports/repos/recommend';
import type { AdminDb } from '../db';

// Today's Firestore code of src/lib/recommend, moved (daily, signals,
// profile, poolStats, collections, indexCard, indexOwed, warm). Nothing here
// reaches a model: every route's context builds this file
// (src/lib/ai/regions.test.ts follows the imports).

/** A card's reading (round 26 §A1.6), by card id — server-only. */
export const CARD_SIGNATURES = 'cardSignatures';
/** The pool's kept numbers (src/lib/recommend/poolStats) — server-only like all of config/*. */
export const POOL_STATS_DOC = 'config/recommendPool';
const USER_PROFILES = 'userProfiles';
const CARDS = 'cards';

/** What indexing reads of the card first: whether it is published, what the reading reads, whose it is, who may read it. */
const INDEX_FIELDS = ['publishedAt', 'thoughtCore', 'story', 'authorId', 'visibility', 'trashedAt', 'thin', 'signature.contentHash', 'indexPendingAt'];
/** What the vectors' visibility is decided by (vectorVisibility), for the reads that only follow it. */
const VISIBILITY_FIELDS = ['visibility', 'trashedAt'];

/** Firestore's NOT_FOUND: an update of a document that is gone. */
const isNotFound = (e: unknown) => (e as { code?: unknown } | null)?.code === 5;
const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : v instanceof Date ? v.getTime() : null);
const idOk = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/');

/** A build's result as written on `recommendations/{uid}` (./daily store). */
function picksFields(p: PicksWrite): DocumentData {
  return {
    date: p.date,
    items: p.items,
    partial: p.partial,
    coldStart: p.coldStart === true,
    generatedAt: FieldValue.serverTimestamp(),
    leaseUntil: FieldValue.delete(),
    failedAt: FieldValue.delete(),
    ...(p.warm ? { warm: true } : { warm: FieldValue.delete(), askedOn: p.date }),
  };
}

export function recommendTx(db: AdminDb, tx: Transaction): RecommendTxRepo {
  const picks = (uid: string) => db.collection(RECOMMENDATIONS).doc(uid);
  const card = (cardId: string) => db.collection(CARDS).doc(cardId);
  return {
    async getPicks(uid) {
      return readStored((await tx.get(picks(uid))).data());
    },
    async getShown(uid) {
      return shownCounts((await tx.get(picks(uid))).data());
    },
    putLease(uid, until) {
      tx.set(picks(uid), { leaseUntil: Timestamp.fromMillis(until) }, { merge: true });
    },
    putServedPicks(uid, p, shown) {
      tx.set(picks(uid), { ...picksFields(p), shown }, { merge: true });
    },
    putAsked(uid, day, shown) {
      // `shown` whole: a merge would keep a count countShown dropped.
      tx.set(picks(uid), { askedOn: day, shown }, { mergeFields: ['askedOn', 'shown'] });
    },
    async getCardText(cardId) {
      const [now] = await tx.getAll(card(cardId), { fieldMask: ['thoughtCore', 'story', 'signature', 'thin'] });
      if (!now.exists) return null;
      return {
        thoughtCore: now.get('thoughtCore'),
        story: now.get('story'),
        thin: now.get('thin') === true,
        signature: now.get('signature') as InsightSignature | undefined,
      };
    },
    async cardExists(cardId) {
      const [now] = await tx.getAll(card(cardId), { fieldMask: ['authorId'] });
      return now.exists;
    },
    patchCardIndexed(cardId, hash) {
      tx.update(card(cardId), { 'signature.contentHash': hash, indexPendingAt: FieldValue.delete() });
    },
    patchCardThin(cardId, thin) {
      tx.update(card(cardId), { thin: thin ? true : FieldValue.delete() });
    },
    putReading(cardId, row) {
      tx.set(db.collection(CARD_SIGNATURES).doc(cardId), { ...row, updatedAt: FieldValue.serverTimestamp() });
    },
    mergeReadingFailure(cardId, failure) {
      tx.set(db.collection(CARD_SIGNATURES).doc(cardId), { ...failure, failedAt: FieldValue.serverTimestamp() }, { merge: true });
    },
  };
}

function cardIndexFields(snap: DocumentSnapshot): CardIndexFields {
  const data = snap.data() ?? {};
  return {
    publishedAt: data.publishedAt,
    thoughtCore: data.thoughtCore,
    story: data.story,
    authorId: data.authorId,
    visibility: data.visibility,
    trashed: data.trashedAt != null,
    thin: data.thin === true,
    contentHash: typeof data.signature?.contentHash === 'string' ? data.signature.contentHash : undefined,
    indexPending: data.indexPendingAt != null,
  };
}

export function recommendData(db: AdminDb): RecommendData {
  const picks = (uid: string) => db.collection(RECOMMENDATIONS).doc(uid);
  const card = (cardId: string) => db.collection(CARDS).doc(cardId);
  return {
    async getPicks(uid) {
      return readStored((await picks(uid).get()).data());
    },
    async putPicks(uid, p) {
      await picks(uid).set(picksFields(p), { merge: true });
    },
    async putFailure(uid, at) {
      await picks(uid).set({ failedAt: Timestamp.fromMillis(at), leaseUntil: FieldValue.delete() }, { merge: true });
    },
    async putProfile(uid, taste, against) {
      await db.collection(USER_PROFILES).doc(uid).set({ taste, against, updatedAt: FieldValue.serverTimestamp() });
    },

    async readerActivity(uid, limit) {
      const [own, notes, taps, saved, reading, stored] = await Promise.all([
        db.collection(CARDS).where('authorId', '==', uid).select('referenceCardId', 'publishedAt', 'trashedAt').limit(limit).get(),
        db.collection('notes').where('fromUserId', '==', uid).select('cardId', 'createdAt').limit(limit).get(),
        db.collection('resonanceTaps').where('userId', '==', uid).select('cardId', 'on', 'at').limit(limit).get(),
        db.collection(`users/${uid}/bookmarks`).select('cardId', 'createdAt').limit(limit).get(),
        db
          .collection('readerSignals')
          .where('userId', '==', uid)
          .select('cardId', 'lastAt', 'reachedEndAt', 'rereads', 'rereadAt', 'shared', 'activeSeconds', 'maxProgress', 'expectedSeconds')
          .limit(limit)
          .get(),
        picks(uid).get(),
      ]);
      const activity: ReaderActivity = {
        own: own.docs.map((d) => ({ id: d.id, publishedAt: ms(d.get('publishedAt')), trashed: d.get('trashedAt') != null, referenceCardId: d.get('referenceCardId') })),
        notes: notes.docs.map((d) => ({ cardId: d.get('cardId'), createdAt: ms(d.get('createdAt')) })),
        taps: taps.docs.map((d) => ({ cardId: d.get('cardId'), on: d.get('on') === true, at: ms(d.get('at')) })),
        saved: saved.docs.map((d) => ({ id: d.id, cardId: d.get('cardId'), createdAt: ms(d.get('createdAt')) })),
        reading: reading.docs.map((d) => ({
          cardId: d.get('cardId'),
          lastAt: ms(d.get('lastAt')),
          reachedEndAt: ms(d.get('reachedEndAt')),
          rereads: d.get('rereads'),
          rereadAt: ms(d.get('rereadAt')),
          shared: d.get('shared') === true,
          activeSeconds: d.get('activeSeconds'),
          maxProgress: d.get('maxProgress'),
          expectedSeconds: d.get('expectedSeconds'),
        })),
        shown: shownCounts(stored.data()),
      };
      return activity;
    },
    async connectionIds(uid) {
      const snap = await db.collection('connections').where('userIds', 'array-contains', uid).select('userIds').get();
      const out = new Set<string>();
      for (const d of snap.docs) for (const id of (d.get('userIds') ?? []) as unknown[]) if (idOk(id) && id !== uid) out.add(id);
      return [...out].sort();
    },
    async engagedAuthorIds(uid) {
      // The reader's own cards that reference another card = their resonances.
      const mine = await db.collection(CARDS).where('authorId', '==', uid).select('referenceCardId', 'publishedAt', 'visibility', 'anonymous').limit(100).get();
      const refIds = Array.from(
        new Set(
          mine.docs
            .filter((d) => d.get('publishedAt') != null && d.get('visibility') === 'public' && d.get('anonymous') !== true)
            .map((d) => d.get('referenceCardId'))
            .filter((id): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/')),
        ),
      );
      if (refIds.length === 0) return new Set();
      const referenced = await db.getAll(...refIds.map((id) => card(id)), { fieldMask: ['authorId', 'anonymous'] });
      const authors = new Set<string>();
      for (const snap of referenced) {
        const authorId = snap.get('authorId');
        // An anonymous original names no one: boosting its author's other cards
        // would show a reader who answered only it whose card it was.
        if (snap.get('anonymous') === true) continue;
        if (typeof authorId === 'string' && authorId !== uid) authors.add(authorId);
      }
      return authors;
    },
    async namedCardIds(cardIds) {
      const ids = [...new Set(cardIds.filter((id) => id.length > 0 && !id.includes('/')))];
      if (!ids.length) return new Set();
      const snaps = await db.getAll(...ids.map((id) => card(id)), { fieldMask: ['anonymous'] });
      return new Set(snaps.filter((s) => s.exists && s.get('anonymous') !== true).map((s) => s.id));
    },
    async unlistedForStrangers(cardIds) {
      const ids = [...new Set(cardIds.filter((id) => id && !id.includes('/')))];
      if (!ids.length) return new Set();
      const snaps = await db.getAll(...ids.map((id) => db.collection(CARD_SIGNATURES).doc(id)), { fieldMask: ['listedForStrangers'] });
      return new Set(snaps.filter((s) => s.exists && s.get('listedForStrangers') === false).map((s) => s.id));
    },
    async connectionCards(authorIds) {
      if (!authorIds.length) return [];
      const snap = await db
        .collection(CARDS)
        .where('authorId', 'in', authorIds)
        .select('authorId', 'visibility', 'anonymous', 'publishedAt', 'trashedAt', 'thin', 'signature.placeholder')
        .limit(200)
        .get();
      const out: ConnectionCard[] = [];
      for (const d of snap.docs) {
        if (d.get('visibility') !== 'public' || d.get('anonymous') === true || d.get('publishedAt') == null || d.get('trashedAt') != null) continue;
        if (d.get('thin') === true || d.get('signature.placeholder') === true) continue;
        out.push({ cardId: d.id, authorId: String(d.get('authorId')), publishedAt: d.get('publishedAt').toMillis() });
      }
      return out;
    },

    async getPoolStats(embedModel) {
      const data = (await db.doc(POOL_STATS_DOC).get()).data();
      if (!data || data.embedModel !== embedModel) return null;
      const vec = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      const r: Record<string, number> = {};
      if (data.r && typeof data.r === 'object') for (const [k, v] of Object.entries(data.r as Record<string, unknown>)) if (typeof v === 'number') r[k] = v;
      const stats: StoredPoolStats = {
        mu: { insight: vec(data.mu?.insight), situation: vec(data.mu?.situation) },
        r,
        tau: num(data.tau),
        tauSituation: num(data.tauSituation),
        cards: num(data.cards),
        embedModel,
        at: data.at instanceof Timestamp ? data.at.toMillis() : 0,
      };
      return stats;
    },
    async putPoolStats(stats) {
      await db.doc(POOL_STATS_DOC).set({ ...stats, at: FieldValue.serverTimestamp() });
    },

    async getCardForIndex(cardId) {
      const [snap] = await db.getAll(card(cardId), { fieldMask: INDEX_FIELDS });
      return snap.exists ? cardIndexFields(snap) : null;
    },
    async getCardVisibility(cardId) {
      const [now] = await db.getAll(card(cardId), { fieldMask: VISIBILITY_FIELDS });
      if (!now.exists) return null;
      const data = now.data() ?? {};
      return { visibility: data.visibility, trashed: data.trashedAt != null };
    },
    async markIndexPending(cardId) {
      try {
        await card(cardId).update({ indexPendingAt: FieldValue.serverTimestamp() });
        return 'ok';
      } catch (e) {
        if (isNotFound(e)) return 'not-found';
        throw e;
      }
    },
    async clearIndexPending(cardId) {
      await card(cardId)
        .update({ indexPendingAt: FieldValue.delete() })
        .catch((e) => (isNotFound(e) ? undefined : Promise.reject(e)));
    },
    async putCardSignature(cardId, signature) {
      try {
        await card(cardId).update({ signature, indexedAt: FieldValue.serverTimestamp() });
        return 'ok';
      } catch (e) {
        if (isNotFound(e)) return 'not-found';
        throw e;
      }
    },
    async listIndexPending(limit) {
      const snap = await db.collection(CARDS).where('indexPendingAt', '!=', null).orderBy('indexPendingAt', 'asc').select().limit(limit).get();
      return snap.docs.map((d) => d.id);
    },
    async listTemplated(limit) {
      const snap = await db.collection(CARD_SIGNATURES).where('templated', '==', true).select('rewritten').limit(limit).get();
      return snap.docs.map((d) => ({ cardId: d.id, rewritten: d.get('rewritten') === true }));
    },

    async warmInputs(uid) {
      const { PICK_PUSHES, readPickLog } = await import('@/lib/push/picks');
      const [devices, stored, log] = await Promise.all([
        db.collection('devices').where('userId', '==', uid).select('token', 'updatedAt').get(),
        db.doc(`${RECOMMENDATIONS}/${uid}`).get(),
        db.doc(`${PICK_PUSHES}/${uid}`).get(),
      ]);
      const lastSeen = Math.max(0, ...devices.docs.filter((d) => typeof d.get('token') === 'string' && d.get('token')).map((d) => ms(d.get('updatedAt')) ?? 0));
      return { lastSeen, picks: readStored(stored.data()), pickLog: readPickLog(log.data()) };
    },
    async *pickReaders(opts) {
      const { optedIn } = await import('@/lib/push/settings');
      yield* optedIn(db, 'picks', opts);
    },
  };
}
