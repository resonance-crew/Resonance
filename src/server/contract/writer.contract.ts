import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api/v1/http';
import type { CreateDraftInput, PendingEditInput } from '@/lib/api/v1/schemas';
import type { ServerCtx } from '@/server/ctx';
import { deleteCardIn } from '@/server/app/cards';
import {
  applyMapOpsIn,
  createDraftIn,
  deletePendingEditIn,
  getPendingEditIn,
  getThoughtMapIn,
  putPendingEditIn,
  saveDraftIn,
} from '@/server/app/writer';
import { mediaKeyFor } from '@/server/domain/media';
import { DRAFT_LOG_DAYS } from '@/server/domain/writer';
import type { RealtimeTopic } from '@/server/ports/realtime';

/**
 * What the writer's services (src/server/app/writer.ts) do over every
 * adapter of the `writer` aggregate: memory (src/server/app/writer.test.ts)
 * and Firestore's emulator (test/emulator/ports.writer.emulator.test.ts) —
 * the thought map's batches, a draft's creation and `rev`-ordered autosaves
 * with their patch log, and a published card's pending edit, each touching
 * its author's signal. `make` answers a fresh, empty store for each test.
 */
export interface WriterHarness {
  ctx: ServerCtx;
  /** Every touch the context's realtime publisher was asked for. */
  touches: { uid: string; topics: RealtimeTopic[] }[];
  /** Write a document whole (path `collection/id[/sub/id]`); times as Date. */
  seed(path: string, row: Record<string, unknown>): Promise<void>;
  /** A document's committed fields (times as Date), or null. */
  read(path: string): Promise<Record<string, unknown> | null>;
}

const ALICE = 'alice';
const BOB = 'bob';
const DRAFT = 'AbCdEfGhIjKlMnOpQrSt';
const OTHER = 'ZyXwVuTsRqPoNmLkJiHg';

const newDraft = (extra: Partial<CreateDraftInput> = {}): CreateDraftInput => ({
  id: DRAFT,
  thoughtCore: '雨天',
  story: '窗外下著雨。',
  tags: ['雨'],
  visibility: 'public',
  originalLocale: 'zh-TW',
  ...extra,
});

const editCopy = (rev: number, extra: Partial<PendingEditInput> = {}): PendingEditInput => ({
  rev,
  thoughtCore: '改過的標題',
  story: '改過的故事',
  tags: ['夜'],
  visibility: 'public',
  anonymous: false,
  ...extra,
});

const COVER = { type: 'image' as const, url: 'https://media.test/a.webp', label: '雨', frame: { cx: 0.3, cy: 0.6, zoom: 1.5, ar: 1.2 } };

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

const topicsFor = (h: WriterHarness, uid: string) => h.touches.filter((t) => t.uid === uid).flatMap((t) => t.topics);

export function describeWriterContract(name: string, make: () => Promise<WriterHarness> | WriterHarness) {
  describe(`the thought map (${name})`, () => {
    it('applies every op kind in order, and reads back as the clients load it', async () => {
      const h = await make();
      const r = await applyMapOpsIn(h.ctx, ALICE, [
        { op: 'addNode', cardId: 'c1', x: 10, y: 20 },
        { op: 'addNode', cardId: 'c2', x: 30, y: 40 },
        { op: 'addNode', cardId: 'c3', x: 0, y: 0 },
        { op: 'addGroup', groupId: 'g1', title: '回憶', hue: 120, x: 0, y: 0, w: 400, h: 300 },
        // Filed in a group made earlier in the same batch.
        { op: 'setNodeGroup', cardId: 'c1', groupId: 'g1' },
        { op: 'moveNode', cardId: 'c2', x: 31, y: 41, groupId: 'g1' },
        { op: 'addEdge', sourceCardId: 'c1', targetCardId: 'c2', label: '然後' },
        { op: 'addEdge', sourceCardId: 'c2', targetCardId: 'c3' },
        { op: 'setEdgeLabel', id: 'c2_c3', label: '所以' },
        { op: 'updateGroup', groupId: 'g1', title: '舊時光', w: 500 },
      ]);
      expect(r).toEqual({ applied: 10, skipped: [] });
      const map = await getThoughtMapIn(h.ctx, ALICE);
      const strip = <T extends Record<string, unknown>>(rows: T[]) => rows.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest);
      expect(strip(map.nodes)).toEqual([
        { id: 'c1', cardId: 'c1', x: 10, y: 20, groupId: 'g1' },
        { id: 'c2', cardId: 'c2', x: 31, y: 41, groupId: 'g1' },
        { id: 'c3', cardId: 'c3', x: 0, y: 0, groupId: null },
      ]);
      expect(strip(map.edges)).toEqual([
        { id: 'c1_c2', sourceCardId: 'c1', targetCardId: 'c2', label: '然後' },
        { id: 'c2_c3', sourceCardId: 'c2', targetCardId: 'c3', label: '所以' },
      ]);
      expect(strip(map.groups)).toEqual([{ id: 'g1', title: '舊時光', hue: 120, x: 0, y: 0, w: 500, h: 300 }]);
      expect(map.nodes.every((n) => typeof n.createdAt === 'string' && typeof n.updatedAt === 'string')).toBe(true);
      expect(typeof map.groups[0].createdAt).toBe('string');
      // One touch of her own map per batch; no one else's.
      expect(h.touches).toEqual([{ uid: ALICE, topics: ['map'] }]);

      // Removing a card takes every arrow touching it; removing a group unfiles its cards.
      await applyMapOpsIn(h.ctx, ALICE, [
        { op: 'removeNode', cardId: 'c2' },
        { op: 'removeGroup', groupId: 'g1' },
      ]);
      const after = await getThoughtMapIn(h.ctx, ALICE);
      expect(after.nodes.map((n) => [n.id, n.groupId])).toEqual([
        ['c1', null],
        ['c3', null],
      ]);
      expect(after.edges).toEqual([]);
      expect(after.groups).toEqual([]);
      await applyMapOpsIn(h.ctx, ALICE, [{ op: 'addEdge', sourceCardId: 'c1', targetCardId: 'c3' }, { op: 'removeEdge', id: 'c1_c3' }]);
      expect((await getThoughtMapIn(h.ctx, ALICE)).edges).toEqual([]);
    });

    it('places a card again whole (unfiled), as the clients do', async () => {
      const h = await make();
      await applyMapOpsIn(h.ctx, ALICE, [
        { op: 'addGroup', groupId: 'g1', title: '', hue: 55, x: 0, y: 0, w: 320, h: 240 },
        { op: 'addNode', cardId: 'c1', x: 1, y: 1 },
        { op: 'setNodeGroup', cardId: 'c1', groupId: 'g1' },
      ]);
      await applyMapOpsIn(h.ctx, ALICE, [{ op: 'addNode', cardId: 'c1', x: 5, y: 6 }]);
      expect(await h.read(`thoughtMaps/${ALICE}/nodes/c1`)).toMatchObject({ cardId: 'c1', x: 5, y: 6, groupId: null });
    });

    it('skips a change to what is not there, and touches no one for a batch that changed nothing', async () => {
      const h = await make();
      const r = await applyMapOpsIn(h.ctx, ALICE, [
        { op: 'moveNode', cardId: 'gone', x: 1, y: 1 },
        { op: 'setNodeGroup', cardId: 'gone', groupId: null },
        { op: 'removeNode', cardId: 'gone' },
        { op: 'setEdgeLabel', id: 'a_b', label: 'x' },
        { op: 'removeEdge', id: 'a_b' },
        { op: 'updateGroup', groupId: 'g9', title: 'x' },
        { op: 'removeGroup', groupId: 'g9' },
      ]);
      expect(r).toEqual({ applied: 0, skipped: [0, 1, 2, 3, 4, 5, 6] });
      expect(h.touches).toEqual([]);
      expect(await getThoughtMapIn(h.ctx, ALICE)).toEqual({ nodes: [], edges: [], groups: [] });
    });

    it('applies a batch all together or not at all: an arrow from a card to itself refuses the whole of it', async () => {
      const h = await make();
      const e = await failure(
        applyMapOpsIn(h.ctx, ALICE, [
          { op: 'addNode', cardId: 'c1', x: 0, y: 0 },
          { op: 'addEdge', sourceCardId: 'c1', targetCardId: 'c1' },
        ]),
      );
      expect(e.code).toBe('invalid_request');
      expect(e.issues).toEqual([{ path: 'ops.1', message: 'An arrow joins two different cards.' }]);
      expect(await getThoughtMapIn(h.ctx, ALICE)).toEqual({ nodes: [], edges: [], groups: [] });
      expect(h.touches).toEqual([]);
    });

    it("never reads or writes anyone else's map", async () => {
      const h = await make();
      await h.seed(`thoughtMaps/${ALICE}/nodes/c1`, { cardId: 'c1', x: 1, y: 2, groupId: null });
      await h.seed(`thoughtMaps/${ALICE}/edges/c1_c2`, { sourceCardId: 'c1', targetCardId: 'c2', label: '她的' });
      await h.seed(`thoughtMaps/${ALICE}/groups/g1`, { title: '她的', hue: 1, x: 0, y: 0, w: 1, h: 1 });
      expect(await getThoughtMapIn(h.ctx, BOB)).toEqual({ nodes: [], edges: [], groups: [] });
      // Bob naming Alice's ids reaches only his own (empty) map.
      const r = await applyMapOpsIn(h.ctx, BOB, [
        { op: 'moveNode', cardId: 'c1', x: 9, y: 9 },
        { op: 'removeNode', cardId: 'c1' },
        { op: 'setEdgeLabel', id: 'c1_c2', label: '他的' },
        { op: 'removeGroup', groupId: 'g1' },
      ]);
      expect(r.applied).toBe(0);
      expect(await h.read(`thoughtMaps/${ALICE}/nodes/c1`)).toMatchObject({ x: 1, y: 2 });
      expect(await h.read(`thoughtMaps/${ALICE}/edges/c1_c2`)).toMatchObject({ label: '她的' });
      expect(await h.read(`thoughtMaps/${ALICE}/groups/g1`)).toMatchObject({ title: '她的' });
      expect(topicsFor(h, ALICE)).toEqual([]);
    });

    it('reads a stored item without some numbers as the clients do (x, y 0; hue 55, w 320, h 240)', async () => {
      const h = await make();
      await h.seed(`thoughtMaps/${ALICE}/nodes/c1`, { cardId: 'c1' });
      await h.seed(`thoughtMaps/${ALICE}/groups/g1`, { title: 'old' });
      const map = await getThoughtMapIn(h.ctx, ALICE);
      expect(map.nodes[0]).toMatchObject({ x: 0, y: 0, groupId: null, createdAt: null });
      expect(map.groups[0]).toMatchObject({ hue: 55, x: 0, y: 0, w: 320, h: 240 });
    });
  });

  describe(`drafts (${name})`, () => {
    it('creates a draft under the client id, as the rules make one: unpublished, counters zeroed', async () => {
      const h = await make();
      expect(await createDraftIn(h.ctx, ALICE, newDraft({ media: COVER, accentHue: 210 }))).toEqual({ id: DRAFT, created: true, rev: 0 });
      const card = await h.read(`cards/${DRAFT}`);
      expect(card).toMatchObject({
        authorId: ALICE,
        thoughtCore: '雨天',
        story: '窗外下著雨。',
        tags: ['雨'],
        visibility: 'public',
        anonymous: false,
        originalLocale: 'zh-TW',
        media: COVER,
        accentHue: 210,
        publishedAt: null,
        readCount: 0,
        resonanceCount: 0,
        inviteCount: 0,
        translations: {},
      });
      expect(card!.createdAt).toBeInstanceOf(Date);
      expect(topicsFor(h, ALICE)).toEqual(['drafts']);
      // Sent again (an outbox resending after a lost answer): answered, nothing written.
      expect(await createDraftIn(h.ctx, ALICE, newDraft({ thoughtCore: '別的' }))).toEqual({ id: DRAFT, created: false, rev: 0 });
      expect((await h.read(`cards/${DRAFT}`))!.thoughtCore).toBe('雨天');
      expect(topicsFor(h, ALICE)).toEqual(['drafts']);
    });

    it("refuses an id someone else's card has, or one deleted for good", async () => {
      const h = await make();
      await h.seed(`cards/${DRAFT}`, { authorId: BOB, thoughtCore: '他的', story: '', tags: [], visibility: 'private', publishedAt: null });
      expect((await failure(createDraftIn(h.ctx, ALICE, newDraft()))).code).toBe('conflict');
      expect((await h.read(`cards/${DRAFT}`))!.authorId).toBe(BOB);
      await h.seed(`cardTombstones/${OTHER}`, { deletedAt: new Date() });
      expect((await failure(createDraftIn(h.ctx, ALICE, newDraft({ id: OTHER })))).code).toBe('conflict');
      expect(await h.read(`cards/${OTHER}`)).toBeNull();
    });

    it('refuses a draft anonymous and for connections only', async () => {
      const h = await make();
      const e = await failure(createDraftIn(h.ctx, ALICE, newDraft({ anonymous: true, visibility: 'connections' })));
      expect([e.code, e.message]).toEqual(['invalid_request', 'An anonymous card is public or private.']);
      expect(await h.read(`cards/${DRAFT}`)).toBeNull();
    });

    it("answers only a card its writer may read, and a named one never across a block (an anonymous one may be)", async () => {
      const h = await make();
      const card = (id: string, extra: Record<string, unknown>) =>
        h.seed(`cards/${id}`, { authorId: BOB, thoughtCore: 't', story: 's', tags: [], visibility: 'public', anonymous: false, publishedAt: new Date(), ...extra });
      await card('bobDraft', { publishedAt: null });
      await card('bobFriends', { visibility: 'connections' });
      await card('bobNamed', {});
      await card('bobAnon', { anonymous: true });
      expect((await failure(createDraftIn(h.ctx, ALICE, newDraft({ referenceCardId: 'bobDraft' })))).code).toBe('not_found');
      expect((await failure(createDraftIn(h.ctx, ALICE, newDraft({ referenceCardId: 'bobFriends' })))).code).toBe('not_found');
      expect((await failure(createDraftIn(h.ctx, ALICE, newDraft({ referenceCardId: 'nothing' })))).code).toBe('not_found');
      await h.seed(`connections/${ALICE}_${BOB}`, { userIds: [ALICE, BOB] });
      expect((await createDraftIn(h.ctx, ALICE, newDraft({ id: 'A0000000000000000001', referenceCardId: 'bobFriends' }))).created).toBe(true);
      // A block either way refuses answering his named card, never his anonymous one.
      await h.seed(`users/${BOB}/blocks/${ALICE}`, { blockedUid: ALICE });
      expect((await failure(createDraftIn(h.ctx, ALICE, newDraft({ referenceCardId: 'bobNamed' })))).code).toBe('blocked');
      expect((await createDraftIn(h.ctx, ALICE, newDraft({ id: 'A0000000000000000002', referenceCardId: 'bobAnon' }))).created).toBe(true);
      expect((await h.read('cards/A0000000000000000002'))!.referenceCardId).toBe('bobAnon');
    });

    it('applies an autosave only above the stored rev: a late or repeated one changes nothing', async () => {
      const h = await make();
      await createDraftIn(h.ctx, ALICE, newDraft());
      const saved = await saveDraftIn(h.ctx, ALICE, DRAFT, { rev: 2, story: '第二版' });
      expect(saved).toMatchObject({ applied: true, rev: 2 });
      expect(typeof saved.updatedAt).toBe('string');
      // Out of order: 5 lands before 4; 4 then changes nothing and says where the draft is.
      expect(await saveDraftIn(h.ctx, ALICE, DRAFT, { rev: 5, story: '第五版' })).toMatchObject({ applied: true, rev: 5 });
      expect(await saveDraftIn(h.ctx, ALICE, DRAFT, { rev: 4, story: '第四版' })).toEqual({ applied: false, rev: 5, updatedAt: null });
      expect(await saveDraftIn(h.ctx, ALICE, DRAFT, { rev: 5, story: '又一次' })).toEqual({ applied: false, rev: 5, updatedAt: null });
      const card = await h.read(`cards/${DRAFT}`);
      expect(card).toMatchObject({ story: '第五版', draftRev: 5, thoughtCore: '雨天', tags: ['雨'] });
      expect(topicsFor(h, ALICE)).toEqual(['drafts', 'drafts', 'drafts']);
      // Each applied save is in the patch log for 7 days, by rev.
      const log = await h.ctx.data.writer.draftLog(DRAFT);
      expect(log.map((l) => [l.rev, l.authorId, l.patch.set.story])).toEqual([
        [2, ALICE, '第二版'],
        [5, ALICE, '第五版'],
      ]);
      const days = (log[1].expireAt!.getTime() - new Date(saved.updatedAt!).getTime()) / 86_400_000;
      expect(days).toBeGreaterThan(DRAFT_LOG_DAYS - 0.01);
      expect(days).toBeLessThan(DRAFT_LOG_DAYS + 0.01);
    });

    it('replaces a cover whole (a frame left out goes), and clears the cover or the hue when asked', async () => {
      const h = await make();
      await createDraftIn(h.ctx, ALICE, newDraft({ media: COVER, accentHue: 30 }));
      const { frame: _frame, ...unframed } = COVER;
      await saveDraftIn(h.ctx, ALICE, DRAFT, { rev: 1, media: unframed });
      // Its storage key beside its URL when the URL is that key on the current base (ADR 0005); none where no base is known.
      const key = mediaKeyFor(h.ctx.media, unframed.url);
      const stored = { ...unframed, ...(key ? { key } : {}) };
      expect((await h.read(`cards/${DRAFT}`))!.media).toEqual(stored);
      // Null is absent (a Kotlin client sends every field): nothing removed.
      await saveDraftIn(h.ctx, ALICE, DRAFT, { rev: 2, media: null, accentHue: null, story: '仍然' });
      expect(await h.read(`cards/${DRAFT}`)).toMatchObject({ media: stored, accentHue: 30, story: '仍然' });
      await saveDraftIn(h.ctx, ALICE, DRAFT, { rev: 3, clear: ['media', 'accentHue'] });
      const card = await h.read(`cards/${DRAFT}`);
      expect('media' in card!).toBe(false);
      expect(card!.accentHue).toBeNull();
    });

    it('lets a draft become anonymous and for connections only, as the rules let an unpublished one', async () => {
      const h = await make();
      await createDraftIn(h.ctx, ALICE, newDraft());
      expect((await saveDraftIn(h.ctx, ALICE, DRAFT, { rev: 1, anonymous: true, visibility: 'connections' })).applied).toBe(true);
    });

    it("refuses someone else's card (as absent), a card in the trash and a published one, writing nothing", async () => {
      const h = await make();
      await createDraftIn(h.ctx, ALICE, newDraft());
      expect((await failure(saveDraftIn(h.ctx, BOB, DRAFT, { rev: 1, story: '他寫的' }))).code).toBe('not_found');
      expect((await failure(saveDraftIn(h.ctx, ALICE, 'nothingHere', { rev: 1, story: 'x' }))).code).toBe('not_found');
      await h.seed('cards/trashed', { authorId: ALICE, thoughtCore: 't', story: 's', tags: [], visibility: 'private', publishedAt: null, trashedAt: new Date() });
      expect(await failure(saveDraftIn(h.ctx, ALICE, 'trashed', { rev: 1, story: 'x' }))).toMatchObject({ code: 'conflict', message: 'This card is in the trash.' });
      await h.seed('cards/live', { authorId: ALICE, thoughtCore: 't', story: 's', tags: [], visibility: 'public', anonymous: false, publishedAt: new Date() });
      expect((await failure(saveDraftIn(h.ctx, ALICE, 'live', { rev: 1, story: 'x' }))).code).toBe('conflict');
      expect((await failure(saveDraftIn(h.ctx, ALICE, 'live', { rev: 1, visibility: 'private' }))).code).toBe('conflict');
      expect((await h.read('cards/live'))!.story).toBe('s');
      expect((await h.read('cards/trashed'))!.story).toBe('s');
      expect((await h.read(`cards/${DRAFT}`))!.story).toBe('窗外下著雨。');
      expect(await h.ctx.data.writer.draftLog('live')).toEqual([]);
    });

    it('deletes the patch log with the card', async () => {
      const h = await make();
      await createDraftIn(h.ctx, ALICE, newDraft());
      await saveDraftIn(h.ctx, ALICE, DRAFT, { rev: 1, story: 'a' });
      await saveDraftIn(h.ctx, ALICE, DRAFT, { rev: 2, story: 'b' });
      expect(await h.ctx.data.writer.draftLog(DRAFT)).toHaveLength(2);
      await deleteCardIn(h.ctx, ALICE, DRAFT);
      expect(await h.read(`cards/${DRAFT}`)).toBeNull();
      expect(await h.ctx.data.writer.draftLog(DRAFT)).toEqual([]);
    });
  });

  describe(`a pending edit (${name})`, () => {
    const live = (h: WriterHarness, extra: Record<string, unknown> = {}) =>
      h.seed('cards/live', {
        authorId: ALICE,
        thoughtCore: '原本',
        story: '原本的故事',
        tags: [],
        visibility: 'public',
        anonymous: false,
        publishedAt: new Date('2026-11-01T00:00:00Z'),
        ...extra,
      });

    it('is put whole, read back, ordered by rev, and thrown away', async () => {
      const h = await make();
      await live(h);
      expect(await getPendingEditIn(h.ctx, ALICE, 'live')).toEqual({ edit: null });
      expect(await putPendingEditIn(h.ctx, ALICE, 'live', editCopy(1, { media: COVER, accentHue: 90 }))).toMatchObject({ applied: true, rev: 1 });
      const { edit } = await getPendingEditIn(h.ctx, ALICE, 'live');
      expect(edit).toMatchObject({ thoughtCore: '改過的標題', story: '改過的故事', tags: ['夜'], visibility: 'public', anonymous: false, media: COVER, accentHue: 90, rev: 1 });
      expect(typeof edit!.updatedAt).toBe('string');
      expect((await h.read('cards/live/edits/current'))!.authorId).toBe(ALICE);
      // A late save changes nothing; the live card is never touched.
      expect(await putPendingEditIn(h.ctx, ALICE, 'live', editCopy(3, { story: '第三版' }))).toMatchObject({ applied: true, rev: 3 });
      expect(await putPendingEditIn(h.ctx, ALICE, 'live', editCopy(2, { story: '第二版' }))).toEqual({ applied: false, rev: 3, updatedAt: null });
      const now = (await getPendingEditIn(h.ctx, ALICE, 'live')).edit!;
      expect([now.story, now.media]).toEqual(['第三版', null]);
      expect((await h.read('cards/live'))!.story).toBe('原本的故事');
      expect(await deletePendingEditIn(h.ctx, ALICE, 'live')).toEqual({ deleted: true });
      expect(await deletePendingEditIn(h.ctx, ALICE, 'live')).toEqual({ deleted: false });
      expect(await getPendingEditIn(h.ctx, ALICE, 'live')).toEqual({ edit: null });
      expect(topicsFor(h, ALICE)).toEqual(['drafts', 'drafts', 'drafts']);
    });

    it("is its author's alone: someone else's card is absent", async () => {
      const h = await make();
      await live(h);
      await putPendingEditIn(h.ctx, ALICE, 'live', editCopy(1));
      expect((await failure(getPendingEditIn(h.ctx, BOB, 'live'))).code).toBe('not_found');
      expect((await failure(putPendingEditIn(h.ctx, BOB, 'live', editCopy(9)))).code).toBe('not_found');
      expect((await failure(deletePendingEditIn(h.ctx, BOB, 'live'))).code).toBe('not_found');
      expect((await h.read('cards/live/edits/current'))!.rev).toBe(1);
      // A copy naming someone else (left under an id another card took) reads as none.
      await h.seed('cards/live/edits/current', { authorId: BOB, story: '他的', thoughtCore: '', tags: [], visibility: 'public' });
      expect(await getPendingEditIn(h.ctx, ALICE, 'live')).toEqual({ edit: null });
    });

    it('refuses a card in the trash, and a copy that would make the card anonymous and for connections only', async () => {
      const h = await make();
      await live(h, { trashedAt: new Date() });
      expect((await failure(putPendingEditIn(h.ctx, ALICE, 'live', editCopy(1)))).code).toBe('conflict');
      await live(h);
      const e = await failure(putPendingEditIn(h.ctx, ALICE, 'live', editCopy(1, { anonymous: true, visibility: 'connections' })));
      expect(e.message).toBe('An anonymous card is public or private.');
      expect(await h.read('cards/live/edits/current')).toBeNull();
      // A card already so stays editable.
      await live(h, { anonymous: true, visibility: 'connections' });
      expect((await putPendingEditIn(h.ctx, ALICE, 'live', editCopy(1, { anonymous: true, visibility: 'connections' }))).applied).toBe(true);
    });

    it('lets its author throw away a copy left after its card went', async () => {
      const h = await make();
      await h.seed('cards/gone/edits/current', { authorId: ALICE, story: '留下的' });
      expect(await deletePendingEditIn(h.ctx, ALICE, 'gone')).toEqual({ deleted: true });
      expect(await h.read('cards/gone/edits/current')).toBeNull();
      expect((await failure(deletePendingEditIn(h.ctx, ALICE, 'gone'))).code).toBe('not_found');
    });
  });
}
