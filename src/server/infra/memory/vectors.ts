import type { NearestHit, VectorQuery, VectorRecord, VectorStore } from '@/server/ports/vectors';

/** Firestore's vector doc id, so a reading written again replaces its parts in place. */
const keyOf = (r: Pick<VectorRecord, 'cardId' | 'channel' | 'part'>) => `${r.cardId}__${r.channel}__${r.part}`;

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? 1 - dot / Math.sqrt(na * nb) : 1;
}

/** An in-memory vector index with every record kept (`records`, to inspect). */
export interface MemoryVectorStore extends VectorStore {
  readonly records: Map<string, VectorRecord>;
}

/**
 * The vector index in memory, for tests: what FirestoreVectorStore does,
 * with an exact COSINE search (1 − cos θ, smallest first) in place of
 * Firestore's KNN. Records go in and come out copied.
 */
export function memoryVectors(seed: VectorRecord[] = []): MemoryVectorStore {
  const records = new Map<string, VectorRecord>();
  const copy = (r: VectorRecord): VectorRecord => ({ ...r, vector: [...r.vector] });
  const ofCard = (cardId: string) => [...records.values()].filter((r) => r.cardId === cardId);
  for (const r of seed) records.set(keyOf(r), copy(r));
  return {
    records,
    async upsert(list) {
      if (!list.length) return;
      const keep = new Set(list.map(keyOf));
      for (const cardId of new Set(list.map((r) => r.cardId))) for (const r of ofCard(cardId)) if (!keep.has(keyOf(r))) records.delete(keyOf(r));
      for (const r of list) records.set(keyOf(r), copy(r));
    },
    async deleteByCard(cardId) {
      for (const r of ofCard(cardId)) records.delete(keyOf(r));
    },
    async setVisibility(cardId, visibility) {
      for (const r of ofCard(cardId)) records.set(keyOf(r), { ...r, visibility });
    },
    async listByVisibility(visibility, channel) {
      return [...records.values()].filter((r) => r.visibility === visibility && (!channel || r.channel === channel) && r.vector.length > 0).map(copy);
    },
    async listByCards(cardIds) {
      const ids = new Set(cardIds);
      return [...records.values()].filter((r) => ids.has(r.cardId) && r.vector.length > 0).map(copy);
    },
    async nearest(query: VectorQuery): Promise<NearestHit[]> {
      return [...records.values()]
        .filter((r) => r.visibility === query.filter.visibility && r.channel === query.channel)
        .map((r) => ({ record: { ...r, vector: [] }, distance: cosineDistance(r.vector, query.vector) }))
        .sort((a, b) => a.distance - b.distance || (keyOf(a.record) < keyOf(b.record) ? -1 : 1))
        .slice(0, query.limit)
        .filter((h) => !query.filter.excludeAuthorId || h.record.authorId !== query.filter.excludeAuthorId);
    },
  };
}
