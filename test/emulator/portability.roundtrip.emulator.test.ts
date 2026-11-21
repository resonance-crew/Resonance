import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ENTITY_NAMES, SPECS, type EntityName } from '@/server/domain/schema/registry';
import { storePath } from '@/server/domain/schema/rows';
import { firestoreSource, firestoreTarget, timestampOf } from '@/server/infra/firestore/canonical';
import { memorySource, memoryTarget } from '@/server/infra/memory/canonical';
import { memoryObjectStore } from '@/server/infra/memory/objects';
import { MemoryState } from '@/server/infra/memory/state';
import { formatParity, parity } from '../../scripts/portability/diff';
import { exportFiles, exportSource, readManifest, writeExport } from '../../scripts/portability/format';
import { load } from '../../scripts/portability/load';

// The portability round trip (plan §4.2): the emulator seeded with a row of
// every registered entity, in the shapes the code writes (Timestamps with
// microseconds, a vector, uid-keyed maps), exported; the export imported into
// memory and exported again — the two byte for byte the same, manifest hashes
// and every file; the parity check finding nothing between the emulator and
// its export, and naming a changed row by its id hash and field paths only.
// The exports go to a temp dir, deleted after.

const PROJECT = 'demo-resonance-portability';
let app: App;
let db: Firestore;
const dirs: string[] = [];

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'portability-roundtrip');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

async function clear() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

async function scratch() {
  const dir = await mkdtemp(join(tmpdir(), 'portability-roundtrip-'));
  dirs.push(dir);
  return dir;
}

const ANON = 'u-anon-writer-5q';
const BOB = 'u-bob-2c1';
const PAIR = `${BOB}_${ANON}`.split('_').sort().join('_');
/** A server time: microseconds below the millisecond. */
const t = (iso: string, micros = 0) => {
  const base = timestampOf(new Date(iso));
  return new Timestamp(base.seconds, base.nanoseconds + micros * 1000);
};
const T1 = t('2026-11-20T03:04:05.123Z', 456);
const T2 = t('2026-11-20T03:05:00.000Z');

/** A row of every entity, by store row id (`<parent>/<doc>` for a subcollection). */
const WORLD: Record<EntityName, Record<string, Record<string, unknown>>> = {
  users: {
    [ANON]: { handle: 'Quiet', handleLower: 'quiet', bio: '', verified: false, joinedAt: T1, handleChangedAt: T1, hintsSeen: { map: 2 }, autoTranslateTo: ['en'] },
    [BOB]: { handle: 'Bob', handleLower: 'bob', joinedAt: T2 },
  },
  bookmarks: { [`${BOB}/card-anon`]: { cardId: 'card-anon', createdAt: T1 } },
  blocks: { [`${BOB}/u-carol`]: { blockedUid: 'u-carol', createdAt: T2 } },
  handles: { quiet: { uid: ANON, handle: 'Quiet', reservedAt: T1 } },
  signals: { [ANON]: { v: 1, at: T1, inbox: 3, threads: { [PAIR]: 2 } } },
  handleHolds: { oldname: { heldFor: null, releasedAt: T2 } },
  cards: {
    'card-anon': { authorId: ANON, thoughtCore: 'Alone', story: 'words', tags: ['night'], visibility: 'public', anonymous: true, publishedAt: T1, createdAt: T1, updatedAt: T1, readCount: 4, media: { type: 'image', url: 'https://img.example/a.webp', frame: { cx: 0.5, cy: 0.4, zoom: 1.2, ar: 1.5 } }, translations: {} },
    // An older card: no `anonymous` (read as named), no `publishedAt` (a draft).
    'card-old': { authorId: BOB, thoughtCore: 'Old', story: 's', visibility: 'private', createdAt: T2, updatedAt: T2, legacyField: { at: T2, n: 1 } },
  },
  edits: { 'card-anon/current': { authorId: ANON, story: 'next', rev: 3, visibility: 'public', anonymous: true, updatedAt: T2 } },
  translations: { 'card-anon/en': { title: 'Alone', story: 'words', hash: 'h', model: 'm', createdAt: T2 } },
  draftLog: { 'card-old/4': { authorId: BOB, rev: 4, patch: { set: { story: 's' }, clear: ['media'] }, at: T2, expireAt: T2 } },
  cardTombstones: { 'card-gone': { deletedAt: T2 } },
  retiredSlugs: { 'gone-slug': { retiredAt: T2 } },
  cardLinks: { 'card-old_card-anon': { sourceCardId: 'card-old', sourceAuthorId: BOB, targetCardId: 'card-anon', targetAuthorId: ANON, createdAt: T2 } },
  connections: { [PAIR]: { userIds: PAIR.split('_'), establishedAt: T1 } },
  connectionOrigins: { [PAIR]: { userIds: PAIR.split('_'), reasons: { [`answered_${BOB}`]: { kind: 'answered', by: BOB, cardId: 'card-old', at: T1 } }, resonanceCards: ['card-old'] } },
  invites: { inv1: { fromUserId: BOB, toUserId: ANON, message: 'hi', status: 'expired', createdAt: T2, expiresAt: T2 } },
  letters: { [`${BOB}_${ANON}`]: { from: BOB, to: ANON, count: 1, cardId: 'card-anon', at: T2 } },
  resonances: { r1: { cardId: 'card-anon', userId: BOB, createdAt: T2 } },
  notes: { n1: { cardId: 'card-anon', fromUserId: BOB, toUserId: ANON, text: 'thank you', readAt: null, createdAt: T1 } },
  conversations: {
    [PAIR]: { participants: PAIR.split('_'), createdAt: T1, updatedAt: T2, unread: { [ANON]: 1, [BOB]: 0 }, lastMessage: { text: 'hey', senderId: BOB, sentAt: T1 } },
  },
  messages: {
    [`${PAIR}/m1`]: { senderId: BOB, text: 'hey', sentAt: T1, reactions: { [ANON]: 'heart' }, image: { id: 'p1', width: 3, height: 4 } },
    [`${PAIR}/m2`]: { senderId: ANON, sentAt: T2, unsentAt: T2 },
  },
  unsentMessages: { [`${PAIR}_m2`]: { pair: PAIR, messageId: 'm2', senderId: ANON, to: BOB, text: 'oops', sentAt: T2, unsentAt: T2 } },
  privateShares: { 'card-old': { authorId: BOB, at: T2 } },
  chatImages: { p1: { senderId: BOB, to: ANON, pair: PAIR, key: 'chat/p1.webp', thumbKey: 'chat/p1-t.webp', width: 3, height: 4, bytes: 10, animated: false, messageId: 'm1', createdAt: T1 } },
  cardReads: { [`${BOB}_card-anon`]: { userId: BOB, cardId: 'card-anon', day: '2026-11-20', expireAt: T2 } },
  resonanceTaps: { [`card-anon_${BOB}`]: { cardId: 'card-anon', userId: BOB, on: true, at: T1, rangAt: null } },
  readerSignals: {
    [`${BOB}_card-anon`]: { userId: BOB, cardId: 'card-anon', firstAt: T1, lastAt: T2, days: ['2026-11-20'], sessions: [{ id: 's', active: 30, progress: 1, startedAt: T1, at: T2, end: true }], activeSeconds: 30, reachedEndAt: T2, expireAt: T2 },
  },
  notifications: {
    [`rtap_card-anon_20261120`]: { userId: ANON, type: 'resonance_tap', payload: { cardId: 'card-anon', fromUserIds: [BOB], anonymous: true }, readAt: null, createdAt: T1 },
    // An older bell without `readAt`: read as unread.
    old1: { userId: BOB, type: 'translation_done', payload: { cardId: 'card-old', locale: 'en' }, createdAt: T2 },
  },
  thoughtMaps: { [BOB]: {} },
  nodes: { [`${BOB}/card-old`]: { cardId: 'card-old', x: 1.5, y: -2, groupId: null, createdAt: T2, updatedAt: T2 } },
  edges: { [`${BOB}/card-old_card-anon`]: { sourceCardId: 'card-old', targetCardId: 'card-anon', label: '', createdAt: T2 } },
  groups: { [`${BOB}/g1`]: { title: 'mine', hue: 55, x: 0, y: 0, w: 320, h: 240, createdAt: T2 } },
  reports: { rep1: { reporterId: BOB, targetType: 'card', targetId: 'card-anon', targetUserId: ANON, reason: 'other', detail: '', createdAt: T2, status: 'open' } },
  reportEvidence: { rep1: { reportId: 'rep1', reporterId: BOB, targetUserId: ANON, targetType: 'card', targetId: 'card-anon', capturedAt: T2, card: { id: 'card-anon', publishedAt: '2026-11-20T03:04:05.123Z', tags: [] } } },
  accountDeletions: { 'u-leaving': { uid: 'u-leaving', requestedAt: T2, purgeAfter: T2 } },
  rateLimits: { [`${BOB}_notes`]: { userId: BOB, bucket: 'notes', windowStart: 1763607845123, used: 2 } },
  quotas: { [`${BOB}_2026-01-01`]: { userId: BOB, inviteCount: 1 } },
  uploads: { 'b7c0': { ownerId: BOB, key: 'image/u/b7c0.webp', kind: 'image', createdAt: T2 } },
  config: { storage: { host: 'img.example', formerHosts: ['old.example'] }, recommendPool: { mu: { insight: [0.1], situation: [0.2] }, tau: 0.5, cards: 3, embedModel: 'e', at: T2 } },
  devices: { inst1: { userId: BOB, token: 'tok', platform: 'ios', locale: 'en', appVersion: null, capabilities: ['tap'], timeZone: 'Asia/Taipei', updatedAt: T2 } },
  notificationSettings: { [BOB]: { picks: true, connectionCards: false, messages: true, resonanceTaps: true, picksConsentAt: T2, connectionCardsConsentAt: null, updatedAt: T2 } },
  pickPushes: { [BOB]: { recent: [{ cardId: 'card-anon', at: T2 }], sentAt: [T1, T2], updatedAt: T2 } },
  connectionCardPushes: { [BOB]: { day: '2026-11-20', cards: ['card-anon'], updatedAt: T2 } },
  cardVectors: {
    'card-anon__insight__0': { cardId: 'card-anon', authorId: ANON, visibility: 'public', channel: 'insight', part: 0, vector: FieldValue.vector([0.125, -0.5, 1]), embedModel: 'text-embedding-3-small', insightScore: 0.7, updatedAt: T1 },
  },
  cardSignatures: { 'card-anon': { authorId: ANON, throughLine: 't', insights: [{ span: 'a', strength: 0.5 }], usage: { input: 1, output: 2 }, error: null, updatedAt: T1 } },
  userProfiles: { [BOB]: { taste: [{ cardId: 'card-anon', w: 1 }], against: [], updatedAt: T2, centroids: { insight: [0.1, 0.2] } } },
  recommendations: { [BOB]: { date: '2026-11-20', items: [{ cardId: 'card-anon', channel: 'insight', reason: 'r', score: 0.9 }], partial: false, coldStart: false, askedOn: '2026-11-20', generatedAt: T2, shown: { 'card-anon': { n: 1, lastDay: '2026-11-20' } } } },
};

async function seed() {
  await clear();
  const writer = db.bulkWriter();
  for (const entity of ENTITY_NAMES) {
    for (const [id, row] of Object.entries(WORLD[entity])) {
      const { collection, doc } = storePath(entity, id);
      void writer.set(db.collection(collection).doc(doc), row);
    }
  }
  await writer.close();
}

async function bytesOf(dir: string) {
  const files = await exportFiles(dir);
  return Object.fromEntries(await Promise.all(files.filter((f) => f !== 'manifest.json').map(async (f) => [f, (await readFile(join(dir, f))).toString('base64')])));
}

const comparable = ({ startedAt: _s, finishedAt: _f, source: _src, project: _p, ...rest }: Awaited<ReturnType<typeof readManifest>>) => rest;

describe('portability round trip (emulator → export → memory → export)', () => {
  it('seeds a row in every registered entity', () => {
    expect(ENTITY_NAMES.filter((e) => !Object.keys(WORLD[e] ?? {}).length)).toEqual([]);
  });

  it('exports the same bytes after an import into memory', async () => {
    await seed();
    const objects = memoryObjectStore();
    await objects.putObject('image/u/b7c0.webp', 'image/webp', new Uint8Array([9, 9, 9]));
    const out = await scratch();
    const first = await writeExport({ source: firestoreSource(db, { kind: 'emulator' }), project: PROJECT, out, objects: { public: objects } });
    const manifest = await readManifest(first.dir);
    for (const entity of ENTITY_NAMES) expect(manifest.entities[entity].rows, entity).toBe(Object.keys(WORLD[entity]).length);
    expect(manifest.unregistered).toEqual([]);
    expect(manifest.compression).toBe('zstd');
    // Drift a complete entity shows (names only): the old card's field no schema names.
    expect(manifest.entities.cards.extras).toEqual(['legacyField']);

    const state = new MemoryState();
    await load(await exportSource(first.dir), memoryTarget(state));
    const second = await writeExport({ source: memorySource(state), out, objects: { public: objects }, now: () => new Date(Date.now() + 1000) });

    expect(comparable(await readManifest(second.dir))).toEqual(comparable(manifest));
    expect(await bytesOf(second.dir)).toEqual(await bytesOf(first.dir));
  });

  it('keeps a server time to its microsecond, a vector, and reads older shapes as today’s', async () => {
    await seed();
    const { dir } = await writeExport({ source: firestoreSource(db), out: await scratch(), zstd: false });
    const rows = new Map<string, Record<string, unknown>>();
    for (const entity of ['cards', 'messages', 'cardVectors', 'notifications'] as const) {
      for await (const r of (await exportSource(dir)).read(entity)) rows.set(`${entity}:${r.row._id}`, r.row);
    }
    expect(rows.get(`messages:${PAIR}/m1`)!.sentAt).toBe('2026-11-20T03:04:05.123456Z');
    expect(rows.get('cardVectors:card-anon__insight__0')!.vector).toEqual([0.125, -0.5, 1]);
    expect(rows.get('cards:card-old')).toMatchObject({ anonymous: false, publishedAt: null, legacyField: { at: { $time: '2026-11-20T03:05:00.000000Z' }, n: 1 } });
    expect(rows.get('notifications:old1')).toMatchObject({ readAt: null });
    for (const [key, row] of rows) expect(SPECS[row._e as EntityName].schema.zod.safeParse(row).success, key).toBe(true);
  });

  it('imports back into the emulator, which then matches its export', async () => {
    await seed();
    const { dir } = await writeExport({ source: firestoreSource(db), out: await scratch() });
    await clear();
    await load(await exportSource(dir), firestoreTarget(db));
    const report = await parity(await exportSource(dir), firestoreSource(db));
    expect(formatParity(report)).toEqual(['parity: same']);
    const m1 = (await db.doc(`conversations/${PAIR}/messages/m1`).get()).data()!;
    expect((m1.sentAt as Timestamp).isEqual(T1)).toBe(true);
  });

  it('names a changed row by its id hash and field paths, never a value nor the anonymous author', async () => {
    await seed();
    const { dir } = await writeExport({ source: firestoreSource(db), out: await scratch() });
    await db.doc('cards/card-anon').update({ authorId: 'u-impostor', [`media.frame.zoom`]: 2 });
    await db.doc(`conversations/${PAIR}`).update({ [`unread.${ANON}`]: 5 });
    const report = await parity(await exportSource(dir), firestoreSource(db));
    expect(report.same).toBe(false);
    const lines = formatParity(report);
    const cards = report.entities.find((e) => e.entity === 'cards')!;
    expect(cards.diffs).toEqual([{ idHash: expect.stringMatching(/^[0-9a-f]{16}$/), kind: 'changed', paths: ['authorId', 'media.frame.zoom'] }]);
    const convo = report.entities.find((e) => e.entity === 'conversations')!;
    expect(convo.diffs[0].paths).toEqual([expect.stringMatching(/^unread\.#[0-9a-f]{8}$/)]);
    const text = lines.join('\n');
    for (const secret of [ANON, 'u-impostor', 'card-anon', 'Quiet', PAIR]) expect(text).not.toContain(secret);
  });
});
