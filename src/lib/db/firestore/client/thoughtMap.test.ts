import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The thought map through the server (phase 2b): GET /api/v1/me/thought-map and batches of ops
// (POST /api/v1/me/thought-map/ops), over a stubbed fetch — never Firestore (a call to it throws).
vi.mock('./init', () => ({
  getClientDb: vi.fn(() => {
    throw new Error('Firestore is not read or written by the map');
  }),
}));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => ({ currentUser: { uid: 'me', getIdToken: async () => 'id-token' } })),
  ensureAppCheck: vi.fn(),
}));
vi.mock('@/lib/auth/firebase/appCheck', () => ({ appCheckHeaders: vi.fn(async () => ({})) }));

import {
  addMapNode,
  createMapEdge,
  createMapGroup,
  flushMapOps,
  loadMyThoughtMap,
  MAP_BATCH_MS,
  mapOpsBusy,
  moveMapNode,
  moveMapNodes,
  removeMapGroup,
  removeMapNode,
  resetMapOpsForTests,
  setNodeGroups,
  updateMapEdgeLabel,
  updateMapGroup,
  type MapOpWire,
} from './thoughtMap';
import { RETRY_BASE_MS } from './draftOutbox';
import { getClientDb } from './init';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let held: (() => void)[] = [];
let hold = false;
let offline = 0;
let fetchMock: ReturnType<typeof vi.fn>;
/** The op batches sent, in order. */
const batches = (): MapOpWire[][] =>
  fetchMock.mock.calls.filter(([url]) => url === '/api/v1/me/thought-map/ops').map(([, init]) => JSON.parse(String((init as RequestInit).body)).ops);

beforeEach(() => {
  vi.useFakeTimers();
  resetMapOpsForTests();
  held = [];
  hold = false;
  offline = 0;
  fetchMock = vi.fn(async (url: string) => {
    if (offline > 0) {
      offline -= 1;
      throw new TypeError('Failed to fetch');
    }
    const answer = () =>
      url === '/api/v1/me/thought-map'
        ? json({
            nodes: [{ id: 'walk', cardId: 'walk', x: 360, y: 80, groupId: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: null }],
            edges: [{ id: 'walk_rain', sourceCardId: 'walk', targetCardId: 'rain', label: 'then', createdAt: null }],
            groups: [{ id: 'g1', title: 'Autumn', hue: 55, x: 0, y: 0, w: 320, h: 240, createdAt: null }],
          })
        : json({ applied: 1, skipped: [] });
    if (!hold) return answer();
    return new Promise<Response>((resolve) => held.push(() => resolve(answer())));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const release = () => held.splice(0).forEach((go) => go());

describe('the thought map through the server', () => {
  it('reads the whole map, its dates as dates and an unfiled card with no group', async () => {
    const map = await loadMyThoughtMap();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/me/thought-map', expect.objectContaining({ method: 'GET' }));
    expect(map.nodes).toEqual([{ id: 'walk', cardId: 'walk', x: 360, y: 80, groupId: undefined, createdAt: new Date('2026-11-01T00:00:00.000Z'), updatedAt: new Date(0) }]);
    expect(map.edges[0]).toMatchObject({ id: 'walk_rain', label: 'then' });
    expect(map.groups[0]).toMatchObject({ id: 'g1', title: 'Autumn', w: 320 });
    expect(getClientDb).not.toHaveBeenCalled();
  });

  it('sends each kind of change as its op', async () => {
    void addMapNode('a', 1, 2);
    void moveMapNode('a', 3, 4, 'g1');
    void moveMapNode('b', 5, 6, null);
    void setNodeGroups([{ cardId: 'c', groupId: null }, { cardId: 'd', groupId: 'g1' }]);
    void removeMapNode('e');
    void createMapEdge('a', 'b');
    void updateMapEdgeLabel('a_b', 'because');
    void removeMapGroup('g2');
    const group = createMapGroup({ title: 'New', hue: 90, x: 0, y: 0, w: 460, h: 340 });
    await vi.advanceTimersByTimeAsync(MAP_BATCH_MS);
    const id = await group;
    expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(batches()).toEqual([
      [
        { op: 'addNode', cardId: 'a', x: 1, y: 2 },
        { op: 'moveNode', cardId: 'a', x: 3, y: 4, groupId: 'g1' },
        // Moved out of every group: the move, then unfiled.
        { op: 'moveNode', cardId: 'b', x: 5, y: 6 },
        { op: 'setNodeGroup', cardId: 'b' },
        { op: 'setNodeGroup', cardId: 'c' },
        { op: 'setNodeGroup', cardId: 'd', groupId: 'g1' },
        { op: 'removeNode', cardId: 'e' },
        { op: 'addEdge', sourceCardId: 'a', targetCardId: 'b', label: '' },
        { op: 'setEdgeLabel', id: 'a_b', label: 'because' },
        { op: 'removeGroup', groupId: 'g2' },
        { op: 'addGroup', groupId: id, title: 'New', hue: 90, x: 0, y: 0, w: 460, h: 340 },
      ],
    ]);
  });

  // A group dragged moves the group and every card in it: one batch, all or nothing.
  it('sends what is handed over within a frame as one batch', async () => {
    void updateMapGroup('g1', { x: 40, y: 50 });
    void moveMapNodes([
      { cardId: 'a', x: 60, y: 70 },
      { cardId: 'b', x: 80, y: 90 },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MAP_BATCH_MS);
    expect(batches()).toEqual([
      [
        { op: 'updateGroup', groupId: 'g1', x: 40, y: 50 },
        { op: 'moveNode', cardId: 'a', x: 60, y: 70 },
        { op: 'moveNode', cardId: 'b', x: 80, y: 90 },
      ],
    ]);
  });

  it('keeps one batch in flight, folding the moves that wait into their last place', async () => {
    hold = true;
    const first = moveMapNode('walk', 120, 40, 'g1');
    await vi.advanceTimersByTimeAsync(MAP_BATCH_MS);
    expect(batches()).toHaveLength(1);

    // While it is out: the card dragged twice more, the group dragged twice with its card, a label retyped.
    const later = [
      moveMapNode('walk', 200, 60, 'g1'),
      moveMapNode('walk', 360, 80, 'g1'),
      updateMapGroup('g1', { x: 10 }),
      moveMapNodes([{ cardId: 'walk', x: 370, y: 80 }]),
      updateMapGroup('g1', { x: 20, y: 5 }),
      moveMapNodes([{ cardId: 'walk', x: 380, y: 85 }]),
      updateMapEdgeLabel('walk_rain', 'th'),
      updateMapEdgeLabel('walk_rain', 'then'),
    ];
    await vi.advanceTimersByTimeAsync(MAP_BATCH_MS * 4);
    expect(batches()).toHaveLength(1);

    release();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(batches()).toHaveLength(2);
    expect(batches()[1]).toEqual([
      // The card's last place, still in the group its first move filed it in.
      { op: 'moveNode', cardId: 'walk', x: 380, y: 85, groupId: 'g1' },
      { op: 'updateGroup', groupId: 'g1', x: 20, y: 5 },
      { op: 'setEdgeLabel', id: 'walk_rain', label: 'then' },
    ]);
    release();
    await Promise.all(later);
  });

  it('never folds a move across a change of what it is about (taken off, placed again)', async () => {
    hold = true;
    void addMapNode('x', 0, 0);
    await vi.advanceTimersByTimeAsync(MAP_BATCH_MS);
    void moveMapNodes([{ cardId: 'walk', x: 1, y: 1 }]);
    void removeMapNode('walk');
    void addMapNode('walk', 5, 5);
    void moveMapNodes([{ cardId: 'walk', x: 9, y: 9 }]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(batches()[1]).toEqual([
      { op: 'moveNode', cardId: 'walk', x: 1, y: 1 },
      { op: 'removeNode', cardId: 'walk' },
      { op: 'addNode', cardId: 'walk', x: 5, y: 5 },
      { op: 'moveNode', cardId: 'walk', x: 9, y: 9 },
    ]);
    release();
  });

  it('sends a batch the network lost again after a pause, in its place', async () => {
    offline = 1;
    const moved = moveMapNode('walk', 120, 40, 'g1');
    await vi.advanceTimersByTimeAsync(MAP_BATCH_MS);
    void moveMapNode('walk', 360, 80, 'g1');
    await vi.advanceTimersByTimeAsync(RETRY_BASE_MS);
    await moved;
    await vi.advanceTimersByTimeAsync(0);
    // The lost batch as it was (it may have reached the server: nothing folds into it), the later move after it.
    expect(batches()).toEqual([
      [{ op: 'moveNode', cardId: 'walk', x: 120, y: 40, groupId: 'g1' }],
      [
        { op: 'moveNode', cardId: 'walk', x: 120, y: 40, groupId: 'g1' },
        { op: 'moveNode', cardId: 'walk', x: 360, y: 80, groupId: 'g1' },
      ],
    ]);
    expect(mapOpsBusy()).toBe(false);
  });

  it('tells the caller of a batch the server refused, and goes on with the rest', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'invalid_request', message: 'Not a valid id.' } }, 400));
    const refused = removeMapNode('bad/id');
    const failed = expect(refused).rejects.toMatchObject({ status: 400 });
    await vi.advanceTimersByTimeAsync(MAP_BATCH_MS);
    await failed;
    const next = addMapNode('walk', 0, 0);
    await vi.advanceTimersByTimeAsync(MAP_BATCH_MS);
    await next;
    expect(batches()).toEqual([[{ op: 'removeNode', cardId: 'bad/id' }], [{ op: 'addNode', cardId: 'walk', x: 0, y: 0 }]]);
  });

  // Leaving the map and coming back must never show the board from before the last move.
  it('reads the map only after every change made here is stored', async () => {
    hold = true;
    void moveMapNode('walk', 360, 80, null);
    const reading = loadMyThoughtMap();
    await vi.advanceTimersByTimeAsync(0);
    // The change went at once (no frame's wait), and the read waits for it.
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/me/thought-map/ops']);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/me/thought-map/ops', '/api/v1/me/thought-map']);
    release();
    await reading;
    await flushMapOps();
  });
});
