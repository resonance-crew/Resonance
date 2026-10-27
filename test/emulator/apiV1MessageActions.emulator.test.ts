import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { sendMessage, sendNote } from '@/lib/api/v1/conversations';
import {
  QUOTES_IN_TRANSACTION,
  UNSEND_WINDOW_MS,
  UNSENT_COPY_KEEP_MS,
  purgeUnsentCopies,
  removeReaction,
  setReaction,
  unsendMessage,
} from '@/lib/api/v1/messageActions';
import { createReport } from '@/lib/api/v1/safety';
import { readChatImage } from '@/lib/api/v1/chatImages';
import type { ChatImageStore } from '@/lib/storage/chatImages';

// Round 16 §5 against the Firestore emulator: reacting to a message
// (PUT/DELETE …/reaction) and unsending one (POST …/unsend). A reaction is
// quiet — no bell, no unread, the list's preview unchanged — and only between
// two people connected, with a pen name and no block either way. Unsending is
// the sender's alone, within 24 hours, never a note: the message keeps only
// its sender and times, its quotes are emptied, the conversation's preview
// says so if it was the newest, and what it said is kept 30 days for
// moderation only — attached to a report, then purged by the cron or with
// either account.

const PROJECT = 'demo-resonance-api-message-actions';
const PAIR = 'alice_bob';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-message-actions-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all([
    ...['alice', 'bob', 'carol'].map((id) => db.doc(`users/${id}`).set({ handle: id, handleLower: id })),
    db.doc(`connections/${PAIR}`).set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() }),
    db.doc('cards/walk').set({
      authorId: 'bob', thoughtCore: 'A walk', story: 's', visibility: 'public', anonymous: false,
      publishedAt: Timestamp.fromDate(new Date('2026-09-01T08:00:00Z')),
    }),
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

const send = (from: string, to: string, text: string, extra: Record<string, unknown> = {}) =>
  sendMessage(db, from, { to, text, ...extra }).then((sent) => sent.id);
const message = async (id: string, pair = PAIR) => (await db.doc(`conversations/${pair}/messages/${id}`).get()).data();
const convo = async (pair = PAIR) => (await db.doc(`conversations/${pair}`).get()).data()!;

describe('setReaction', () => {
  it('answers a message with the reaction, one per person — a second replaces the first — quietly', async () => {
    const id = await send('alice', 'bob', '明天一起去散步嗎？');
    const before = await convo();
    const bellsBefore = (await db.collection('notifications').get()).size;

    await setReaction(db, 'bob', PAIR, id, { reaction: 'heart' });
    expect((await message(id))!.reactions).toEqual({ bob: 'heart' });
    await setReaction(db, 'bob', PAIR, id, { reaction: 'laugh' });
    // Your own messages take them too.
    await setReaction(db, 'alice', PAIR, id, { reaction: 'hug' });
    expect((await message(id))!.reactions).toEqual({ bob: 'laugh', alice: 'hug' });

    // No bell, no unread, the list's preview and order unchanged.
    const after = await convo();
    expect(after.unread).toEqual(before.unread);
    expect(after.lastMessage).toEqual(before.lastMessage);
    expect((after.updatedAt as Timestamp).isEqual(before.updatedAt as Timestamp)).toBe(true);
    expect((await db.collection('notifications').get()).size).toBe(bellsBefore);
  });

  it("is a missing message to anyone not in the conversation, for a message not in it, and for one unsent", async () => {
    const id = await send('alice', 'bob', 'hi');
    expect((await failure(setReaction(db, 'carol', PAIR, id, { reaction: 'heart' }))).code).toBe('not_found');
    expect((await failure(setReaction(db, 'carol', 'alice_carol', id, { reaction: 'heart' }))).code).toBe('not_found');
    expect((await failure(setReaction(db, 'bob', PAIR, 'nope', { reaction: 'heart' }))).code).toBe('not_found');
    expect((await failure(setReaction(db, 'bob', 'bob_x', id, { reaction: 'heart' }))).code).toBe('not_found');
    expect((await failure(setReaction(db, 'bob', PAIR, '__x__', { reaction: 'heart' }))).code).toBe('not_found');
    await unsendMessage(db, 'alice', PAIR, id);
    expect((await failure(setReaction(db, 'bob', PAIR, id, { reaction: 'heart' }))).code).toBe('not_found');
    expect(await message(id)).not.toHaveProperty('reactions');
  });

  it('needs a pen name, then no block either way, then a connection — a letter not yet answered takes none', async () => {
    const id = await send('alice', 'bob', 'hi');
    await db.doc('users/bob').set({ handle: '' }, { merge: true });
    expect((await failure(setReaction(db, 'bob', PAIR, id, { reaction: 'heart' }))).message).toBe('Choose a pen name first.');
    await db.doc('users/bob').set({ handle: 'bob' }, { merge: true });

    for (const [blocker, blocked] of [['alice', 'bob'], ['bob', 'alice']]) {
      await db.doc(`users/${blocker}/blocks/${blocked}`).set({ blockedUid: blocked });
      const e = await failure(setReaction(db, 'bob', PAIR, id, { reaction: 'heart' }));
      expect([e.code, e.message]).toEqual(['blocked', 'You cannot react to this message.']);
      await db.doc(`users/${blocker}/blocks/${blocked}`).delete();
    }

    // A letter: carol left bob a note on his card; they aren't connected.
    const note = await sendNote(db, 'carol', { cardId: 'walk', text: 'a letter' });
    for (const [uid] of [['bob'], ['carol']]) {
      const e = await failure(setReaction(db, uid, 'bob_carol', note.id, { reaction: 'heart' }));
      expect([e.code, e.message]).toEqual(['forbidden', 'You can react once you are connected.']);
    }
    expect(await message(note.id, 'bob_carol')).not.toHaveProperty('reactions');
    expect(await message(id)).not.toHaveProperty('reactions');
  });
});

describe('removeReaction', () => {
  it("takes the viewer's own reaction back, leaving the other's, and is idempotent", async () => {
    const id = await send('alice', 'bob', 'hi');
    await setReaction(db, 'bob', PAIR, id, { reaction: 'heart' });
    await setReaction(db, 'alice', PAIR, id, { reaction: 'thumbs' });
    await removeReaction(db, 'bob', PAIR, id);
    expect((await message(id))!.reactions).toEqual({ alice: 'thumbs' });
    await removeReaction(db, 'bob', PAIR, id);
    expect((await message(id))!.reactions).toEqual({ alice: 'thumbs' });
  });

  it('takes one back across a block (reaching no one), and of an unsent message answers as done', async () => {
    const id = await send('alice', 'bob', 'hi');
    await setReaction(db, 'bob', PAIR, id, { reaction: 'moved' });
    await db.doc('users/alice/blocks/bob').set({ blockedUid: 'bob' });
    await removeReaction(db, 'bob', PAIR, id);
    expect((await message(id))!.reactions).toEqual({});
    await db.doc('users/alice/blocks/bob').delete();
    await unsendMessage(db, 'alice', PAIR, id);
    await removeReaction(db, 'bob', PAIR, id);
  });

  it('is a missing message to anyone not in the conversation, or for one not in it', async () => {
    const id = await send('alice', 'bob', 'hi');
    await setReaction(db, 'bob', PAIR, id, { reaction: 'heart' });
    expect((await failure(removeReaction(db, 'carol', PAIR, id))).code).toBe('not_found');
    expect((await failure(removeReaction(db, 'bob', PAIR, 'nope'))).code).toBe('not_found');
    expect((await message(id))!.reactions).toEqual({ bob: 'heart' });
  });
});

describe('unsendMessage', () => {
  it('leaves the message its sender and times only, and the newest one\'s preview saying so — unread untouched', async () => {
    await send('bob', 'alice', 'earlier');
    const id = await send('alice', 'bob', '這句話不該說的 https://example.com/x', { cardRef: 'walk' });
    await db.doc(`conversations/${PAIR}/messages/${id}`).update({ preview: { url: 'https://example.com/x', title: 'X' } });
    await setReaction(db, 'bob', PAIR, id, { reaction: 'laugh' });
    const before = await convo();
    const { sentAt } = (await message(id))!;

    const { push } = await unsendMessage(db, 'alice', PAIR, id);
    expect(push).toEqual({ conversationId: PAIR, messageId: id, from: 'alice', to: 'bob' });

    const now = (await message(id))!;
    expect(Object.keys(now).sort()).toEqual(['senderId', 'sentAt', 'unsentAt']);
    expect(now.senderId).toBe('alice');
    expect((now.sentAt as Timestamp).isEqual(sentAt as Timestamp)).toBe(true);
    expect(now.unsentAt).toBeInstanceOf(Timestamp);

    const after = await convo();
    expect(Object.keys(after.lastMessage).sort()).toEqual(['senderId', 'sentAt', 'unsent']);
    expect(after.lastMessage).toMatchObject({ senderId: 'alice', unsent: true });
    expect((after.lastMessage.sentAt as Timestamp).isEqual(sentAt as Timestamp)).toBe(true);
    expect(after.unread).toEqual(before.unread);
  });

  // Found by the iOS lane: the next message's preview is merged into the unsent one, and kept its `unsent`.
  it('lets the next message — or note in the thread — write a whole preview again, with no unsent left in it', async () => {
    const id = await send('alice', 'bob', 'gone soon');
    await unsendMessage(db, 'alice', PAIR, id);
    expect((await convo()).lastMessage).toMatchObject({ unsent: true });
    await send('bob', 'alice', 'still here?');
    const last = (await convo()).lastMessage;
    expect(last).toMatchObject({ text: 'still here?', senderId: 'bob' });
    expect(last).not.toHaveProperty('unsent');
  });

  it("leaves the preview alone when a later message is the newest", async () => {
    const id = await send('alice', 'bob', 'first');
    await send('bob', 'alice', 'a later one');
    const before = (await convo()).lastMessage;
    await unsendMessage(db, 'alice', PAIR, id);
    expect((await convo()).lastMessage).toEqual(before);
  });

  it("empties every quote of it to `{ id, senderId, unsent: true }`, and a later reply to it quotes it so", async () => {
    const id = await send('alice', 'bob', 'the words');
    const a = await send('bob', 'alice', 'what?', { replyTo: id });
    const b = await send('alice', 'bob', 'nothing', { replyTo: id });
    const other = await send('bob', 'alice', 'other', { replyTo: a });
    await unsendMessage(db, 'alice', PAIR, id);
    for (const reply of [a, b]) expect((await message(reply))!.replyTo).toEqual({ id, senderId: 'alice', unsent: true });
    expect((await message(other))!.replyTo).toMatchObject({ id: a, text: 'what?' });
    const late = await send('bob', 'alice', 'still?', { replyTo: id });
    expect((await message(late))!.replyTo).toEqual({ id, senderId: 'alice', unsent: true });
  });

  it(`empties quotes past one transaction's ${QUOTES_IN_TRANSACTION} too`, async () => {
    const id = await send('alice', 'bob', 'quoted a lot');
    const count = QUOTES_IN_TRANSACTION + 5;
    for (let i = 0; i < count; i += 400) {
      const batch = db.batch();
      for (let j = i; j < Math.min(count, i + 400); j++) {
        batch.set(db.doc(`conversations/${PAIR}/messages/q${String(j).padStart(4, '0')}`), {
          senderId: 'bob', text: `${j}`, sentAt: Timestamp.now(), replyTo: { id, senderId: 'alice', text: 'quoted a lot' },
        });
      }
      await batch.commit();
    }
    await unsendMessage(db, 'alice', PAIR, id);
    const quotes = await db.collection(`conversations/${PAIR}/messages`).where('replyTo.id', '==', id).get();
    expect(quotes.size).toBe(count);
    expect(quotes.docs.filter((d) => d.get('replyTo.unsent') !== true)).toEqual([]);
    expect(quotes.docs.filter((d) => d.get('replyTo.text') !== undefined)).toEqual([]);
  });

  it("keeps what it said for moderation, server-only, with its card and picture — the picture no longer served", async () => {
    await db.doc('chatImages/pic1').set({
      senderId: 'alice', to: 'bob', pair: PAIR, key: 'chat/2026-10/k.webp', thumbKey: 'chat/2026-10/k-thumb.webp',
      width: 4, height: 3, bytes: 10, animated: false, unsentAt: Timestamp.now(),
    });
    const id = await send('alice', 'bob', 'a photo', { image: 'pic1' });
    const store = { get: vi.fn(async () => new Uint8Array([1])), put: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() } as unknown as ChatImageStore;
    expect(await readChatImage(db, store, 'bob', 'pic1', 'full')).not.toBeNull();

    await unsendMessage(db, 'alice', PAIR, id);
    const copy = (await db.doc(`unsentMessages/${PAIR}_${id}`).get()).data()!;
    expect(copy).toMatchObject({ pair: PAIR, messageId: id, senderId: 'alice', to: 'bob', text: 'a photo', image: { id: 'pic1', width: 4, height: 3 } });
    expect(copy.sentAt).toBeInstanceOf(Timestamp);
    expect(copy.unsentAt).toBeInstanceOf(Timestamp);
    // The picture's record and files stay with the copy; no one reads it any more.
    expect((await db.doc('chatImages/pic1').get()).exists).toBe(true);
    expect(await readChatImage(db, store, 'bob', 'pic1', 'full')).toBeNull();
    expect(await readChatImage(db, store, 'alice', 'pic1', 'thumb')).toBeNull();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('is the sender\'s alone: the recipient and anyone else get a missing message', async () => {
    const id = await send('alice', 'bob', 'hi');
    expect((await failure(unsendMessage(db, 'bob', PAIR, id))).code).toBe('not_found');
    expect((await failure(unsendMessage(db, 'carol', PAIR, id))).code).toBe('not_found');
    expect((await failure(unsendMessage(db, 'alice', 'alice_carol', id))).code).toBe('not_found');
    expect((await failure(unsendMessage(db, 'alice', PAIR, 'nope'))).code).toBe('not_found');
    expect((await message(id))!.text).toBe('hi');
  });

  it("refuses a note (a letter left on a card) — 'A note can't be unsent.'", async () => {
    const note = await sendNote(db, 'alice', { cardId: 'walk', text: 'a note' });
    const e = await failure(unsendMessage(db, 'alice', PAIR, note.id));
    expect([e.code, e.message]).toEqual(['invalid_request', "A note can't be unsent."]);
    expect((await message(note.id))!.text).toBe('a note');
  });

  it('is a conflict past 24 hours, and an unsent one again is answered as done, writing nothing', async () => {
    const id = await send('alice', 'bob', 'hi');
    const sentAt = ((await message(id))!.sentAt as Timestamp).toMillis();
    const e = await failure(unsendMessage(db, 'alice', PAIR, id, sentAt + UNSEND_WINDOW_MS + 1));
    expect([e.code, e.message]).toEqual(['conflict', 'This message can no longer be unsent.']);
    expect((await message(id))!.text).toBe('hi');

    await unsendMessage(db, 'alice', PAIR, id, sentAt + UNSEND_WINDOW_MS);
    const first = (await db.doc(`unsentMessages/${PAIR}_${id}`).get()).updateTime!;
    expect(await unsendMessage(db, 'alice', PAIR, id)).toEqual({ push: null });
    // Long after, too: done is done.
    expect(await unsendMessage(db, 'alice', PAIR, id, sentAt + 10 * UNSEND_WINDOW_MS)).toEqual({ push: null });
    expect((await db.doc(`unsentMessages/${PAIR}_${id}`).get()).updateTime!.isEqual(first)).toBe(true);
  });
});

describe('a report attaches the unsent copies', () => {
  it("of the conversation, while kept, to a report of one of its messages or of the conversation — marked unsent", async () => {
    const said = await send('bob', 'alice', '你給我小心一點');
    const reported = await send('bob', 'alice', 'a later one');
    await unsendMessage(db, 'bob', PAIR, said);

    const one = await createReport(db, 'alice', { targetType: 'message', targetId: reported, conversationId: PAIR, reason: 'harassment' });
    const evidence = (await db.doc(`reportEvidence/${one}`).get()).data()!;
    expect(evidence.unsent).toEqual([
      expect.objectContaining({ id: said, senderId: 'bob', text: '你給我小心一點', unsent: true }),
    ]);
    // The unsent message itself, among the ones before: marked, its words only in `unsent`.
    expect(evidence.context.find((m: { id: string }) => m.id === said)).toMatchObject({ unsent: true, text: '' });

    const whole = await createReport(db, 'alice', { targetType: 'message', targetId: PAIR, conversationId: PAIR, reason: 'harassment' });
    expect((await db.doc(`reportEvidence/${whole}`).get()).get('unsent')).toEqual([expect.objectContaining({ id: said, unsent: true })]);
  });

  it('not once the copy is past its 30 days, nor from another conversation', async () => {
    const said = await send('bob', 'alice', 'old words');
    await unsendMessage(db, 'bob', PAIR, said);
    await db.doc(`unsentMessages/${PAIR}_${said}`).update({ unsentAt: Timestamp.fromMillis(Date.now() - UNSENT_COPY_KEEP_MS - 60_000) });
    await db.doc('unsentMessages/bob_carol_x').set({ pair: 'bob_carol', messageId: 'x', senderId: 'bob', to: 'carol', text: 'not this one', sentAt: Timestamp.now(), unsentAt: Timestamp.now() });
    const id = await createReport(db, 'alice', { targetType: 'message', targetId: PAIR, conversationId: PAIR, reason: 'spam' });
    expect((await db.doc(`reportEvidence/${id}`).get()).get('unsent')).toEqual([]);
  });
});

describe('purgeUnsentCopies (the daily trash cron)', () => {
  it('deletes the copies kept 30 days or more with the picture each carried, keeping the newer ones', async () => {
    const now = Date.now();
    const at = (ago: number) => Timestamp.fromMillis(now - ago);
    const copy = (id: string, ago: number, image?: string) =>
      db.doc(`unsentMessages/${PAIR}_${id}`).set({
        pair: PAIR, messageId: id, senderId: 'alice', to: 'bob', text: id, sentAt: at(ago + 1000), unsentAt: at(ago),
        ...(image ? { image: { id: image, width: 4, height: 3 } } : {}),
      });
    const picture = (id: string, messageId: string) =>
      db.doc(`chatImages/${id}`).set({ senderId: 'alice', to: 'bob', pair: PAIR, key: `chat/${id}.webp`, thumbKey: `chat/${id}-thumb.webp`, messageId });
    await Promise.all([
      copy('old', UNSENT_COPY_KEEP_MS + 60_000, 'p-old'),
      picture('p-old', 'old'),
      copy('older', UNSENT_COPY_KEEP_MS + 120_000),
      copy('fresh', UNSENT_COPY_KEEP_MS - 60_000, 'p-fresh'),
      picture('p-fresh', 'fresh'),
      // A copy naming a picture another message carries never takes that picture.
      copy('odd', UNSENT_COPY_KEEP_MS + 60_000, 'p-other'),
      picture('p-other', 'someone-else'),
    ]);
    const deleted: string[] = [];
    const store = { delete: vi.fn(async (key: string) => void deleted.push(key)) } as unknown as ChatImageStore;

    expect(await purgeUnsentCopies(db, store, { now })).toEqual({ deleted: 3, failed: 0 });
    const left = (await db.collection('unsentMessages').get()).docs.map((d) => d.id);
    expect(left).toEqual([`${PAIR}_fresh`]);
    expect((await db.doc('chatImages/p-old').get()).exists).toBe(false);
    expect((await db.doc('chatImages/p-fresh').get()).exists).toBe(true);
    expect((await db.doc('chatImages/p-other').get()).exists).toBe(true);
    expect(deleted.sort()).toEqual(['chat/p-old-thumb.webp', 'chat/p-old.webp']);
  });

  it('starts nothing past its deadline, and without a picture store leaves the picture for the account purge', async () => {
    const old = Timestamp.fromMillis(Date.now() - UNSENT_COPY_KEEP_MS - 60_000);
    await db.doc(`unsentMessages/${PAIR}_a`).set({ pair: PAIR, messageId: 'a', senderId: 'alice', to: 'bob', sentAt: old, unsentAt: old, image: { id: 'pa', width: 1, height: 1 } });
    await db.doc('chatImages/pa').set({ senderId: 'alice', to: 'bob', pair: PAIR, key: 'chat/pa.webp', thumbKey: 'chat/pa-thumb.webp', messageId: 'a' });
    expect(await purgeUnsentCopies(db, null, { deadline: 0, clock: () => 1 })).toEqual({ deleted: 0, failed: 0 });
    expect((await db.collection('unsentMessages').get()).size).toBe(1);

    expect(await purgeUnsentCopies(db, null)).toEqual({ deleted: 1, failed: 0 });
    expect((await db.collection('unsentMessages').get()).size).toBe(0);
    expect((await db.doc('chatImages/pa').get()).exists).toBe(true);
  });
});
