import { getAdminDb } from '@/lib/db/firestore/admin';
import { indexCardIn, type IndexOptions, type IndexResult } from '@/server/app/recommendIndex';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { getVectorStore } from './vectorStore';

/**
 * The write-time pipeline, run once per published card — now
 * src/server/app/recommendIndex.ts (`indexCardIn(ctx, …)`). This is its
 * legacy facade, on the app's admin database and the configured vector store.
 */
export { CARD_SIGNATURES } from './collections';
export { currentEmbedModel, indexContentHash, INDEX_VERSION } from './indexHash';
export type { IndexOptions, IndexResult } from '@/server/app/recommendIndex';

export function indexCard(cardId: string, opts: IndexOptions = {}): Promise<IndexResult> {
  return indexCardIn(ctxFor(getAdminDb(), { vectors: getVectorStore() }), cardId, opts);
}
