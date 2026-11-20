import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { deleteCard } from '@/lib/api/v1/cards';
import { getCardDetail } from '@/lib/api/v1/reads';
import { TAP_PAGE, listTaps, setTap } from '@/lib/api/v1/taps';
import { reportReading } from '@/lib/api/v1/reading';
import { ringTap } from '@/lib/push/tapBell';

// The resonance tap (共振, round 26 §R1) against the Firestore emulator: the
// tap document and nothing else written by the PUT, one ring per reader and
// card ever, CardDetail.tap as a reader and as the author see it, the
// author's pages (their composite index: test/emulator/indexGuard refuses a
// query production would), a privately shared card never tapped, and a card
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

describe('CardDetail.tap', () => {
  beforeEach(async () => {
    for (const [uid, m] of [['gus', 1], ['dora', 2], ['carol', 3]] as const) {
      await set(`resonanceTaps/walk_${uid}`, { cardId: 'walk', userId: uid, on: true, at: minutesAgo(m), rangAt: minutesAgo(m) });
    }
  });

  it("shows a reader their connections' faces (themselves first once they tap), the author everyone's, never a count", async () => {
    expect((await getCardDetail(db, 'alice', 'walk')).tap).toEqual({
      mine: false, faces: [expect.objectContaining({ handle: 'dora' }), expect.objectContaining({ handle: 'carol' })], more: false, mayNote: true,
    });
    await setTap(db, 'alice', 'walk', true);
    const mine = (await getCardDetail(db, 'alice', 'walk')).tap!;
    expect([mine.mine, mine.faces.map((f) => f.handle), mine.more]).toEqual([true, ['alice', 'dora', 'carol'], false]);
    const author = (await getCardDetail(db, 'bob', 'walk')).tap!;
    expect([author.mine, author.faces.map((f) => f.handle), author.more, author.mayNote]).toEqual([false, ['alice', 'gus', 'dora'], true, false]);
    expect(JSON.stringify(author)).not.toMatch(/count/i);
  });

  it('finds a reader’s connections’ taps by query, 30 at a time, never reading each connection’s possible tap; the author’s blocks once (B4, B5)', async () => {
    // 40 more connections (two `in` chunks), every third one's tap on, one off.
    for (let i = 0; i < 40; i++) {
      const uid = `k${String(i).padStart(2, '0')}`;
      await Promise.all([profile(uid), set(`connections/${['alice', uid].sort().join('_')}`, { userIds: ['alice', uid] })]);
      if (i % 3 === 0) await set(`resonanceTaps/walk_${uid}`, { cardId: 'walk', userId: uid, on: i !== 39, at: minutesAgo(100 + i), rangAt: null });
    }
    const getAll = vi.spyOn(db, 'getAll');
    const collection = vi.spyOn(db, 'collection');
    try {
      const people = (await listTaps(db, 'alice', 'walk')).people.map((p) => p.author.handle);
      expect(people).toEqual(['dora', 'carol', ...Array.from({ length: 13 }, (_, n) => `k${String(n * 3).padStart(2, '0')}`)]);
      const paths = getAll.mock.calls.flat().map((ref) => (ref as { path?: string }).path ?? '');
      // Only the reader's own tap is read by its path.
      expect(paths.filter((p) => p.startsWith('resonanceTaps/'))).toEqual(['resonanceTaps/walk_alice']);
      getAll.mockClear();
      collection.mockClear();
      await getCardDetail(db, 'bob', 'walk', new Set(['resonances']));
      // The author's blocks: one read, shared by the lists and the tap's pages.
      expect(collection.mock.calls.filter(([path]) => path === 'users/bob/blocks')).toHaveLength(1);
    } finally {
      getAll.mockRestore();
      collection.mockRestore();
    }
  });

  it(`pages the author's list ${TAP_PAGE} at a time, newest first, through its index`, async () => {
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
    // A reader: their connections, one page.
    expect((await listTaps(db, 'alice', 'walk')).people.map((p) => p.author.handle)).toEqual(['dora', 'carol']);
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
