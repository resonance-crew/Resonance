import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { deleteConversation, sendMessage, sendNote } from '@/lib/api/v1/conversations';
import { unsendMessage } from '@/lib/api/v1/messageActions';
import { getCardDetail, getCardsByKeys, getResonances } from '@/lib/api/v1/reads';
import { resonateWith } from '@/lib/api/v1/resonate';
import { reportCard } from '@/lib/api/v1/safety';
import { trashCard } from '@/lib/api/v1/trash';

// A 私人卡 shared in a conversation: its author's message is the recipient's
// pass to read it — and only to read it — while that message stands
// (src/lib/api/v1/sharedCards.ts).

const PROJECT = 'demo-resonance-api-shared-cards';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-shared-cards-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const published = Timestamp.fromDate(new Date('2026-09-01T08:00:00Z'));
const card = (id: string, extra: Record<string, unknown> = {}) =>
  db.doc(`cards/${id}`).set({
    authorId: 'bob',
    thoughtCore: `title ${id}`,
    story: `the story of ${id}`,
    tags: [],
    visibility: 'private',
    anonymous: false,
    publishedAt: published,
    slug: `slug-${id}`,
    ...extra,
  });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all(['alice', 'bob', 'carol'].map((id) => db.doc(`users/${id}`).set({ handle: id, handleLower: id })));
  // Alice and Bob are connected; Carol is connected to both and to no conversation.
  await Promise.all(
    ['alice_bob', 'alice_carol', 'bob_carol'].map((pair) =>
      db.doc(`connections/${pair}`).set({ userIds: pair.split('_'), establishedAt: published }),
    ),
  );
  await Promise.all([
    card('secret'),
    card('unfinished', { publishedAt: null, slug: null }),
    card('masked', { anonymous: true }),
    card('public', { visibility: 'public' }),
    card('alices', { authorId: 'alice' }),
    card('reply', { authorId: 'alice', visibility: 'public' }),
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

const readsDetail = (viewer: string, key: string) =>
  getCardDetail(db, viewer, key).then(
    (d) => d.story,
    () => null,
  );
const readsSummary = async (viewer: string, key: string) => (await getCardsByKeys(db, viewer, [key])).cards.map((c) => c.id);

describe('a private card shared in a message', () => {
  it('is read by the one it was sent to — its story, its summary, by id or slug — and by no one else', async () => {
    expect(await readsDetail('alice', 'secret')).toBeNull();
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });

    expect(await readsDetail('alice', 'secret')).toBe('the story of secret');
    expect(await readsDetail('alice', 'slug-secret')).toBe('the story of secret');
    const detail = await getCardDetail(db, 'alice', 'secret');
    expect(detail).toMatchObject({ isOwner: false, visibility: 'private', anonymous: false });
    expect(detail.card.author?.handle).toBe('bob');
    expect(await readsSummary('alice', 'secret')).toEqual(['secret']);
    // Carol, connected to both, was sent nothing.
    expect(await readsDetail('carol', 'secret')).toBeNull();
    expect(await readsSummary('carol', 'secret')).toEqual([]);
  });

  it('can be one never published (a 私人卡 finished or not), but never someone else’s draft', async () => {
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'unfinished' });
    expect(await readsDetail('alice', 'unfinished')).toBe('the story of unfinished');
    expect(await readsSummary('alice', 'unfinished')).toEqual(['unfinished']);
    await db.doc('cards/hers').set({ authorId: 'carol', thoughtCore: 'x', story: 'x', visibility: 'private', anonymous: false, publishedAt: null });
    expect((await failure(sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'hers' }))).code).toBe('not_found');
  });

  it('is never an anonymous one: refused when sent, unread if it turns anonymous after', async () => {
    expect((await failure(sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'masked' }))).code).toBe('invalid_request');
    expect(await db.collection('conversations/alice_bob/messages').get()).toHaveProperty('size', 0);
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    await db.doc('cards/secret').update({ anonymous: true });
    expect(await readsDetail('alice', 'secret')).toBeNull();
    expect(await readsSummary('alice', 'secret')).toEqual([]);
  });

  it('is shared only by its author: the recipient sending it on, or back, is refused', async () => {
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    expect((await failure(sendMessage(db, 'alice', { to: 'carol', text: '', cardRef: 'secret' }))).code).toBe('not_found');
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: '', cardRef: 'secret' }))).code).toBe('not_found');
    // Alice's own private card, sent to Bob by her and quoted back by him: Bob is not its author.
    await sendMessage(db, 'alice', { to: 'bob', text: '', cardRef: 'alices' });
    expect(await readsDetail('bob', 'alices')).toBe('the story of alices');
    expect((await failure(sendMessage(db, 'bob', { to: 'carol', text: '', cardRef: 'alices' }))).code).toBe('not_found');
    expect(await readsDetail('carol', 'alices')).toBeNull();
  });

  it('is read, never answered: no note, no resonance, none of its lists — but it can be reported', async () => {
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    expect((await failure(sendNote(db, 'alice', { cardId: 'secret', text: 'hi' }))).code).toBe('not_found');
    expect((await failure(resonateWith(db, 'alice', 'secret', 'reply'))).code).toBe('not_found');
    expect((await failure(getResonances(db, 'alice', 'secret'))).code).toBe('not_found');
    const reportId = await reportCard(db, 'alice', 'secret', { reason: 'harassment' });
    expect((await db.doc(`reports/${reportId}`).get()).data()).toMatchObject({ targetId: 'secret', targetUserId: 'bob' });
  });

  it('ends when the message is unsent', async () => {
    const sent = await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    await unsendMessage(db, 'bob', 'alice_bob', sent.id);
    expect(await readsDetail('alice', 'secret')).toBeNull();
    expect(await readsSummary('alice', 'secret')).toEqual([]);
  });

  it('stands while another message of its author shares it, and ends when the last one goes', async () => {
    const first = await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    const second = await sendMessage(db, 'bob', { to: 'alice', text: 'again', cardRef: 'secret' });
    await unsendMessage(db, 'bob', 'alice_bob', first.id);
    expect(await readsDetail('alice', 'secret')).toBe('the story of secret');
    await unsendMessage(db, 'bob', 'alice_bob', second.id);
    expect(await readsDetail('alice', 'secret')).toBeNull();
  });

  it('ends when either of them deletes the conversation, and a message that outlived it shares nothing once they talk again', async () => {
    const sent = await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    const kept = (await db.doc(`conversations/alice_bob/messages/${sent.id}`).get()).data()!;
    await deleteConversation(db, 'alice', 'alice_bob');
    expect(await readsDetail('alice', 'secret')).toBeNull();
    // An older build's client delete left the message behind; the two talk again in a new conversation.
    await db.doc(`conversations/alice_bob/messages/${sent.id}`).set(kept);
    await sendMessage(db, 'alice', { to: 'bob', text: 'hello again' });
    expect(await readsDetail('alice', 'secret')).toBeNull();
    expect(await readsSummary('alice', 'secret')).toEqual([]);
  });

  it('ends with a block either way, and comes back only with the block gone', async () => {
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
    expect(await readsDetail('alice', 'secret')).toBeNull();
    expect(await readsSummary('alice', 'secret')).toEqual([]);
    await db.doc('users/alice/blocks/bob').delete();
    await db.doc('users/bob/blocks/alice').set({ blockedUid: 'alice' });
    expect(await readsDetail('alice', 'secret')).toBeNull();
    await db.doc('users/bob/blocks/alice').delete();
    expect(await readsDetail('alice', 'secret')).toBe('the story of secret');
  });

  it('ends when its author moves it to the trash or deletes it', async () => {
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    await trashCard(db, 'bob', 'secret');
    expect(await readsDetail('alice', 'secret')).toBeNull();
    expect(await readsSummary('alice', 'secret')).toEqual([]);
    expect((await failure(sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' }))).code).toBe('not_found');
  });

  it('a message of the recipient naming the card shares nothing (only its author’s does)', async () => {
    // Written as an older client might have: Alice's own message naming Bob's card.
    await sendMessage(db, 'alice', { to: 'bob', text: 'hi' });
    await db.collection('conversations/alice_bob/messages').add({ senderId: 'alice', text: '', cardRef: 'secret', sentAt: Timestamp.now() });
    expect(await readsDetail('alice', 'secret')).toBeNull();
  });

  it('keeps the list preview from naming it — a never-published one set to be public too', async () => {
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    expect((await db.doc('conversations/alice_bob').get()).get('lastMessage.text')).toBe('');
    await card('draft', { visibility: 'public', publishedAt: null, slug: null });
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'draft' });
    expect((await db.doc('conversations/alice_bob').get()).get('lastMessage.text')).toBe('');
  });

  it('is not read for an app build that would offer answers the server refuses (2.2.0 and before): hidden, as before', async () => {
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    expect((await failure(getCardDetail(db, 'alice', 'secret', new Set(), { shared: false }))).code).toBe('not_found');
    expect((await getCardsByKeys(db, 'alice', ['secret', 'public'], { shared: false })).cards.map((c) => c.id)).toEqual(['public']);
    // Its author's own card is theirs on any build.
    expect((await getCardDetail(db, 'bob', 'secret', new Set(), { shared: false })).isOwner).toBe(true);
  });

  it('marks the message that shares it, and only that one', async () => {
    const kept = await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    const open = await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'public' });
    expect((await db.doc(`conversations/alice_bob/messages/${kept.id}`).get()).get('privateShare')).toBe(true);
    expect((await db.doc(`conversations/alice_bob/messages/${open.id}`).get()).get('privateShare')).toBeUndefined();
  });

  it('is never a card sent while others could read it, made private after', async () => {
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'public' });
    await db.doc('cards/public').update({ visibility: 'private' });
    expect(await readsDetail('alice', 'public')).toBeNull();
    expect(await readsSummary('alice', 'public')).toEqual([]);
  });

  it("is never what an older message's card was: one sent before there was such a pass shares nothing", async () => {
    await sendMessage(db, 'alice', { to: 'bob', text: 'hi' });
    await db.collection('conversations/alice_bob/messages').add({ senderId: 'bob', text: '', cardRef: 'secret', sentAt: Timestamp.now() });
    expect(await readsDetail('alice', 'secret')).toBeNull();
    expect(await readsSummary('alice', 'secret')).toEqual([]);
  });

  it('is never a card for connections only: that stays with the connection', async () => {
    await card('close', { visibility: 'connections' });
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'close' });
    expect(await readsDetail('alice', 'close')).toBe('the story of close');
    await db.doc('connections/alice_bob').delete();
    expect(await readsDetail('alice', 'close')).toBeNull();
  });

  it('ends when its author publishes it to readers, who then read it by its audience', async () => {
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    await db.doc('cards/secret').update({ visibility: 'connections' });
    await db.doc('connections/alice_bob').delete();
    expect(await readsDetail('alice', 'secret')).toBeNull();
  });

  it('reads several of one author’s shared cards in one pass, and leaves out the rest', async () => {
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret' });
    await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'unfinished' });
    await card('unsent');
    expect((await getCardsByKeys(db, 'alice', ['secret', 'masked', 'unsent', 'unfinished'])).cards.map((c) => c.id)).toEqual(['secret', 'unfinished']);
  });

  it('answers a retried send as it was first sent, though the card has gone to the trash since', async () => {
    const first = await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret', clientId: 'retry-0000000001' });
    await trashCard(db, 'bob', 'secret');
    const again = await sendMessage(db, 'bob', { to: 'alice', text: '', cardRef: 'secret', clientId: 'retry-0000000001' });
    expect(again).toMatchObject({ id: first.id, duplicate: true });
  });
});
