import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, setLogLevel, type Firestore as ClientDb } from 'firebase/firestore';

// The writer's v1 endpoints (任務 #3 Phase 2, lane 2a-writer) through their
// real route handlers against the Firestore emulator: the thought map
// (GET with ETag → 304, a batch of ops), a draft made under a client id and
// autosaved in `rev` order, its patch log (server-only, purged with the
// account), and a published card's pending edit — each refusing, with the
// rules' answer, what the rules refused when the clients wrote Firestore.

const mocks = vi.hoisted(() => ({ db: null as unknown, viewer: 'alice' as string | null }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => (mocks.viewer ? { id: mocks.viewer } : null) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));

const cardsRoute = await import('@/app/api/v1/cards/route');
const draftRoute = await import('@/app/api/v1/cards/[key]/draft/route');
const editRoute = await import('@/app/api/v1/cards/[key]/edits/current/route');
const mapRoute = await import('@/app/api/v1/me/thought-map/route');
const opsRoute = await import('@/app/api/v1/me/thought-map/ops/route');
const { purgeAccountDataIn } = await import('@/server/app/account');
const { ctxFor } = await import('@/server/infra/firestore/ctx');
const { memoryVectors } = await import('@/server/infra/memory/vectors');
const { memoryObjectStore } = await import('@/server/infra/memory/objects');

const PROJECT = 'demo-resonance-api-writer';
const DRAFT = 'AbCdEfGhIjKlMnOpQrSt';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-writer-test');
  db = getFirestore(app);
  mocks.db = db;
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  mocks.viewer = 'alice';
});

type Json = Record<string, unknown>;
const request = (path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request(`http://localhost/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
const params = (key: string) => ({ params: Promise.resolve({ key }) });
const createDraft = (body: Json) => cardsRoute.POST(request('/cards', { method: 'POST', body }));
const saveDraft = (id: string, body: Json) => draftRoute.PATCH(request(`/cards/${id}/draft`, { method: 'PATCH', body }), params(id));
const getEdit = (id: string, headers?: Record<string, string>) => editRoute.GET(request(`/cards/${id}/edits/current`, { headers }), params(id));
const putEdit = (id: string, body: Json) => editRoute.PUT(request(`/cards/${id}/edits/current`, { method: 'PUT', body }), params(id));
const deleteEdit = (id: string) => editRoute.DELETE(request(`/cards/${id}/edits/current`, { method: 'DELETE' }), params(id));
const getMap = (headers?: Record<string, string>) => mapRoute.GET(request('/me/thought-map', { headers }));
const mapOps = (ops: unknown[]) => opsRoute.POST(request('/me/thought-map/ops', { method: 'POST', body: { ops } }));
const draft = (extra: Json = {}) => ({ id: DRAFT, thoughtCore: '雨天', story: '窗外下著雨。', tags: ['雨'], visibility: 'public', ...extra });
const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error;

describe('POST /api/v1/cards (a draft under a client id)', () => {
  it('is 201 when made, 200 with created: false when sent again', async () => {
    const made = await createDraft(draft());
    expect(made.status).toBe(201);
    expect(await made.json()).toEqual({ id: DRAFT, created: true, rev: 0 });
    const again = await createDraft(draft({ thoughtCore: '別的' }));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ id: DRAFT, created: false, rev: 0 });
    const stored = (await db.doc(`cards/${DRAFT}`).get()).data()!;
    expect(stored).toMatchObject({ authorId: 'alice', thoughtCore: '雨天', publishedAt: null, readCount: 0, resonanceCount: 0, inviteCount: 0 });
    expect(stored.createdAt).toBeInstanceOf(Timestamp);
  });

  it('refuses a field the rules refuse, an id of the wrong shape, one taken and one deleted for good', async () => {
    for (const extra of [{ publishedAt: null }, { slug: 'x' }, { authorId: 'bob' }, { readCount: 3 }, { thoughtCore: 'x'.repeat(201) }, { id: 'short' }, { id: `${'a'.repeat(19)}/` }]) {
      const res = await createDraft(draft(extra));
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    await db.doc('cards/BbCdEfGhIjKlMnOpQrSt').set({ authorId: 'bob', publishedAt: null });
    expect((await createDraft(draft({ id: 'BbCdEfGhIjKlMnOpQrSt' }))).status).toBe(409);
    await db.doc('cardTombstones/CbCdEfGhIjKlMnOpQrSt').set({ deletedAt: Timestamp.now() });
    const res = await createDraft(draft({ id: 'CbCdEfGhIjKlMnOpQrSt' }));
    expect(res.status).toBe(409);
    expect((await db.doc('cards/CbCdEfGhIjKlMnOpQrSt').get()).exists).toBe(false);
    expect((await createDraft(draft({ anonymous: true, visibility: 'connections' }))).status).toBe(400);
  });

  it('asks who you are', async () => {
    mocks.viewer = null;
    expect((await createDraft(draft())).status).toBe(401);
    expect((await getMap()).status).toBe(401);
  });
});

describe('PATCH /api/v1/cards/{id}/draft (an autosave in rev order)', () => {
  it('applies the higher rev whatever order they arrive in; a stale one is 200 applied: false', async () => {
    await createDraft(draft());
    const five = await saveDraft(DRAFT, { rev: 5, story: '第五版', thoughtCore: null, media: null });
    expect(five.status).toBe(200);
    expect(await five.json()).toMatchObject({ applied: true, rev: 5 });
    const four = await saveDraft(DRAFT, { rev: 4, story: '第四版' });
    expect(four.status).toBe(200);
    expect(await four.json()).toEqual({ applied: false, rev: 5, updatedAt: null });
    expect((await db.doc(`cards/${DRAFT}`).get()).data()).toMatchObject({ story: '第五版', thoughtCore: '雨天', draftRev: 5 });
  });

  it('refuses what the rules let no client write on its card (400), and leaves the draft as it was', async () => {
    await createDraft(draft());
    for (const extra of [{ publishedAt: null }, { slug: 'x' }, { referenceCardId: 'c' }, { authorId: 'bob' }, { draftRev: 9 }, { translations: {} }, { tags: [1] }, { visibility: 'friends' }]) {
      expect((await saveDraft(DRAFT, { rev: 1, story: '不該', ...extra })).status, JSON.stringify(extra)).toBe(400);
    }
    expect((await saveDraft(DRAFT, { story: 'no rev' })).status).toBe(400);
    expect((await db.doc(`cards/${DRAFT}`).get()).data()!.story).toBe('窗外下著雨。');
  });

  it("is 409 for a card in the trash or a published one, 404 for someone else's", async () => {
    await db.doc('cards/trashed').set({ authorId: 'alice', story: 's', visibility: 'private', publishedAt: null, trashedAt: Timestamp.now() });
    const trashed = await saveDraft('trashed', { rev: 1, story: 'x' });
    expect([trashed.status, (await errorOf(trashed)).message]).toEqual([409, 'This card is in the trash.']);
    await db.doc('cards/live').set({ authorId: 'alice', story: 's', visibility: 'public', publishedAt: Timestamp.now() });
    expect((await saveDraft('live', { rev: 1, visibility: 'private' })).status).toBe(409);
    await db.doc('cards/bobs').set({ authorId: 'bob', story: 's', visibility: 'private', publishedAt: null });
    expect((await saveDraft('bobs', { rev: 1, story: 'x' })).status).toBe(404);
    expect((await db.doc('cards/live').get()).data()!.visibility).toBe('public');
  });

  it('keeps each applied save in the patch log, closed to clients, and the log goes with the account', async () => {
    await createDraft(draft());
    await saveDraft(DRAFT, { rev: 1, story: '一' });
    await saveDraft(DRAFT, { rev: 2, story: '二' });
    const log = await db.collection(`cards/${DRAFT}/draftLog`).get();
    expect(log.docs.map((d) => [d.id, d.get('authorId'), d.get('patch.set.story')])).toEqual([
      ['1', 'alice', '一'],
      ['2', 'alice', '二'],
    ]);
    const expireAt = (log.docs[1].get('expireAt') as Timestamp).toMillis();
    const at = (log.docs[1].get('at') as Timestamp).toMillis();
    expect(Math.round((expireAt - at) / 86_400_000)).toBe(7);
    // One an older app's own delete of its draft left behind is found by its author.
    await db.doc('cards/goneDraft/draftLog/3').set({ authorId: 'alice', rev: 3, patch: { set: { story: '留下的' }, clear: [] } });
    await db.doc('cards/bobs/draftLog/1').set({ authorId: 'bob', rev: 1, patch: { set: { story: '他的' }, clear: [] } });
    await purgeAccountDataIn(ctxFor(db, { vectors: memoryVectors(), objects: memoryObjectStore() }), 'alice');
    expect((await db.collectionGroup('draftLog').get()).docs.map((d) => d.ref.path)).toEqual(['cards/bobs/draftLog/1']);
  });
});

describe('the patch log in the rules', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    setLogLevel('silent');
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-resonance-writer-rules',
      firestore: { rules: readFileSync(resolve(__dirname, '../../firebase/firestore.rules'), 'utf8'), host, port: Number(port) },
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });

  it('no client reads or writes it, not even the card’s author', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const admin = ctx.firestore() as unknown as ClientDb;
      await setDoc(doc(admin, 'cards', DRAFT), { authorId: 'alice', publishedAt: null, visibility: 'private' });
      await setDoc(doc(admin, 'cards', DRAFT, 'draftLog', '1'), { authorId: 'alice', rev: 1 });
    });
    const alice = env.authenticatedContext('alice').firestore() as unknown as ClientDb;
    await assertFails(getDoc(doc(alice, 'cards', DRAFT, 'draftLog', '1')));
    await assertFails(getDocs(collection(alice, 'cards', DRAFT, 'draftLog')));
    await assertFails(setDoc(doc(alice, 'cards', DRAFT, 'draftLog', '2'), { authorId: 'alice', rev: 2 }));
  });
});

describe('/api/v1/cards/{id}/edits/current (a published card’s working copy)', () => {
  const copy = (rev: number, extra: Json = {}) => ({ rev, thoughtCore: '改過', story: '改過的故事', tags: [], visibility: 'public', anonymous: false, ...extra });
  beforeEach(async () => {
    await db.doc('cards/live').set({ authorId: 'alice', thoughtCore: '原本', story: '原本', visibility: 'public', anonymous: false, publishedAt: Timestamp.now() });
  });

  it('is put, read with an ETag (304 while unchanged), ordered by rev and deleted', async () => {
    const none = await getEdit('live');
    expect(await none.json()).toEqual({ edit: null });
    expect((await putEdit('live', copy(1))).status).toBe(200);
    const first = await getEdit('live');
    expect(first.headers.get('cache-control')).toBe('private, no-cache');
    const etag = first.headers.get('etag')!;
    expect((await first.json()).edit).toMatchObject({ story: '改過的故事', rev: 1 });
    expect((await getEdit('live', { 'If-None-Match': etag })).status).toBe(304);
    expect(await (await putEdit('live', copy(1, { story: '舊的' }))).json()).toEqual({ applied: false, rev: 1, updatedAt: null });
    await putEdit('live', copy(2, { story: '新的' }));
    expect((await getEdit('live', { 'If-None-Match': etag })).status).toBe(200);
    expect(await (await deleteEdit('live')).json()).toEqual({ deleted: true });
    expect((await db.doc('cards/live/edits/current').get()).exists).toBe(false);
    expect((await db.doc('cards/live').get()).data()!.story).toBe('原本');
  });

  it("refuses a field the rules refuse, someone else's card, a card in the trash", async () => {
    expect((await putEdit('live', copy(1, { publishedAt: null }))).status).toBe(400);
    expect((await putEdit('live', copy(1, { anonymous: true, visibility: 'connections' }))).status).toBe(400);
    mocks.viewer = 'bob';
    expect((await putEdit('live', copy(1))).status).toBe(404);
    expect((await getEdit('live')).status).toBe(404);
    mocks.viewer = 'alice';
    await db.doc('cards/live').update({ trashedAt: Timestamp.now() });
    expect((await putEdit('live', copy(1))).status).toBe(409);
    expect((await db.doc('cards/live/edits/current').get()).exists).toBe(false);
  });
});

describe('/api/v1/me/thought-map', () => {
  it('applies a batch and answers the map with an ETag that a change moves', async () => {
    const empty = await getMap();
    expect(await empty.json()).toEqual({ nodes: [], edges: [], groups: [] });
    const etag = empty.headers.get('etag')!;
    expect((await getMap({ 'If-None-Match': etag })).status).toBe(304);
    const res = await mapOps([
      { op: 'addNode', cardId: 'c1', x: 1, y: 2 },
      { op: 'addNode', cardId: 'c2', x: 3, y: 4, groupId: null, label: null },
      { op: 'addEdge', sourceCardId: 'c1', targetCardId: 'c2', label: '因為' },
      { op: 'addGroup', groupId: 'g1', title: '組', hue: 10, x: 0, y: 0, w: 100, h: 100 },
      { op: 'moveNode', cardId: 'c1', x: 5, y: 5, groupId: 'g1' },
    ]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: 5, skipped: [] });
    const now = await getMap({ 'If-None-Match': etag });
    expect(now.status).toBe(200);
    const map = await now.json();
    expect(map.nodes.map((n: Json) => [n.id, n.x, n.groupId])).toEqual([
      ['c1', 5, 'g1'],
      ['c2', 3, null],
    ]);
    expect(map.edges.map((e: Json) => [e.id, e.label])).toEqual([['c1_c2', '因為']]);
    // Bob's map is his own: empty, and his ops never reach Alice's.
    mocks.viewer = 'bob';
    expect(await (await getMap()).json()).toEqual({ nodes: [], edges: [], groups: [] });
    expect(await (await mapOps([{ op: 'removeNode', cardId: 'c1' }])).json()).toEqual({ applied: 0, skipped: [0] });
    expect((await db.doc('thoughtMaps/alice/nodes/c1').get()).exists).toBe(true);
  });

  it('refuses the whole batch for one bad op (400), writing nothing', async () => {
    for (const ops of [
      [{ op: 'addNode', cardId: 'c1', x: 0, y: 0 }, { op: 'addEdge', sourceCardId: 'c1', targetCardId: 'c1' }],
      [{ op: 'addNode', cardId: 'c1', x: 0, y: 0 }, { op: 'addNode', cardId: 'x'.repeat(129), x: 0, y: 0 }],
      [{ op: 'addNode', cardId: 'c1', x: 0, y: 0 }, { op: 'setEdgeLabel', id: 'c1_c2', label: 'w'.repeat(501) }],
      [{ op: 'addNode', cardId: 'c1', x: 0, y: 0, title: '多的' }],
      [{ op: 'teleport', cardId: 'c1' }],
      [],
    ]) {
      expect((await mapOps(ops)).status, JSON.stringify(ops)).toBe(400);
    }
    expect((await db.collection('thoughtMaps/alice/nodes').get()).empty).toBe(true);
  });
});
