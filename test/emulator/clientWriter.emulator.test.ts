import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

// The browser's writer as it runs since phase 2b (任務 #3, web lane B): the real client modules (client/cards,
// client/cardEdits, client/thoughtMap and their outbox) calling the real v1 route handlers in-process, against
// the Firestore emulator — what clientSdk.emulator.test.ts pinned for the Lite writes they replace: a read made
// after quick writes shows the last of them, a card dragged twice rests where it was dropped last, and the
// browser itself never touches Firestore (its client SDK throws here).

const mocks = vi.hoisted(() => ({ db: null as unknown, viewer: 'alice' }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: mocks.viewer }) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => mocks.db }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: () => ({ currentUser: { uid: mocks.viewer, getIdToken: async () => 'id-token' } }),
  ensureAppCheck: () => {},
}));
vi.mock('@/lib/auth/firebase/appCheck', () => ({ appCheckHeaders: async () => ({}) }));
vi.mock('@/lib/db/firestore/client/init', () => ({
  getClientDb: () => {
    throw new Error('The writer never reaches Firestore from the browser');
  },
}));

const cardsRoute = await import('@/app/api/v1/cards/route');
const draftRoute = await import('@/app/api/v1/cards/[key]/draft/route');
const editRoute = await import('@/app/api/v1/cards/[key]/edits/current/route');
const mapRoute = await import('@/app/api/v1/me/thought-map/route');
const opsRoute = await import('@/app/api/v1/me/thought-map/ops/route');
const cards = await import('@/lib/db/firestore/client/cards');
const cardEdits = await import('@/lib/db/firestore/client/cardEdits');
const map = await import('@/lib/db/firestore/client/thoughtMap');

const PROJECT = 'demo-resonance-client-writer';
let app: App;
let db: Firestore;

/** fetch as the browser's: a same-origin /api/v1 path, answered by its route handler. */
async function inProcessFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const req = new Request(`http://localhost${input}`, init);
  const path = input.split('?')[0];
  const method = (init.method ?? 'GET').toUpperCase();
  const params = (key: string) => ({ params: Promise.resolve({ key }) });
  let m: RegExpMatchArray | null;
  if (path === '/api/v1/cards' && method === 'POST') return cardsRoute.POST(req);
  if ((m = path.match(/^\/api\/v1\/cards\/([^/]+)\/draft$/)) && method === 'PATCH') return draftRoute.PATCH(req, params(m[1]));
  if ((m = path.match(/^\/api\/v1\/cards\/([^/]+)\/edits\/current$/))) {
    const handler = { GET: editRoute.GET, PUT: editRoute.PUT, DELETE: editRoute.DELETE }[method as 'GET' | 'PUT' | 'DELETE'];
    return handler(req, params(m[1]));
  }
  if (path === '/api/v1/me/thought-map') return mapRoute.GET(req);
  if (path === '/api/v1/me/thought-map/ops') return opsRoute.POST(req);
  throw new Error(`No route here for ${method} ${input}`);
}

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'client-writer-test');
  db = getFirestore(app);
  mocks.db = db;
  vi.stubGlobal('fetch', vi.fn(inProcessFetch));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await deleteApp(app);
});

beforeEach(async () => {
  // The emulator is cleared with the real fetch (the stub answers /api/v1 only).
  vi.unstubAllGlobals();
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  vi.stubGlobal('fetch', vi.fn(inProcessFetch));
  await db.doc('users/alice').set({ handle: 'alice', handleLower: 'alice', initials: 'AL', joinedAt: Timestamp.now() });
});

describe('a draft, from the writer to the card', () => {
  it('is made under the id the writer chose, and its quick autosaves land in order — the last words kept', async () => {
    const made = await cards.createCardDraft({ thoughtCore: '雨天', story: '窗外', tags: [], visibility: 'private', originalLocale: 'zh-TW' });
    expect(made.id).toMatch(/^[A-Za-z0-9]{20}$/);
    // Three pauses' saves, none awaited, as typing goes on.
    const saves = [
      cards.updateCardDraft(made.id, { story: '窗外下著' }),
      cards.updateCardDraft(made.id, { story: '窗外下著雨', tags: ['雨'] }),
      cards.updateCardDraft(made.id, { story: '窗外下著雨。' }),
    ];
    await cards.flushCardDraft(made.id);
    await Promise.all(saves);
    const stored = (await db.doc(`cards/${made.id}`).get()).data()!;
    expect(stored).toMatchObject({ authorId: 'alice', thoughtCore: '雨天', story: '窗外下著雨。', tags: ['雨'], publishedAt: null });
  });

  it('takes a cover off when the writer removes it, and a hue with it', async () => {
    const made = await cards.createCardDraft({
      thoughtCore: '封面',
      story: '',
      tags: [],
      visibility: 'private',
      originalLocale: 'en',
      media: { type: 'image', url: 'https://img.resonance.channel/cover.webp', frame: { cx: 0.4, cy: 0.5, zoom: 1.2, ar: 1.5 } },
      accentHue: 120,
    });
    expect((await db.doc(`cards/${made.id}`).get()).get('media')).toMatchObject({ url: 'https://img.resonance.channel/cover.webp' });
    await cards.updateCardDraft(made.id, { media: undefined, accentHue: null });
    const stored = (await db.doc(`cards/${made.id}`).get()).data()!;
    expect(stored.media).toBeUndefined();
    expect(stored.accentHue == null).toBe(true);
  });
});

describe("a published card's working copy", () => {
  beforeEach(async () => {
    await db.doc('cards/live').set({
      authorId: 'alice',
      thoughtCore: 'Live',
      story: 'As readers see it.',
      tags: [],
      originalLocale: 'en',
      translations: {},
      visibility: 'public',
      anonymous: false,
      publishedAt: Timestamp.now(),
      readCount: 0,
      resonanceCount: 0,
      inviteCount: 0,
    });
  });

  it('keeps the last of quick autosaves, never on the card itself, and is gone once discarded', async () => {
    const copy = { thoughtCore: 'Live', tags: [], visibility: 'public' as const, anonymous: false };
    const saves = [
      cardEdits.savePendingCardEdit('live', { ...copy, story: 'A rewrite' }),
      cardEdits.savePendingCardEdit('live', { ...copy, story: 'A rewrite, mid-sentence' }),
    ];
    await Promise.all(saves);
    expect(await cardEdits.getPendingCardEdit('live')).toMatchObject({ story: 'A rewrite, mid-sentence' });
    expect((await db.doc('cards/live').get()).get('story')).toBe('As readers see it.');

    await cardEdits.discardPendingCardEdit('live');
    expect(await cardEdits.getPendingCardEdit('live')).toBeNull();
    expect((await db.doc('cards/live/edits/current').get()).exists).toBe(false);
  });
});

describe('the thought map', () => {
  it('rests a card dragged twice where it was dropped last, and moves a group with its cards', async () => {
    await map.addMapNode('walk', 0, 0);
    const group = await map.createMapGroup({ title: 'Autumn', hue: 55, x: 0, y: 0, w: 460, h: 340 });
    void map.moveMapNode('walk', 120, 40, group);
    void map.moveMapNode('walk', 360, 80, group);
    void map.updateMapGroup(group, { x: 10, y: 20 });
    void map.moveMapNodes([{ cardId: 'walk', x: 370, y: 100 }]);
    void map.createMapEdge('walk', 'rain', 'then');
    const loaded = await map.loadMyThoughtMap();
    expect(loaded.nodes.map((n) => [n.cardId, n.x, n.y, n.groupId])).toEqual([['walk', 370, 100, group]]);
    expect(loaded.groups.map((g) => [g.id, g.title, g.x, g.y])).toEqual([[group, 'Autumn', 10, 20]]);
    expect(loaded.edges.map((e) => [e.id, e.label])).toEqual([['walk_rain', 'then']]);

    // Taken off: its arrows go with it; a group removed leaves no card filed in it.
    await map.removeMapGroup(group);
    await map.removeMapNode('walk');
    const after = await map.loadMyThoughtMap();
    expect(after).toMatchObject({ nodes: [], edges: [], groups: [] });
  });
});
