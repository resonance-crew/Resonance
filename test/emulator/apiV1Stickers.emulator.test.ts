import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { ApiFailure } from '@/lib/api/v1/http';
import { sendMessage, sendNote, type SendMessageInput } from '@/lib/api/v1/conversations';
import { unsendMessage } from '@/lib/api/v1/messageActions';
import { createReport } from '@/lib/api/v1/safety';
import { exportAccountData } from '@/lib/account/export';
import { pushMessage } from '@/lib/push/chat';
import { registerDevice } from '@/lib/push/devices';
import { MESSAGES_CHANNEL, type PushSender } from '@/lib/push/send';

// Round 22 §3 against the Firestore emulator: 小紙團 stickers and albums. A
// sticker is a message of its own, kept as `sticker: { pack, id }` with its
// fallback words in the recipient's profile language for builds that can't
// draw it; the list's preview says it was a sticker; a reply quotes it; an
// unsend keeps it for moderation only; reports and the export carry it. Its
// push names it in each device's language, and a run of stickers buzzes once.
// An album is several pictures, one message each: only beside a picture, kept
// as sent, and only its first picture rings.

const PROJECT = 'demo-resonance-api-stickers';
const PAIR = 'alice_bob';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-stickers-test');
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
    db.doc('users/alice').set({ handle: '小明', handleLower: '小明', primaryLocale: 'zh-TW' }),
    db.doc('users/bob').set({ handle: 'bob', handleLower: 'bob', primaryLocale: 'zh-TW' }),
    db.doc('users/carol').set({ handle: 'carol', handleLower: 'carol', primaryLocale: 'en' }),
    // Made before profiles named a language.
    db.doc('users/dave').set({ handle: 'dave', handleLower: 'dave' }),
    db.doc('users/erin').set({ handle: 'erin', handleLower: 'erin', primaryLocale: 'en' }),
    db.doc(`connections/${PAIR}`).set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() }),
    db.doc('connections/alice_carol').set({ userIds: ['alice', 'carol'], establishedAt: Timestamp.now() }),
    db.doc('connections/alice_dave').set({ userIds: ['alice', 'dave'], establishedAt: Timestamp.now() }),
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

const THANKS = { pack: 'twine', id: 'thanks' };
const HI = { pack: 'pip', id: 'hi' };
const send = (from: string, to: string, extra: Partial<SendMessageInput> = {}) => sendMessage(db, from, { to, text: '', ...extra });
const message = async (id: string, pair = PAIR) => (await db.doc(`conversations/${pair}/messages/${id}`).get()).data();
const convo = async (pair = PAIR) => (await db.doc(`conversations/${pair}`).get()).data()!;
/** A picture alice uploaded for her conversation with bob, not sent yet. */
const picture = (id: string, pair = PAIR) =>
  db.doc(`chatImages/${id}`).set({ senderId: 'alice', to: pair.replace('alice_', ''), pair, key: `chat/${id}.webp`, thumbKey: `chat/${id}-thumb.webp`, width: 4, height: 3, unsentAt: Timestamp.now() });
const ALBUM = 'album-0123456789abcdef';

describe('a sticker', () => {
  it('is kept as its pack and id, with its fallback words in the recipient\'s language, and the list says it was a sticker', async () => {
    const sent = await send('alice', 'bob', { sticker: THANKS });
    expect(sent).toMatchObject({ conversationId: PAIR, duplicate: false, push: { conversationId: PAIR, messageId: sent.id, from: 'alice', to: 'bob' } });
    expect(sent).not.toHaveProperty('silent');
    const m = (await message(sent.id))!;
    expect(m).toEqual({ senderId: 'alice', text: '〔貼圖：謝謝〕', sentAt: expect.any(Timestamp), sticker: THANKS });
    const c = await convo();
    expect(c.lastMessage).toEqual({ text: '〔貼圖：謝謝〕', senderId: 'alice', sentAt: m.sentAt, sticker: true });
    expect(c.unread).toEqual({ alice: 0, bob: 1 });

    // Someone who reads in English gets English words; a profile without a language, Chinese.
    const toCarol = await send('alice', 'carol', { sticker: THANKS });
    expect((await message(toCarol.id, 'alice_carol'))!.text).toBe('[Sticker: Thanks]');
    expect((await convo('alice_carol')).lastMessage).toMatchObject({ text: '[Sticker: Thanks]', sticker: true });
    const toDave = await send('alice', 'dave', { sticker: HI });
    expect((await message(toDave.id, 'alice_dave'))!.text).toBe('〔貼圖：嗨！〕');
  });

  it('takes the recipient\'s language, never the sender\'s', async () => {
    const sent = await send('carol', 'alice', { sticker: THANKS });
    expect((await message(sent.id, 'alice_carol'))!.text).toBe('〔貼圖：謝謝〕');
  });

  it('leaves the list once anything else is said: a message, a picture, a note', async () => {
    await send('alice', 'bob', { sticker: THANKS });
    await send('bob', 'alice', { text: '不客氣' });
    expect((await convo()).lastMessage).toEqual({ text: '不客氣', senderId: 'bob', sentAt: expect.any(Timestamp) });

    await send('alice', 'bob', { sticker: THANKS });
    await picture('pic1');
    await send('alice', 'bob', { image: 'pic1' });
    expect((await convo()).lastMessage).toEqual({ text: '', senderId: 'alice', sentAt: expect.any(Timestamp), image: true });

    await send('alice', 'bob', { sticker: THANKS });
    await sendNote(db, 'alice', { cardId: 'walk', text: '好喜歡這段路' });
    expect((await convo()).lastMessage).toEqual({ text: '好喜歡這段路', senderId: 'alice', sentAt: expect.any(Timestamp) });
  });

  it('is refused when the catalog doesn\'t hold it, and when anything rides with it — writing nothing', async () => {
    for (const sticker of [{ pack: 'twine', id: 'nope' }, { pack: 'nope', id: 'thanks' }, { pack: 'tuck', id: 'thanks' }]) {
      const e = await failure(send('alice', 'bob', { sticker }));
      expect([e.code, e.message], JSON.stringify(sticker)).toEqual(['invalid_request', 'That is not a sticker.']);
    }
    await picture('pic1');
    const riders: Partial<SendMessageInput>[] = [
      { text: '謝謝' },
      { cardRef: 'walk' },
      { image: 'pic1' },
      { noteRef: { cardId: 'walk', noteId: 'n1' } },
      { image: 'pic1', album: { id: ALBUM, index: 0, count: 2 } },
    ];
    for (const extra of riders) {
      const e = await failure(send('alice', 'bob', { sticker: THANKS, ...extra }));
      expect([e.code, e.message], JSON.stringify(extra)).toEqual(['invalid_request', 'A sticker is sent on its own.']);
    }
    expect((await db.doc(`conversations/${PAIR}`).get()).exists).toBe(false);
    expect((await db.doc('chatImages/pic1').get()).get('messageId')).toBeUndefined();
  });

  it('goes where any message goes, and nowhere else: a connection or a letter it answers, a pen name, no block', async () => {
    // Not connected: refused, as any message.
    expect((await failure(send('bob', 'carol', { sticker: THANKS }))).message).toBe('You can message people you are connected with.');
    // No pen name: refused first.
    await db.doc('users/alice').set({ handle: '' }, { merge: true });
    expect((await failure(send('alice', 'bob', { sticker: THANKS }))).message).toBe('Choose a pen name first.');
    await db.doc('users/alice').set({ handle: '小明' }, { merge: true });
    // A block, either way.
    for (const [blocker, blocked] of [['alice', 'bob'], ['bob', 'alice']]) {
      await db.doc(`users/${blocker}/blocks/${blocked}`).set({ blockedUid: blocked });
      expect((await failure(send('alice', 'bob', { sticker: THANKS }))).code).toBe('blocked');
      await db.doc(`users/${blocker}/blocks/${blocked}`).delete();
    }
    // A letter: erin left bob a note on his card; bob's sticker back answers it and connects them.
    await sendNote(db, 'erin', { cardId: 'walk', text: '我也走過這條路' });
    expect((await db.doc('connections/bob_erin').get()).exists).toBe(false);
    const answer = await send('bob', 'erin', { sticker: HI });
    expect((await db.doc('connections/bob_erin').get()).exists).toBe(true);
    const thread = await convo('bob_erin');
    expect(thread).not.toHaveProperty('request');
    expect(thread.lastMessage).toMatchObject({ text: '[Sticker: Hi!]', senderId: 'bob', sticker: true });
    expect((await message(answer.id, 'bob_erin'))!.sticker).toEqual(HI);
  });

  it('is sent once under its client id: a resend finds it and writes nothing', async () => {
    const clientId = 'sticker-0123456789abcdef';
    const first = await send('alice', 'bob', { sticker: THANKS, clientId });
    const again = await send('alice', 'bob', { sticker: THANKS, clientId });
    expect(first.id).toBe(clientId);
    expect(again).toEqual({ conversationId: PAIR, id: clientId, notificationId: null, duplicate: true, push: null });
    expect((await convo()).unread).toEqual({ alice: 0, bob: 1 });
  });

  it('is quoted by a reply with its fallback words and itself, and may answer a message', async () => {
    const sticker = await send('alice', 'bob', { sticker: THANKS });
    const reply = await send('bob', 'alice', { text: '哈哈', replyTo: sticker.id });
    expect((await message(reply.id))!.replyTo).toEqual({ id: sticker.id, senderId: 'alice', text: '〔貼圖：謝謝〕', sticker: THANKS });

    const answer = await send('alice', 'bob', { sticker: HI, replyTo: reply.id });
    expect(await message(answer.id)).toEqual({
      senderId: 'alice', text: '〔貼圖：嗨！〕', sentAt: expect.any(Timestamp), sticker: HI,
      replyTo: { id: reply.id, senderId: 'bob', text: '哈哈' },
    });
  });

  it('unsent, is gone for both — its quotes and the list too — and kept for moderation alone, then carried by a report', async () => {
    const sticker = await send('alice', 'bob', { sticker: THANKS });
    const reply = await send('bob', 'alice', { text: '好可愛', replyTo: sticker.id });
    const last = await send('alice', 'bob', { sticker: HI });
    await unsendMessage(db, 'alice', PAIR, last.id);
    await unsendMessage(db, 'alice', PAIR, sticker.id);

    const m = (await message(sticker.id))!;
    expect(m).toEqual({ senderId: 'alice', sentAt: expect.any(Timestamp), unsentAt: expect.any(Timestamp) });
    expect((await message(reply.id))!.replyTo).toEqual({ id: sticker.id, senderId: 'alice', unsent: true });
    expect((await convo()).lastMessage).toEqual({ senderId: 'alice', sentAt: expect.any(Timestamp), unsent: true });
    expect((await db.doc(`unsentMessages/${PAIR}_${sticker.id}`).get()).data()).toEqual({
      pair: PAIR, messageId: sticker.id, senderId: 'alice', to: 'bob', text: '〔貼圖：謝謝〕', sticker: THANKS,
      sentAt: m.sentAt, unsentAt: expect.any(Timestamp),
    });

    const id = await createReport(db, 'bob', { targetType: 'message', targetId: PAIR, conversationId: PAIR, reason: 'spam' });
    const evidence = (await db.doc(`reportEvidence/${id}`).get()).data()!;
    expect(evidence.unsent).toEqual([
      expect.objectContaining({ id: sticker.id, text: '〔貼圖：謝謝〕', sticker: THANKS, unsent: true }),
      expect.objectContaining({ id: last.id, text: '〔貼圖：嗨！〕', sticker: HI, unsent: true }),
    ]);
  });

  it('is in a report\'s evidence as it was sent, and in its sender\'s export', async () => {
    const before = await send('alice', 'bob', { sticker: HI });
    const reported = await send('alice', 'bob', { sticker: THANKS });
    const id = await createReport(db, 'bob', { targetType: 'message', targetId: reported.id, conversationId: PAIR, reason: 'harassment' });
    const evidence = (await db.doc(`reportEvidence/${id}`).get()).data()!;
    expect(evidence.message).toMatchObject({ id: reported.id, senderId: 'alice', text: '〔貼圖：謝謝〕', sticker: THANKS });
    expect(evidence.context).toEqual([expect.objectContaining({ id: before.id, sticker: HI })]);

    const backup = await exportAccountData(db, 'alice');
    expect(backup.messagesSent).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: reported.id, conversationId: PAIR, text: '〔貼圖：謝謝〕', sticker: THANKS }),
    ]));
  });
});

describe('an album', () => {
  it('is a picture\'s alone', async () => {
    for (const extra of [{ text: 'hi' }, { cardRef: 'walk' }] as Partial<SendMessageInput>[]) {
      const e = await failure(send('alice', 'bob', { ...extra, album: { id: ALBUM, index: 0, count: 2 } }));
      expect([e.code, e.message], JSON.stringify(extra)).toEqual(['invalid_request', 'An album holds pictures only.']);
    }
    expect((await db.doc(`conversations/${PAIR}`).get()).exists).toBe(false);
  });

  it('keeps each picture\'s place as sent, the words with the first; only the first is to ring', async () => {
    await Promise.all(['p0', 'p1', 'p2'].map((id) => picture(id)));
    const sent = [];
    for (const [index, id] of ['p0', 'p1', 'p2'].entries()) {
      sent.push(await send('alice', 'bob', { image: id, text: index === 0 ? '昨天的海' : '', album: { id: ALBUM, index, count: 3 } }));
    }
    expect(sent.map((s) => s.silent ?? false)).toEqual([false, true, true]);
    for (const [index, s] of sent.entries()) {
      expect(await message(s.id)).toEqual({
        senderId: 'alice', text: index === 0 ? '昨天的海' : '', sentAt: expect.any(Timestamp),
        image: { id: `p${index}`, width: 4, height: 3 }, album: { id: ALBUM, index, count: 3 },
      });
    }
    const c = await convo();
    expect(c.lastMessage).toMatchObject({ image: true, text: '' });
    expect(c.unread.bob).toBe(3);

    // Unsent, a picture's place in its album is kept with its copy; the export and evidence keep it too.
    await unsendMessage(db, 'alice', PAIR, sent[2].id);
    expect((await db.doc(`unsentMessages/${PAIR}_${sent[2].id}`).get()).data()).toMatchObject({ image: { id: 'p2' }, album: { id: ALBUM, index: 2, count: 3 } });
    const id = await createReport(db, 'bob', { targetType: 'message', targetId: sent[1].id, conversationId: PAIR, reason: 'sexual' });
    const evidence = (await db.doc(`reportEvidence/${id}`).get()).data()!;
    expect(evidence.message).toMatchObject({ image: { id: 'p1' }, album: { id: ALBUM, index: 1, count: 3 } });
    expect(evidence.unsent).toEqual([expect.objectContaining({ id: sent[2].id, album: { id: ALBUM, index: 2, count: 3 } })]);
    expect((await exportAccountData(db, 'alice')).messagesSent).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: sent[0].id, album: { id: ALBUM, index: 0, count: 3 } }),
    ]));
  });
});

/** Records every multicast. */
function fakeFcm() {
  const sent: MulticastMessage[] = [];
  const sender: PushSender = {
    async sendEachForMulticast(m) {
      sent.push(m);
      const responses = m.tokens.map((t) => ({ success: true, messageId: `m-${t}` })) as BatchResponse['responses'];
      return { responses, successCount: responses.length, failureCount: 0 };
    },
  };
  return { sender, sent };
}
const deliveries = (sent: MulticastMessage[]) => Object.fromEntries(sent.flatMap((m) => m.tokens.map((t) => [t, m] as const)));

describe('the push', () => {
  beforeEach(async () => {
    // Bob reads Chinese in his profile, but has devices in both languages, of both kinds.
    await registerDevice(db, 'bob', 'bob-pixel-zh', { token: 'pixel-zh', platform: 'android', locale: 'zh-TW', capabilities: ['chat-push'] });
    await registerDevice(db, 'bob', 'bob-pixel-en', { token: 'pixel-en', platform: 'android', locale: 'en', capabilities: ['chat-push'] });
    await registerDevice(db, 'bob', 'bob-old-android', { token: 'old-en', platform: 'android', locale: 'en' });
    await registerDevice(db, 'bob', 'bob-iphone', { token: 'iphone-zh', platform: 'ios', locale: 'zh-TW' });
  });

  const ring = async (push: Awaited<ReturnType<typeof send>>['push']) => {
    const fcm = fakeFcm();
    const result = await pushMessage(db, push!, fcm.sender);
    return { result, at: deliveries(fcm.sent), sent: fcm.sent };
  };

  it('names a sticker in each device\'s language — never its fallback words — and tells a build that draws its own which one', async () => {
    const sent = await send('alice', 'bob', { sticker: THANKS });
    const { result, at } = await ring(sent.push);
    expect(result).toEqual({ sent: 4, pruned: 0 });
    expect(at['pixel-zh'].data).toMatchObject({ type: 'message', body: '傳送了一張貼圖：謝謝', kind: 'sticker', stickerPack: 'twine', stickerId: 'thanks' });
    expect(at['pixel-en'].data).toMatchObject({ body: 'Sent a sticker: Thanks', kind: 'sticker', stickerPack: 'twine', stickerId: 'thanks' });
    expect(at['iphone-zh'].notification).toEqual({ title: '小明', body: '傳送了一張貼圖：謝謝' });
    expect(at['old-en'].notification).toEqual({ title: '小明', body: 'Sent a sticker: Thanks' });
    // The system's push is a message's as ever (with its sound); `kind` there has only ever meant a note.
    expect(at['iphone-zh'].data).toEqual({ type: 'message', route: expect.any(String), fromUserId: 'alice', conversationId: PAIR, messageId: sent.id });
    expect(at['iphone-zh'].apns).toEqual({ headers: { 'apns-collapse-id': sent.id }, payload: { aps: { sound: 'default', threadId: PAIR } } });
    expect(at['old-en'].android).toEqual({ priority: 'high', notification: { channelId: MESSAGES_CHANNEL, tag: PAIR } });
  });

  it('rings a run of stickers once: the next within ten seconds is quiet on a notification the system shows, and reaches no build that draws its own', async () => {
    await ring((await send('alice', 'bob', { sticker: THANKS })).push);
    // Bob's message between them doesn't break alice's run: it is her previous message that counts.
    await send('bob', 'alice', { text: '哈哈' });
    const next = await send('alice', 'bob', { sticker: HI });
    const { result, at } = await ring(next.push);
    expect(result).toEqual({ sent: 2, pruned: 0 });
    expect(Object.keys(at).sort()).toEqual(['iphone-zh', 'old-en']);
    expect(at['iphone-zh'].notification).toEqual({ title: '小明', body: '傳送了一張貼圖：嗨！' });
    expect(at['iphone-zh'].apns).toEqual({ headers: { 'apns-collapse-id': next.id }, payload: { aps: { threadId: PAIR, 'interruption-level': 'passive' } } });
    expect(at['old-en'].android).toEqual({ priority: 'normal', notification: { channelId: MESSAGES_CHANNEL, tag: PAIR, priority: 'low', defaultSound: false } });
  });

  it('rings a sticker as usual after the sender said something else in between', async () => {
    await send('alice', 'bob', { sticker: THANKS });
    await send('alice', 'bob', { text: '真的很謝謝' });
    const afterWords = await ring((await send('alice', 'bob', { sticker: HI })).push);
    expect(afterWords.result).toEqual({ sent: 4, pruned: 0 });
    expect(afterWords.at['iphone-zh'].apns?.payload?.aps).toMatchObject({ sound: 'default' });
  });

  it('rings a sticker as usual ten seconds or more after the last one: it starts a run of its own', async () => {
    const earlier = await send('alice', 'bob', { sticker: THANKS });
    const at = (await message(earlier.id))!.sentAt as Timestamp;
    await db.doc(`conversations/${PAIR}/messages/${earlier.id}`).update({ sentAt: Timestamp.fromMillis(at.toMillis() - 10_000) });
    const later = await ring((await send('alice', 'bob', { sticker: HI })).push);
    expect(later.result).toEqual({ sent: 4, pruned: 0 });
    expect(later.at['pixel-en'].data).toMatchObject({ kind: 'sticker', stickerId: 'hi' });
    expect(later.at['old-en'].android).toEqual({ priority: 'high', notification: { channelId: MESSAGES_CHANNEL, tag: PAIR } });
  });

  it('rings an album once, for its first picture: "sent 3 photos" in each device\'s language, or its words', async () => {
    await Promise.all(['p0', 'p1', 'p2', 'q0', 'q1'].map((id) => picture(id)));
    const album = [];
    for (const [index, id] of ['p0', 'p1', 'p2'].entries()) album.push(await send('alice', 'bob', { image: id, album: { id: ALBUM, index, count: 3 } }));
    const first = await ring(album[0].push);
    expect(first.result).toEqual({ sent: 4, pruned: 0 });
    expect(first.at['pixel-zh'].data?.body).toBe('傳送了 3 張圖片');
    expect(first.at['pixel-en'].data?.body).toBe('Sent 3 photos');
    expect(first.at['iphone-zh'].notification?.body).toBe('傳送了 3 張圖片');
    for (const later of album.slice(1)) {
      const { result, sent } = await ring(later.push);
      expect(result).toBeNull();
      expect(sent).toEqual([]);
    }

    const worded = [];
    const OTHER = 'album-fedcba9876543210';
    for (const [index, id] of ['q0', 'q1'].entries()) {
      worded.push(await send('alice', 'bob', { image: id, text: index === 0 ? '昨天的海' : '', album: { id: OTHER, index, count: 2 } }));
    }
    expect((await ring(worded[0].push)).at['pixel-en'].data?.body).toBe('昨天的海');
    expect((await ring(worded[1].push)).result).toBeNull();
  });
});
