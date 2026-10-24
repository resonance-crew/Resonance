import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

// Pictures sent in chat against the Firestore emulator, their files in a
// folder standing in for the private bucket: who may upload one (as who may
// message), what is kept of it (upright, no metadata, two sizes), that a
// message carries one only from its sender in its own conversation and only
// once, that only the two people of the conversation read it while its
// message is there, and that the unsent and the purged go with their files.

const mocks = vi.hoisted(() => ({ db: null as unknown, viewer: 'alice', store: null as unknown }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: mocks.viewer }) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('@/lib/storage/chatImages', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage/chatImages')>()),
  getChatImageStore: () => mocks.store,
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));

const { LocalChatImages } = await import('@/lib/storage/chatImages');
const { ApiFailure } = await import('@/lib/api/v1/http');
const { sendMessage } = await import('@/lib/api/v1/conversations');
const { uploadChatImage } = await import('@/lib/api/v1/chatImageUpload');
const { purgeUnsentChatImages, readChatImage, UNSENT_KEEP_MS } = await import('@/lib/api/v1/chatImages');
const { purgeAccount } = await import('@/lib/account/deletion');
const { createReport } = await import('@/lib/api/v1/safety');
const uploadRoute = await import('@/app/api/v1/chat-images/route');
const readRoute = await import('@/app/api/v1/chat-images/[id]/route');

const PROJECT = 'demo-resonance-api-chat-images';
let app: App;
let db: Firestore;
let dir: string;
let store: InstanceType<typeof LocalChatImages>;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-chat-images-test');
  db = getFirestore(app);
  mocks.db = db;
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  dir = await mkdtemp(join(tmpdir(), 'chat-images-test-'));
  store = new LocalChatImages(dir);
  mocks.store = store;
  mocks.viewer = 'alice';
  await Promise.all(['alice', 'bob', 'carol'].map((id) => db.doc(`users/${id}`).set({ handle: id, handleLower: id })));
  await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: Timestamp.now() });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A photo as a phone takes it: 3000 × 2000, turned on its side by its EXIF, with a camera and a place in its metadata. */
async function photo(): Promise<Uint8Array> {
  const data = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 80 } } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'PhoneMaker', Model: 'Phone 1' } } })
    .toBuffer();
  return new Uint8Array(data);
}

async function files(): Promise<string[]> {
  return (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
}

async function failure(p: Promise<unknown>): Promise<InstanceType<typeof ApiFailure>> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as InstanceType<typeof ApiFailure>;
}

const upload = async (from = 'alice', to = 'bob', clientId?: string) => uploadChatImage(db, store, from, { to, clientId, bytes: await photo() });

describe('uploading a picture', () => {
  it('keeps it upright, scaled down, without its metadata, in two sizes, recorded as unsent', async () => {
    const { id, width, height } = await upload();
    // Turned upright by its orientation (6: a quarter turn), then fitted into 2048.
    expect([width, height]).toEqual([1365, 2048]);
    const record = (await db.doc(`chatImages/${id}`).get()).data()!;
    expect(record).toMatchObject({ senderId: 'alice', pair: 'alice_bob', width: 1365, height: 2048, unsent: true, animated: false });
    expect(record.key).toMatch(/^chat\/\d{4}-\d{2}\/[0-9a-f-]{36}\.webp$/);
    expect(record.thumbKey).toBe(record.key.replace(/\.webp$/, '-thumb.webp'));
    const full = await sharp(Buffer.from((await store.get(record.key))!)).metadata();
    const thumb = await sharp(Buffer.from((await store.get(record.thumbKey))!)).metadata();
    expect([full.format, full.width, full.height, full.exif, full.orientation]).toEqual(['webp', 1365, 2048, undefined, undefined]);
    expect([thumb.width, thumb.height]).toEqual([640, 960]);
    // The file names say nothing of who sent it, or to whom.
    expect(record.key).not.toMatch(/alice|bob/);
  });

  it('is refused for anyone the sender may not message, keeping nothing', async () => {
    expect((await failure(upload('alice', 'carol'))).code).toBe('forbidden');
    await db.doc('users/bob/blocks/alice').set({ at: Timestamp.now() });
    expect((await failure(upload('alice', 'bob'))).code).toBe('blocked');
    await db.doc('users/alice').set({ handle: '' });
    expect((await failure(upload('alice', 'bob'))).message).toBe('Choose a pen name first.');
    expect((await failure(upload('alice', 'alice'))).code).toBe('invalid_request');
    expect(await files()).toEqual([]);
    expect((await db.collection('chatImages').get()).size).toBe(0);
  });

  it('can answer a letter: the one it was left for may send a picture back before they are connected', async () => {
    await db.doc('conversations/bob_carol').set({ participants: ['bob', 'carol'], request: { from: 'carol', cardId: 'c', at: Timestamp.now(), count: 1 } });
    await expect(upload('bob', 'carol')).resolves.toMatchObject({ width: 1365 });
    // …but not the letter's writer, who waits for the answer.
    expect((await failure(upload('carol', 'bob'))).code).toBe('forbidden');
  });

  it('refuses what is not a picture we send', async () => {
    const e = await failure(uploadChatImage(db, store, 'alice', { to: 'bob', bytes: new TextEncoder().encode('<svg></svg>') }));
    expect([e.code, e.message]).toEqual(['invalid_request', 'Not a picture that can be sent.']);
    expect(await files()).toEqual([]);
  });

  it('makes a resend with its clientId the same picture, storing nothing twice; someone else\'s clientId is refused', async () => {
    const first = await upload('alice', 'bob', 'clientIdOfAlice001');
    const again = await upload('alice', 'bob', 'clientIdOfAlice001');
    expect(again).toEqual(first);
    expect(first.id).toBe('clientIdOfAlice001');
    expect(await files()).toHaveLength(2);
    expect((await failure(upload('bob', 'alice', 'clientIdOfAlice001'))).message).toBe('Not a valid client id.');
    await db.doc('connections/alice_carol').set({ userIds: ['alice', 'carol'] });
    expect((await failure(upload('alice', 'carol', 'clientIdOfAlice001'))).message).toBe('Not a valid client id.');
  });
});

describe('sending it', () => {
  it('puts the picture on the message, takes it out of the unsent, and says so in the list — the next message says nothing of it', async () => {
    const picture = await upload();
    const sent = await sendMessage(db, 'alice', { to: 'bob', text: '', image: picture.id, clientId: 'messageOfAlice0001' });
    const message = (await db.doc(`conversations/alice_bob/messages/${sent.id}`).get()).data()!;
    expect(message).toMatchObject({ senderId: 'alice', text: '', image: { id: picture.id, width: 1365, height: 2048 } });
    const record = (await db.doc(`chatImages/${picture.id}`).get()).data()!;
    expect(record.messageId).toBe('messageOfAlice0001');
    expect(record.unsent).toBeUndefined();
    expect((await db.doc('conversations/alice_bob').get()).get('lastMessage')).toMatchObject({ text: '', senderId: 'alice', image: true });

    await sendMessage(db, 'bob', { to: 'alice', text: 'what a sky' });
    const last = (await db.doc('conversations/alice_bob').get()).get('lastMessage');
    expect(last).toMatchObject({ text: 'what a sky', senderId: 'bob' });
    expect(last.image).toBeUndefined();
  });

  it('quotes a picture in a reply as one (no words of it to quote)', async () => {
    const picture = await upload();
    const { id } = await sendMessage(db, 'alice', { to: 'bob', text: 'look', image: picture.id });
    const reply = await sendMessage(db, 'bob', { to: 'alice', text: 'wow', replyTo: id });
    expect((await db.doc(`conversations/alice_bob/messages/${reply.id}`).get()).get('replyTo')).toEqual({ id, senderId: 'alice', text: 'look', image: true });
  });

  it("refuses a picture that isn't this sender's for this conversation, one already sent, and a card beside it — writing nothing", async () => {
    const picture = await upload();
    const theirs = await upload('bob', 'alice');
    await db.doc('connections/alice_carol').set({ userIds: ['alice', 'carol'] });
    const elsewhere = await upload('alice', 'carol');
    const refused = 'That is not a picture you can send here.';
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: '', image: theirs.id }))).message).toBe(refused);
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: '', image: elsewhere.id }))).message).toBe(refused);
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: '', image: 'noSuchPicture' }))).message).toBe(refused);
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: 'x', image: picture.id, cardRef: 'walk' }))).message).toBe(
      'A message carries a card or a picture, not both.',
    );
    expect((await db.collection('conversations/alice_bob/messages').get()).size).toBe(0);

    await sendMessage(db, 'alice', { to: 'bob', text: '', image: picture.id, clientId: 'messageOfAlice0002' });
    // Its own resend is the message already sent; another message can't take the same picture.
    await expect(sendMessage(db, 'alice', { to: 'bob', text: '', image: picture.id, clientId: 'messageOfAlice0002' })).resolves.toMatchObject({ duplicate: true });
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: 'again', image: picture.id }))).message).toBe(refused);
  });

  it('still needs words, a card or a picture', async () => {
    expect((await failure(sendMessage(db, 'alice', { to: 'bob', text: '' }))).message).toBe('A message needs text, a card or a picture.');
  });
});

describe('reading it', () => {
  it('is for the two people of the conversation, while its message is there — never before it is sent', async () => {
    const picture = await upload();
    expect(await readChatImage(db, store, 'alice', picture.id, 'full')).toBeNull();
    const { id } = await sendMessage(db, 'alice', { to: 'bob', text: '', image: picture.id });
    const full = await readChatImage(db, store, 'bob', picture.id, 'full');
    const thumb = await readChatImage(db, store, 'alice', picture.id, 'thumb');
    expect((await sharp(Buffer.from(full!)).metadata()).height).toBe(2048);
    expect((await sharp(Buffer.from(thumb!)).metadata()).height).toBe(960);
    expect(await readChatImage(db, store, 'carol', picture.id, 'full')).toBeNull();
    expect(await readChatImage(db, store, 'bob', '__picture__', 'full')).toBeNull();
    // A conversation deleted (the client deletes its messages, then it): its pictures with it.
    await db.doc(`conversations/alice_bob/messages/${id}`).delete();
    expect(await readChatImage(db, store, 'bob', picture.id, 'full')).toBeNull();
  });
});

describe('reporting it', () => {
  it('keeps the picture of a reported message, and of the ones before it, in the evidence by id', async () => {
    const before = await upload();
    await sendMessage(db, 'alice', { to: 'bob', text: '', image: before.id });
    const reported = await upload();
    const { id } = await sendMessage(db, 'alice', { to: 'bob', text: 'look', image: reported.id });
    const reportId = await createReport(db, 'bob', { targetType: 'message', targetId: id, conversationId: 'alice_bob', reason: 'harassment' });
    const evidence = (await db.doc(`reportEvidence/${reportId}`).get()).data()!;
    expect(evidence.message).toMatchObject({ id, text: 'look', image: { id: reported.id, width: 1365, height: 2048 } });
    expect(evidence.context[0]).toMatchObject({ image: { id: before.id } });
  });
});

describe('the routes', () => {
  const form = (fields: Record<string, string | Blob>) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.append(k, v);
    return new Request('http://localhost/api/v1/chat-images', { method: 'POST', body });
  };
  const read = (id: string, query = '') =>
    readRoute.GET(new Request(`http://localhost/api/v1/chat-images/${id}${query}`), { params: Promise.resolve({ id }) });

  it('uploads a multipart picture (201), then serves it to the conversation, privately and for good', async () => {
    const res = await uploadRoute.POST(form({ file: new Blob([Buffer.from(await photo())], { type: 'image/jpeg' }), to: 'bob', clientId: 'routeClientId00001' }));
    expect(res.status).toBe(201);
    const uploaded = (await res.json()) as { id: string; width: number; height: number };
    expect(uploaded).toEqual({ id: 'routeClientId00001', width: 1365, height: 2048 });
    expect((await read(uploaded.id)).status).toBe(404);

    await sendMessage(db, 'alice', { to: 'bob', text: '', image: uploaded.id });
    mocks.viewer = 'bob';
    const got = await read(uploaded.id, '?size=thumb');
    expect(got.status).toBe(200);
    expect(got.headers.get('Content-Type')).toBe('image/webp');
    expect(got.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
    expect((await sharp(Buffer.from(await got.arrayBuffer())).metadata()).height).toBe(960);
    mocks.viewer = 'carol';
    expect((await read(uploaded.id)).status).toBe(404);
  });

  it('refuses a form without a file or with a bad recipient, and says so', async () => {
    const noFile = await uploadRoute.POST(form({ to: 'bob' }));
    expect(noFile.status).toBe(400);
    const badTo = await uploadRoute.POST(form({ file: new Blob([Buffer.from(await photo())], { type: 'image/jpeg' }), to: 'not/an/id' }));
    expect(badTo.status).toBe(400);
  });

  it('says pictures cannot be sent when no store is set up', async () => {
    mocks.store = null;
    const res = await uploadRoute.POST(form({ file: new Blob([Buffer.from(await photo())], { type: 'image/jpeg' }), to: 'bob' }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe("Pictures can't be sent right now.");
  });
});

describe('what goes', () => {
  it('deletes the pictures never sent after a day, with their files — never one sent, nor one uploaded lately', async () => {
    const old = await upload();
    const sentOld = await upload();
    await sendMessage(db, 'alice', { to: 'bob', text: '', image: sentOld.id });
    const fresh = await upload();
    const dayAgo = Timestamp.fromMillis(Date.now() - UNSENT_KEEP_MS - 60_000);
    await Promise.all([old.id, sentOld.id].map((id) => db.doc(`chatImages/${id}`).update({ createdAt: dayAgo })));

    expect(await purgeUnsentChatImages(db, store)).toEqual({ deleted: 1, failed: 0 });
    expect((await db.doc(`chatImages/${old.id}`).get()).exists).toBe(false);
    expect((await db.doc(`chatImages/${sentOld.id}`).get()).exists).toBe(true);
    expect((await db.doc(`chatImages/${fresh.id}`).get()).exists).toBe(true);
    expect(await files()).toHaveLength(4);
  });

  it('takes the pictures of a deleted account with it: the ones it sent, and the ones sent to it in its conversations', async () => {
    const mine = await upload('alice', 'bob');
    await sendMessage(db, 'alice', { to: 'bob', text: '', image: mine.id });
    const toMe = await upload('bob', 'alice');
    await sendMessage(db, 'bob', { to: 'alice', text: '', image: toMe.id });
    await db.doc('connections/bob_carol').set({ userIds: ['bob', 'carol'] });
    const notMine = await upload('bob', 'carol');
    await sendMessage(db, 'bob', { to: 'carol', text: '', image: notMine.id });

    const deleted: string[] = [];
    await purgeAccount({ db, deleteAuthUser: async () => {}, deleteChatImageFile: async (key) => { deleted.push(key); await store.delete(key); } }, 'alice');
    expect(deleted).toHaveLength(4);
    expect((await db.doc(`chatImages/${mine.id}`).get()).exists).toBe(false);
    expect((await db.doc(`chatImages/${toMe.id}`).get()).exists).toBe(false);
    expect((await db.doc(`chatImages/${notMine.id}`).get()).exists).toBe(true);
    expect(await files()).toHaveLength(2);
  });
});
