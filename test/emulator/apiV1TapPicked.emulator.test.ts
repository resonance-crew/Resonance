import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { readCardForPage } from '@/app/[locale]/(app)/card/[slug]/cardPageData';
import { getCardDetail } from '@/lib/api/v1/reads';
import { listTaps, setTap } from '@/lib/api/v1/taps';
import { offlinePassages, passagesHash } from '@/lib/cards/tapPassages';
import { PICKED_FACES_MAX } from '@/lib/cards/tapPicked';

// The author's picked sentences (round 29 §P1, §P2, §S4.4) against the
// Firestore emulator: CardTap.picked on the author's answer alone — the
// sentences still in the story, in its order, up to three pickers each,
// newest first, `more` past them —, never on a reader's, a picker's
// connection's or a signed-out visitor's; a block either way leaving the
// person out (and a sentence only they picked); a picker with no profile; an
// anonymous card; an edit that takes the sentence out; a tap taken back.
// Then GET /cards/{id}/taps?passage=: the author's pages of one sentence's
// people, a reader's answer the same with it or without. Every query passes
// test/emulator/indexGuard (the new composite index).

const PROJECT = 'demo-resonance-tap-picked';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'tap-picked-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

// The seeded `rich-story`'s twin (scripts/seed-emulator.ts): every kind of block a story can hold.
const TITLE = '搬家後的第一個安靜夜晚';
const STORY = [
  '箱子堆滿了客廳，我坐在地上，第一次覺得**安靜是屬於自己的**。窗外有人在*慢慢地*收衣服。',
  '## 那些帶不走的東西',
  '有些東西在打包的時候就決定留下了：舊沙發、一面有裂痕的鏡子，還有 [一篇讀過很多次的文章](https://example.com/essay)。',
  '> 你不是失去了一個家，\n> 你是多了一個可以回去的地方。',
  ' ',
  '### 清單',
  '- 把書按照顏色排好\n- 在窗台放一盆薄荷\n- 寫信給十年前的自己',
  '1. 先睡一覺\n2. 再說',
  '延伸閱讀：',
  '[一場雨後的散步](/card/rain-walk)',
  '也可以看看 [第一杯自己沖的咖啡](/card/first-coffee) 這張，寫得很溫柔。',
  '---',
  'The quiet after moving out felt like mine — *finally*.',
].join('\n\n');
const ITEMS = offlinePassages(STORY, { title: TITLE });

const minutesAgo = (m: number) => Timestamp.fromMillis(Date.now() - m * 60_000);
const set = (path: string, data: Record<string, unknown>) => db.doc(path).set(data);
const card = (id: string, authorId: string, extra: Record<string, unknown> = {}) =>
  set(`cards/${id}`, {
    authorId, thoughtCore: TITLE, story: STORY, tags: [], visibility: 'public', anonymous: false, slug: `${id}-slug`,
    publishedAt: minutesAgo(600), resonanceCount: 0,
    tapPassages: { of: passagesHash(STORY), items: ITEMS, model: 'offline' }, ...extra,
  });
const profile = (id: string) => set(`users/${id}`, { handle: id, handleLower: id, penName: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'x' });
/** A tap that is on, `m` minutes old, with the pick of passage `i` (or none). */
const tapped = (cardId: string, uid: string, m: number, i: number | null) =>
  set(`resonanceTaps/${cardId}_${uid}`, {
    cardId, userId: uid, on: true, at: minutesAgo(m), rangAt: minutesAgo(m), ...(i == null ? {} : { passage: ITEMS[i] }),
  });
const block = (who: string, whom: string) => set(`users/${who}/blocks/${whom}`, { blockedUid: whom, createdAt: minutesAgo(0) });

const handles = (people: { handle: string }[]) => people.map((p) => p.handle);
const pickedOf = async (viewer: string, id = 'rich') => (await getCardDetail(db, viewer, id)).tap?.picked;

// alice writes, as in the seed: gus and bob picked passage [0], carol [1], hana none, no one [2].
// dora is connected to gus; eli is a stranger.
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all([
    ...['alice', 'bob', 'carol', 'dora', 'eli', 'gus', 'hana', 'ivy', 'jay', 'kim'].map(profile),
    card('rich', 'alice'),
    card('masked', 'alice', { anonymous: true }),
    tapped('rich', 'gus', 9, 0),
    tapped('rich', 'carol', 48, 1),
    tapped('rich', 'hana', 30, null),
    tapped('rich', 'bob', 35, 0),
    set('connections/dora_gus', { userIds: ['dora', 'gus'] }),
  ]);
});

describe("CardTap.picked: the author's answer", () => {
  it('names the picked sentences in the story’s order, each with its pickers newest first, the unpicked one absent', async () => {
    expect(ITEMS.length).toBe(3);
    expect(await pickedOf('alice')).toEqual([
      { id: ITEMS[0].id, text: ITEMS[0].text, people: [expect.objectContaining({ handle: 'gus' }), expect.objectContaining({ handle: 'bob' })], more: false },
      { id: ITEMS[1].id, text: ITEMS[1].text, people: [expect.objectContaining({ handle: 'carol' })], more: false },
    ]);
    // The faces at the story's end answer as they did.
    expect(handles((await getCardDetail(db, 'alice', 'rich')).tap!.faces)).toEqual(['gus', 'hana', 'bob']);
  });

  it('is absent for a reader, a picker, a connection of a picker and a signed-out visitor', async () => {
    for (const viewer of ['eli', 'gus', 'dora']) {
      const tap = (await getCardDetail(db, viewer, 'rich')).tap!;
      expect('picked' in tap, viewer).toBe(false);
    }
    expect(JSON.stringify(await readCardForPage(db, 'rich-slug'))).not.toContain('picked');
  });

  it('is absent while nothing is picked, and leaves a reader’s answer exactly as it was', async () => {
    const before = (await getCardDetail(db, 'eli', 'rich')).tap;
    await Promise.all(['gus', 'carol', 'bob'].map((uid) => db.doc(`resonanceTaps/rich_${uid}`).update({ passage: null })));
    expect((await getCardDetail(db, 'eli', 'rich')).tap).toEqual(before);
    expect('picked' in (await getCardDetail(db, 'alice', 'rich')).tap!).toBe(false);
  });

  it('leaves out anyone with a block between them and the author, either way — and a sentence only they picked', async () => {
    await block('alice', 'gus');
    await block('carol', 'alice');
    expect(await pickedOf('alice')).toEqual([{ id: ITEMS[0].id, text: ITEMS[0].text, people: [expect.objectContaining({ handle: 'bob' })], more: false }]);
  });

  it('leaves out a picker with no profile', async () => {
    await db.doc('users/carol').delete();
    expect((await pickedOf('alice'))!.map((p) => p.id)).toEqual([ITEMS[0].id]);
  });

  it('shows three of four pickers, newest first, and says there are more — never a count', async () => {
    await Promise.all([tapped('rich', 'ivy', 1, 1), tapped('rich', 'jay', 2, 1), tapped('rich', 'kim', 3, 1)]);
    const [, second] = (await pickedOf('alice'))!;
    expect(handles(second.people)).toEqual(['ivy', 'jay', 'kim']);
    expect(second.people).toHaveLength(PICKED_FACES_MAX);
    expect(second.more).toBe(true);
  });

  it('drops a sentence an edit took out of the story, and keeps one still there that is no longer offered', async () => {
    // The applied edit rewrote the quote's sentence (passage [1]) and left the first paragraph; the options are not made again yet.
    const edited = STORY.replace(ITEMS[1].text.slice(0, 4), '其實我');
    expect(edited).not.toBe(STORY);
    await db.doc('cards/rich').update({ story: edited });
    expect((await pickedOf('alice'))!.map((p) => [p.id, handles(p.people)])).toEqual([[ITEMS[0].id, ['gus', 'bob']]]);
  });

  it('lets go of a pick when its tap is taken back', async () => {
    await setTap(db, 'carol', 'rich', false);
    expect((await pickedOf('alice'))!.map((p) => p.id)).toEqual([ITEMS[0].id]);
  });

  it('answers the author of an anonymous card too, and a reader of it the same with picks or without', async () => {
    const without = (await getCardDetail(db, 'eli', 'masked')).tap;
    await Promise.all([tapped('masked', 'gus', 5, 0), tapped('masked', 'carol', 6, 0)]);
    expect((await pickedOf('alice', 'masked'))!.map((p) => [p.id, handles(p.people)])).toEqual([[ITEMS[0].id, ['gus', 'carol']]]);
    // eli is connected to neither picker: nothing of theirs reaches her answer.
    expect((await getCardDetail(db, 'eli', 'masked')).tap).toEqual(without);
  });
});

describe('GET /cards/{id}/taps?passage=', () => {
  it("gives the author the people of that sentence alone, newest first, with each one's note", async () => {
    await set('notes/n1', { cardId: 'rich', fromUserId: 'bob', toUserId: 'alice', text: '我也搬過很多次家。', readAt: null, createdAt: minutesAgo(20) });
    const first = await listTaps(db, 'alice', 'rich', null, ITEMS[0].id);
    expect(first.people.map((p) => [p.author.handle, p.note, p.passage])).toEqual([
      ['gus', null, { text: ITEMS[0].text }],
      ['bob', { excerpt: '我也搬過很多次家。' }, { text: ITEMS[0].text }],
    ]);
    expect(first.nextPageToken).toBeNull();
    expect((await listTaps(db, 'alice', 'rich', null, ITEMS[1].id)).people.map((p) => p.author.handle)).toEqual(['carol']);
    expect((await listTaps(db, 'alice', 'rich', null, ITEMS[2].id)).people).toEqual([]);
    // Without it, the author's whole list, as before.
    expect((await listTaps(db, 'alice', 'rich')).people.map((p) => p.author.handle)).toEqual(['gus', 'hana', 'bob', 'carol']);
  });

  it('keeps the blocks either way, on a named and an anonymous card', async () => {
    await Promise.all([tapped('masked', 'gus', 5, 0), tapped('masked', 'bob', 6, 0)]);
    await block('alice', 'gus');
    for (const id of ['rich', 'masked']) {
      expect((await listTaps(db, 'alice', id, null, ITEMS[0].id)).people.map((p) => p.author.handle), id).toEqual(['bob']);
    }
    await block('bob', 'alice');
    expect((await listTaps(db, 'alice', 'rich', null, ITEMS[0].id)).people).toEqual([]);
  });

  it('pages as the whole list does', async () => {
    const many = Array.from({ length: 32 }, (_, i) => `p${String(i).padStart(2, '0')}`);
    await Promise.all(many.flatMap((uid, i) => [profile(uid), tapped('rich', uid, 100 + i, 2)]));
    const first = await listTaps(db, 'alice', 'rich', null, ITEMS[2].id);
    expect(first.people).toHaveLength(30);
    expect(first.nextPageToken).not.toBeNull();
    const second = await listTaps(db, 'alice', 'rich', first.nextPageToken, ITEMS[2].id);
    expect([...first.people, ...second.people].map((p) => p.author.handle)).toEqual(many);
    expect(second.nextPageToken).toBeNull();
  });

  it("changes nothing for a reader: a picker's connection, the picker, a stranger", async () => {
    for (const viewer of ['dora', 'gus', 'eli']) {
      for (const id of ['rich', 'masked']) {
        expect(await listTaps(db, viewer, id, null, ITEMS[0].id), `${viewer} ${id}`).toEqual(await listTaps(db, viewer, id));
      }
    }
  });
});
