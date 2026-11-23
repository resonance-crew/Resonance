import { FieldValue, Timestamp, type DocumentData, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
// The path the emulator suites `vi.mock`, so a store made without a database takes theirs.
import { getAdminDb } from '@/lib/db/firestore/admin';
import type { Visibility } from '@/lib/db/types';
import type { NearestHit, VectorChannel, VectorQuery, VectorRecord, VectorStore } from '@/server/ports/vectors';
import type { AdminDb } from './db';

const COLLECTION = 'cardVectors';
const DISTANCE_FIELD = '__distance';
/** The record's fields beside the vector. */
const RECORD_FIELDS = ['cardId', 'authorId', 'visibility', 'channel', 'part', 'embedModel', 'insightScore', 'coreInsight', 'situation', 'lifeDomain', 'span'];
/**
 * What a hit carries back: the record, not the 1536-float vector. The
 * distance field must be in the projection or Firestore leaves it out.
 */
const HIT_FIELDS = [...RECORD_FIELDS, DISTANCE_FIELD];
/** Firestore's `in` takes 30 values. */
const IN_CHUNK = 30;
/** A batch's limit on writes. */
const BATCH_MAX = 500;

/** Deterministic doc id so reading a card again writes its parts in place. */
export function vectorDocId(cardId: string, channel: VectorChannel, part: number): string {
  return `${cardId}__${channel}__${part}`;
}

function toRecord(data: DocumentData, withVector: boolean): VectorRecord {
  return {
    cardId: String(data.cardId),
    authorId: String(data.authorId),
    visibility: data.visibility,
    channel: data.channel === 'situation' ? 'situation' : 'insight',
    part: Number.isInteger(data.part) ? Number(data.part) : 0,
    vector: withVector ? ((data.vector?.toArray?.() ?? []) as number[]) : [],
    embedModel: typeof data.embedModel === 'string' ? data.embedModel : '',
    insightScore: Number(data.insightScore ?? 0),
    coreInsight: String(data.coreInsight ?? ''),
    situation: String(data.situation ?? ''),
    lifeDomain: String(data.lifeDomain ?? ''),
    span: String(data.span ?? ''),
  };
}

/**
 * Firestore-native KNN backend (moved here from src/lib/recommend/vectorStore/firestore.ts, which re-exports it). Vectors live in the `cardVectors` collection,
 * one doc per `(cardId, channel, part)`, written with {@link FieldValue.vector}.
 * The `visibility` pre-filter is the privacy boundary — others' feeds only
 * ever see `public` records (see `firebase/firestore.rules`, which deny all
 * client access to this collection).
 *
 * Requires a composite vector index on `(visibility, channel, vector)` — see
 * `firestore.indexes.json` (an index serves every distance measure).
 */
export class FirestoreVectorStore implements VectorStore {
  /** `firestore` for tests against the emulator; the app's admin database otherwise. */
  constructor(private readonly firestore?: Firestore) {}

  private db(): Firestore {
    return this.firestore ?? getAdminDb();
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = this.db();
    const keep = new Set(records.map((r) => vectorDocId(r.cardId, r.channel, r.part)));
    // The references only: a vector is 1536 floats nobody here reads.
    const cards = [...new Set(records.map((r) => r.cardId))];
    const existing = await Promise.all(cards.map((id) => db.collection(COLLECTION).where('cardId', '==', id).select().get()));
    const batch = db.batch();
    for (const r of records) {
      batch.set(db.collection(COLLECTION).doc(vectorDocId(r.cardId, r.channel, r.part)), {
        cardId: r.cardId,
        authorId: r.authorId,
        visibility: r.visibility,
        channel: r.channel,
        part: r.part,
        vector: FieldValue.vector(r.vector),
        embedModel: r.embedModel,
        insightScore: r.insightScore,
        coreInsight: r.coreInsight,
        situation: r.situation,
        lifeDomain: r.lifeDomain,
        span: r.span,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    for (const snap of existing) for (const d of snap.docs) if (!keep.has(d.id)) batch.delete(d.ref);
    await batch.commit();
  }

  async deleteByCard(cardId: string): Promise<void> {
    const snap = await this.db().collection(COLLECTION).where('cardId', '==', cardId).select().get();
    if (snap.empty) return;
    const batch = this.db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  async setVisibility(cardId: string, visibility: Visibility): Promise<void> {
    const snap = await this.db().collection(COLLECTION).where('cardId', '==', cardId).select().get();
    if (snap.empty) return;
    const batch = this.db().batch();
    snap.docs.forEach((d) => batch.update(d.ref, { visibility, updatedAt: FieldValue.serverTimestamp() }));
    await batch.commit();
  }

  async listByVisibility(visibility: Visibility, channel?: VectorChannel): Promise<VectorRecord[]> {
    let query = this.db().collection(COLLECTION).where('visibility', '==', visibility);
    if (channel) query = query.where('channel', '==', channel);
    const out: VectorRecord[] = [];
    // A page at a time: the pool's vectors are 12 KB each.
    let last: QueryDocumentSnapshot | null = null;
    for (;;) {
      let page = query.select(...RECORD_FIELDS, 'vector').orderBy('__name__').limit(BATCH_MAX);
      if (last) page = page.startAfter(last);
      const snap = await page.get();
      for (const d of snap.docs) out.push(toRecord(d.data(), true));
      if (snap.size < BATCH_MAX) return out.filter((r) => r.vector.length > 0);
      last = snap.docs[snap.docs.length - 1];
    }
  }

  async listByCards(cardIds: string[]): Promise<VectorRecord[]> {
    const ids = [...new Set(cardIds.filter((id) => id && !id.includes('/')))];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK));
    // Side by side (B9): a taste of hundreds of cards was ten or more reads one after another.
    const snaps = await Promise.all(
      chunks.map((chunk) => this.db().collection(COLLECTION).where('cardId', 'in', chunk).select(...RECORD_FIELDS, 'vector').get()),
    );
    return snaps.flatMap((snap) => snap.docs.map((d) => toRecord(d.data(), true))).filter((r) => r.vector.length > 0);
  }

  async listChangedSince(since: Date, max: number): Promise<VectorRecord[] | null> {
    // One range on `updatedAt` alone: its automatic single-field index, no composite one (P0 #7).
    const snap = await this.db()
      .collection(COLLECTION)
      .where('updatedAt', '>', Timestamp.fromDate(since))
      .select(...RECORD_FIELDS, 'vector')
      .limit(max + 1)
      .get();
    if (snap.size > max) return null;
    return snap.docs.map((d) => toRecord(d.data(), true));
  }

  async nearest(query: VectorQuery): Promise<NearestHit[]> {
    const snap = await this.db()
      .collection(COLLECTION)
      .where('visibility', '==', query.filter.visibility)
      .where('channel', '==', query.channel)
      .select(...HIT_FIELDS)
      .findNearest({
        vectorField: 'vector',
        queryVector: FieldValue.vector(query.vector),
        limit: query.limit,
        // COSINE answers 1 − cos θ: smaller is closer, as the funnel ranks.
        distanceMeasure: 'COSINE',
        distanceResultField: DISTANCE_FIELD,
      })
      .get();

    const hits: NearestHit[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      // `excludeAuthorId` is applied in code rather than as a `!=` pre-filter so
      // the composite vector index stays equality-only (the author's own cards
      // are few, so over-fetch + drop is cheaper than a second index).
      if (query.filter.excludeAuthorId && data.authorId === query.filter.excludeAuthorId) continue;
      hits.push({ record: toRecord(data, false), distance: Number(data[DISTANCE_FIELD] ?? 0) });
    }
    return hits;
  }
}

/**
 * The vector index on this database (ServerCtx.vectors in ctxFor). Building
 * it reads nothing; the routes' production store is still
 * src/lib/recommend/vectorStore getVectorStore() (`RECO_VECTOR_BACKEND`),
 * which the legacy facades pass in.
 */
export function firestoreVectors(db: AdminDb): VectorStore {
  return new FirestoreVectorStore(db);
}
