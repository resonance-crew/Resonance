import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { deleteCard, updateCard } from '@/lib/api/v1/cards';
import { applyCardEdit } from '@/lib/api/v1/edits';
import { publishCard } from '@/lib/api/v1/publish';
import { getCardBox, getCardDetail, getCardsByKeys, getProfile, getRelated, TRASH_SHELF_LIMIT } from '@/lib/api/v1/reads';
import { resonateWith, unresonate } from '@/lib/api/v1/resonate';
import { sendMessage, sendNote } from '@/lib/api/v1/conversations';
import { getFeed } from '@/lib/api/v1/service';
import { emptyTrash, purgeExpiredTrash, restoreCard, trashCard } from '@/lib/api/v1/trash';
import { CardDetail, FeedCard, TrashedCard, RestoredCard } from '@/lib/api/v1/schemas';
import { spend } from '@/lib/api/rateLimit';
import { exportAccountData } from '@/lib/account/export';
import { readCardForPage } from '@/app/[locale]/(app)/card/[slug]/cardPageData';
import { FirestoreVectorStore } from '@/lib/recommend/vectorStore/firestore';
import type { IVectorStore } from '@/lib/recommend/vectorStore/interfaces';

// The trash (垃圾桶) through the v1 services against the Firestore emulator:
// a card moved there is private to everyone but its author — gone from every
// list, page and probe exactly as a private card is — answers nothing (its
// resonance taken back and parked), takes no change but a restore, and comes
// back as it was; it is deleted for good from the trash (永久刪除, 清空,
// the 30-day purge) only while it is still there.

const PROJECT = 'demo-resonance-api-trash';
let app: App;
let db: Firestore;
const mocks = vi.hoisted(() => ({ store: null as IVectorStore | null, db: null as Firestore | null }));
vi.mock('@/lib/recommend/vectorStore', () => ({ getVectorStore: () => mocks.store }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-trash-test');
  db = getFirestore(app);
  mocks.db = db;
  mocks.store = new FirestoreVectorStore(db);
});

afterAll(async () => {
  await deleteApp(app);
});

const DAY = 86_400_000;
const published = Timestamp.fromDate(new Date('2026-09-01T08:00:00Z'));
const edited = Timestamp.fromDate(new Date('2026-09-02T08:00:00Z'));
const set = (path: string, data: DocumentData) => db.doc(path).set(data);
const get = async (path: string) => (await db.doc(path).get()).data();
const exists = async (path: string) => (await db.doc(path).get()).exists;
const card = (id: string, authorId: string, extra: DocumentData = {}) =>
  set(`cards/${id}`, {
    authorId,
    thoughtCore: `title ${id}`,
    story: `the story of ${id}`,
    tags: ['夜'],
    visibility: 'public',
    anonymous: false,
    slug: `slug-${id}`,
    publishedAt: published,
    updatedAt: edited,
    excerpt: `the story of ${id}`,
    readMinutes: 1,
    excerptAt: edited,
    resonanceCount: 0,
    ...extra,
  });

// Alice writes; Bob wrote the original she answers; Carol leaves notes.
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all([
    set('users/alice', { handle: '小安', handleLower: '小安', initials: '小', accentColor: 'x' }),
    set('users/bob', { handle: 'bob', handleLower: 'bob', initials: 'b', accentColor: 'x' }),
    set('users/carol', { handle: 'carol', handleLower: 'carol', initials: 'c', accentColor: 'x' }),
    card('live', 'alice'),
    card('conn', 'alice', { visibility: 'connections' }),
    card('priv', 'alice', { visibility: 'private' }),
    card('draft', 'alice', { publishedAt: null, slug: null, excerpt: null, readMinutes: null, excerptAt: null }),
    card('orig', 'bob'),
    card('mine', 'alice'),
    card('mine2', 'alice'),
    set('cardVectors/live__insight', { cardId: 'live', authorId: 'alice', visibility: 'public', channel: 'insight' }),
  ]);
});

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}
const answer = (e: ApiFailure) => [e.code, e.message, e.issues];
const MISSING = ['not_found', 'No such card.', undefined];
const IN_TRASH = ['conflict', 'This card is in the trash.', undefined];
const ids = (list: { cards: { id: string }[] }) => list.cards.map((c) => c.id);

/** Alice's card `mine` answering Bob's `orig`, through the server: the two connected by it, Bob's bell rung. */
async function resonate(cardId = 'mine') {
  const r = await resonateWith(db, 'alice', 'orig', cardId);
  expect(r.changed).toBe(true);
}

describe('moving a card to the trash', () => {
  it.each([
    ['live', 'public'],
    ['conn', 'connections'],
    ['priv', 'private'],
    ['draft', 'public'],
  ] as const)('makes %s private, recording what restoring brings back, and touches nothing else', async (id, visibility) => {
    const before = (await get(`cards/${id}`))!;
    const now = Date.now();
    const { card: box, changed, stale } = await trashCard(db, 'alice', id, { now });
    expect(changed).toBe(true);
    const after = (await get(`cards/${id}`))!;
    expect(after).toMatchObject({ visibility: 'private', trashedFrom: { visibility, referenceCardId: null } });
    expect((after.trashedAt as Timestamp).toMillis()).toBe(now);
    // Its dates, slug and summary as they were: a draft keeps its place, a list its summary.
    const { visibility: _v, trashedAt: _t, trashedFrom: _f, ...rest } = after;
    const { visibility: _bv, ...was } = before;
    expect(rest).toEqual(was);
    // The answer: the trash shelf's own view of it, on the contract.
    expect(TrashedCard.safeParse({ card: box, changed }).success).toBe(true);
    expect(box).toMatchObject({
      id,
      visibility: 'private',
      trashedAt: new Date(now).toISOString(),
      purgeAt: new Date(now + 30 * DAY).toISOString(),
      restoresTo: visibility,
      author: { id: 'alice' },
    });
    expect(stale.some((p) => p.startsWith('/u/'))).toBe(false);
  });

  it('is idempotent: a second move writes nothing, keeping its thirty days and what restoring brings back', async () => {
    await resonate();
    const first = Date.now() - 5 * DAY;
    await trashCard(db, 'alice', 'mine', { now: first });
    const once = await get('cards/mine');
    const again = await trashCard(db, 'alice', 'mine');
    expect(again.changed).toBe(false);
    expect(again.stale).toEqual([]);
    expect(await get('cards/mine')).toEqual(once);
    expect(again.card).toMatchObject({ trashedAt: new Date(first).toISOString() });
    // Restored, it answers its original again, public as it was.
    const back = await restoreCard(db, 'alice', 'mine');
    expect(back).toMatchObject({ changed: true, droppedResonance: false });
    expect(await get('cards/mine')).toMatchObject({ visibility: 'public', referenceCardId: 'orig' });
  });

  it('names its pages and the landing page, never its author\'s profile — anonymous or not', async () => {
    await db.doc('cards/live').update({ anonymous: true });
    const { stale } = await trashCard(db, 'alice', 'live');
    expect(stale).toEqual(['/card/live', '/card/slug-live', '/']);
    expect((await restoreCard(db, 'alice', 'live')).stale).toEqual(['/card/live', '/card/slug-live', '/']);
    // A private card was never on the landing page.
    expect((await trashCard(db, 'alice', 'priv')).stale).toEqual(['/card/priv', '/card/slug-priv']);
  });

  it('takes the recommender\'s copy private', async () => {
    await trashCard(db, 'alice', 'live');
    expect(await get('cardVectors/live__insight')).toMatchObject({ visibility: 'private' });
    await restoreCard(db, 'alice', 'live');
    expect(await get('cardVectors/live__insight')).toMatchObject({ visibility: 'public' });
  });
});

describe("someone else's card in the trash is a missing card", () => {
  beforeEach(async () => {
    await trashCard(db, 'alice', 'live');
    await db.doc('cards/live/edits/current').set({ thoughtCore: 'x', story: 'y', updatedAt: Timestamp.now() });
  });

  it('answers a stranger\'s every write with a missing card\'s very body', async () => {
    const missing = answer(await failure(updateCard(db, 'bob', 'nope', { visibility: 'public' })));
    expect(missing).toEqual(MISSING);
    for (const write of [
      () => updateCard(db, 'bob', 'live', { visibility: 'public' }),
      () => publishCard(db, 'bob', 'live', async () => 'x'),
      () => applyCardEdit(db, 'bob', 'live'),
      () => trashCard(db, 'bob', 'live'),
      () => restoreCard(db, 'bob', 'live'),
      () => deleteCard(db, 'bob', 'live'),
      () => deleteCard(db, 'bob', 'live', { onlyIfTrashed: true }),
    ]) {
      expect(answer(await failure(write()))).toEqual(MISSING);
    }
    expect(await get('cards/live')).toMatchObject({ visibility: 'private' });
  });

  it("is in no one else's list, page or answer", async () => {
    await card('host', 'bob', { story: 'Before.\n\n[a night](/card/slug-live)\n\nAfter.' });
    expect(ids(await getFeed(db, 'bob', 30))).not.toContain('live');
    // Her public cards under her name: `mine` and `mine2`, no longer `live`.
    const profile = await getProfile(db, 'bob', '小安', { include: new Set(['cards']) });
    expect(profile.cardCount).toBe(2);
    expect(ids(profile.cards!).sort()).toEqual(['mine', 'mine2']);
    expect(ids(await getRelated(db, 'bob', 'orig'))).not.toContain('live');
    expect(answer(await failure(getCardDetail(db, 'bob', 'slug-live')))).toEqual(MISSING);
    expect(ids((await getCardDetail(db, 'bob', 'host', new Set(['embeds']))).embeds!)).toEqual([]);
    // Its page answers as for a deleted card — not even its id, which would say it is still there.
    expect(await readCardForPage(db, 'slug-live')).toEqual({ id: null, card: null, author: null });
    expect(await readCardForPage(db, 'live')).toEqual({ id: null, card: null, author: null });
    // ?keys=, its author included: its slug still names it, and so names nothing.
    expect(ids(await getCardsByKeys(db, 'bob', ['live', 'slug-live']))).toEqual([]);
    expect(ids(await getCardsByKeys(db, 'alice', ['live', 'slug-live', 'mine']))).toEqual(['mine']);
    const { default: sitemap } = await import('@/app/sitemap');
    expect(JSON.stringify(await sitemap())).not.toContain('slug-live');
  });
});

describe('its author sees it in the trash', () => {
  it("on its own page: the card with its trash fields and its story's cards, none of the lists around it", async () => {
    await card('reply', 'bob', { referenceCardId: 'live' });
    await set('cardLinks/x', { sourceCardId: 'orig', targetCardId: 'live', targetAuthorId: 'alice', createdAt: Timestamp.now() });
    await db.doc('cards/live').update({ story: 'Before.\n\n[the original](/card/slug-orig)\n\nAfter.' });
    await trashCard(db, 'alice', 'live');
    const detail = await getCardDetail(db, 'alice', 'slug-live', new Set(['resonances', 'related', 'links', 'embeds']));
    expect(CardDetail.safeParse(detail).success).toBe(true);
    expect(detail).toMatchObject({ isOwner: true, visibility: 'private', card: { trashedAt: expect.any(String), restoresTo: 'public' } });
    expect(detail.resonances?.cards).toEqual([]);
    expect(detail.related?.cards).toEqual([]);
    expect(detail.links?.cards).toEqual([]);
    expect(ids(detail.embeds!)).toEqual(['orig']);
  });

  it('until its thirty days are up: then it is gone to them too, before the purge reaches it', async () => {
    await trashCard(db, 'alice', 'live', { now: Date.now() - 30 * DAY - 1000 });
    expect(answer(await failure(getCardDetail(db, 'alice', 'live')))).toEqual(MISSING);
    expect(answer(await failure(restoreCard(db, 'alice', 'live')))).toEqual(MISSING);
    expect(answer(await failure(trashCard(db, 'alice', 'live')))).toEqual(MISSING);
    expect(ids(await getCardBox(db, 'alice', 'trash'))).toEqual([]);
  });

  it('on the trash shelf, the latest in first, the newest hundred — and on no other shelf', async () => {
    const t0 = Date.now() - DAY;
    await trashCard(db, 'alice', 'priv', { now: t0 });
    await trashCard(db, 'alice', 'draft', { now: t0 + 1000 });
    await trashCard(db, 'alice', 'live', { now: t0 + 2000 });
    const shelf = await getCardBox(db, 'alice', 'trash');
    expect(ids(shelf)).toEqual(['live', 'draft', 'priv']);
    for (const c of shelf.cards) expect(FeedCard.safeParse(c).success).toBe(true);
    // A draft has no summary: its story is read for it.
    expect(shelf.cards[1]).toMatchObject({ excerpt: 'the story of draft', publishedAt: null, restoresTo: 'public' });
    expect(ids(await getCardBox(db, 'alice', 'private'))).toEqual([]);
    expect(ids(await getCardBox(db, 'alice', 'draft'))).toEqual([]);
    expect(ids(await getCardBox(db, 'alice', 'published'))).not.toContain('live');
    // No one else's trash, ever.
    expect(ids(await getCardBox(db, 'bob', 'trash'))).toEqual([]);

    const batch = db.batch();
    for (let i = 0; i < TRASH_SHELF_LIMIT + 2; i++) {
      batch.set(db.doc(`cards/old${i}`), {
        authorId: 'alice', thoughtCore: 't', story: 's', visibility: 'private', publishedAt: published,
        trashedAt: Timestamp.fromMillis(t0 - (i + 1) * 1000), trashedFrom: { visibility: 'private', referenceCardId: null },
      });
    }
    await batch.commit();
    const full = await getCardBox(db, 'alice', 'trash');
    expect(full.cards).toHaveLength(TRASH_SHELF_LIMIT);
    expect(ids(full).slice(0, 4)).toEqual(['live', 'draft', 'priv', 'old0']);
  });

  it('never crowding out the private and draft shelves, however many newer cards are in it', async () => {
    const batch = db.batch();
    for (let i = 0; i < 45; i++) {
      // Newer than her private card and her draft, all of them.
      batch.set(db.doc(`cards/tp${i}`), {
        authorId: 'alice', thoughtCore: 't', story: 's', visibility: 'private', anonymous: false,
        publishedAt: Timestamp.fromMillis(published.toMillis() + (i + 1) * 1000),
        trashedAt: Timestamp.now(), trashedFrom: { visibility: 'private', referenceCardId: null },
      });
      batch.set(db.doc(`cards/td${i}`), {
        authorId: 'alice', thoughtCore: 't', story: 's', visibility: 'private', publishedAt: null,
        updatedAt: Timestamp.fromMillis(edited.toMillis() + (i + 1) * 1000),
        trashedAt: Timestamp.now(), trashedFrom: { visibility: 'public', referenceCardId: null },
      });
    }
    await batch.commit();
    expect(ids(await getCardBox(db, 'alice', 'private'))).toEqual(['priv']);
    expect(ids(await getCardBox(db, 'alice', 'draft'))).toEqual(['draft']);
  });
});

describe('a card in the trash takes no change but a restore', () => {
  beforeEach(async () => {
    await set('cards/draft/edits/current', { thoughtCore: 'x', story: 'y' });
    await set('cards/live/edits/current', { thoughtCore: 'edited', story: 'edited story', visibility: 'public', anonymous: false });
    await trashCard(db, 'alice', 'live');
    await trashCard(db, 'alice', 'draft');
    await trashCard(db, 'alice', 'mine');
  });

  it('PATCH, publish, edits/apply and resonating with it are 409, writing nothing', async () => {
    const before = await Promise.all(['cards/live', 'cards/draft', 'cards/mine', 'cards/live/edits/current'].map(get));
    expect(answer(await failure(updateCard(db, 'alice', 'live', { visibility: 'public' })))).toEqual(IN_TRASH);
    expect(answer(await failure(updateCard(db, 'alice', 'live', { anonymous: true })))).toEqual(IN_TRASH);
    expect(answer(await failure(publishCard(db, 'alice', 'draft', async () => 'a-slug')))).toEqual(IN_TRASH);
    expect(answer(await failure(applyCardEdit(db, 'alice', 'live')))).toEqual(IN_TRASH);
    expect(answer(await failure(resonateWith(db, 'alice', 'orig', 'mine')))).toEqual(IN_TRASH);
    expect(await Promise.all(['cards/live', 'cards/draft', 'cards/mine', 'cards/live/edits/current'].map(get))).toEqual(before);
    expect(await exists('notifications/resonance_alice_orig')).toBe(false);
    // Taking back a resonance it no longer has changes nothing either.
    expect(await unresonate(db, 'alice', 'orig', 'mine')).toEqual({ changed: false, stale: [] });
  });

  it('is deleted for good by DELETE, in the trash or not; onlyIfTrashed refuses one that is not', async () => {
    expect((await deleteCard(db, 'alice', 'live', { onlyIfTrashed: true })).deleted).toBe(true);
    expect(await exists('cards/live')).toBe(false);
    expect(await exists('cards/live/edits/current')).toBe(false);
    expect(answer(await failure(deleteCard(db, 'alice', 'conn', { onlyIfTrashed: true })))).toEqual([
      'conflict', 'This card is not in the trash.', undefined,
    ]);
    expect(await get('cards/conn')).toMatchObject({ visibility: 'connections' });
    // Without it (installed builds: their 刪除 is for good, as their dialog says), any card.
    expect((await deleteCard(db, 'alice', 'conn')).deleted).toBe(true);
    expect(await exists('cards/conn')).toBe(false);
  });
});

describe('notes on a card in the trash', () => {
  it("go with an anonymous card as it goes in — delivered and withheld alike — and stay on a named one", async () => {
    await db.doc('cards/live').update({ anonymous: true });
    const delivered = await sendNote(db, 'carol', { cardId: 'live', text: 'hi', clientId: 'carolsnote-0000001' });
    await set('users/carol/blocks/alice', { blockedUid: 'alice' });
    const withheld = await sendNote(db, 'carol', { cardId: 'live', text: 'again', clientId: 'carolsnote-0000002' });
    await db.doc('users/carol/blocks/alice').delete();
    const named = await sendNote(db, 'carol', { cardId: 'mine', text: 'to a named card' });
    // While the note is there, a resend answers as the first send did.
    expect(await sendNote(db, 'carol', { cardId: 'live', text: 'hi', clientId: 'carolsnote-0000001' })).toMatchObject({ id: delivered.id });

    await trashCard(db, 'alice', 'live');
    await trashCard(db, 'alice', 'mine');
    expect(await exists(`notes/${delivered.id}`)).toBe(false);
    expect(await exists(`notes/${withheld.id}`)).toBe(false);
    expect(await exists(`notes/${named.id}`)).toBe(true);
    // Gone as a deleted card's notes go: the resend is a missing card's 404, and the writer's export lacks them.
    expect(answer(await failure(sendNote(db, 'carol', { cardId: 'live', text: 'hi', clientId: 'carolsnote-0000001' })))).toEqual(MISSING);
    const exported = await exportAccountData(db, 'carol');
    expect(exported.notesSent.map((n) => n.id)).toEqual([named.id]);
    // Restored, the anonymous card comes back without them.
    await restoreCard(db, 'alice', 'live');
    expect((await db.collection('notes').where('cardId', '==', 'live').get()).size).toBe(0);
  });

  it("can't be shared in a message, even by its author", async () => {
    await set('connections/alice_carol', { userIds: ['alice', 'carol'], establishedAt: Timestamp.now() });
    await trashCard(db, 'alice', 'live');
    expect(answer(await failure(sendMessage(db, 'alice', { to: 'carol', text: 'look', cardRef: 'live' })))).toEqual(MISSING);
    expect((await db.collection('conversations').get()).empty).toBe(true);
  });

  it("let a reply that quotes a note on the sender's own anonymous card in the trash go without the quote", async () => {
    await db.doc('cards/live').update({ anonymous: true });
    await set('connections/alice_carol', { userIds: ['alice', 'carol'], establishedAt: Timestamp.now() });
    const note = await sendNote(db, 'carol', { cardId: 'live', text: 'hi' });
    await trashCard(db, 'alice', 'live');
    const sent = await sendMessage(db, 'alice', { to: 'carol', text: 'thank you', noteRef: { cardId: 'live', noteId: note.id } });
    const message = (await get(`conversations/alice_carol/messages/${sent.id}`))!;
    expect(message.text).toBe('thank you');
    expect(message).not.toHaveProperty('noteRef');
  });
});

describe('a resonance in the trash', () => {
  it("is taken back at once: the connection it alone held goes, its bell stays — and another card may answer the original", async () => {
    await resonate();
    expect(await exists('connections/alice_bob')).toBe(true);
    await trashCard(db, 'alice', 'mine');
    expect(await get('cards/mine')).toMatchObject({ visibility: 'private', trashedFrom: { visibility: 'public', referenceCardId: 'orig' } });
    expect(await get('cards/mine')).not.toHaveProperty('referenceCardId');
    expect(await exists('connections/alice_bob')).toBe(false);
    expect(await exists('connectionOrigins/alice_bob')).toBe(false);
    expect(await exists('notifications/resonance_alice_orig')).toBe(true);
    // She answers that card once: with this one parked, another may.
    expect((await resonateWith(db, 'alice', 'orig', 'mine2')).changed).toBe(true);
    // Which leaves the first one to come back on its own.
    const back = await restoreCard(db, 'alice', 'mine');
    expect(RestoredCard.safeParse({ card: back.card, changed: back.changed, droppedResonance: back.droppedResonance }).success).toBe(true);
    expect(back).toMatchObject({ changed: true, droppedResonance: true, notificationId: null });
    expect(await get('cards/mine')).toMatchObject({ visibility: 'public' });
    expect(await get('cards/mine')).not.toHaveProperty('referenceCardId');
  });

  it('comes back answering its original, ringing no one and connecting no one the trash disconnected', async () => {
    await resonate();
    const bell = await get('notifications/resonance_alice_orig');
    await trashCard(db, 'alice', 'mine');
    const back = await restoreCard(db, 'alice', 'mine');
    expect(back).toMatchObject({ droppedResonance: false, notificationId: null });
    expect(await get('cards/mine')).toMatchObject({ visibility: 'public', referenceCardId: 'orig' });
    expect(await exists('connections/alice_bob')).toBe(false);
    expect(await get('notifications/resonance_alice_orig')).toEqual(bell);
  });

  it('is a reason the two are connected again when something else kept them so', async () => {
    await resonate();
    // An accepted invite: a reason for good.
    await db.doc('connectionOrigins/alice_bob').set({ reasons: { invite_i1: { kind: 'invite', inviteId: 'i1' } } }, { merge: true });
    await trashCard(db, 'alice', 'mine');
    expect(await exists('connections/alice_bob')).toBe(true);
    expect(Object.keys((await get('connectionOrigins/alice_bob'))!.reasons)).toEqual(['invite_i1']);
    await restoreCard(db, 'alice', 'mine');
    expect(Object.keys((await get('connectionOrigins/alice_bob'))!.reasons).sort()).toEqual(['invite_i1', 'resonance_alice_mine']);
    expect((await get('connectionOrigins/alice_bob'))!.resonanceCards).toEqual(['mine']);
  });

  it('that never reached anyone rings its original\'s author once on its way back — and never again', async () => {
    // Published while a block stood (since lifted): it reached no one.
    await db.doc('cards/mine').update({ referenceCardId: 'orig' });
    await trashCard(db, 'alice', 'mine');
    const first = await restoreCard(db, 'alice', 'mine');
    expect(first.notificationId).toBe('resonance_alice_orig');
    expect(await exists('connections/alice_bob')).toBe(true);
    await trashCard(db, 'alice', 'mine');
    expect(await exists('connections/alice_bob')).toBe(false);
    const second = await restoreCard(db, 'alice', 'mine');
    expect(second.notificationId).toBeNull();
    expect(await exists('connections/alice_bob')).toBe(false);
    expect((await db.collection('notifications').get()).size).toBe(1);
  });

  describe('comes back answering its original whatever has become of it (as un-hiding one does)', () => {
    beforeEach(async () => {
      await resonate();
      await trashCard(db, 'alice', 'mine');
    });
    const pointed = async () => (await get('cards/mine'))?.referenceCardId;

    it('gone', async () => {
      await deleteCard(db, 'bob', 'orig');
      expect(await restoreCard(db, 'alice', 'mine')).toMatchObject({ droppedResonance: false, notificationId: null });
      expect(await pointed()).toBe('orig');
    });

    it('private', async () => {
      await updateCard(db, 'bob', 'orig', { visibility: 'private' });
      expect(await restoreCard(db, 'alice', 'mine')).toMatchObject({ droppedResonance: false });
      expect(await pointed()).toBe('orig');
    });

    it('in the trash itself', async () => {
      await trashCard(db, 'bob', 'orig');
      expect(await restoreCard(db, 'alice', 'mine')).toMatchObject({ droppedResonance: false });
      expect(await pointed()).toBe('orig');
    });

    it('across a block, either way — reaching no one', async () => {
      await set('users/bob/blocks/alice', { blockedUid: 'alice' });
      expect(await restoreCard(db, 'alice', 'mine')).toMatchObject({ droppedResonance: false, notificationId: null });
      expect(await pointed()).toBe('orig');
      expect(await exists('connections/alice_bob')).toBe(false);
    });

    it('but not once the original answers it (a card answers no card answering it)', async () => {
      await db.doc('cards/orig').update({ referenceCardId: 'mine' });
      expect(await restoreCard(db, 'alice', 'mine')).toMatchObject({ droppedResonance: true, notificationId: null });
      expect(await pointed()).toBeUndefined();
    });
  });
});

describe('restoring', () => {
  it('changes nothing on a card not in the trash', async () => {
    const before = await get('cards/live');
    expect(await restoreCard(db, 'alice', 'live')).toMatchObject({ changed: false, droppedResonance: false, stale: [] });
    expect(await get('cards/live')).toEqual(before);
  });

  it('brings an older anonymous card for connections only back as it was (never migrated)', async () => {
    await db.doc('cards/conn').update({ anonymous: true });
    await trashCard(db, 'alice', 'conn');
    await restoreCard(db, 'alice', 'conn');
    expect(await get('cards/conn')).toMatchObject({ visibility: 'connections', anonymous: true });
    expect(await get('cards/conn')).not.toHaveProperty('trashedAt');
    expect(await get('cards/conn')).not.toHaveProperty('trashedFrom');
  });

  it("sets a pending edit saved while it was in the trash straight, so saving it later doesn't hide the card again", async () => {
    await resonate();
    // Connected for good besides (an accepted invite): the resonance is one more reason, while it stands.
    await db.doc('connectionOrigins/alice_bob').set({ reasons: { invite_i1: { kind: 'invite', inviteId: 'i1' } } }, { merge: true });
    const at = Date.now() - 60_000;
    await trashCard(db, 'alice', 'mine', { now: at });
    // A save that raced the trash: the editor's working copy, holding the trash's 'private'.
    await set('cards/mine/edits/current', { thoughtCore: 'revised', story: 'revised', visibility: 'private', anonymous: false, updatedAt: Timestamp.fromMillis(at + 1) });
    await restoreCard(db, 'alice', 'mine');
    expect(await get('cards/mine/edits/current')).toMatchObject({ visibility: 'public', story: 'revised' });
    await applyCardEdit(db, 'alice', 'mine');
    expect(await get('cards/mine')).toMatchObject({ visibility: 'public', referenceCardId: 'orig', story: 'revised' });
    expect(Object.keys((await get('connectionOrigins/alice_bob'))?.reasons ?? {})).toContain('resonance_alice_mine');
  });

  it("leaves the author's own working copy from before the trash as it is", async () => {
    await set('cards/live/edits/current', { thoughtCore: 'mine', story: 'mine', visibility: 'private', updatedAt: Timestamp.fromMillis(Date.now() - DAY) });
    await trashCard(db, 'alice', 'live');
    await restoreCard(db, 'alice', 'live');
    expect(await get('cards/live/edits/current')).toMatchObject({ visibility: 'private' });
  });

  it("gives an edit the card's byline beside its visibility where the visibility alone would leave it anonymous for connections", async () => {
    const at = Date.now() - 60_000;
    await trashCard(db, 'alice', 'conn', { now: at });
    await set('cards/conn/edits/current', { thoughtCore: 't', story: 's', visibility: 'private', anonymous: true, updatedAt: Timestamp.fromMillis(at + 1) });
    await restoreCard(db, 'alice', 'conn');
    expect(await get('cards/conn/edits/current')).toMatchObject({ visibility: 'connections', anonymous: false });
  });
});

describe('emptying the trash (DELETE /me/trash)', () => {
  it("deletes only the viewer's cards in the trash from before its cut-off, and says how many are left", async () => {
    const t = Date.now() - DAY;
    await trashCard(db, 'alice', 'live', { now: t });
    await trashCard(db, 'alice', 'priv', { now: t });
    await trashCard(db, 'bob', 'orig', { now: t });
    const first = await emptyTrash(db, 'alice', { before: new Date(t + 1000) });
    // Moved there after the cut-off: left, and not counted.
    await trashCard(db, 'alice', 'draft');
    expect(first).toMatchObject({ deleted: 2, remaining: 0, before: new Date(t + 1000).toISOString() });
    expect(first.stale.some((p) => p.startsWith('/u/'))).toBe(false);
    expect(await exists('cards/live')).toBe(false);
    expect(await exists('cards/priv')).toBe(false);
    expect(await exists('cards/orig')).toBe(true);
    expect(await exists('cards/draft')).toBe(true);
    // A cut-off in the future is now.
    expect((await emptyTrash(db, 'alice', { before: new Date(Date.now() + DAY) })).deleted).toBe(1);
  });

  it('a page at a time: remaining counts what is left from before the cut-off, until nothing is', async () => {
    const t = Date.now() - DAY;
    const batch = db.batch();
    for (let i = 0; i < 53; i++) {
      batch.set(db.doc(`cards/bulk${i}`), {
        authorId: 'alice', thoughtCore: 't', story: 's', visibility: 'private', publishedAt: null,
        trashedAt: Timestamp.fromMillis(t + i), trashedFrom: { visibility: 'public', referenceCardId: null },
      });
    }
    await batch.commit();
    const first = await emptyTrash(db, 'alice');
    expect(first).toMatchObject({ deleted: 50, remaining: 3 });
    const second = await emptyTrash(db, 'alice', { before: new Date(first.before) });
    expect(second).toMatchObject({ deleted: 3, remaining: 0, before: first.before });
  });

  it('keeps a card restored between its read of the trash and the delete', async () => {
    await trashCard(db, 'alice', 'live', { now: Date.now() - DAY });
    const real = db.runTransaction.bind(db);
    let restored = false;
    const spy = vi.spyOn(db, 'runTransaction').mockImplementation(async (fn, opts) => {
      if (!restored) {
        restored = true;
        spy.mockRestore();
        await restoreCard(db, 'alice', 'live');
      }
      return real(fn, opts);
    });
    const result = await emptyTrash(db, 'alice');
    spy.mockRestore();
    expect(restored).toBe(true);
    expect(result).toMatchObject({ deleted: 0, remaining: 0 });
    expect(await get('cards/live')).toMatchObject({ visibility: 'public' });
  });
});

describe('the purge (30 days in)', () => {
  const now = Date.now();
  it('deletes only the cards in the trash for thirty days or more, with what is under them', async () => {
    await trashCard(db, 'alice', 'live', { now: now - 30 * DAY - 1000 });
    await set('cards/live/edits/current', { thoughtCore: 'x', story: 'y' });
    await trashCard(db, 'alice', 'priv', { now: now - 29 * DAY });
    const revalidated: string[][] = [];
    const run = await purgeExpiredTrash(db, { now, budgetMs: 60_000, revalidate: (p) => void revalidated.push(p) });
    expect(run).toMatchObject({ purged: 1, skipped: 0, failed: 0, deferred: 0 });
    expect(await exists('cards/live')).toBe(false);
    expect(await exists('cards/live/edits/current')).toBe(false);
    expect(await exists('cards/priv')).toBe(true);
    // Private while in the trash, it left the landing page when it went in.
    expect(revalidated).toEqual([['/card/live', '/card/slug-live']]);
  });

  it('keeps a card restored between its read of the trash and the delete', async () => {
    await trashCard(db, 'alice', 'live', { now: now - 31 * DAY });
    const real = db.runTransaction.bind(db);
    let restored = false;
    const spy = vi.spyOn(db, 'runTransaction').mockImplementation(async (fn, opts) => {
      if (!restored) {
        restored = true;
        spy.mockRestore();
        // Restored by hand: its own restore would refuse a card past its date.
        await db.doc('cards/live').update({ trashedAt: Timestamp.now() });
      }
      return real(fn, opts);
    });
    const run = await purgeExpiredTrash(db, { now, budgetMs: 60_000 });
    spy.mockRestore();
    expect(run).toMatchObject({ purged: 0, skipped: 1 });
    expect(await exists('cards/live')).toBe(true);
  });

  it('pages on past a card it cannot delete, rather than reading it again', async () => {
    const batch = db.batch();
    // The longest in the trash names no author: it fails each time.
    batch.set(db.doc('cards/stuck'), { thoughtCore: 't', story: 's', visibility: 'private', trashedAt: Timestamp.fromMillis(now - 60 * DAY) });
    for (let i = 0; i < 50; i++) {
      batch.set(db.doc(`cards/expired${i}`), {
        authorId: 'alice', thoughtCore: 't', story: 's', visibility: 'private', publishedAt: null,
        trashedAt: Timestamp.fromMillis(now - 40 * DAY + i), trashedFrom: { visibility: 'public', referenceCardId: null },
      });
    }
    await batch.commit();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = await purgeExpiredTrash(db, { now, budgetMs: 60_000 });
    quiet.mockRestore();
    expect(run).toMatchObject({ purged: 50, failed: 1, skipped: 0, deferred: 0 });
  });

  it('starts nothing once its time is up, leaving the rest for the next run', async () => {
    await trashCard(db, 'alice', 'live', { now: now - 31 * DAY });
    const run = await purgeExpiredTrash(db, { now, budgetMs: 0 });
    expect(run).toMatchObject({ purged: 0, deferred: 1 });
    expect(await exists('cards/live')).toBe(true);
  });
});

describe('budgets', () => {
  it('a trash spent to its last never takes the undo with it', async () => {
    await set('rateLimits/alice_trash', { userId: 'alice', bucket: 'trash', windowStart: Date.now(), used: 200 });
    expect((await failure(spend(db, 'alice', 'trash'))).code).toBe('rate_limited');
    await trashCard(db, 'alice', 'live');
    await spend(db, 'alice', 'restore');
    expect((await restoreCard(db, 'alice', 'live')).changed).toBe(true);
  });
});

describe('no card change revalidates its author\'s profile', () => {
  it('trash, restore, delete, PATCH and apply — anonymous or not', async () => {
    const stale: string[] = [];
    for (const anonymous of [false, true]) {
      await db.doc('cards/live').update({ anonymous });
      stale.push(...(await trashCard(db, 'alice', 'live')).stale);
      stale.push(...(await restoreCard(db, 'alice', 'live')).stale);
      stale.push(...(await updateCard(db, 'alice', 'live', { visibility: 'private' })).stale);
      stale.push(...(await updateCard(db, 'alice', 'live', { visibility: 'public' })).stale);
      await set('cards/live/edits/current', { thoughtCore: 'edited', story: 'edited', visibility: 'public', anonymous });
      stale.push(...(await applyCardEdit(db, 'alice', 'live')).stale);
    }
    stale.push(...(await deleteCard(db, 'alice', 'live')).stale);
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.filter((p) => p.startsWith('/u/'))).toEqual([]);
  });
});
