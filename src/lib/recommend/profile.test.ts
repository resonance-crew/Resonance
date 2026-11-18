import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb } from '@/../test/fakeAdminDb';

vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => { throw new Error('not in this suite'); } }));

import { buildUserProfile, profileOf } from './profile';

// Round 26 §A3: a reader as the recommender knows them — from what they did, read from where each act is kept
// (their cards, notes, taps, card box, reading records, the picks they were shown) — and only card ids and weights
// kept of it.

const NOW = Date.parse('2026-11-19T12:00:00Z');
const at = (daysAgo: number) => Timestamp.fromMillis(NOW - daysAgo * 86_400_000);

const DOCS = {
  // Her own card, and her reply to bob's
  'cards/mine': { authorId: 'alice', publishedAt: at(10), thoughtCore: 't', story: 's' },
  'cards/myReply': { authorId: 'alice', publishedAt: at(2), referenceCardId: 'bobs', thoughtCore: 't', story: 's' },
  'cards/myDraft': { authorId: 'alice', publishedAt: null, referenceCardId: 'drafted', thoughtCore: 't', story: 's' },
  // A note she left (its text never read), a tap on and one taken back, a saved card
  'notes/n1': { cardId: 'noted', fromUserId: 'alice', toUserId: 'carol', text: 'PRIVATE-NOTE-TEXT', createdAt: at(1) },
  'resonanceTaps/tapped_alice': { cardId: 'tapped', userId: 'alice', on: true, at: at(1) },
  'resonanceTaps/untapped_alice': { cardId: 'untapped', userId: 'alice', on: false, at: at(1) },
  'users/alice/bookmarks/saved': { cardId: 'saved', createdAt: at(3) },
  // How she read cards: one to the end, one opened and left
  'readerSignals/alice_readEnd': { userId: 'alice', cardId: 'readEnd', lastAt: at(40), reachedEndAt: at(40), rereads: 0, shared: false, activeSeconds: 200, maxProgress: 1, expectedSeconds: 150 },
  'readerSignals/alice_left': { userId: 'alice', cardId: 'left', lastAt: at(1), reachedEndAt: null, rereads: 0, shared: false, activeSeconds: 3, maxProgress: 0.02 },
  // Someone else's acts: never hers
  'notes/n2': { cardId: 'other', fromUserId: 'bob', toUserId: 'alice', text: 'x', createdAt: at(1) },
  'resonanceTaps/other_bob': { cardId: 'other', userId: 'bob', on: true, at: at(1) },
  'readerSignals/bob_other': { userId: 'bob', cardId: 'other', lastAt: at(1), reachedEndAt: at(1) },
  // Shown in her picks three times, never opened
  'recommendations/alice': { askedOn: '2026-11-19', shown: { ignored: { n: 3, lastDay: '2026-11-18' }, once: { n: 1, lastDay: '2026-11-18' } } },
  'connections/alice_bob': { userIds: ['alice', 'bob'] },
  'connections/alice_dora': { userIds: ['alice', 'dora'] },
};

describe('buildUserProfile', () => {
  it('weighs what she did, holds back what she has answered or just read, and knows whom she is connected with', async () => {
    const fake = fakeAdminDb(DOCS);
    const p = await buildUserProfile('alice', { db: fake.db, now: NOW });
    const ids = p.taste.positive.map((t) => t.cardId);
    expect(ids[0]).toBe('bobs'); // a reply weighs most
    expect(ids).toEqual(expect.arrayContaining(['bobs', 'noted', 'tapped', 'mine', 'myReply', 'saved', 'readEnd']));
    // A draft's reply and a tap taken back weigh nothing.
    expect(ids).not.toContain('drafted');
    expect(ids).not.toContain('untapped');
    expect(p.taste.negative.map((t) => t.cardId).sort()).toEqual(['ignored', 'left']);
    expect([...p.held].sort()).toEqual(['bobs', 'ignored', 'left', 'mine', 'myReply', 'noted', 'saved', 'tapped', 'untapped']);
    expect(p.positives).toBe(ids.length);
    expect(p.connections).toEqual(['bob', 'dora']);
    // Nobody else's acts, and never a note's words.
    expect(ids).not.toContain('other');
    expect(fake.reads.join('\n')).not.toContain('PRIVATE-NOTE-TEXT');
  });

  it('keeps card ids and weights only — never a vector, never what a card says', async () => {
    const fake = fakeAdminDb(DOCS);
    await buildUserProfile('alice', { db: fake.db, now: NOW });
    const stored = fake.docs['userProfiles/alice'] as { taste: { cardId: string; w: number }[]; against: unknown[] };
    expect(Object.keys(stored).sort()).toEqual(['against', 'taste', 'updatedAt']);
    expect(stored.taste[0]).toEqual({ cardId: 'bobs', w: expect.any(Number) });
    expect(JSON.stringify(stored)).not.toMatch(/vector|centroid|summar/i);
  });

  it('is a cold start for a reader who has done nothing yet', () => {
    const p = profileOf('newbie', [], [], NOW);
    expect(p).toMatchObject({ positives: 0, taste: { positive: [], negative: [] }, connections: [] });
  });
});
