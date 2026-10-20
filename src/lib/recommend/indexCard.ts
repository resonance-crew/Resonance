import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { extractInsightSignature } from '@/lib/ai/tasks';
import { embed } from '@/lib/ai/openai';
import { isIndexable, signatureToChannelTexts } from './signature';
import { getVectorStore } from './vectorStore';
import type { VectorRecord } from './vectorStore/types';

export interface IndexResult {
  indexed: boolean;
  reason?: 'not-published' | 'not-found' | 'low-insight' | 'trashed';
  channels?: number;
}

/** Firestore's NOT_FOUND: an update of a document that is gone (deleted while the LLM ran). */
const isNotFound = (e: unknown) => (e as { code?: unknown } | null)?.code === 5;

/**
 * The write-time pipeline, run once per published card (idempotent): extract the
 * insight signature with one LLM call → store it back on the card → if the card
 * clears the insight bar, embed each channel and upsert its vectors; otherwise
 * remove any stale vectors so it leaves the candidate pool.
 *
 * Server-only (admin SDK + OpenAI key). This is where the system's cost lives —
 * O(cards), each once — so the read side can stay cheap.
 */
export async function indexCard(cardId: string): Promise<IndexResult> {
  const db = getAdminDb();
  const ref = db.collection('cards').doc(cardId);
  const snap = await ref.get();
  if (!snap.exists) return { indexed: false, reason: 'not-found' };

  const data = snap.data() ?? {};
  // Drafts carry no published signal yet — nothing to recommend.
  if (data.publishedAt == null) return { indexed: false, reason: 'not-published' };
  // A card in the trash is no one's candidate (restoring it, or its next edit, indexes it again).
  if (data.trashedAt != null) return { indexed: false, reason: 'trashed' };

  const signature = await extractInsightSignature({
    title: String(data.thoughtCore ?? ''),
    story: String(data.story ?? ''),
  });

  // Always persist the signature (powers the card page / future features) and
  // stamp the index time. Not `updatedAt`: indexing isn't an edit, and a
  // later updatedAt would retire the card's stored list summary
  // (lib/api/v1/summary), making every list read its story again. An
  // update, never a merge: a card deleted while the LLM ran stays deleted
  // (a merge would bring back a stub of it, holding its slug for good).
  try {
    await ref.update({ signature, indexedAt: FieldValue.serverTimestamp() });
  } catch (e) {
    if (isNotFound(e)) return { indexed: false, reason: 'not-found' };
    throw e;
  }

  const store = getVectorStore();

  if (!isIndexable(signature)) {
    // Below the insight bar (or edited down): make sure it isn't lingering in
    // the candidate pool from a previous, higher-scoring version.
    await store.deleteByCard(cardId);
    return { indexed: false, reason: 'low-insight' };
  }

  const channelTexts = signatureToChannelTexts(signature);
  const vectors = await embed(channelTexts.map((c) => c.text));

  // The card as it is now, after the LLM calls: one moved to the trash (or
  // deleted) meanwhile gets no vectors, and one whose visibility changed
  // carries the new one — the candidate pool's filter.
  const now = (await ref.get()).data();
  if (!now) return { indexed: false, reason: 'not-found' };
  if (now.trashedAt != null) {
    await store.deleteByCard(cardId);
    return { indexed: false, reason: 'trashed' };
  }

  const records: VectorRecord[] = channelTexts.map((c, i) => ({
    cardId,
    authorId: String(data.authorId),
    visibility: now.visibility ?? 'public',
    channel: c.channel,
    vector: vectors[i] ?? [],
    insightScore: signature.insightScore,
    coreInsight: signature.coreInsight,
    situation: signature.situation,
    lifeDomain: signature.lifeDomain,
  }));

  await store.upsert(records);
  return { indexed: true, channels: records.length };
}
