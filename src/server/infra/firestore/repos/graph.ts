import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { clearLetters, holdsRequest } from '@/lib/api/v1/conversations';
import { visibleCardById } from '@/lib/api/v1/reads';
import { mapCard } from '@/lib/db/firestore/mapper';
import {
  ORIGINS,
  docId,
  isMap,
  keepsReasons,
  pairKey,
  resonanceBellId,
  resonanceCardsOf,
  takeBackCandidate,
  takeBackPlan,
  type ConnectionReason,
  type KeyedReason,
  type Origins,
  type ResonanceCard,
  type TakeBackPlan,
} from '@/server/domain/graph';
import type { GraphCard, GraphData, GraphTxRepo, PairReads, Reach } from '@/server/ports/repos/graph';
import type { AdminDb } from '../db';

// Today's queries and transaction code of src/lib/api/v1/{resonate,origins,
// invites,preLetter}.ts, moved here as they were: the same documents, the
// legacy bell's four-field equality query, the in-transaction array-contains
// query, `FieldValue.arrayUnion` / `arrayRemove`, the `FieldPath` delete,
// server timestamps.

export const originsRef = (db: AdminDb, a: string, b: string) => db.doc(`${ORIGINS}/${pairKey(a, b)}`);

/** Origins as a service reads them; null when the document is absent. */
export function originsOf(snap: DocumentSnapshot | null | undefined): Origins | null {
  if (!snap?.exists) return null;
  const reasons = snap.get('reasons');
  return { reasons: isMap(reasons) ? reasons : null };
}

/** A card's fields as its reach reads them (`properlyPublished` takes a Timestamp only). */
export function resonanceCardOf(data: DocumentData): ResonanceCard {
  return {
    authorId: data.authorId,
    referenceCardId: data.referenceCardId,
    visibility: data.visibility,
    anonymous: data.anonymous,
    publishedAt: data.publishedAt instanceof Timestamp ? data.publishedAt.toDate() : null,
  };
}

const profileOf = (snap: DocumentSnapshot): Record<string, unknown> | null => (snap.exists ? (snap.data() ?? {}) : null);

/** A reason as stored: with when it was given. */
const stored = (reason: ConnectionReason) => ({ ...reason, at: FieldValue.serverTimestamp() });

/**
 * A resonance bell from before they had a fixed id: `type: 'resonance'` rows
 * under random ids, with the same payload (src/lib/api/v1/resonate.ts
 * `legacyBell`). Equality on four fields only, so Firestore merges its
 * single-field indexes: no composite index.
 */
const legacyBell = (db: AdminDb, from: string, author: string, originalId: string) =>
  db
    .collection('notifications')
    .where('userId', '==', author)
    .where('type', '==', 'resonance')
    .where('payload.fromUserId', '==', from)
    .where('payload.cardId', '==', originalId)
    .limit(1);

// --- the writes, shared by the repo and the legacy Transaction helpers ------------------------------------------

function connectIn(tx: Transaction, db: AdminDb, [a, b]: [string, string], { key, reason }: KeyedReason, opts: { extra?: Record<string, unknown> } = {}) {
  const userIds = [a, b].sort();
  tx.set(db.doc(`connections/${pairKey(a, b)}`), { userIds, establishedAt: FieldValue.serverTimestamp(), ...opts.extra });
  tx.set(originsRef(db, a, b), {
    userIds,
    reasons: { [key]: stored(reason) },
    resonanceCards: reason.kind === 'resonance' ? [reason.cardId] : [],
  });
}

function addReasonIn(tx: Transaction, db: AdminDb, [a, b]: [string, string], origins: Origins | null, added: (KeyedReason | null)[]) {
  const list = added.filter((r): r is KeyedReason => r != null);
  if (!list.length) return;
  const legacy = keepsReasons(origins) ? {} : { legacy: stored({ kind: 'legacy' }) };
  const cards = resonanceCardsOf(list);
  tx.set(
    originsRef(db, a, b),
    {
      userIds: [a, b].sort(),
      reasons: { ...legacy, ...Object.fromEntries(list.map(({ key, reason }) => [key, stored(reason)])) },
      ...(cards.length ? { resonanceCards: FieldValue.arrayUnion(...cards) } : {}),
    },
    { merge: true },
  );
}

/** What taking one resonance back does to one pair, with the documents it writes (the legacy helpers' shape). */
export interface TakeBack extends TakeBackPlan {
  origins: DocumentReference;
  connection: DocumentReference;
}

async function readTakeBackIn(tx: Transaction, db: AdminDb, uid: string, cardId: string): Promise<TakeBack[]> {
  const found = await tx.get(db.collection(ORIGINS).where('resonanceCards', 'array-contains', cardId).limit(10));
  const mine = found.docs.filter((d) => takeBackCandidate(uid, cardId, originsOf(d)!, d.get('userIds')));
  const connections = await Promise.all(mine.map((d) => tx.get(db.doc(`connections/${d.id}`))));
  return mine.map((d, i) => ({
    ...takeBackPlan(uid, cardId, d.id, originsOf(d)!, connections[i].exists),
    origins: d.ref,
    connection: connections[i].ref,
  }));
}

function takeBackIn(tx: Transaction, plans: TakeBack[]): void {
  for (const p of plans) {
    if (p.ends) {
      tx.delete(p.connection);
      tx.delete(p.origins);
    } else {
      tx.update(p.origins, new FieldPath('reasons', p.key), FieldValue.delete(), 'resonanceCards', FieldValue.arrayRemove(p.cardId));
    }
  }
}

async function readReachIn(tx: Transaction, db: AdminDb, from: string, originalId: string): Promise<Reach> {
  const bellId = resonanceBellId(from, originalId);
  const [snap, me, bell] = await Promise.all([
    tx.get(db.doc(`cards/${originalId}`)),
    tx.get(db.doc(`users/${from}`)),
    tx.get(db.doc(`notifications/${bellId}`)),
  ]);
  const original = snap.exists ? mapCard(snap.id, snap.data()!) : null;
  const none: Reach = {
    from, originalId, original, me: profileOf(me), bellId, rang: bell.exists, blockOut: false, blockIn: false, connected: false, origins: null,
  };
  const other = original?.authorId;
  if (!docId(other) || other === from) return none;
  const [out, inn, connection, origins, legacy] = await Promise.all([
    tx.get(db.doc(`users/${from}/blocks/${other}`)),
    tx.get(db.doc(`users/${other}/blocks/${from}`)),
    tx.get(db.doc(`connections/${pairKey(from, other)}`)),
    tx.get(originsRef(db, from, other)),
    bell.exists ? null : tx.get(legacyBell(db, from, other, originalId)),
  ]);
  return {
    ...none,
    rang: bell.exists || legacy?.empty === false,
    blockOut: out.exists,
    blockIn: inn.exists,
    connected: connection.exists,
    origins: originsOf(origins),
  };
}

// --- the legacy Transaction helpers (re-exported by src/lib/api/v1/origins.ts) ----------------------------------

/** See src/lib/api/v1/origins.ts. */
export function connect(tx: Transaction, db: AdminDb, pair: [string, string], reason: KeyedReason, opts: { extra?: Record<string, unknown> } = {}): void {
  connectIn(tx, db, pair, reason, opts);
}

/** See src/lib/api/v1/origins.ts (`origins` as read in the same transaction). */
export function addReason(tx: Transaction, db: AdminDb, pair: [string, string], origins: DocumentSnapshot | null, ...added: (KeyedReason | null)[]): void {
  addReasonIn(tx, db, pair, originsOf(origins), added);
}

/** See src/lib/api/v1/origins.ts. */
export function readTakeBack(tx: Transaction, db: AdminDb, uid: string, cardId: string): Promise<TakeBack[]> {
  return readTakeBackIn(tx, db, uid, cardId);
}

/** See src/lib/api/v1/origins.ts. */
export function takeBack(tx: Transaction, plans: TakeBack[]): void {
  takeBackIn(tx, plans);
}

/** See src/lib/api/v1/resonate.ts. */
export function readReach(tx: Transaction, db: AdminDb, from: string, originalId: string): Promise<Reach> {
  return readReachIn(tx, db, from, originalId);
}

// --- the repositories ----------------------------------------------------------------------------------------------

/** `graph` inside a Firestore transaction. */
export function graphTx(db: AdminDb, tx: Transaction): GraphTxRepo {
  return {
    async getCard(cardId): Promise<GraphCard | null> {
      const snap = await tx.get(db.doc(`cards/${cardId}`));
      if (!snap.exists) return null;
      const data = snap.data()!;
      const slug = data.slug;
      return { card: mapCard(cardId, data), resonance: resonanceCardOf(data), trashed: data.trashedAt != null, slug: typeof slug === 'string' ? slug : null };
    },
    async findAnswers(uid, targetId, limit) {
      const snap = await tx.get(db.collection('cards').where('authorId', '==', uid).where('referenceCardId', '==', targetId).limit(limit));
      return snap.docs.map((d) => d.id);
    },
    readReach: (from, originalId) => readReachIn(tx, db, from, originalId),
    async readTakeBack(uid, cardId) {
      return (await readTakeBackIn(tx, db, uid, cardId)).map(({ pair, key, cardId: id, ends }) => ({ pair, key, cardId: id, ends }));
    },
    async getInvite(inviteId) {
      const snap = await tx.get(db.doc(`invites/${inviteId}`));
      if (!snap.exists) return null;
      const expiresAt = snap.get('expiresAt');
      return {
        fromUserId: snap.get('fromUserId'),
        toUserId: snap.get('toUserId'),
        status: snap.get('status'),
        expiresAt: expiresAt instanceof Timestamp ? expiresAt.toDate() : null,
      };
    },
    async readPair(uid, other): Promise<PairReads> {
      const pair = pairKey(uid, other);
      const [me, blockOut, blockIn, existing, origins, conversation] = await Promise.all([
        tx.get(db.doc(`users/${uid}`)),
        tx.get(db.doc(`users/${uid}/blocks/${other}`)),
        tx.get(db.doc(`users/${other}/blocks/${uid}`)),
        tx.get(db.doc(`connections/${pair}`)),
        tx.get(originsRef(db, uid, other)),
        tx.get(db.doc(`conversations/${pair}`)),
      ]);
      return {
        me: profileOf(me),
        blockOut: blockOut.exists,
        blockIn: blockIn.exists,
        connected: existing.exists,
        origins: originsOf(origins),
        requestHeld: holdsRequest(conversation),
      };
    },

    pointCard(cardId, targetId) {
      tx.update(db.doc(`cards/${cardId}`), { referenceCardId: targetId });
    },
    unpointCard(cardId) {
      tx.update(db.doc(`cards/${cardId}`), { referenceCardId: FieldValue.delete() });
    },
    connect: (pair, reason, opts) => connectIn(tx, db, pair, reason, opts),
    addReason: (pair, origins, ...added) => addReasonIn(tx, db, pair, origins, added),
    takeBack(plans) {
      takeBackIn(
        tx,
        plans.map((p) => ({ ...p, origins: db.doc(`${ORIGINS}/${p.pair}`), connection: db.doc(`connections/${p.pair}`) })),
      );
    },
    ringResonance(bellId, b) {
      tx.set(db.doc(`notifications/${bellId}`), {
        userId: b.to,
        type: 'resonance',
        payload: { fromUserId: b.from, fromHandle: b.fromHandle, cardId: b.cardId, ...(b.anonymous ? { anonymous: true } : {}) },
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    },
    setInviteStatus(inviteId, status) {
      tx.update(db.doc(`invites/${inviteId}`), { status });
    },
    ringInviteAccepted(to, payload) {
      const bell = db.collection('notifications').doc();
      tx.set(bell, { userId: to, type: 'invite_accepted', payload, readAt: null, createdAt: FieldValue.serverTimestamp() });
      return bell.id;
    },
    answerLetters(a, b, requestHeld) {
      if (requestHeld) tx.update(db.doc(`conversations/${pairKey(a, b)}`), { request: FieldValue.delete() });
      clearLetters(tx, db, a, b);
    },
  };
}

/** `graph` outside a transaction. */
export function graphData(db: AdminDb): GraphData {
  const at = (d: DocumentSnapshot) => {
    const v = d.get('updatedAt') as { toMillis?: () => number } | undefined;
    return typeof v?.toMillis === 'function' ? v.toMillis() : 0;
  };
  return {
    visibleCard: (viewerId, cardId) => visibleCardById(db, viewerId, cardId),
    async hasBlocked(a, b) {
      return (await db.doc(`users/${a}/blocks/${b}`).get()).exists;
    },
    async deviceLocale(uid, platform) {
      const devices = await db.collection('devices').where('userId', '==', uid).select('platform', 'locale', 'updatedAt').get();
      const registered = devices.docs.filter((d) => d.get('platform') === platform && typeof d.get('locale') === 'string').sort((x, y) => at(y) - at(x))[0];
      return registered ? (registered.get('locale') as string) : null;
    },
    async primaryLocale(uid) {
      return (await db.doc(`users/${uid}`).get()).get('primaryLocale');
    },
  };
}
