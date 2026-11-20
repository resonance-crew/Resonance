/**
 * The card-vector index: src/lib/recommend/vectorStore's IVectorStore, which
 * was already storage-agnostic. The recommend lane moves its Firestore
 * implementation under infra and may move the interface here.
 */
export type { IVectorStore as VectorStore } from '@/lib/recommend/vectorStore/interfaces';
export type { NearestHit, VectorChannel, VectorQuery, VectorRecord } from '@/lib/recommend/vectorStore/types';
