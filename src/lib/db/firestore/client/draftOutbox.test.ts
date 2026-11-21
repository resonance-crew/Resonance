// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The writer's autosaves through the server (phase 2b): the real client modules (cards, cardEdits, the outbox)
// over a stubbed fetch that plays the server's `rev` rule — never Firestore (a call to it throws).
vi.mock('./init', () => ({
  getClientDb: vi.fn(() => {
    throw new Error('Firestore is not written by the writer');
  }),
}));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => ({ currentUser: { uid: 'me', getIdToken: async () => 'id-token' } })),
  ensureAppCheck: vi.fn(),
}));
vi.mock('@/lib/auth/firebase/appCheck', () => ({ appCheckHeaders: vi.fn(async () => ({})) }));

import { createCardDraft, deleteCardForever, publishCard, updateCardDraft } from './cards';
import { applyPendingCardEdit, discardPendingCardEdit, getPendingCardEdit, savePendingCardEdit } from './cardEdits';
import { knownRev, resetOutboxForTests, RETRY_BASE_MS } from './draftOutbox';
import { getClientDb } from './init';

interface Sent {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

/** A server keeping one draft's fields and `rev` as PATCH …/draft does, and a working copy as PUT …/edits/current. */
function fakeServer() {
  const sent: Sent[] = [];
  const draft: { rev: number; fields: Record<string, unknown> } = { rev: 0, fields: {} };
  const edit: { rev: number; copy: Record<string, unknown> | null } = { rev: 0, copy: null };
  /** Answers held back (a slow network): released in order by `release()`. */
  const held: (() => void)[] = [];
  const state = { hold: false, offline: 0 };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    const method = init.method ?? 'GET';
    sent.push({ method, path, body });
    if (state.offline > 0) {
      state.offline -= 1;
      throw new TypeError('Failed to fetch');
    }
    const answer = (): Response => {
      if (method === 'POST' && path === '/api/v1/cards') {
        draft.fields = { ...body };
        return json({ id: body!.id, created: true, rev: 0 }, 201);
      }
      if (method === 'PATCH' && path.endsWith('/draft')) {
        const { rev, clear, ...fields } = body as { rev: number; clear?: string[] };
        if (rev <= draft.rev) return json({ applied: false, rev: draft.rev, updatedAt: null });
        draft.rev = rev;
        for (const f of clear ?? []) delete draft.fields[f];
        Object.assign(draft.fields, fields);
        return json({ applied: true, rev, updatedAt: '2026-11-21T08:00:00.000Z' });
      }
      if (path.endsWith('/edits/current')) {
        if (method === 'GET') return json({ edit: edit.copy ? { ...edit.copy, rev: edit.rev, updatedAt: null, media: edit.copy.media ?? null, accentHue: edit.copy.accentHue ?? null } : null });
        if (method === 'DELETE') {
          const had = edit.copy != null;
          edit.copy = null;
          return json({ deleted: had });
        }
        const { rev, ...copy } = body as { rev: number };
        if (rev <= edit.rev) return json({ applied: false, rev: edit.rev, updatedAt: null });
        edit.rev = rev;
        edit.copy = copy;
        return json({ applied: true, rev, updatedAt: '2026-11-21T08:00:00.000Z' });
      }
      if (path.endsWith('/edits/apply')) return json({ id: 'card-1', slug: null, applied: edit.copy != null });
      if (path.endsWith('/publish')) return json({ id: 'card-1', slug: 'a-slug', firstPublish: true });
      if (method === 'DELETE') return new Response(null, { status: 204 });
      return json({ error: { code: 'not_found', message: 'No such thing.' } }, 404);
    };
    if (!state.hold) return answer();
    return new Promise<Response>((resolve) => held.push(() => resolve(answer())));
  });
  return {
    sent,
    draft,
    edit,
    state,
    fetchMock,
    release: () => held.splice(0).forEach((go) => go()),
    /** The requests to a path's end, in order. */
    to: (end: string) => sent.filter((s) => s.path.endsWith(end)),
  };
}

let server: ReturnType<typeof fakeServer>;

beforeEach(() => {
  resetOutboxForTests();
  window.localStorage.clear();
  server = fakeServer();
  vi.stubGlobal('fetch', server.fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('a draft through the server', () => {
  it('is made under the id the writer chose, and its saves count on from the rev the server stores', async () => {
    const made = await createCardDraft({ id: 'abcdefghij0123456789', thoughtCore: 'A walk', story: '', tags: [], visibility: 'private', originalLocale: 'en' });
    expect(made.id).toBe('abcdefghij0123456789');
    expect(server.sent[0]).toMatchObject({ method: 'POST', path: '/api/v1/cards', body: { id: 'abcdefghij0123456789', anonymous: false } });

    await updateCardDraft(made.id, { story: 'after the rain' });
    expect(server.to('/draft')[0].body).toEqual({ story: 'after the rain', rev: 1 });
    expect(knownRev('draft', made.id)).toBe(1);
    expect(getClientDb).not.toHaveBeenCalled();
  });

  it('makes a new id of 20 letters and digits when none is given (as Firestore auto ids)', async () => {
    const made = await createCardDraft({ thoughtCore: 'x', story: '', tags: [], visibility: 'private', originalLocale: 'en' });
    expect(made.id).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  it('removes a cover given as undefined and a hue given as null (clear), and sends a cover whole', async () => {
    await updateCardDraft('card-1', { thoughtCore: 'x', media: undefined, accentHue: null });
    expect(server.to('/draft')[0].body).toEqual({ thoughtCore: 'x', clear: ['media', 'accentHue'], rev: 1 });

    await updateCardDraft('card-1', { media: { type: 'image', url: 'https://img.resonance.channel/a.webp', frame: { cx: 0.5, cy: 0.5, zoom: 1, ar: 1.5 } } });
    expect(server.to('/draft')[1].body).toEqual({ media: { type: 'image', url: 'https://img.resonance.channel/a.webp', frame: { cx: 0.5, cy: 0.5, zoom: 1, ar: 1.5 } }, rev: 2 });
  });

  it('leaves the cover alone when the patch does not mention it', async () => {
    await updateCardDraft('card-1', { thoughtCore: 'x' });
    expect(server.to('/draft')[0].body).not.toHaveProperty('media');
    expect(server.to('/draft')[0].body).not.toHaveProperty('clear');
  });
});

describe('the outbox', () => {
  // What Firestore's ordered stream (sdk.ts inOrder) promised: two quick saves never land the other way round.
  it('sends one save at a time, and folds what comes meanwhile into one — the newest words win', async () => {
    server.state.hold = true;
    const first = updateCardDraft('card-1', { story: 'one' });
    await settle();
    const second = updateCardDraft('card-1', { story: 'one two', tags: ['rain'] });
    const third = updateCardDraft('card-1', { story: 'one two three' });
    await settle();
    expect(server.to('/draft')).toHaveLength(1);

    server.release();
    await first;
    await settle();
    // The two saved meanwhile went as one, field by field.
    expect(server.to('/draft')).toHaveLength(2);
    expect(server.to('/draft')[1].body).toEqual({ story: 'one two three', tags: ['rain'], rev: 2 });
    server.release();
    await Promise.all([second, third]);
    expect(server.draft.fields).toMatchObject({ story: 'one two three', tags: ['rain'] });
  });

  it('a cover removed after one was set, while waiting, is removed — not sent', async () => {
    server.state.hold = true;
    const first = updateCardDraft('card-1', { story: 'a' });
    await settle();
    void updateCardDraft('card-1', { media: { type: 'image', url: 'https://img.resonance.channel/a.webp' } });
    const last = updateCardDraft('card-1', { media: undefined });
    server.release();
    await first;
    await settle();
    expect(server.to('/draft')[1].body).toEqual({ clear: ['media'], rev: 2 });
    server.release();
    await last;
  });

  // Another device (or an earlier session) counted higher: the words on screen are the ones to keep.
  it('sends the words on screen again above the stored rev when the server holds a later count', async () => {
    server.draft.rev = 7;
    const saved = updateCardDraft('card-1', { story: 'mine' });
    await saved;
    expect(server.to('/draft').map((s) => s.body!.rev)).toEqual([1, 8]);
    expect(server.draft.fields.story).toBe('mine');
    expect(knownRev('draft', 'card-1')).toBe(8);
  });

  it('counts on across a reload (the count is kept in localStorage)', async () => {
    await updateCardDraft('card-1', { story: 'one' });
    await updateCardDraft('card-1', { story: 'two' });
    resetOutboxForTests(); // a new page: memory gone, storage kept
    await updateCardDraft('card-1', { story: 'three' });
    expect(server.to('/draft').map((s) => s.body!.rev)).toEqual([1, 2, 3]);
  });

  it('says a save failed offline, keeps its words, and sends them again after a pause', async () => {
    vi.useFakeTimers();
    server.state.offline = 1;
    await expect(updateCardDraft('card-1', { story: 'typed offline' })).rejects.toThrow('Failed to fetch');
    expect(server.draft.fields.story).toBeUndefined();

    await vi.advanceTimersByTimeAsync(RETRY_BASE_MS);
    expect(server.draft.fields.story).toBe('typed offline');
    expect(server.to('/draft')).toHaveLength(2);
  });

  it('drops a save the server refuses (a 4xx), and says so', async () => {
    server.fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: 'conflict', message: 'In the trash.' } }), { status: 409 }));
    await expect(updateCardDraft('card-1', { story: 'x' })).rejects.toMatchObject({ status: 409 });
    await settle();
    // Not sent again: nothing is left waiting.
    expect(server.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('publishes only once the last save is stored — a pending retry is sent first', async () => {
    vi.useFakeTimers();
    server.state.offline = 1;
    await expect(updateCardDraft('card-1', { story: 'the last words' })).rejects.toThrow();
    // Back online before the pause is over: publishing sends what waits, then publishes.
    const published = publishCard('card-1');
    await vi.advanceTimersByTimeAsync(0);
    await published;
    const paths = server.sent.map((s) => `${s.method} ${s.path}`);
    expect(paths.slice(-2)).toEqual(['PATCH /api/v1/cards/card-1/draft', 'POST /api/v1/cards/card-1/publish']);
    expect(server.draft.fields.story).toBe('the last words');
  });

  it('publishes behind a save still on its way', async () => {
    server.state.hold = true;
    const saving = updateCardDraft('card-1', { story: 'still going' });
    await settle();
    const published = publishCard('card-1');
    await settle();
    expect(server.to('/publish')).toHaveLength(0);
    server.release();
    await saving;
    await settle();
    server.release();
    await published;
    expect(server.sent.map((s) => s.path)).toEqual(['/api/v1/cards/card-1/draft', '/api/v1/cards/card-1/publish']);
  });

  it('forgets what waits for a card deleted for good, and lands nothing after the delete', async () => {
    server.state.hold = true;
    const inflight = updateCardDraft('card-1', { story: 'a' });
    await settle();
    void updateCardDraft('card-1', { story: 'ab' });
    const deleting = deleteCardForever('card-1');
    server.release();
    await inflight;
    await settle();
    server.release();
    await deleting;
    expect(server.sent.map((s) => s.method)).toEqual(['PATCH', 'DELETE']);
    expect(knownRev('draft', 'card-1')).toBe(0);
  });
});

describe('pending edits through the server', () => {
  const copy = { thoughtCore: 'Live', story: 'A rewrite', tags: ['夜'], visibility: 'public' as const, anonymous: false, accentHue: null };

  it('autosaves the whole working copy with a rev, and reads it back counting on from its rev', async () => {
    await savePendingCardEdit('card-1', copy);
    expect(server.to('/edits/current')[0]).toMatchObject({ method: 'PUT', body: { thoughtCore: 'Live', story: 'A rewrite', tags: ['夜'], visibility: 'public', anonymous: false, rev: 1 } });
    expect(server.to('/edits/current')[0].body).not.toHaveProperty('accentHue');

    server.edit.rev = 5; // saved meanwhile on another device
    const pending = await getPendingCardEdit('card-1');
    expect(pending).toMatchObject({ thoughtCore: 'Live', story: 'A rewrite', media: undefined, accentHue: null, updatedAt: null });
    await savePendingCardEdit('card-1', { ...copy, story: 'Later' });
    expect(server.to('/edits/current').at(-1)!.body!.rev).toBe(6);
    expect(getClientDb).not.toHaveBeenCalled();
  });

  it('reads no pending edit for a card that is not yours (404), and fails a read that failed', async () => {
    server.fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: 'not_found', message: 'No such card.' } }), { status: 404 }));
    await expect(getPendingCardEdit('card-1')).resolves.toBeNull();
    server.state.offline = 1;
    await expect(getPendingCardEdit('card-1')).rejects.toThrow('Failed to fetch');
  });

  it('applies only once the working copy waiting is stored', async () => {
    server.state.hold = true;
    const saving = savePendingCardEdit('card-1', copy);
    await settle();
    const applying = applyPendingCardEdit('card-1');
    await settle();
    expect(server.to('/edits/apply')).toHaveLength(0);
    server.release();
    await saving;
    await settle();
    server.release();
    await expect(applying).resolves.toMatchObject({ applied: true });
  });

  it('discards: a copy not sent yet is forgotten, and the one on its way lands before the delete', async () => {
    server.state.hold = true;
    const inflight = savePendingCardEdit('card-1', copy);
    await settle();
    void savePendingCardEdit('card-1', { ...copy, story: 'never sent' });
    const discarding = discardPendingCardEdit('card-1');
    server.release();
    await inflight;
    await settle();
    server.release();
    await discarding;
    expect(server.to('/edits/current').map((s) => s.method)).toEqual(['PUT', 'DELETE']);
    expect(server.edit.copy).toBeNull();
  });
});
