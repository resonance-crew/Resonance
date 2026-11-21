/**
 * The card-vector index: src/lib/recommend/vectorStore's IVectorStore, which
 * was already storage-agnostic. Adapters: infra/firestore/vectors.ts
 * (Firestore's KNN on `cardVectors`) and infra/memory/vectors.ts (exact
 * cosine, for tests); the routes' store is still getVectorStore()
 * (`RECO_VECTOR_BACKEND`), which the recommend facades pass in.
 */
export type { IVectorStore as VectorStore } from '@/lib/recommend/vectorStore/interfaces';
export type { NearestHit, VectorChannel, VectorQuery, VectorRecord } from '@/lib/recommend/vectorStore/types';
