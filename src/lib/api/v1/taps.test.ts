import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { fakeAdminDb } from '../../../../test/fakeAdminDb';
import { ApiFailure } from './http';
import { TAP_PAGE, cardTap, listTaps, noteExcerpt, setTap } from './taps';
import { mapCard } from '@/lib/db/firestore/mapper';

// The resonance tap (共振, round 26 §R1) through the services, on an
// in-memory Firestore: what a tap writes (and never: an ask marker), the
// order its checks answer in, one ring per reader and card ever, the faces a
// reader and an author see — everyone, as a like is seen (Wave 2 #3b), minus
// blocks, never a count —
// whether a note would be taken, and the author's list with its note excerpts.
// The emulator suites (apiV1Taps, anonymousBlocks) hold the same against the
// real Firestore and its indexes.

const NOW = Date.parse('2026-11-19T10:00:00Z');
const ago = (min: number) => Timestamp.fromMillis(NOW - min * 60_000);
const profile = (id: string) => ({ handle: id, handleLower: id, initials: id.slice(0, 2).toUpperCase(), accentColor: 'oklch(90% 0.05 200)' });
const card = (authorId: string, extra: Record<string, unknown> = {}) => ({
  authorId,
  thoughtCore: 'A walk after the rain',
  story: 'words',
  tags: [],
  visibility: 'public',
  anonymous: false,
  publishedAt: ago(60 * 24),
  ...extra,
});
const tap = (cardId: string, uid: string, min: number, extra: Record<string, unknown> = {}) => ({
  [`resonanceTaps/${cardId}_${uid}`]: { cardId, userId: uid, on: true, at: ago(min), rangAt: ago(min), ...extra },
});

/** bob wrote the cards; alice reads them, connected to carol, dora, eli and fay; gus and hana are strangers to her. */
function world(more: Record<string, Record<string, unknown>> = {}) {
  const docs: Record<string, Record<string, unknown>> = {
    ...Object.fromEntries(['alice', 'bob', 'carol', 'dora', 'eli', 'fay', 'gus', 'hana'].map((id) => [`users/${id}`, profile(id)])),
    'users/nopen': { initials: 'NO' },
    'cards/walk': card('bob'),
    'cards/masked': card('bob', { anonymous: true }),
    'cards/draft': card('bob', { publishedAt: null }),
    'cards/hidden': card('bob', { visibility: 'private' }),
    'cards/trashed': card('bob', { visibility: 'private', trashedAt: ago(10), trashedFrom: { visibility: 'public', referenceCardId: null } }),
    'cards/friends': card('bob', { visibility: 'connections' }),
    'cards/aliceCard': card('alice'),
    ...Object.fromEntries(['carol', 'dora', 'eli', 'fay'].map((id) => [`connections/alice_${id}`, { userIds: ['alice', id] }])),
    ...more,
  };
  return fakeAdminDb(docs);
}

async function failure(p: Promise<unknown>): Promise<[string, string]> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(ApiFailure);
  return [(e as ApiFailure).code, (e as ApiFailure).message];
}

const handles = (faces: { handle: string }[]) => faces.map((f) => f.handle);
const cardOf = (docs: Record<string, Record<string, unknown>>, id: string) => mapCard(id, docs[`cards/${id}`]);

describe('setTap', () => {
  it('turns a tap on and off, once each — keeping the document, and ringing its author only the first time ever', async () => {
    const { db, docs } = world();
    expect(await setTap(db, 'alice', 'walk', true, NOW)).toEqual({ on: true, changed: true, ring: true });
    // The tap and nothing else; no ask marker (the field is the 寄小紙條 segment's, never the tap's).
    expect(docs['resonanceTaps/walk_alice']).toEqual({ cardId: 'walk', userId: 'alice', on: true, at: Timestamp.fromMillis(NOW), rangAt: null });
    expect(await setTap(db, 'alice', 'walk', true, NOW + 1)).toEqual({ on: true, changed: false, ring: false });
    expect(await setTap(db, 'alice', 'walk', false, NOW + 2)).toEqual({ on: false, changed: true, ring: false });
    expect(docs['resonanceTaps/walk_alice']).toMatchObject({ on: false });
    expect(await setTap(db, 'alice', 'walk', false, NOW + 3)).toEqual({ on: false, changed: false, ring: false });
    // It rang once (lib/push/tapBell writes rangAt): tapping again rings no one, and keeps the mark.
    docs['resonanceTaps/walk_alice'].rangAt = ago(1);
    expect(await setTap(db, 'alice', 'walk', true, NOW + 4)).toEqual({ on: true, changed: true, ring: false });
    expect(docs['resonanceTaps/walk_alice']).toMatchObject({ on: true, rangAt: ago(1), at: Timestamp.fromMillis(NOW + 4) });
    // Taking back something never tapped writes nothing.
    expect(await setTap(db, 'carol', 'walk', false, NOW)).toEqual({ on: false, changed: false, ring: false });
    expect(docs['resonanceTaps/walk_carol']).toBeUndefined();
  });

  it("refuses its author, and a card the reader can't read — a draft, a private card, one in the trash, a stranger's connections card, a missing one", async () => {
    const { db, docs } = world();
    expect(await failure(setTap(db, 'bob', 'walk', true, NOW))).toEqual(['invalid_request', 'You cannot resonate with your own card.']);
    expect(await failure(setTap(db, 'bob', 'walk', false, NOW))).toEqual(['invalid_request', 'You cannot resonate with your own card.']);
    for (const id of ['draft', 'hidden', 'trashed', 'friends', 'nope']) {
      expect((await failure(setTap(db, 'alice', id, true, NOW)))[0], id).toBe('not_found');
      expect((await failure(setTap(db, 'alice', id, false, NOW)))[0], id).toBe('not_found');
    }
    expect(Object.keys(docs).some((p) => p.startsWith('resonanceTaps/'))).toBe(false);
    // Connected, the connections card is theirs to tap.
    docs['connections/alice_bob'] = { userIds: ['alice', 'bob'] };
    expect(await setTap(db, 'alice', 'friends', true, NOW)).toMatchObject({ on: true, changed: true });
  });

  it('asks the pen name before the blocks, refuses a named card across a block either way, and taps an anonymous one all the same', async () => {
    for (const block of [null, 'users/alice/blocks/bob', 'users/bob/blocks/alice']) {
      const extra: Record<string, Record<string, unknown>> = block ? { [block]: { blockedUid: 'x' } } : {};
      const { db } = world(extra);
      expect(await failure(setTap(db, 'nopen', 'walk', true, NOW))).toEqual(['forbidden', 'Choose a pen name first.']);
      expect(await failure(setTap(db, 'nopen', 'masked', true, NOW))).toEqual(['forbidden', 'Choose a pen name first.']);
      if (block) expect(await failure(setTap(db, 'alice', 'walk', true, NOW))).toEqual(['blocked', 'You cannot resonate with this card.']);
      else expect(await setTap(db, 'alice', 'walk', true, NOW)).toEqual({ on: true, changed: true, ring: true });
      // An anonymous card answers exactly as with no block: the author's side alone leaves the reader out.
      expect(await setTap(db, 'alice', 'masked', true, NOW), block ?? 'no block').toEqual({ on: true, changed: true, ring: true });
      // Taking back reaches no one: across a block too.
      expect(await setTap(db, 'alice', 'masked', false, NOW)).toEqual({ on: false, changed: true, ring: false });
    }
    const { db, docs } = world();
    await setTap(db, 'alice', 'walk', true, NOW);
    docs['users/bob/blocks/alice'] = { blockedUid: 'alice' };
    expect(await setTap(db, 'alice', 'walk', false, NOW)).toEqual({ on: false, changed: true, ring: false });
  });
});

describe('cardTap (CardDetail.tap)', () => {
  // On bob's walk: gus (a stranger to alice) newest, then dora, carol, eli and fay — all four her connections.
  const tapped = () => ({
    ...tap('walk', 'gus', 1),
    ...tap('walk', 'dora', 2),
    ...tap('walk', 'carol', 5),
    ...tap('walk', 'eli', 10),
    ...tap('walk', 'fay', 20),
  });

  it("shows a reader everyone who resonated, newest first — strangers too (Wave 2 #3b), never a number", async () => {
    const { db, docs } = world(tapped());
    const view = await cardTap(db, 'alice', cardOf(docs, 'walk'), { pass: false });
    expect(view).toMatchObject({ mine: false, more: true, mayNote: true });
    expect(handles(view!.faces)).toEqual(['gus', 'dora', 'carol']);
    expect(view!.faces[1]).toEqual({
      id: 'dora', handle: 'dora', initials: 'DO', accentColor: 'oklch(90% 0.05 200)', avatarUrl: null, avatarSeed: null, verified: false, region: null,
    });
    // Theirs first once they resonated; a tap taken back leaves at once.
    docs['resonanceTaps/walk_alice'] = { cardId: 'walk', userId: 'alice', on: true, at: ago(0), rangAt: null };
    docs['resonanceTaps/walk_dora'].on = false;
    const mine = await cardTap(db, 'alice', cardOf(docs, 'walk'), { pass: false });
    expect(mine).toMatchObject({ mine: true, more: true });
    expect(handles(mine!.faces)).toEqual(['alice', 'gus', 'carol']);
    // Exactly three: no blank disc.
    docs['resonanceTaps/walk_fay'].on = false;
    docs['resonanceTaps/walk_eli'].on = false;
    expect(await cardTap(db, 'alice', cardOf(docs, 'walk'), { pass: false })).toMatchObject({ mine: true, more: false });
  });

  it("leaves out of a reader's faces anyone across a block with the reader — and on a named card with its author — either way", async () => {
    const { db, docs } = world(tapped());
    docs['users/alice/blocks/gus'] = { blockedUid: 'gus' };
    docs['users/dora/blocks/alice'] = { blockedUid: 'alice' };
    expect(handles((await cardTap(db, 'alice', cardOf(docs, 'walk'), { pass: false }))!.faces)).toEqual(['carol', 'eli', 'fay']);
    // The author's blocks take a face off a named card, as the author's own list.
    docs['users/bob/blocks/carol'] = { blockedUid: 'carol' };
    docs['users/eli/blocks/bob'] = { blockedUid: 'bob' };
    const named = await cardTap(db, 'alice', cardOf(docs, 'walk'), { pass: false });
    expect(handles(named!.faces)).toEqual(['fay']);
    expect(named!.more).toBe(false);
  });

  it("on an anonymous card a reader's faces never turn on the author's blocks — only the reader's own", async () => {
    const taps = { ...tap('masked', 'gus', 1), ...tap('masked', 'carol', 2), ...tap('masked', 'eli', 3) };
    const plain = world(taps);
    const before = await cardTap(plain.db, 'alice', cardOf(plain.docs, 'masked'), { pass: false });
    // Whoever its author blocked, or was blocked by, a reader's answer is byte for byte the same.
    for (const block of ['users/bob/blocks/gus', 'users/carol/blocks/bob', 'users/bob/blocks/alice', 'users/alice/blocks/bob']) {
      const { db, docs } = world({ ...taps, [block]: { blockedUid: 'x' } });
      expect(await cardTap(db, 'alice', cardOf(docs, 'masked'), { pass: false }), block).toEqual(before);
    }
    expect(handles(before!.faces)).toEqual(['gus', 'carol', 'eli']);
    // The reader's own block takes that face off, as on any card.
    const { db, docs } = world({ ...taps, 'users/alice/blocks/gus': { blockedUid: 'gus' } });
    expect(handles((await cardTap(db, 'alice', cardOf(docs, 'masked'), { pass: false }))!.faces)).toEqual(['carol', 'eli']);
  });

  it("shows a reader the picked sentences with their pickers — theirs the moment they pick, minus blocks, never the author's blocks on an anonymous card", async () => {
    const story = 'The rain stopped at dusk. We walked home without a word.\n\nShe kept the umbrella open anyway.';
    const pick = (text: string) => ({ passage: { id: `p${text.length.toString(16).padStart(7, '0')}`, text } });
    const one = pick('The rain stopped at dusk.');
    const two = pick('She kept the umbrella open anyway.');
    const seed = (id: string, extra: Record<string, unknown> = {}) => ({
      [`cards/${id}`]: card('bob', { story, ...extra }),
      ...tap(id, 'gus', 1, one),
      ...tap(id, 'carol', 2, one),
      ...tap(id, 'dora', 3, two),
      ...tap(id, 'eli', 4),
    });
    const { db, docs } = world({ ...seed('pw'), ...seed('pm', { anonymous: true }) });
    const view = await cardTap(db, 'alice', cardOf(docs, 'pw'), { pass: false });
    expect(view!.picked!.map((p) => [p.text, handles(p.people), p.more])).toEqual([
      ['The rain stopped at dusk.', ['gus', 'carol'], false],
      ['She kept the umbrella open anyway.', ['dora'], false],
    ]);
    // Their own pick stands first in its sentence's faces as soon as it is kept, whatever its tap's age.
    docs['resonanceTaps/pw_alice'] = { cardId: 'pw', userId: 'alice', on: true, at: ago(9999), rangAt: null, ...two };
    const mine = await cardTap(db, 'alice', cardOf(docs, 'pw'), { pass: false });
    expect(handles(mine!.picked![1].people)).toEqual(['alice', 'dora']);
    // A block with the reader either way, or with a named card's author, takes the picker off; a sentence left with none goes.
    docs['users/alice/blocks/gus'] = { blockedUid: 'gus' };
    docs['users/bob/blocks/dora'] = { blockedUid: 'dora' };
    const blocked = await cardTap(db, 'alice', cardOf(docs, 'pw'), { pass: false });
    expect(blocked!.picked!.map((p) => handles(p.people))).toEqual([['carol'], ['alice']]);
    // On the anonymous card the author's block changes nothing a reader sees.
    const masked = await cardTap(db, 'carol', cardOf(docs, 'pm'), { pass: false });
    expect(masked!.picked!.map((p) => handles(p.people))).toEqual([['carol', 'gus'], ['dora']]);
    delete docs['users/bob/blocks/dora'];
    expect(await cardTap(db, 'carol', cardOf(docs, 'pm'), { pass: false })).toEqual(masked);
    // A card with no picks answers no `picked` at all, as before.
    expect(await cardTap(db, 'alice', cardOf(docs, 'walk'), { pass: false })).not.toHaveProperty('picked');
  });

  it("shows the author the three newest of everyone — strangers too — minus anyone across a block, either way", async () => {
    const { db, docs } = world(tapped());
    const view = await cardTap(db, 'bob', cardOf(docs, 'walk'), { pass: false });
    expect(view).toMatchObject({ mine: false, more: true, mayNote: false });
    expect(handles(view!.faces)).toEqual(['gus', 'dora', 'carol']);
    docs['users/gus/blocks/bob'] = { blockedUid: 'bob' };
    docs['users/bob/blocks/dora'] = { blockedUid: 'dora' };
    const blocked = await cardTap(db, 'bob', cardOf(docs, 'walk'), { pass: false });
    expect(handles(blocked!.faces)).toEqual(['carol', 'eli', 'fay']);
    expect(blocked!.more).toBe(false);
  });

  it('says whether a note would be taken: not past three unanswered letters, yes when connected or answering one, always on an anonymous card', async () => {
    const { db, docs } = world({ 'letters/alice_bob': { from: 'alice', to: 'bob', count: 3 } });
    expect((await cardTap(db, 'alice', cardOf(docs, 'walk'), { pass: false }))!.mayNote).toBe(false);
    expect((await cardTap(db, 'alice', cardOf(docs, 'masked'), { pass: false }))!.mayNote).toBe(true);
    docs['conversations/alice_bob'] = { participants: ['alice', 'bob'], request: { from: 'bob', count: 1 } };
    expect((await cardTap(db, 'alice', cardOf(docs, 'walk'), { pass: false }))!.mayNote).toBe(true);
    delete docs['conversations/alice_bob'];
    docs['connections/alice_bob'] = { userIds: ['alice', 'bob'] };
    expect((await cardTap(db, 'alice', cardOf(docs, 'walk'), { pass: false }))!.mayNote).toBe(true);
  });

  it("is null through a shared-card pass, on a draft or a card in the trash (its author's too), and on a named card across a block", async () => {
    const { db, docs } = world({ ...tapped(), 'users/alice/blocks/bob': { blockedUid: 'bob' } });
    expect(await cardTap(db, 'alice', cardOf(docs, 'masked'), { pass: true })).toBeNull();
    expect(await cardTap(db, 'bob', cardOf(docs, 'draft'), { pass: false })).toBeNull();
    expect(await cardTap(db, 'bob', cardOf(docs, 'trashed'), { pass: false })).toBeNull();
    expect(await cardTap(db, 'alice', cardOf(docs, 'walk'), { pass: false })).toBeNull();
    // Her block changes nothing she sees of an anonymous card.
    docs['resonanceTaps/masked_carol'] = { cardId: 'masked', userId: 'carol', on: true, at: ago(3), rangAt: null };
    const masked = await cardTap(db, 'alice', cardOf(docs, 'masked'), { pass: false });
    expect(handles(masked!.faces)).toEqual(['carol']);
  });
});

describe('listTaps (GET /cards/{id}/taps)', () => {
  it("gives the author everyone, 30 a page, each with the first line of the latest note they left on a named card", async () => {
    const many: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < TAP_PAGE + 1; i++) {
      const uid = `reader${String(i).padStart(2, '0')}`;
      many[`users/${uid}`] = profile(uid);
      Object.assign(many, tap('walk', uid, i + 1));
    }
    Object.assign(many, {
      'notes/n1': { cardId: 'walk', fromUserId: 'reader00', toUserId: 'bob', text: 'an older one', createdAt: ago(30) },
      'notes/n2': { cardId: 'walk', fromUserId: 'reader00', toUserId: 'bob', text: '\n  雨停的那段，我也想起小時候踩水窪回家。'.padEnd(200, '。') + '\n第二行', createdAt: ago(5) },
      // Withheld across a block (delivered to no one): never an excerpt.
      'notes/n3': { cardId: 'walk', fromUserId: 'reader01', toUserId: null, withheldFor: 'bob', text: 'hidden', createdAt: ago(5) },
    });
    const { db } = world(many);
    const first = await listTaps(db, 'bob', 'walk');
    expect(first.people).toHaveLength(TAP_PAGE);
    expect(first.people[0].author.handle).toBe('reader00');
    expect(first.people[0].note!.excerpt).toBe(Array.from('雨停的那段，我也想起小時候踩水窪回家。'.padEnd(200, '。')).slice(0, 80).join(''));
    expect(first.people[1].note).toBeNull();
    expect(first.nextPageToken).toEqual(expect.any(String));
    const second = await listTaps(db, 'bob', 'walk', first.nextPageToken);
    expect(second.people.map((p) => p.author.handle)).toEqual(['reader30']);
    expect(second.nextPageToken).toBeNull();
  });

  it('never gives a note on an anonymous card, nor any to a reader, who pages everyone with each pick (Wave 2 #3b)', async () => {
    const { db } = world({
      ...tap('masked', 'carol', 2, { passage: { id: 'aaaa0001', text: 'The words she chose' } }),
      ...tap('masked', 'gus', 1),
      ...tap('masked', 'alice', 3, { passage: { id: 'aaaa0002', text: 'Her own pick' } }),
      'notes/n1': { cardId: 'masked', fromUserId: 'carol', toUserId: 'bob', text: 'whose is this?', createdAt: ago(2) },
    });
    const author = await listTaps(db, 'bob', 'masked');
    expect(author.people.map((p) => [p.author.handle, p.note])).toEqual([['gus', null], ['carol', null], ['alice', null]]);
    expect(await listTaps(db, 'alice', 'masked')).toEqual({
      people: [
        { author: expect.objectContaining({ handle: 'alice' }), note: null, passage: { text: 'Her own pick' } },
        { author: expect.objectContaining({ handle: 'gus' }), note: null },
        { author: expect.objectContaining({ handle: 'carol' }), note: null, passage: { text: 'The words she chose' } },
      ],
      nextPageToken: null,
    });
    // ?passage= gives a reader that sentence's people alone, their own row too when it is theirs.
    expect((await listTaps(db, 'alice', 'masked', null, 'aaaa0001')).people.map((p) => p.author.handle)).toEqual(['carol']);
    expect((await listTaps(db, 'alice', 'masked', null, 'aaaa0002')).people.map((p) => p.author.handle)).toEqual(['alice']);
  });

  it('is not_found wherever CardDetail.tap is null', async () => {
    const { db } = world({ 'users/bob/blocks/alice': { blockedUid: 'alice' } });
    for (const [viewer, id] of [['alice', 'walk'], ['alice', 'draft'], ['alice', 'trashed'], ['bob', 'trashed'], ['bob', 'draft'], ['alice', 'nope']]) {
      expect((await failure(listTaps(db, viewer, id)))[0], `${viewer} ${id}`).toBe('not_found');
    }
  });
});

describe('noteExcerpt', () => {
  it('takes the first line with words in it, trimmed, at most 80 characters, never splitting an emoji', () => {
    expect(noteExcerpt('\n\n  謝謝你寫下這段  \n第二行')).toBe('謝謝你寫下這段');
    expect(noteExcerpt('😀'.repeat(100))).toBe('😀'.repeat(80));
    expect(noteExcerpt('   \n ')).toBe('');
  });
});
