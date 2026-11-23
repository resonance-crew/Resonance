import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Query, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { deleteCard } from '@/lib/api/v1/cards';
import { getCardDetail } from '@/lib/api/v1/reads';
import { TAP_PAGE, listTaps, setTap } from '@/lib/api/v1/taps';
import { reportReading } from '@/lib/api/v1/reading';
import { ringTap } from '@/lib/push/tapBell';
import { READER_SCAN } from '@/server/app/taps';

// The resonance tap (共振, round 26 §R1) against the Firestore emulator: the
// tap document and nothing else written by the PUT, one ring per reader and
// card ever, CardDetail.tap as a reader and as the author see it (Wave 2 #3b:
// a reader sees everyone's face, as a like is seen, minus the blocks), the
// author's and a reader's pages (their composite index:
// test/emulator/indexGuard refuses a query production would), a privately shared card never tapped, and a card
// deleted taking its taps and reading records with it.

const PROJECT = 'demo-resonance-taps';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'taps-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);
const set = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);
const card = (id: string, authorId: string, extra: Record<string, unknown> = {}) =>
  set(`cards/${id}`, {
    authorId, thoughtCore: `title ${id}`, story: `the story of ${id}`, tags: [], visibility: 'public', anonymous: false,
    publishedAt: minutesAgo(60), resonanceCount: 0, ...extra,
  });
const profile = (id: string) => set(`users/${id}`, { handle: id, handleLower: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x' });

// bob writes; alice reads, connected to carol and dora; gus is a stranger to her.
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all([
    ...['alice', 'bob', 'carol', 'dora', 'gus'].map(profile),
    card('walk', 'bob'),
    card('masked', 'bob', { anonymous: true }),
    // A 私人卡 bob sent alice in their conversation: her pass to read it, never to answer it.
    card('secret', 'bob', { visibility: 'private' }),
    set('conversations/alice_bob', { participants: ['alice', 'bob'], createdAt: minutesAgo(30) }),
    set('conversations/alice_bob/messages/m1', { senderId: 'bob', text: '', cardRef: 'secret', privateShare: true, sentAt: minutesAgo(20) }),
    set('connections/alice_bob', { userIds: ['alice', 'bob'] }),
    set('connections/alice_carol', { userIds: ['alice', 'carol'] }),
    set('connections/alice_dora', { userIds: ['alice', 'dora'] }),
  ]);
});

async function code(p: Promise<unknown>): Promise<string> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(ApiFailure);
  return (e as ApiFailure).code;
}

describe('setTap and the ring', () => {
  it('writes the tap alone, rings its author once ever — taking back and tapping again rings no one — and keeps the document', async () => {
    expect(await setTap(db, 'alice', 'walk', true)).toEqual({ on: true, changed: true, ring: true });
    // The PUT wrote the tap and nothing else: no bell yet (that is the after-work's).
    expect((await db.collection('notifications').get()).empty).toBe(true);
    expect(Object.keys((await db.doc('resonanceTaps/walk_alice').get()).data()!).sort()).toEqual(['at', 'cardId', 'on', 'rangAt', 'userId']);
    const rang = await ringTap(db, 'alice', 'walk');
    expect(rang).toMatchObject({ to: 'bob', handle: 'alice', others: 0 });
    expect((await db.doc(`notifications/${rang!.notificationId}`).get()).data()).toMatchObject({
      userId: 'bob', type: 'resonance_tap', payload: { cardId: 'walk', fromUserIds: ['alice'] }, readAt: null,
    });
    expect(await setTap(db, 'alice', 'walk', false)).toEqual({ on: false, changed: true, ring: false });
    expect(await setTap(db, 'alice', 'walk', true)).toEqual({ on: true, changed: true, ring: false });
    expect(await ringTap(db, 'alice', 'walk')).toBeNull();
    expect((await db.collection('notifications').get()).size).toBe(1);
  });

  it("never taps someone else's 私人卡 shared in a conversation, and its page answers no tap", async () => {
    // Her pass reads it…
    const detail = await getCardDetail(db, 'alice', 'secret');
    expect(detail.card.id).toBe('secret');
    expect(detail.tap).toBeNull();
    // …and answers nothing: the tap and its list read the card by id, without the pass.
    expect(await code(setTap(db, 'alice', 'secret', true))).toBe('not_found');
    expect(await code(listTaps(db, 'alice', 'secret'))).toBe('not_found');
  });

  it('two readers tapping at once both land, each ringing once', async () => {
    await Promise.all([setTap(db, 'carol', 'walk', true), setTap(db, 'dora', 'walk', true)]);
    const rung = await Promise.all([ringTap(db, 'carol', 'walk'), ringTap(db, 'dora', 'walk'), ringTap(db, 'carol', 'walk')]);
    expect(rung.filter(Boolean)).toHaveLength(2);
    const row = (await db.collection('notifications').get()).docs[0];
    expect([...row.get('payload.fromUserIds')].sort()).toEqual(['carol', 'dora']);
  });
});

describe('the budget spent beside the tap (B7)', () => {
  it('writes nothing when the budget refuses, though the tap’s reads ran beside it', async () => {
    const refused = Promise.reject(new ApiFailure('rate_limited', 'Too many requests.'));
    refused.catch(() => {});
    expect(await code(setTap(db, 'alice', 'walk', true, Date.now(), refused))).toBe('rate_limited');
    expect((await db.doc('resonanceTaps/walk_alice').get()).exists).toBe(false);
    expect((await setTap(db, 'alice', 'walk', true, Date.now(), Promise.resolve())).changed).toBe(true);
  });
});

describe('CardDetail.tap', () => {
  beforeEach(async () => {
    for (const [uid, m] of [['gus', 1], ['dora', 2], ['carol', 3]] as const) {
      await set(`resonanceTaps/walk_${uid}`, { cardId: 'walk', userId: uid, on: true, at: minutesAgo(m), rangAt: minutesAgo(m) });
    }
  });

  it("shows a reader everyone's faces, a stranger's too (themselves first once they tap), the author everyone's, never a count", async () => {
    // gus is a stranger to alice: his face is hers to see, as a like is seen (Wave 2 #3b).
    expect((await getCardDetail(db, 'alice', 'walk')).tap).toEqual({
      mine: false,
      faces: [expect.objectContaining({ handle: 'gus' }), expect.objectContaining({ handle: 'dora' }), expect.objectContaining({ handle: 'carol' })],
      more: false,
      mayNote: true,
    });
    await setTap(db, 'alice', 'walk', true);
    const mine = (await getCardDetail(db, 'alice', 'walk')).tap!;
    expect([mine.mine, mine.faces.map((f) => f.handle), mine.more]).toEqual([true, ['alice', 'gus', 'dora'], true]);
    const author = (await getCardDetail(db, 'bob', 'walk')).tap!;
    expect([author.mine, author.faces.map((f) => f.handle), author.more, author.mayNote]).toEqual([false, ['alice', 'gus', 'dora'], true, false]);
    expect(JSON.stringify(author)).not.toMatch(/count/i);
    expect(JSON.stringify(mine)).not.toMatch(/count/i);
  });

  it("leaves out of a reader's faces and list anyone with a block either way with the reader, and on a named card with the author — never the author's on an anonymous one", async () => {
    for (const [uid, m] of [['gus', 1], ['dora', 2], ['carol', 3]] as const) {
      await set(`resonanceTaps/masked_${uid}`, { cardId: 'masked', userId: uid, on: true, at: minutesAgo(m), rangAt: minutesAgo(m) });
    }
    const seen = async (id: string) => ({
      faces: (await getCardDetail(db, 'alice', id)).tap!.faces.map((f) => f.handle),
      list: (await listTaps(db, 'alice', id)).people.map((p) => p.author.handle),
    });
    const all = { faces: ['gus', 'dora', 'carol'], list: ['gus', 'dora', 'carol'] };
    expect(await seen('walk')).toEqual(all);
    const openMasked = await seen('masked');
    expect(openMasked).toEqual(all);
    for (const [who, whom] of [['bob', 'gus'], ['gus', 'bob']] as const) {
      await set(`users/${who}/blocks/${whom}`, { blockedUid: whom, createdAt: minutesAgo(0) });
      // The author's block, either way: gone from a reader's view of the named card…
      expect(await seen('walk'), `${who} blocked ${whom}`).toEqual({ faces: ['dora', 'carol'], list: ['dora', 'carol'] });
      // …and the anonymous card's reader answer as with no block, or a missing face would name its author.
      expect(await seen('masked'), `${who} blocked ${whom}`).toEqual(openMasked);
      await db.doc(`users/${who}/blocks/${whom}`).delete();
    }
    for (const [who, whom] of [['alice', 'dora'], ['dora', 'alice']] as const) {
      await set(`users/${who}/blocks/${whom}`, { blockedUid: whom, createdAt: minutesAgo(0) });
      // The reader's own blocks, on every card.
      for (const id of ['walk', 'masked']) {
        expect(await seen(id), `${who} blocked ${whom} (${id})`).toEqual({ faces: ['gus', 'carol'], list: ['gus', 'carol'] });
      }
      await db.doc(`users/${who}/blocks/${whom}`).delete();
    }
  });

  it(`reads a reader's faces from one scan of the newest ${READER_SCAN} taps and their list from one page, never each connection's possible tap; the author's blocks once (B4, B5)`, async () => {
    // 40 more connections (two `in` chunks), every third one's tap on, one off.
    for (let i = 0; i < 40; i++) {
      const uid = `k${String(i).padStart(2, '0')}`;
      await Promise.all([profile(uid), set(`connections/${['alice', uid].sort().join('_')}`, { userIds: ['alice', uid] })]);
      if (i % 3 === 0) await set(`resonanceTaps/walk_${uid}`, { cardId: 'walk', userId: uid, on: i !== 39, at: minutesAgo(100 + i), rangAt: null });
    }
    const getAll = vi.spyOn(db, 'getAll');
    const collection = vi.spyOn(db, 'collection');
    const get = vi.spyOn(Query.prototype, 'get');
    type Q = Query & { _queryOptions?: { collectionId?: string; limit?: number } };
    const tapQueryLimits = () =>
      (get.mock.contexts as Q[]).filter((q) => q._queryOptions?.collectionId === 'resonanceTaps').map((q) => q._queryOptions?.limit);
    const tapPaths = () => getAll.mock.calls.flat().map((ref) => (ref as { path?: string }).path ?? '').filter((p) => p.startsWith('resonanceTaps/'));
    try {
      const people = (await listTaps(db, 'alice', 'walk')).people.map((p) => p.author.handle);
      // Everyone whose tap is on, newest first, the one taken back left out.
      expect(people).toEqual(['gus', 'dora', 'carol', ...Array.from({ length: 13 }, (_, n) => `k${String(n * 3).padStart(2, '0')}`)]);
      // Only the reader's own tap is read by its path; the others come from one page of the card's taps.
      expect(tapPaths()).toEqual(['resonanceTaps/walk_alice']);
      expect(tapQueryLimits()).toEqual([TAP_PAGE]);
      getAll.mockClear();
      get.mockClear();
      const tap = (await getCardDetail(db, 'alice', 'walk')).tap!;
      expect([tap.faces.map((f) => f.handle), tap.more]).toEqual([['gus', 'dora', 'carol'], true]);
      // The faces: one query of at most READER_SCAN taps, and no connection's tap read by its path.
      expect(tapQueryLimits()).toEqual([READER_SCAN]);
      expect(tapPaths()).toEqual(['resonanceTaps/walk_alice']);
      getAll.mockClear();
      collection.mockClear();
      await getCardDetail(db, 'bob', 'walk', new Set(['resonances']));
      // The author's blocks: one read, shared by the lists and the tap's pages.
      expect(collection.mock.calls.filter(([path]) => path === 'users/bob/blocks')).toHaveLength(1);
    } finally {
      getAll.mockRestore();
      collection.mockRestore();
      get.mockRestore();
    }
  });

  it(`pages the author's list and a reader's ${TAP_PAGE} at a time, newest first, through its index — the reader's own row first`, async () => {
    for (let i = 0; i < TAP_PAGE + 2; i++) {
      const uid = `r${String(i).padStart(2, '0')}`;
      await profile(uid);
      await set(`resonanceTaps/walk_${uid}`, { cardId: 'walk', userId: uid, on: true, at: minutesAgo(10 + i), rangAt: null });
    }
    const first = await listTaps(db, 'bob', 'walk');
    expect(first.people.slice(0, 4).map((p) => p.author.handle)).toEqual(['gus', 'dora', 'carol', 'r00']);
    expect(first.people).toHaveLength(TAP_PAGE);
    const second = await listTaps(db, 'bob', 'walk', first.nextPageToken);
    expect(second.people.map((p) => p.author.handle)).toEqual(['r27', 'r28', 'r29', 'r30', 'r31']);
    expect(second.nextPageToken).toBeNull();
    // A reader (Wave 2 #3b): everyone, paged alike, never a note.
    const theirs = await listTaps(db, 'alice', 'walk');
    expect(theirs.people.map((p) => p.author.handle)).toEqual(first.people.map((p) => p.author.handle));
    expect(theirs.people.every((p) => p.note === null)).toBe(true);
    const theirsNext = await listTaps(db, 'alice', 'walk', theirs.nextPageToken);
    expect(theirsNext.people.map((p) => p.author.handle)).toEqual(['r27', 'r28', 'r29', 'r30', 'r31']);
    expect(theirsNext.nextPageToken).toBeNull();
    // Once she taps, her own row first, each person once across the pages.
    await setTap(db, 'alice', 'walk', true);
    const one = await listTaps(db, 'alice', 'walk');
    expect(one.people.slice(0, 4).map((p) => p.author.handle)).toEqual(['alice', 'gus', 'dora', 'carol']);
    const two = await listTaps(db, 'alice', 'walk', one.nextPageToken);
    const handles = [...one.people, ...two.people].map((p) => p.author.handle);
    expect(handles).toHaveLength(TAP_PAGE + 2 + 3 + 1);
    expect(new Set(handles).size).toBe(handles.length);
    expect(two.nextPageToken).toBeNull();
  });
});

describe('deleting a card', () => {
  it('takes its taps and its reading records with it', async () => {
    await setTap(db, 'alice', 'walk', true);
    expect(await reportReading(db, 'alice', 'walk', { session: 'view-0001', activeSeconds: 30, progress: 1, reachedEnd: true })).toBe(true);
    await deleteCard(db, 'bob', 'walk', { vectors: { deleteByCard: async () => {} } });
    expect((await db.collection('resonanceTaps').where('cardId', '==', 'walk').get()).empty).toBe(true);
    expect((await db.collection('readerSignals').where('cardId', '==', 'walk').get()).empty).toBe(true);
  });
});
