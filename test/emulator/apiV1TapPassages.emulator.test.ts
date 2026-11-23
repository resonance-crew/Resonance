import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { getCardDetail } from '@/lib/api/v1/reads';
import { LIST_FIELDS } from '@/lib/api/v1/summary';
import { listTaps, setTap, setTapPassage } from '@/lib/api/v1/taps';
import { passagesHash } from '@/lib/cards/tapPassages';
import { PASSAGE_STORY, passageItems, withPassages } from './tapPassageStory';

// The passage a reader picks after resonating (round 27 §P3–§P4) against the
// Firestore emulator: the options on CardDetail.tap for a reader (never the
// author, never a short card), the pick on the tap document and nothing else
// written, the author's list and (Wave 2 #3b) every reader's carrying each
// pick — on a named and an anonymous card —, the checks' order, a stale option refused after an edit
// while the author keeps the words chosen, and taking the tap back clearing it.

const PROJECT = 'demo-resonance-tap-passages-api';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'tap-passages-api-test');
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

async function code(p: Promise<unknown>): Promise<string> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(ApiFailure);
  return (e as ApiFailure).code;
}

// bob writes; alice reads, connected to carol; gus is a stranger to her.
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all([
    ...['alice', 'bob', 'carol', 'gus'].map(profile),
    card('long', 'bob', withPassages()),
    card('masked', 'bob', { ...withPassages(), anonymous: true }),
    card('short', 'bob'),
    card('draft', 'bob', { ...withPassages(), publishedAt: null }),
    set('connections/alice_carol', { userIds: ['alice', 'carol'] }),
  ]);
});

const [first, second] = passageItems();

describe('CardDetail.tap.passages', () => {
  it("offers a reader the card's passages, the same for every reader, before and after they tap — never its author or a short card", async () => {
    const before = (await getCardDetail(db, 'alice', 'long')).tap!;
    expect(before).toMatchObject({ mine: false, passages: passageItems(), passage: null });
    expect(passageItems().length).toBeGreaterThanOrEqual(2);
    expect((await getCardDetail(db, 'gus', 'long')).tap!.passages).toEqual(before.passages);
    await setTap(db, 'alice', 'long', true);
    expect((await getCardDetail(db, 'alice', 'long')).tap).toMatchObject({ mine: true, passages: passageItems(), passage: null });
    const author = (await getCardDetail(db, 'bob', 'long')).tap!;
    expect('passages' in author || 'passage' in author).toBe(false);
    const short = (await getCardDetail(db, 'alice', 'short')).tap!;
    expect('passages' in short || 'passage' in short).toBe(false);
    // A value made from another story is never shown.
    await db.doc('cards/long').update({ 'tapPassages.of': passagesHash('another story') });
    expect('passages' in (await getCardDetail(db, 'alice', 'long')).tap!).toBe(false);
  });

  it('never rides on a list', () => {
    expect(LIST_FIELDS).not.toContain('tapPassages');
  });
});

describe('PUT /cards/{id}/tap/passage (setTapPassage)', () => {
  it('writes the pick on the tap document and nothing else: no bell, no at, no rangAt', async () => {
    await setTap(db, 'alice', 'long', true);
    const was = (await db.doc('resonanceTaps/long_alice').get()).data()!;
    const notes = (await db.collection('notifications').get()).size;
    expect(await setTapPassage(db, 'alice', 'long', first.id)).toEqual({ passage: first.id });
    const now = (await db.doc('resonanceTaps/long_alice').get()).data()!;
    expect(now).toEqual({ ...was, passage: { id: first.id, text: first.text } });
    expect((await db.collection('notifications').get()).size).toBe(notes);
    expect((await getCardDetail(db, 'alice', 'long')).tap).toMatchObject({ passage: first.id });
    // Another replaces it; null clears it.
    expect(await setTapPassage(db, 'alice', 'long', second.id)).toEqual({ passage: second.id });
    expect(await setTapPassage(db, 'alice', 'long', null)).toEqual({ passage: null });
    expect((await db.doc('resonanceTaps/long_alice').get()).get('passage')).toBeNull();
  });

  it('checks the card, then the tap being on, then the passage', async () => {
    expect(await code(setTapPassage(db, 'bob', 'long', first.id))).toBe('not_found'); // the author's own
    expect(await code(setTapPassage(db, 'alice', 'draft', first.id))).toBe('not_found');
    expect(await code(setTapPassage(db, 'alice', 'nope', first.id))).toBe('not_found');
    expect(await code(setTapPassage(db, 'alice', 'long', first.id))).toBe('conflict'); // never tapped
    await setTap(db, 'alice', 'long', true);
    expect(await code(setTapPassage(db, 'alice', 'long', 'ffffffff'))).toBe('invalid_request');
    expect(await code(setTapPassage(db, 'alice', 'short', 'ffffffff'))).toBe('conflict');
    await setTap(db, 'alice', 'short', true);
    expect(await code(setTapPassage(db, 'alice', 'short', first.id))).toBe('invalid_request');
    expect(await setTapPassage(db, 'alice', 'short', null)).toEqual({ passage: null });
    await setTap(db, 'alice', 'long', false);
    expect(await code(setTapPassage(db, 'alice', 'long', first.id))).toBe('conflict');
  });

  it('is cleared by taking the tap back, and a tap turned on again starts without one', async () => {
    await setTap(db, 'alice', 'long', true);
    await setTapPassage(db, 'alice', 'long', first.id);
    await setTap(db, 'alice', 'long', false);
    expect((await db.doc('resonanceTaps/long_alice').get()).get('passage')).toBeNull();
    await setTap(db, 'alice', 'long', true);
    expect((await db.doc('resonanceTaps/long_alice').get()).get('passage')).toBeUndefined();
    expect((await getCardDetail(db, 'alice', 'long')).tap).toMatchObject({ mine: true, passage: null });
  });

  it("refuses a stale option after an edit, and the author's list keeps the words that were chosen", async () => {
    await setTap(db, 'alice', 'long', true);
    await setTapPassage(db, 'alice', 'long', first.id);
    // The story changed and its passages were not made again yet: none offered, the old id refused.
    await db.doc('cards/long').update({ story: `${PASSAGE_STORY}\n\n又過了一年。` });
    expect((await getCardDetail(db, 'alice', 'long')).tap).not.toHaveProperty('passage');
    expect(await code(setTapPassage(db, 'alice', 'long', second.id))).toBe('invalid_request');
    expect((await listTaps(db, 'bob', 'long')).people).toEqual([expect.objectContaining({ passage: { text: first.text } })]);
  });
});

describe('who resonated, with their picks', () => {
  for (const id of ['long', 'masked']) {
    it(`gives the author and every reader each pick, own row first, a stranger's too — never a note to a reader (${id})`, async () => {
      await setTap(db, 'carol', id, true);
      await setTapPassage(db, 'carol', id, first.id);
      await setTap(db, 'gus', id, true);
      await setTap(db, 'alice', id, true);
      await setTapPassage(db, 'alice', id, second.id);
      const author = await listTaps(db, 'bob', id);
      expect(author.people.map((p) => [p.author.handle, p.passage ?? null])).toEqual([
        ['alice', { text: second.text }],
        ['gus', null],
        ['carol', { text: first.text }],
      ]);
      // Wave 2 #3b: a reader sees everyone's row with its pick, as a like is seen — gus is a stranger to alice.
      const alices = await listTaps(db, 'alice', id);
      expect(alices.people.map((p) => [p.author.handle, p.passage ?? null, p.note])).toEqual([
        ['alice', { text: second.text }, null],
        ['gus', null, null],
        ['carol', { text: first.text }, null],
      ]);
      const carols = await listTaps(db, 'carol', id);
      expect(carols.people.map((p) => [p.author.handle, p.passage ?? null])).toEqual([
        ['carol', { text: first.text }],
        ['alice', { text: second.text }],
        ['gus', null],
      ]);
      // A reader's tap carries their own pick, and the picked sentences with everyone's faces.
      const tap = (await getCardDetail(db, 'alice', id)).tap!;
      expect(tap).toMatchObject({ passage: second.id });
      expect(tap.picked?.map((x) => [x.id, x.people.map((a) => a.handle)]).sort()).toEqual([[first.id, ['carol']], [second.id, ['alice']]].sort());
    });
  }
});
