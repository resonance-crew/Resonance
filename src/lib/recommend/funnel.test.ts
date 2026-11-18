import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { fakeAdminDb } from '@/../test/fakeAdminDb';
import type { UserProfile } from './profile';
import type { VectorChannel, VectorRecord } from './vectorStore/types';

const mocks = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('./profile', () => ({ buildUserProfile: vi.fn() }));
vi.mock('./signals', () => ({ getEngagedAuthorIds: vi.fn(), namedCardIds: vi.fn() }));
vi.mock('./vectorStore', () => ({ getVectorStore: vi.fn() }));
vi.mock('./indexCard', () => ({ currentEmbedModel: () => 'embed-now' }));
vi.mock('./poolStats', async (original) => ({ ...(await original<typeof import('./poolStats')>()), readPoolStats: vi.fn(async () => null) }));
vi.mock('@/lib/ai/openai', () => ({
  chatJSON: vi.fn(),
  rerankModel: () => 'cheap-model',
  selectModel: () => 'select-model',
}));

import { LLM_FINAL, RERANK_TIMEOUT_MS, SELECT_TIMEOUT_MS, recommendFeed } from './funnel';
import { buildUserProfile } from './profile';
import { getEngagedAuthorIds, namedCardIds } from './signals';
import { getVectorStore } from './vectorStore';
import { chatJSON } from '@/lib/ai/openai';
import { normalize } from './math';

// The read-time funnel (round 26 §A2, §A3): a reader's taste → every listed public card scored exactly in memory →
// rerank → MMR → select, the cold start's coverage set, and what never enters it. No Firestore but the fake, no
// model: the vector store, the reader's profile and the LLM calls are stood in for.

const DIM = 16;
const axis = (i: number, nudge = 0, j = (i + 1) % DIM) => normalize(Array.from({ length: DIM }, (_, k) => (k === i ? 1 : k === j ? nudge : 0)));
const rec = (cardId: string, authorId: string, v: number[], over: Partial<VectorRecord> = {}, channel: VectorChannel = 'insight'): VectorRecord => ({
  cardId,
  authorId,
  visibility: 'public',
  channel,
  part: 0,
  vector: v,
  embedModel: 'embed-now',
  insightScore: 0.8,
  coreInsight: `insight of ${cardId}`,
  situation: `situation of ${cardId}`,
  lifeDomain: 'work',
  span: '',
  ...over,
});

/** The pool: three cards near the taste by one author, two near it by others, and a spread of others. */
const POOL: VectorRecord[] = [
  rec('near1', 'amy', axis(0, 0.05)),
  rec('near2', 'amy', axis(0, 0.08)),
  rec('near3', 'amy', axis(0, 0.1)),
  rec('near4', 'ben', axis(0, 0.12)),
  rec('anonNear', 'amy', axis(0, 0.07)),
  rec('mid', 'cat', axis(0, 0.9)),
  ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => rec(`far${i}`, `w${i}`, axis(i), { lifeDomain: i === 5 ? 'health' : 'work' })),
  // The reader's own card in the pool: never theirs to be picked.
  rec('mine', 'u1', axis(0, 0.01)),
  // Another model's vector: compared with nothing.
  rec('oldModel', 'dan', axis(0, 0.02), { embedModel: 'text-embedding-3-large' }),
];
/** The reader's taste cards' records (they engaged with them: any visibility). */
const TASTE: VectorRecord[] = [
  rec('t1', 'zed', axis(0), { visibility: 'connections' }),
  rec('t2', 'zed', axis(0, 0.02)),
  rec('t3', 'yan', axis(0, 0.03), { visibility: 'private' }),
  rec('t3', 'yan', axis(1), {}, 'situation'),
];

const store = { listByVisibility: vi.fn(), listByCards: vi.fn(), nearest: vi.fn(), upsert: vi.fn(), deleteByCard: vi.fn(), setVisibility: vi.fn() };
const profile = (positives: string[], over: Partial<UserProfile> = {}): UserProfile => ({
  uid: 'u1',
  taste: { positive: positives.map((cardId, i) => ({ cardId, weight: 2 - i * 0.1 })), negative: [] },
  held: new Set(positives),
  positives: positives.length,
  connections: [],
  updatedAt: new Date(),
  ...over,
});
const timedOut = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
const ids = (r: { items: { cardId: string }[] }) => r.items.map((i) => i.cardId);
/** The select's answer: everything it was given, in order, with a reason each. */
const selectAll = () =>
  vi.mocked(chatJSON).mockImplementation(async (messages) => {
    const refs = [...String(messages[1].content).matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
    return String(messages[0].content).includes('scores') ? { scores: refs.map((ref, i) => ({ ref, score: 1 - i * 0.01 })) } : { picks: refs.map((ref) => ({ ref, reason: `because ${ref}` })) };
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db = fakeAdminDb({}).db;
  vi.mocked(getVectorStore).mockReturnValue(store);
  store.listByVisibility.mockResolvedValue(POOL);
  store.listByCards.mockImplementation(async (cardIds: string[]) => TASTE.filter((r) => cardIds.includes(r.cardId)));
  vi.mocked(getEngagedAuthorIds).mockResolvedValue(new Set());
  // Every card named unless a test says otherwise.
  vi.mocked(namedCardIds).mockImplementation(async (cardIds: string[]) => new Set(cardIds.filter((id) => !id.startsWith('anon'))));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('recommendFeed — the taste', () => {
  beforeEach(() => vi.mocked(buildUserProfile).mockResolvedValue(profile(['t1', 't2', 't3'])));

  it('scores the listed public pool against what the reader engaged with: the nearest first, at most two by one author', async () => {
    selectAll();
    const result = await recommendFeed('u1');
    expect(result.partial).toBe(false);
    expect(store.listByVisibility).toHaveBeenCalledWith('public');
    const got = ids(result);
    expect(got[0]).toBe('near1');
    expect(got.filter((id) => ['near1', 'near2', 'near3'].includes(id))).toHaveLength(2);
    // An anonymous card is its own author: amy's cap never decides it.
    expect(got).toContain('anonNear');
    expect(got).toContain('near4');
    // Never their own card, a card they engaged with, nor a vector of another model.
    for (const id of ['mine', 't1', 't2', 't3', 'oldModel']) expect(got).not.toContain(id);
    expect(result.items.find((i) => i.cardId === 'near1')!.reason).toBe('because near1');
  });

  it("gives the rerank and the select the hit part's two lines — never more of a card — on the select model", async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    selectAll();
    await recommendFeed('u1');
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([RERANK_TIMEOUT_MS, SELECT_TIMEOUT_MS]);
    const [rerank, select] = vi.mocked(chatJSON).mock.calls;
    expect(rerank[1]).toEqual({ model: 'cheap-model', signal: expect.any(AbortSignal), maxTokens: expect.any(Number) });
    expect(select[1]).toEqual({ model: 'select-model', signal: expect.any(AbortSignal), maxTokens: expect.any(Number), reasoningEffort: 'low' });
    expect(String(select[0][1].content)).toContain('[near1] 體悟：insight of near1；情境：situation of near1');
    // The reader's own lines: their taste cards' (other people's cards: one short line each).
    expect(String(select[0][1].content)).toContain('insight of t1');
  });

  it('keeps one place for a card from a life domain the reader has not engaged with', async () => {
    selectAll();
    const got = ids(await recommendFeed('u1'));
    expect(got).toContain('far5');
    expect(got.at(-1)).toBe('far5');
  });

  it('lifts a named card by an author the reader replied to, never an anonymous one', async () => {
    vi.mocked(getEngagedAuthorIds).mockResolvedValue(new Set(['amy']));
    vi.mocked(chatJSON).mockRejectedValue(timedOut());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { items } = await recommendFeed('u1', { fallback: true });
    const plain = (await (async () => {
      vi.mocked(getEngagedAuthorIds).mockResolvedValue(new Set());
      return recommendFeed('u1', { fallback: true });
    })()).items;
    const score = (list: typeof items, id: string) => list.find((i) => i.cardId === id)!.score;
    expect(score(items, 'near1') - score(plain, 'near1')).toBeCloseTo(0.15, 9);
    expect(score(items, 'anonNear')).toBeCloseTo(score(plain, 'anonNear'), 9);
  });

  it('answers in its own order, without reasons, when the LLM steps fail and a fallback is allowed', async () => {
    vi.mocked(chatJSON).mockRejectedValue(timedOut());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await recommendFeed('u1', { fallback: true, deadline: Date.now() + 6_000 });
    expect(result.partial).toBe(true);
    expect(ids(result)[0]).toBe('near1');
    expect(result.items.slice(0, 3).every((i) => i.reason === '')).toBe(true);
  });

  it('throws when an LLM step fails without a fallback, so a background build is recorded as failed', async () => {
    vi.mocked(chatJSON).mockRejectedValueOnce(timedOut());
    await expect(recommendFeed('u1')).rejects.toThrow(/timeout/);
  });

  it('gives fewer than eight when nothing more fits the taste (C5): never padded with what does not', async () => {
    store.listByVisibility.mockResolvedValue([rec('near1', 'amy', axis(0, 0.05)), ...[2, 3, 4].map((i) => rec(`far${i}`, `w${i}`, axis(i)))]);
    selectAll();
    const got = ids(await recommendFeed('u1'));
    expect(got.length).toBeLessThan(LLM_FINAL);
    expect(got[0]).toBe('near1');
  });
});

describe('recommendFeed — a cold start', () => {
  it('gives a reader with nothing yet the coverage set: their connections’ newest named cards first, then the widest spread, no model', async () => {
    const at = (d: number) => Timestamp.fromMillis(Date.parse('2026-11-19T00:00:00Z') - d * 86_400_000);
    mocks.db = fakeAdminDb({
      'cards/friendNew': { authorId: 'fay', visibility: 'public', anonymous: false, publishedAt: at(1) },
      'cards/friendOld': { authorId: 'fay', visibility: 'public', anonymous: false, publishedAt: at(5) },
      'cards/friendMasked': { authorId: 'fay', visibility: 'public', anonymous: true, publishedAt: at(0) },
      'cards/friendPrivate': { authorId: 'fay', visibility: 'private', anonymous: false, publishedAt: at(0) },
    }).db;
    vi.mocked(buildUserProfile).mockResolvedValue(profile([], { held: new Set(), connections: ['fay'] }));
    const result = await recommendFeed('u1');
    expect(result.coldStart).toBe(true);
    expect(result.partial).toBe(false);
    expect(chatJSON).not.toHaveBeenCalled();
    const got = ids(result);
    expect(got.slice(0, 2)).toEqual(['friendNew', 'friendOld']);
    // A connection's anonymous card is never put first (cold start must not turn on whose it is), nor a private one.
    expect(got).not.toContain('friendMasked');
    expect(got).not.toContain('friendPrivate');
    expect(got).toHaveLength(LLM_FINAL);
    expect(got).not.toContain('mine');
    expect(result.items.every((i) => i.reason === '')).toBe(true);
  });

  it("gives a reader with one positive card 8 × 2 / 3 of the 8 from the coverage set, the rest from their taste", async () => {
    vi.mocked(buildUserProfile).mockResolvedValue(profile(['t1']));
    selectAll();
    const result = await recommendFeed('u1');
    expect(result.coldStart).toBeUndefined();
    const reasoned = result.items.filter((i) => i.reason !== '');
    expect(reasoned).toHaveLength(LLM_FINAL - Math.round((LLM_FINAL * 2) / 3));
    expect(result.items.length).toBeLessThanOrEqual(LLM_FINAL);
  });
});
