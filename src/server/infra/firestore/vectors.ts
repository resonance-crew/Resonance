import type { VectorStore } from '@/server/ports/vectors';
import { lazyAsync } from '../wiring';
import type { AdminDb } from './db';

/**
 * Firestore's native KNN on `cardVectors` (src/lib/recommend/vectorStore's
 * FirestoreVectorStore, bound to this database, loaded on first use). The
 * recommend lane moves the implementation here and leaves the old path as a
 * re-export.
 */
export function firestoreVectors(db: AdminDb): VectorStore {
  return lazyAsync(async () => new (await import('@/lib/recommend/vectorStore/firestore')).FirestoreVectorStore(db));
}
